<?php

declare(strict_types=1);

namespace App\Repository;

use App\Service\JetonsRafraichissement;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\DBAL\Connection;

/**
 * LES COMPTES EN BASE : lire, desactiver, detruire.
 *
 * POURQUOI UN DEPOT
 *
 * Ce SQL vivait dans `ComptesController`. La documentation Symfony 7.4 place le
 * SQL brut dans `src/Repository/` et laisse au controleur trois gestes : lire
 * la requete, appeler, repondre. Ici la raison est plus forte qu'ailleurs :
 * l'ordre de destruction d'un compte n'etait ecrit QUE dans le corps d'une
 * methode de controleur, et c'est la seule chose qui separe une suppression
 * propre d'une erreur de cle etrangere en pleine transaction.
 *
 * POURQUOI LE SERVICE DES JETONS EST ICI, ET PAS DANS LE CONTROLEUR
 *
 * Desactiver un compte et couper ses sessions doivent tenir dans UNE
 * transaction. Les separer laisserait la porte ouverte quand la seconde
 * echoue : l'ecran dirait « compte bloque » pendant que le jeton de
 * rafraichissement continuerait de rouvrir la session pendant des semaines.
 * Le depot porte donc la transaction, et le controleur n'a plus a la connaitre.
 */
final readonly class Comptes
{
    public function __construct(
        private Connection $cnx,
        private JetonsRafraichissement $jetons,
    ) {
    }

    /**
     * Tous les comptes, avec ce que chacun contient.
     *
     * LES COMPTEURS NE SONT PAS DECORATIFS : ce sont eux qui rendent la
     * suppression pensable. « Supprimer Marie » ne veut rien dire ; « supprimer
     * Marie et ses 34 seances » se decide. Aliments et stock en font partie
     * depuis que chaque aliment appartient a un compte — un compte sans seance
     * peut avoir un frigo plein, et l'administrateur lisait « 0 ».
     *
     * @return list<array<string, mixed>>
     */
    public function tousAvecContenu(): array
    {
        return $this->cnx->fetchAllAssociative(
            "SELECT u.id, u.email, u.nom, u.roles, u.actif, u.source_frigo, u.cree_le,
                    (SELECT count(*) FROM seance     s WHERE s.utilisateur_id = u.id) AS seances,
                    (SELECT count(*) FROM modele     m WHERE m.utilisateur_id = u.id) AS modeles,
                    (SELECT count(*) FROM plan_repas p WHERE p.utilisateur_id = u.id) AS plans,
                    (SELECT count(*) FROM aliment    a WHERE a.utilisateur_id = u.id) AS aliments,
                    (SELECT count(*) FROM stock      k WHERE k.utilisateur_id = u.id) AS stock,
                    (SELECT count(*) FROM cible      c WHERE c.utilisateur_id = u.id) AS cibles,
                    (SELECT count(*) FROM complement o WHERE o.utilisateur_id = u.id) AS complements,
                    (SELECT count(*) FROM exercice   e WHERE e.cree_par = u.id AND NOT e.public) AS exercices,
                    (SELECT count(*) FROM serie sr
                       JOIN seance_exercice se ON se.id = sr.seance_exercice_id
                       JOIN seance s2 ON s2.id = se.seance_id
                      WHERE s2.utilisateur_id = u.id) AS series
               FROM utilisateur u
           ORDER BY u.cree_le",
        );
    }

    /**
     * Un compte par son identifiant, ou `null`.
     *
     * L'IDENTIFIANT VIENT DE L'URL, donc de n'importe qui. PostgreSQL refuse un
     * UUID mal forme par une erreur 500 illisible plutot que par un resultat
     * vide : on borne la forme avant d'interroger.
     *
     * @return array<string, mixed>|null
     */
    public function parId(string $id): ?array
    {
        if (1 !== \preg_match('/^[0-9a-f-]{36}$/i', $id)) {
            return null;
        }

        $ligne = $this->cnx->fetchAssociative(
            'SELECT id, email, nom, roles, actif FROM utilisateur WHERE id = :id',
            ['id' => $id],
        );

        return false === $ligne ? null : $ligne;
    }

    /**
     * Combien d'administrateurs peuvent encore ouvrir l'ecran d'administration.
     *
     * On compte les ACTIFS : un administrateur desactive ne gere plus rien, il
     * ne compte donc pas comme filet de securite.
     */
    public function administrateursActifs(): int
    {
        return (int) $this->cnx->fetchOne(
            "SELECT count(*) FROM utilisateur
              WHERE actif = true AND roles LIKE '%ROLE_ADMIN%'",
        );
    }

    /**
     * Desactive ou reactive un compte — et coupe ses sessions s'il est bloque.
     *
     * Le jeton d'acces vit une heure, celui de rafraichissement des semaines :
     * sans cette revocation, un compte « bloque » se prolongerait tout seul
     * aussi longtemps qu'on le laisse, et le blocage n'aurait d'effet qu'a la
     * prochaine deconnexion volontaire — que personne ne fait.
     */
    public function definirActif(string $id, bool $actif): void
    {
        $this->cnx->transactional(function () use ($id, $actif): void {
            $this->cnx->executeStatement(
                'UPDATE utilisateur SET actif = :a WHERE id = :id',
                ['a' => $actif ? 'true' : 'false', 'id' => $id],
            );

            if (!$actif) {
                /* LA REGLE N'EST PAS RECOPIEE ICI, ELLE EST APPELEE. Ce
                   `DELETE` a deja ete ecrit a la main a deux endroits, qui
                   divergeaient : le service des jetons en est le seul auteur. */
                $this->jetons->revoquerTout($id);
            }
        });
    }

    /**
     * Supprime un compte et tout ce qu'il contient.
     *
     * LA CASCADE EST ECRITE DANS LA BASE, pas ici : chaque table qui pointe
     * vers `utilisateur` declare `ON DELETE CASCADE` ou `SET NULL`. Refaire ce
     * travail en PHP donnerait deux verites sur la meme question, et celle du
     * code finirait par mentir — il suffit d'ajouter une table en oubliant de
     * revenir ici. Une instruction pour le compte, donc, et DEUX EXCEPTIONS.
     *
     * SES ALIMENTS. `aliment.utilisateur_id` est en CASCADE, mais
     * `stock.aliment_id` est en RESTRICT, et PostgreSQL ne garantit pas l'ordre
     * de deux cascades parties du meme compte : on retire le stock qui les
     * vise, puis les aliments.
     *
     * SES EXERCICES PERSONNELS. `exercice.cree_par` est en SET NULL : la
     * cascade les laisserait sans auteur ni publication, visibles de personne.
     * On les releve AVANT — apres, on ne saurait plus lesquels etaient a lui —
     * et on les retire APRES le compte, dont les seances et les modeles les
     * citaient encore en RESTRICT.
     */
    public function supprimer(string $id): void
    {
        $this->cnx->transactional(function () use ($id): void {
            $this->cnx->executeStatement(
                'DELETE FROM stock WHERE aliment_id IN (SELECT id FROM aliment WHERE utilisateur_id = :u)',
                ['u' => $id],
            );
            $this->cnx->executeStatement(
                'DELETE FROM aliment WHERE utilisateur_id = :u', ['u' => $id]);

            $exercices = $this->cnx->fetchFirstColumn(
                'SELECT id FROM exercice WHERE cree_par = :u AND NOT public', ['u' => $id]);

            $this->cnx->executeStatement(
                'DELETE FROM utilisateur WHERE id = :id', ['id' => $id]);

            /* Un exercice qu'un AUTRE compte cite toujours — possible pour une
               seance d'avant que les exercices personnels cessent d'etre
               visibles de tous — reste en place : le supprimer ferait echouer
               toute la suppression. Et sans aucun exercice, pas de requete du
               tout : `IN (:ids)` sur une liste vide produit du SQL invalide. */
            if ([] !== $exercices) {
                $this->cnx->executeStatement(
                    'DELETE FROM exercice e
                      WHERE e.id IN (:ids) AND NOT e.public
                        AND NOT EXISTS (SELECT 1 FROM seance_exercice se WHERE se.exercice_id = e.id)
                        AND NOT EXISTS (SELECT 1 FROM modele_exercice me WHERE me.exercice_id = e.id)',
                    ['ids' => $exercices],
                    ['ids' => ArrayParameterType::INTEGER],
                );
            }
        });
    }
}
