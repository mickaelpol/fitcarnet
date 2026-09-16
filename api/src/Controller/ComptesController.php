<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\Utilisateur;
use App\Service\JetonsRafraichissement;
use App\Service\ProtectionDuCompte;
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
 * Un compte supprime emporte tout, par cascade de la base : seances, series,
 * plans, cibles, habitudes de cuisson, stock, jetons, ET SES ALIMENTS PRIVES.
 * Rien de tout cela ne se restaure sans une sauvegarde.
 *
 * Les aliments COMMUNS, eux, restent : ils n'appartiennent a personne. Seuls
 * partent ceux que ce compte avait crees pour lui — les laisser en faisait
 * des aliments publics, ce qui est l'inverse de la regle.
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
     */
    #[Route('/comptes', methods: ['GET'])]
    public function lister(): JsonResponse
    {
        $lignes = $this->cnx->fetchAllAssociative(
            "SELECT u.id, u.email, u.nom, u.roles, u.actif, u.source_frigo, u.cree_le,
                    (SELECT count(*) FROM seance     s WHERE s.utilisateur_id = u.id) AS seances,
                    (SELECT count(*) FROM modele     m WHERE m.utilisateur_id = u.id) AS modeles,
                    (SELECT count(*) FROM plan_repas p WHERE p.utilisateur_id = u.id) AS plans,
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
     * Une seule instruction, donc, et la base fait le reste dans sa propre
     * transaction.
     *
     * UNE EXCEPTION, ET ELLE EST IMPORTANTE : LES ALIMENTS PRIVES.
     *
     * `aliment.cree_par` est en `ON DELETE SET NULL`. Un aliment prive dont on
     * supprime le proprietaire perd donc son auteur — et `FiltreAliment` ne
     * lit QUE `creePar IS NULL OR creePar = user`, jamais la colonne `public`.
     * Resultat : l'aliment prive de quelqu'un DEVENAIT VISIBLE DE TOUS. C'est
     * l'inverse exact de la regle posee dans `AlimentProcessor` — « sur des
     * valeurs nutritionnelles, l'erreur de l'un ne doit pas fausser la diete
     * des autres ».
     *
     * Et quand le nom collisionnait avec un aliment commun existant, le
     * `SET NULL` violait `aliment_nom_commun_unique` : 500 illisible, et le
     * compte devenait indelebile.
     *
     * On supprime donc explicitement ce qui lui appartenait, dans l'ordre que
     * les cles etrangeres imposent — `stock.aliment_id` est en RESTRICT, il
     * faut le vider d'abord.
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
            adminsActifs: $this->administrateursActifs(),
        );

        if (null !== $raison) {
            return $this->refus($raison);
        }

        $this->cnx->transactional(function () use ($id): void {
            /* Les lignes de stock qui visent ses aliments prives, quel qu'en
               soit le proprietaire. Une ligne appartenant a quelqu'un d'autre
               ne devrait pas exister — c'etait la faille corrigee dans
               `FrigoController` — mais si elle existe, elle bloquerait tout
               par la contrainte RESTRICT. */
            $this->cnx->executeStatement(
                'DELETE FROM stock WHERE aliment_id IN (SELECT id FROM aliment WHERE cree_par = :u)',
                ['u' => $id],
            );
            $this->cnx->executeStatement('DELETE FROM aliment WHERE cree_par = :u', ['u' => $id]);
            $this->cnx->executeStatement('DELETE FROM utilisateur WHERE id = :id', ['id' => $id]);
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
