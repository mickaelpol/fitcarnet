<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\PlanRepas;
use App\Entity\Utilisateur;
use App\Service\DeductionDuPlan;
use App\Service\Frigo;
use App\Service\FrigoBase;
use App\Service\FrigoGrocy;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * « J'AI CUISINE CE PLAN. »
 *
 * LE BUG QUE CE BOUTON CORRIGE
 *
 * Deux batch cooking d'affilee comptaient DEUX FOIS le meme frigo. On compose
 * lundi-mercredi, on enregistre ; on compose jeudi-samedi, et le solveur
 * repartait du stock d'avant. Le premier plan avait beau vider les 800 g de
 * poulet, le second annoncait « objectifs atteints » sur du poulet qui
 * n'existait plus. Chaque plan etait juste tout seul ; ensemble, ils
 * mentaient — et rien ne le disait.
 *
 * DEUX ETATS, DEUX ROLES
 *
 *   - PREVU (`cuisine_le` NULL) : la nourriture est encore dans le frigo,
 *     mais elle est promise. L'ecran la retire du stock disponible sans rien
 *     ecrire. Supprimer le plan la rend.
 *   - CUISINE : la nourriture a quitte le frigo, et le stock a ete decremente
 *     ICI, au moment de l'appui. Le plan ne reserve plus rien — sinon on
 *     deduirait deux fois.
 *
 * POURQUOI L'APPEL FAIT LES DEUX GESTES, ET DANS CET ORDRE
 *
 * Decrementer le frigo et marquer le plan sont un seul fait : « c'est
 * cuisine ». Un seul appel, donc — deux appels laisseraient l'ecran gerer
 * lui-meme le cas ou le premier passe et le second non.
 *
 * Mais UN SEUL APPEL N'EST PAS UNE TRANSACTION, et je l'avais ecrit ici comme
 * si ca l'etait. Grocy est un serveur distant : entre le dernier inventaire
 * ecrit et le `flush()`, PHP peut mourir — depassement de temps, conteneur
 * qui redemarre, coupure. Les deux gestes se desynchronisent, et il faut
 * choisir DANS QUEL SENS.
 *
 *   - Stock d'abord : la panne laisse un stock baisse pour un plan qui
 *     reserve encore. Il deduit deux fois, en silence — precisement le defaut
 *     que ce bouton existe pour corriger.
 *   - Marquage d'abord : la panne laisse un plan cuisine sur un frigo intact.
 *     On surestime son stock, on le voit en ouvrant le frigo, on corrige.
 *
 * On marque d'abord. Entre deux pannes possibles, on prend celle qui se
 * voit.
 *
 * ON MARQUE MEME SI UNE LIGNE DU FRIGO RESISTE. Le plan est cuisine, c'est un
 * fait du monde, pas une consequence de l'ecriture. Les lignes qui n'ont pas
 * pu etre decrementees sont RENDUES a l'ecran pour etre corrigees a la main —
 * refuser de marquer laisserait le plan reserver eternellement un stock deja
 * mange.
 */
