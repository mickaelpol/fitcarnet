<?php

declare(strict_types=1);

namespace App\Controller;

use App\Service\CoherenceDesCibles;
use App\Service\ModesDeTravail;
use App\Service\MotDePasse;
use App\Service\PlanCoach;
use App\Service\VerdictAliment;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\RateLimiter\RateLimiterFactoryInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * CE QUE L'ECRAN DOIT DIRE, DEMANDE AU SERVEUR.
 *
 * DECISION DU 20 SEPTEMBRE 2026 : « tout doit passer par le serveur car le
 * metier doit etre sur le serveur et puis c'est tout, comme ca je peux changer
 * le front quand bon me semble ».
 *
 * Cette route ne lit rien et n'ecrit rien. Elle repond a une seule question :
 * « voila ce qui est tape — qu'est-ce que j'affiche, et puis-je enregistrer ? »
 *
 * POURQUOI UNE ROUTE ET NON UN FICHIER DE REGLES. Un fichier de regles est un
 * contrat : il suppose qu'un futur front pense a le lire. Une route ne le
 * suppose pas — un ecran qui ne l'appelle pas n'affiche rien, et ca se voit
 * tout de suite. C'est la difference entre une duplication gardee et une
 * duplication supprimee.
 *
 * ELLE EST APPELEE PENDANT LA SAISIE, avec anti-rebond cote ecran : un appel
 * par PAUSE de frappe, pas par caractere. L'ecran garde le dernier verdict en
 * attendant le suivant, si bien que rien ne clignote.
 *
 * HORS LIGNE, IL N'Y A PAS DE VERDICT, et c'est assume : le mode hors ligne du
 * projet est « lecture, ecritures en file, aucun calcul nouveau ». Une saisie
 * faite hors ligne part en file et se fait juger au moment ou elle passe.
 */
#[Route('/api')]
final class VerificationController extends AbstractController
{
    /**
     * Le verdict d'un aliment en cours de saisie.
     *
     * AUTHENTIFIEE, bien qu'elle ne touche a aucune donnee : elle repond sur
     * des regles metier, et rien n'oblige a les offrir a qui n'a pas de compte.
     *
     * AUCUN CHAMP N'EST OBLIGATOIRE : c'est tout l'interet. L'ecran appelle des
     * la premiere frappe, et le serveur dit ce qu'il peut dire avec ce qu'il a.
     */
    #[Route('/verification/aliment', methods: ['POST'])]
    #[IsGranted('IS_AUTHENTICATED_FULLY')]
    public function aliment(Request $requete): JsonResponse
    {
        /** @var array<string, mixed> $saisie */
        $saisie = (array) \json_decode((string) $requete->getContent(), true);

        return $this->json(VerdictAliment::pour($saisie));
    }

    /**
     * L'AVERTISSEMENT D'UNE CIBLE EN COURS DE SAISIE — palier B, 21 septembre 2026.
     *
     * L'ecran des objectifs jugeait lui-meme : il portait le seuil de 15 kcal,
     * les deux conventions de glucides et la phrase. Il n'a plus rien de tout
     * cela — il affiche `avertissement` tel quel, ou rien.
     *
     * CE N'EST PAS UN REFUS, et c'est voulu. `Cible::verifierLUniteDesCalories`
     * refuse les kilojoules, seule erreur d'unite ; celle-ci AVERTIT et laisse
     * enregistrer. « Quelqu'un recopie un plan de coach qui ne tombe pas juste,
     * et on ne lui interdit pas de le saisir. »
     *
     * AUCUN CHAMP N'EST OBLIGATOIRE, comme pour l'aliment : l'ecran appelle des
     * la premiere frappe, et ce qui manque vaut zero gramme. L'ecran n'envoie
     * que ce qu'il a DEJA lu — la virgule et le vide sont de la saisie, pas du
     * metier (`saisieNombre.ts`), et c'est la seule chose qui lui reste ici.
     */
    #[Route('/verification/cible', methods: ['POST'])]
    #[IsGranted('IS_AUTHENTICATED_FULLY')]
    public function cible(Request $requete): JsonResponse
    {
        /** @var array<string, mixed> $saisie */
        $saisie = (array) \json_decode((string) $requete->getContent(), true);

        return $this->json([
            'avertissement' => CoherenceDesCibles::avertissement(
                (float) ($saisie['kcal'] ?? 0),
                (float) ($saisie['prot'] ?? 0),
                (float) ($saisie['gluc'] ?? 0),
                (float) ($saisie['lip'] ?? 0),
                (bool) ($saisie['glucidesTotaux'] ?? false),
            ),
        ]);
    }

