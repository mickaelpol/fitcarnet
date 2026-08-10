<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\Utilisateur;
use App\Service\LotDHabitudes;
use Doctrine\DBAL\Connection;
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
 * POURQUOI DU SQL ET NON L'ORM
 *
 * `ON CONFLICT DO UPDATE` fait en un aller-retour ce que l'ORM ferait en deux
 * (chercher, puis creer ou modifier) — et surtout, il le fait sans fenetre :
 * entre le « chercher » et le « creer » de l'ORM, un second envoi passerait
 * et le premier finirait sur une violation d'unicite. C'est le seul endroit
 * du projet ou la base sait faire quelque chose que Doctrine ne sait pas
 * dire, et le dire en SQL coute une ligne.
 */
#[Route('/api')]
#[IsGranted('ROLE_USER')]
final class CuissonsController extends AbstractController
{
    public function __construct(private readonly Connection $cnx)
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
        $lignes = $this->cnx->fetchAllAssociative(
            'SELECT aliment, mode_cuisson_id FROM cuisson_habituelle
              WHERE utilisateur_id = :u
              ORDER BY aliment',
            ['u' => $this->utilisateur()->getId()],
        );

        return $this->json([
            'habitudes' => \array_map(static fn (array $l) => [
                'aliment' => (string) $l['aliment'],
                'mode' => null === $l['mode_cuisson_id'] ? null : (int) $l['mode_cuisson_id'],
            ], $lignes),
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
        $connus = \array_map(
            static fn ($v) => (int) $v,
            $this->cnx->fetchFirstColumn('SELECT id FROM mode_cuisson'));

        /* Toute la validation — bornes, dedoublonnage, distinction entre
           « mode absent » et « mode null » — vit dans `LotDHabitudes`, ou elle
           s'eprouve sans base ni noyau. Ce controleur ne fait plus que lire,
           appeler, ecrire. */
        $lot = LotDHabitudes::depuis($donnees['habitudes'] ?? null, $connus);

        if (!$lot->estValide()) {
            return $this->json(['erreur' => $lot->erreur], 422);
        }
        if ([] === $lot->aEcrire) {
            return $this->json(['enregistrees' => 0]);
        }

        $aEcrire = $lot->aEcrire;
        $utilisateur = $this->utilisateur()->getId();

        /* Une transaction pour tout le lot : un geste de l'utilisateur passe
           entierement ou pas du tout. */
        $this->cnx->transactional(function (Connection $cnx) use ($aEcrire, $utilisateur): void {
            foreach ($aEcrire as $aliment => $mode) {
                $cnx->executeStatement(
                    'INSERT INTO cuisson_habituelle (utilisateur_id, aliment, mode_cuisson_id, maj_le)
                     VALUES (:u, :a, :m, now())
                     ON CONFLICT (utilisateur_id, aliment)
                     DO UPDATE SET mode_cuisson_id = EXCLUDED.mode_cuisson_id, maj_le = now()',
                    ['u' => $utilisateur, 'a' => (string) $aliment, 'm' => $mode],
                );
            }
        });

        return $this->json(['enregistrees' => \count($aEcrire)]);
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

    private function utilisateur(): Utilisateur
    {
        $u = $this->getUser();
        \assert($u instanceof Utilisateur);

        return $u;
    }
}
