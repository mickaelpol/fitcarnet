<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\Utilisateur;
use App\Service\JetonsRafraichissement;
use App\Service\ProtectionDuCompte;
use Doctrine\DBAL\ArrayParameterType;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * LES COMPTES, VUS PAR L'ADMINISTRATEUR.
 *
 * Trois gestes : voir, desactiver, supprimer. Ils ne se valent pas, et
 * l'ecran doit le montrer autant que ce controleur.
 *
 * DESACTIVER EST REVERSIBLE. SUPPRIMER NE L'EST PAS.
 *
 * Un compte desactive garde tout : ses seances, ses series, ses plans, ses
 * cibles. On le reactive, la personne retrouve son carnet intact. C'est le
 * geste a faire dans 99 % des cas — quelqu'un qui part, un acces qu'on
 * suspend, un doute.
 *
 * Un compte supprime emporte tout : seances, series, modeles, plans, cibles,
 * complements, habitudes de cuisson, inventaires, stock, jetons, SES ALIMENTS
 * et SES EXERCICES PERSONNELS. Rien de tout cela ne se restaure sans une
 * sauvegarde.
 *
 * On COMPTE donc ce qui sera detruit et on le renvoie avec la liste. Un
 * « Supprimer ? Oui / Non » qui ne dit pas ce qu'on detruit n'est pas une
 * question, c'est un piege.
 *
 * DEUX GESTES SONT REFUSES, PAS CONFIRMES : voir `ProtectionDuCompte`. Se
 * bloquer soi-meme et supprimer le dernier administrateur sont irreversibles
 * DEPUIS L'APPLICATION — apres, il faut un terminal sur le NAS et une console
 * SQL. Une confirmation, on l'accepte ; un refus, non.
 */
#[Route('/api')]
#[IsGranted('ROLE_ADMIN')]
final class ComptesController extends AbstractController
{
    public function __construct(
        private readonly Connection $cnx,
        private readonly JetonsRafraichissement $jetons,
    ) {
    }