    /**
     * UN PLAN DE COACH AMERICAIN, CONVERTI — palier B, 21 septembre 2026.
     *
     * Les plans americains comptent les fibres DANS les glucides ; l'application
     * les compte a part, a 2 kcal/g (regle 4). L'ecran des objectifs portait
     * cette conversion, le seuil de plausibilite des fibres et la phrase qui
     * l'accompagne : `front/src/calcul/planCoach.ts` est supprime dans le meme
     * commit, il n'en reste rien au front.
     *
     * L'ECRAN NE DEVINE PAS LA CONVENTION, IL LA DEMANDE A L'UTILISATEUR — et
     * ce bloc n'est ouvert que si celui-ci l'a ouvert. La route ne fait donc que
     * repondre a ce qui est tape, comme les autres de ce contrat.
     *
     * AUCUN CHAMP N'EST OBLIGATOIRE : ce qui manque vaut zero gramme.
     */
    #[Route('/verification/plan-coach', methods: ['POST'])]
    #[IsGranted('IS_AUTHENTICATED_FULLY')]
    public function planCoach(Request $requete): JsonResponse
    {
        /** @var array<string, mixed> $saisie */
        $saisie = (array) \json_decode((string) $requete->getContent(), true);

        $glucides = (float) ($saisie['gluc'] ?? 0);
        $fibres = (float) ($saisie['fibres'] ?? 0);

        return $this->json([
            'cible' => PlanCoach::convertir(
                (float) ($saisie['kcal'] ?? 0),
                (float) ($saisie['prot'] ?? 0),
                $glucides,
                (float) ($saisie['lip'] ?? 0),
                $fibres,
            ),
            'avertissement' => PlanCoach::avertissementDesFibres($glucides, $fibres),
        ]);
    }

    /**
     * COMBIEN DE SERIES COMPTENT, SELON LA FACON DONT ON TRAVAILLE.
     *
     * POURQUOI L'ECRAN A BESOIN DE CA, et pourquoi un poids par serie ne
     * suffisait pas. L'ecran d'une seance est autoritaire sur son etat local :
     * il ajoute un exercice, supprime une ligne, bascule un mode, et le
     * compteur « 7 sur 12 » doit suivre le geste SANS aller-retour reseau,
     * hors ligne compris.
     *
     * Un poids par serie est DERIVE du mode et du rang de la ligne — les deux
     * choses que ces gestes changent. Il etait donc perime des le premier
     * geste : ajouter un exercice « for time » affichait 0/3 la ou le serveur
     * dirait 0/1. Mesure et corrige le 21 septembre 2026.
     *
     * Ce catalogue, lui, est indexe sur le MODE : un bloc fabrique a l'ecran a
     * un mode, une bascule change la cle et pas la reponse. L'ecran fait une
     * addition parametree, il ne decide rien.
     *
     * AUTHENTIFIEE ET SANS CACHE COTE SERVEUR : la reponse ne depend d'aucune
     * donnee de compte, mais rien n'oblige a l'offrir a qui n'a pas de compte.
     * L'ecran, lui, ne la redemande jamais (`staleTime: Infinity`).
     */
    #[Route('/modes-de-travail', methods: ['GET'])]
    #[IsGranted('IS_AUTHENTICATED_FULLY')]
    public function modesDeTravail(): JsonResponse
    {
        return $this->json(ModesDeTravail::catalogue());
    }

