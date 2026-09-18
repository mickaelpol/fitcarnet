<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\Utilisateur;
use App\Repository\CuissonsHabituelles;
use App\Service\LotDHabitudes;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * LES CUISSONS HABITUELLES D'UN COMPTE.
 *
 * Deux verbes, et ce sont exactement les deux gestes de l'ecran : lire les
 * defauts avant de composer, ecrire ce que l'utilisateur vient de decider.
 *
 * POURQUOI PUT ET NON POST
 *
 * L'ecriture est un REMPLACEMENT par cle naturelle : « desormais, mon riz
 * passe a l'eau ». Rejoue deux fois, elle donne le meme etat — c'est la
 * definition de PUT. Un POST empilerait, ou echouerait sur l'index unique des
 * la deuxieme fois, et l'ecran devrait lire avant chaque ecriture pour savoir
 * lequel des deux verbes employer. On dit ce qu'on fait : voila l'etat.
 *
 * POURQUOI UN LOT ET NON UNE LIGNE
 *
 * « Les 12 autres se mangent sans cuisson » est UN geste de l'utilisateur.
 * Douze appels le feraient reussir a moitie : sept habitudes ecrites, cinq
 * perdues dans une coupure de reseau, et aucun moyen de savoir lesquelles.
 * Un seul appel, une seule transaction — il passe ou il ne passe pas.
 *
 * OU EST PASSE LE SQL
 *
 * Dans `App\Repository\CuissonsHabituelles`, depuis le 18 septembre 2026 — avec
 * la raison de l'`ON CONFLICT DO UPDATE`, qui n'a pas change en changeant de
 * place. Un controleur lit la requete, appelle, repond ; il ne parle pas SQL.
 */
#[Route('/api')]
#[IsGranted('ROLE_USER')]
final class CuissonsController extends AbstractController
{
    public function __construct(private readonly CuissonsHabituelles $habitudes)
    {
    }

    /**
     * Ce que ce compte a deja decide.
     *
     * `mode` a trois valeurs, et la troisieme n'est pas dans la reponse :
     * un entier (cuit ainsi), `null` (se mange sans cuisson), et l'ABSENCE
     * de la ligne (jamais decide, l'ecran demandera). Repondre `null` pour
     * un aliment jamais rencontre effacerait cette derniere distinction.
     */
    #[Route('/mes-cuissons', methods: ['GET'])]
    public function lire(): JsonResponse
    {
        return $this->json([
            'habitudes' => $this->habitudes->lire($this->moi()),
        ]);
    }

    /**
     * Enregistre, ou remplace, des habitudes.
     *
     * Corps attendu :
     *   { "habitudes": [ { "aliment": "riz basmati", "mode": 2 },
     *                    { "aliment": "skyr",        "mode": null } ] }
     *
     * `aliment` est la cle deja normalisee par l'ecran. On ne la retouche pas
     * — on la borne et on refuse le vide, c'est tout ce que l'API a le droit
     * de savoir d'elle.
     */
    #[Route('/mes-cuissons', methods: ['PUT'])]
    public function ecrire(Request $requete): JsonResponse
    {
        $donnees = (array) \json_decode($requete->getContent(), true);

        /* Les modes existants, lus UNE fois. C'est la seule chose que la
           validation ne puisse pas savoir toute seule. */
        $connus = $this->habitudes->modesConnus();

        /* Toute la validation — bornes, dedoublonnage, distinction entre
           « mode absent » et « mode null » — vit dans `LotDHabitudes`, ou elle
           s'eprouve sans base ni noyau. Ce controleur ne fait plus que lire,
           appeler, ecrire. */
        $lot = LotDHabitudes::depuis($donnees['habitudes'] ?? null, $connus);

        if (!$lot->estValide()) {
            return $this->json(['erreur' => $lot->erreur], 422);
        }

        /* Le lot vide n'a plus son cas ici : le depot n'ouvre pas de
           transaction pour rien et rend 0. Deux endroits pour une seule regle,
           c'est le jumeau oublie que ce projet connait bien. */
        return $this->json([
            'enregistrees' => $this->habitudes->remplacer($this->moi(), $lot->aEcrire),
        ]);
    }

    /*
     * PAS DE DELETE, et c'est un choix, pas un oubli.
     *
     * J'avais ecrit un `DELETE /api/mes-cuissons` pour « oublier » une
     * habitude. Il ne servait a rien : une habitude ne se supprime pas, elle
     * se REMPLACE. Un aliment qu'on ne cuit plus a l'eau, on le cuit
     * autrement — ou on le mange tel quel, ce qui est aussi une reponse. Le
     * seul cas que le DELETE couvrait vraiment, c'est l'aliment qu'on ne
     * cuisine plus du tout ; celui-la ne reapparait jamais dans un plan, donc
     * son habitude ne sera jamais relue.
     *
     * Une ligne de code qui ne repond a aucun geste de l'utilisateur est du
     * poids mort : elle demande a etre maintenue, testee et comprise, en
     * echange de rien.
     */

    /**
     * L'identifiant du compte connecte, EN CHAINE.
     *
     * Le depot recoit une chaine et non un objet `Uuid` : l'ancien code passait
     * l'objet a DBAL, qui s'en sortait par la conversion `Stringable` de PDO —
     * une dependance implicite que personne n'avait verifiee.
     */
    private function moi(): string
    {
        $u = $this->getUser();
        \assert($u instanceof Utilisateur);

        return $u->getId()->toRfc4122();
    }
}
