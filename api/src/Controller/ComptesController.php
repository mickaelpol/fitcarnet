<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\Utilisateur;
use App\Repository\Comptes;
use App\Service\ProtectionDuCompte;
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
    public function __construct(private readonly Comptes $comptes)
    {
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
        $lignes = $this->comptes->tousAvecContenu();

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
        $cible = $this->comptes->parId($id);
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
                adminsActifs: $this->comptes->administrateursActifs(),
            );
        }

        if (null !== $raison) {
            return $this->refus($raison);
        }

        /* La mise a jour et la coupure des sessions tiennent dans une seule
           transaction, et c'est le depot qui la porte : un controleur n'a pas a
           connaitre les transactions plus qu'il n'a a connaitre le SQL. */
        $this->comptes->definirActif($id, $actif);

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
        $cible = $this->comptes->parId($id);
        if (null === $cible) {
            return $this->refus('Ce compte n’existe pas.', Response::HTTP_NOT_FOUND);
        }

        $raison = ProtectionDuCompte::raisonDeRefuserSuppression(
            estMoi: $this->estMoi($id),
            cibleEstAdmin: $this->estAdmin($cible),
            cibleEstActive: (bool) $cible['actif'],
            adminsActifs: $this->comptes->administrateursActifs(),
        );

        if (null !== $raison) {
            return $this->refus($raison);
        }

        $this->comptes->supprimer($id);

        return $this->json(['supprime' => true, 'email' => (string) $cible['email']]);
    }

    // ------------------------------------------------------------- outils

    private function estAdmin(array $compte): bool
    {
        return \in_array('ROLE_ADMIN', \explode(',', (string) $compte['roles']), true);
    }

    private function estMoi(string $id): bool
    {
        return $this->moi()->getId()->toRfc4122() === \mb_strtolower($id);
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