    /**
     * La jauge d'un mot de passe en cours de frappe.
     *
     * PAS AUTHENTIFIEE, et il le faut : elle sert AUSSI a l'ecran
     * d'invitation, ou personne n'a encore de compte. Le pare-feu
     * `verification_publique` de `security.yaml` l'ouvre, comme il ouvre deja
     * `invitation` et `etat`.
     *
     * ELLE NE JOURNALISE RIEN ET NE STOCKE RIEN. Le mot de passe passe par le
     * corps d'un POST, sur le meme canal chiffre que l'envoi du formulaire —
     * qui le transmet de toute facon. Ce n'est donc pas une exposition
     * nouvelle ; mais c'est une raison de ne jamais mettre ce corps dans un
     * journal.
     */
    #[Route('/verification/mot-de-passe', methods: ['POST'])]
    public function motDePasse(
        Request $requete,
        /* LE NOM DE CET ARGUMENT EST LA CONFIGURATION. Symfony relie
           `verification_publique` de `rate_limiter.yaml` a un argument nomme
           « le nom en camelCase + Limiter ». Le renommer coupe le limiteur
           SANS ERREUR au demarrage : c'est un lien par convention, et c'est le
           genre de garde qui disparait sans bruit. */
        RateLimiterFactoryInterface $verificationPubliqueLimiter,
    ): JsonResponse {
        /* TOUTE ROUTE OUVERTE EST BORNEE — 21 septembre 2026. Celle-ci est la
           seule sans compte, parce que l'ecran d'invitation en a besoin. */
        $limite = $verificationPubliqueLimiter->create($requete->getClientIp())->consume(1);

        if (!$limite->isAccepted()) {
            /* ON REPOND EN JSON PLUTOT QUE DE LEVER. `TooManyRequestsHttpException`
               rend du HTML des que le client ne negocie rien — mesure le
               21 septembre 2026 : `Content-Type: text/html` sur une route dont
               TOUS les clients attendent du JSON. L'ecran aurait affiche une
               page d'erreur Symfony dans son bandeau, ou rien du tout.

               ET ON DIT QUAND REESSAYER, en en-tete comme dans le corps : un
               refus qui ne dit pas combien de temps il dure se lit comme une
               panne (regle 7). */
            $secondes = \max(1, $limite->getRetryAfter()->getTimestamp() - \time());

            return $this->json([
                'dit' => \sprintf(
                    'Trop de vérifications depuis cette adresse. Réessaie dans %d seconde%s.',
                    $secondes, $secondes > 1 ? 's' : ''),
                'reessayerDansSecondes' => $secondes,
            ], 429, ['Retry-After' => (string) $secondes]);
        }

        /** @var array<string, mixed> $corps */
        $corps = (array) \json_decode((string) $requete->getContent(), true);
        $clair = (string) ($corps['motDePasse'] ?? '');

        $manquements = MotDePasse::manquements($clair);
        $force = MotDePasse::force($clair);

        return $this->json([
            'manquements' => $manquements,
            'exigences' => MotDePasse::exigences($clair),
            /* LA PHRASE, PAS SEULEMENT LES CLES. L'ecran n'a plus a traduire
               « longueur » en « douze caracteres » : c'est ce qui lui faisait
               porter le chiffre, et c'est ainsi qu'un ecran a conseille « ni
               majuscule ni chiffre imposes » le jour ou le serveur a commence
               a les exiger. */
            'dit' => MotDePasse::pourquoiRefuse($clair),
            'acceptable' => [] === $manquements,
            'force' => $force,
            'motDeLaForce' => MotDePasse::motDeLaForce($force),
        ]);
    }
}