#[Route('/api')]
#[IsGranted('ROLE_USER')]
final class PlansController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly Frigo $frigo,
        private readonly FrigoBase $base,
        private readonly FrigoGrocy $grocy,
    ) {
    }

    #[Route('/plan_repas/{id}/cuisine', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function cuisine(int $id): JsonResponse
    {
        $utilisateur = $this->utilisateur();
        $plan = $this->em->getRepository(PlanRepas::class)->find($id);

        if (null === $plan || $plan->getUtilisateur() !== $utilisateur) {
            return $this->json(['erreur' => 'Plan introuvable.'], 404);
        }
        if (null !== $plan->getCuisineLe()) {
            // Deja fait. Un second appui ne doit PAS rededuire : ce serait la
            // meme erreur que le double comptage, dans l'autre sens.
            return $this->json(['erreur' => 'Ce plan est déjà marqué cuisiné.'], 409);
        }

        $consomme = $plan->getContenu()['consomme'] ?? null;
        if (!\is_array($consomme) || [] === $consomme) {
            /* Un plan enregistre AVANT cette fonctionnalite ne dit pas ce
               qu'il consomme. On ne devine pas a partir de ses noms : une
               deduction fausse viderait le mauvais bac. */
            return $this->json([
                'erreur' => 'Ce plan a été enregistré avant cette fonctionnalité : '
                          . 'il ne sait pas ce qu\'il prend au frigo. Refais-en un '
                          . 'pour que la déduction fonctionne.',
            ], 422);
        }

        try {
            $aliments = $this->frigo->lire($utilisateur);
        } catch (\RuntimeException $e) {
            return $this->json(['erreur' => $e->getMessage()], 502);
        }

        $parReference = [];
        foreach ($aliments as $a) {
            $parReference[$a->reference] = $a;
        }

        /* Tout le calcul — grammes vers unites, plancher a zero, lignes
           inapplicables — vit dans `DeductionDuPlan`, ou il s'eprouve sans
           base, sans noyau et sans Grocy. C'est le seul endroit du projet qui
           ecrit dans le stock de quelqu'un sans qu'il ait tape le chiffre :
           une erreur ici ne se voit pas a l'ecran, elle se voit devant un bac
           vide une semaine plus tard. */
        $deduction = DeductionDuPlan::calculer($consomme, $parReference);
        $nouvellesQuantites = $deduction->quantites;
        $ignores = $deduction->ignores;

        /* ON MARQUE LE PLAN AVANT DE TOUCHER AU STOCK. L'ordre inverse etait
           le mien, et il etait faux.

           J'avais ecrit dans l'en-tete de ce fichier que les deux gestes
           tenaient dans « un seul appel », donc qu'ils ne pouvaient pas se
           desynchroniser. C'est faux : un appel HTTP n'est pas une
           transaction. Grocy est un serveur DISTANT, et rien ne garantit que
           PHP soit encore vivant entre le dernier inventaire ecrit et le
           `flush()` — un depassement de temps, un conteneur qui redemarre,
           une coupure, et la requete meurt entre les deux.

           Dans l'ordre d'avant, cette mort laissait : stock DEJA baisse, plan
           TOUJOURS prevu — donc qui reserve encore ce qu'il vient de
           consommer. Deduit deux fois, en silence, et c'est exactement le
           defaut que ce bouton existe pour corriger.

           Dans ce sens-ci, la meme mort laisse : plan marque cuisine, stock
           PAS ENCORE baisse. On surestime son frigo, on le voit en l'ouvrant,
           et on corrige a la main. Aucun double comptage.

           Les deux pannes sont possibles ; on choisit celle qui se voit. */
        $plan->marquerCuisine();
        $this->em->flush();

        $echecs = [];
        if ([] !== $nouvellesQuantites) {
            if ('grocy' === $this->frigo->source($utilisateur)) {
                try {
                    $echecs = $this->grocy->inventorier($nouvellesQuantites);
                } catch (\RuntimeException $e) {
                    /* Le plan reste cuisine — il l'est. On rend la liste de ce
                       qu'il faut retirer soi-meme plutot qu'une erreur seche
                       qui laisserait croire que rien n'a eu lieu. */
                    return $this->json([
                        'cuisineLe' => $plan->getCuisineLe()?->format(\DATE_ATOM),
                        'deduits' => 0,
                        'ignores' => \array_map(
                            static fn (array $l) => ['nom' => $l['nom'], 'motif' => $e->getMessage()],
                            $deduction->ignores) ?: [['nom' => 'tout le plan', 'motif' => $e->getMessage()]],
                    ]);
                }
            } else {
                foreach ($nouvellesQuantites as $idAliment => $quantite) {
                    $this->base->definirStock($utilisateur, $idAliment, $quantite);
                }
            }
        }

        foreach ($echecs as $idSource => $motif) {
            $ignores[] = ['nom' => (string) $idSource, 'motif' => (string) $motif];
        }

        return $this->json([
            'cuisineLe' => $plan->getCuisineLe()?->format(\DATE_ATOM),
            'deduits' => \count($nouvellesQuantites) - \count($echecs),
            'ignores' => $ignores,
        ]);
    }

    private function utilisateur(): Utilisateur
    {
        $u = $this->getUser();
        \assert($u instanceof Utilisateur);

        return $u;
    }
}