    /**
     * Tous les comptes, avec ce que chacun contient.
     *
     * Les compteurs ne sont pas decoratifs : ce sont eux qui rendent la
     * suppression pensable. « Supprimer Marie » ne veut rien dire ;
     * « supprimer Marie et ses 34 seances » se decide.
     *
     * Aliments, stock, cibles, complements et exercices personnels y sont
     * depuis le 17 septembre 2026 : ils partent avec le compte, et un compte
     * sans seance peut avoir un frigo plein. Habitudes de cuisson et
     * inventaires partent aussi, sans etre comptes : ils ne se ressaisissent
     * pas, ils se refont en cuisinant et en recomptant.
     */
    #[Route('/comptes', methods: ['GET'])]
    public function lister(): JsonResponse
    {
        $lignes = $this->cnx->fetchAllAssociative(
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

        $moi = $this->moi()->getId()->toRfc4122();

        return $this->json([
            'comptes' => \array_map(static function (array $l) use ($moi): array {
                $roles = \array_filter(\explode(',', (string) $l['roles']));

                return [
                    'id' => (string) $l['id'],
                    'email' => (string) $l['email'],
                    'nom' => (string) $l['nom'],
                    'roles' => \array_values($roles),
                    'admin' => \in_array('ROLE_ADMIN', $roles, true),
                    'actif' => (bool) $l['actif'],
                    'sourceFrigo' => (string) $l['source_frigo'],
                    'creeLe' => (new \DateTimeImmutable((string) $l['cree_le']))->format(\DATE_ATOM),
                    // `moi` sert a l'ecran : il grise les boutons plutot que
                    // de laisser tenter un geste que le serveur refusera.
                    'moi' => (string) $l['id'] === $moi,
                    'contenu' => [
                        'seances' => (int) $l['seances'],
                        'series' => (int) $l['series'],
                        'modeles' => (int) $l['modeles'],
                        'plans' => (int) $l['plans'],
                        'aliments' => (int) $l['aliments'],
                        'stock' => (int) $l['stock'],
                        'cibles' => (int) $l['cibles'],
                        'complements' => (int) $l['complements'],
                        'exercices' => (int) $l['exercices'],
                    ],
                ];
            }, $lignes),
        ]);
    }

    /**
     * Desactive ou reactive un compte.
     *
     * DESACTIVER COUPE AUSSI LES SESSIONS EN COURS, et ce n'est pas un extra.
     * Le jeton d'acces vit une heure, et le jeton de rafraichissement des
     * semaines : sans supprimer ce dernier, un compte « bloque » continuerait
     * a se prolonger tout seul aussi longtemps qu'on le laisse. Le blocage
     * n'aurait alors d'effet qu'a la prochaine deconnexion volontaire — et
     * personne ne se deconnecte volontairement.
     */
    #[Route('/comptes/{id}/actif', methods: ['POST'])]
    public function activer(string $id, Request $requete): JsonResponse
    {
        $cible = $this->compte($id);
        if (null === $cible) {
            return $this->refus('Ce compte n’existe pas.', Response::HTTP_NOT_FOUND);
        }

        $donnees = \json_decode($requete->getContent(), true);
        $actif = \is_array($donnees) && true === ($donnees['actif'] ?? null);

        if ($actif) {
            $raison = ProtectionDuCompte::raisonDeRefuserReactivation();
        } else {
            $raison = ProtectionDuCompte::raisonDeRefuserBlocage(
                estMoi: $this->estMoi($id),
                cibleEstAdmin: $this->estAdmin($cible),
                cibleEstActive: (bool) $cible['actif'],
                adminsActifs: $this->administrateursActifs(),
            );
        }

        if (null !== $raison) {
            return $this->refus($raison);
        }

        $this->cnx->transactional(function () use ($id, $actif): void {
            $this->cnx->executeStatement(
                'UPDATE utilisateur SET actif = :a WHERE id = :id',
                ['a' => $actif ? 'true' : 'false', 'id' => $id],
            );

            if (!$actif) {
                /* LA REGLE N'EST PAS RECOPIEE ICI, ELLE EST APPELEE.
                   Ce `DELETE` etait ecrit a la main, et son jumeau l'etait
                   aussi dans `UtilisateurProcessor` : deux copies d'une meme
                   decision, qui divergeaient deja. Depuis le 17 septembre 2026
                   les deux appellent le service qui connait les jetons. */
                $this->jetons->revoquerTout($id);
            }
        });

        return $this->json(['actif' => $actif]);
    }

    /**
     * Supprime un compte, et tout ce qu'il contient.
     *
     * La cascade est ecrite dans la BASE, pas ici : chaque table qui pointe
     * vers `utilisateur` declare `ON DELETE CASCADE` ou `SET NULL`. Refaire ce
     * travail en PHP donnerait deux verites sur la meme question, et celle du
     * code finirait par mentir — il suffit d'ajouter une table en oubliant de
     * revenir ici.
     *
     * Une instruction pour le compte, donc, et la base fait le reste. DEUX
     * EXCEPTIONS, dans la meme transaction.
     *
     * SES ALIMENTS.
     * `aliment.utilisateur_id` est en `ON DELETE CASCADE`, mais
     * `stock.aliment_id` est en RESTRICT, et PostgreSQL ne garantit pas
     * l'ordre dans lequel il deroule deux cascades partant du meme compte. On
     * supprime donc explicitement ses aliments, dans l'ordre que les cles
     * etrangeres imposent — le stock qui les vise d'abord.
     *
     * SES EXERCICES PERSONNELS. `exercice.cree_par` est en `SET NULL` : la
     * cascade les laisserait sans auteur ni publication, visibles de
     * personne. On les releve avant, et on les retire apres — voir le corps.
     */
    #[Route('/comptes/{id}', methods: ['DELETE'])]
    public function supprimer(string $id): JsonResponse
    {
        $cible = $this->compte($id);
        if (null === $cible) {
            return $this->refus('Ce compte n’existe pas.', Response::HTTP_NOT_FOUND);
        }

        $raison = ProtectionDuCompte::raisonDeRefuserSuppression(
            estMoi: $this->estMoi($id),
            cibleEstAdmin: $this->estAdmin($cible),
            cibleEstActive: (bool) $cible['actif'],
            adminsActifs: $this->administrateursActifs(),
        );

        if (null !== $raison) {
            return $this->refus($raison);
        }

        $this->cnx->transactional(function () use ($id): void {
            /* Le stock qui vise ses aliments, puis ses aliments. Depuis la
               migration 35, seul son propre stock peut les viser ; la
               suppression explicite reste pour l'ordre, que deux cascades
               parties du meme compte ne garantissent pas. */
            $this->cnx->executeStatement(
                'DELETE FROM stock WHERE aliment_id IN (SELECT id FROM aliment WHERE utilisateur_id = :u)',
                ['u' => $id],
            );
            $this->cnx->executeStatement('DELETE FROM aliment WHERE utilisateur_id = :u', ['u' => $id]);

            /* SES EXERCICES PERSONNELS, RELEVES AVANT. `exercice.cree_par` est
               en `SET NULL` : sans ce releve, le compte parti, on ne saurait
               plus lesquels etaient a lui, et ils resteraient sans auteur ni
               publication — visibles de personne. */
            $exercices = $this->cnx->fetchFirstColumn(
                'SELECT id FROM exercice WHERE cree_par = :u AND NOT public', ['u' => $id]);

            $this->cnx->executeStatement('DELETE FROM utilisateur WHERE id = :id', ['id' => $id]);

            /* APRES le compte, dont les seances et les modeles les citaient
               encore (RESTRICT). Un exercice qu'un AUTRE compte cite toujours
               — possible pour une seance d'avant le 14 septembre 2026, quand
               les exercices personnels se voyaient de tous — reste en place :
               le supprimer ferait echouer toute la suppression. */
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

        return $this->json(['supprime' => true, 'email' => (string) $cible['email']]);
    }

    // ------------------------------------------------------------- outils

    private function compte(string $id): ?array
    {
        /* L'identifiant vient de l'URL : PostgreSQL refuse un UUID mal forme
           avec une erreur 500 illisible plutot qu'un resultat vide. On borne
           donc la forme avant d'interroger. */
        if (1 !== \preg_match('/^[0-9a-f-]{36}$/i', $id)) {
            return null;
        }

        $ligne = $this->cnx->fetchAssociative(
            'SELECT id, email, nom, roles, actif FROM utilisateur WHERE id = :id',
            ['id' => $id],
        );

        return false === $ligne ? null : $ligne;
    }

    private function estAdmin(array $compte): bool
    {
        return \in_array('ROLE_ADMIN', \explode(',', (string) $compte['roles']), true);
    }

    private function estMoi(string $id): bool
    {
        return $this->moi()->getId()->toRfc4122() === \mb_strtolower($id);
    }

    /**
     * Combien d'administrateurs peuvent encore ouvrir cet ecran.
     *
     * On compte les ACTIFS : un administrateur desactive ne peut plus rien
     * gerer, donc il ne compte pas comme filet de securite.
     */
    private function administrateursActifs(): int
    {
        return (int) $this->cnx->fetchOne(
            "SELECT count(*) FROM utilisateur
              WHERE actif = true AND roles LIKE '%ROLE_ADMIN%'",
        );
    }

    private function moi(): Utilisateur
    {
        $u = $this->getUser();
        \assert($u instanceof Utilisateur);

        return $u;
    }

    private function refus(string $message, int $statut = Response::HTTP_UNPROCESSABLE_ENTITY): JsonResponse
    {
        return $this->json(['erreur' => $message], $statut);
    }
}
