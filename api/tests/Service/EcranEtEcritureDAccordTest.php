<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\CoherenceNutritionnelle;
use App\Service\VerdictAliment;
use PHPUnit\Framework\TestCase;

/**
 * L'ECRAN NE PROMET JAMAIS CE QUE L'ECRITURE REFUSERA.
 *
 * DEUX PORTES, UNE SEULE REGLE DE FOND — et c'est ce qu'il fallait verifier.
 *
 *   - `VerdictAliment` repond a l'ecran : « puis-je enregistrer ? ». Il allume
 *     ou eteint le bouton (`POST /api/verification/aliment`).
 *   - `CoherenceNutritionnelle` valide l'entite `Aliment` : c'est la vraie
 *     porte, celle que tout client doit franchir (`POST /api/aliments`).
 *
 * LES DEUX NE SONT PAS DES COPIES, et je l'ai cru avant de le mesurer :
 * `VerdictAliment` passe par `AnomaliesAliment`, qui APPELLE
 * `CoherenceNutritionnelle`. Preuve a l'execution — deplacer
 * `ATWATER_MINIMUM_POUR_REFUSER` fait bouger les DEUX reponses ensemble, donc
 * ce test ne tombe pas : il n'y a rien a desynchroniser de ce cote-la.
 *
 * L'ECART VIENT D'AILLEURS : l'ecran ajoute ses propres anomalies et exige en
 * plus `verdict !== 'incoherent'`, ce qui reproduit l'ancien `valide` du front
 * d'avant la refonte. Il est donc PLUS STRICT, jamais moins.
 *
 * L'INVARIANT : si l'ecran dit « enregistrable », l'ecriture DOIT passer.
 * L'inverse est permis, et il est delibere.
 *
 * POURQUOI L'INVERSE EST PERMIS, mesure le 21 septembre 2026 sur les 7 808 cas
 * lisibles du corpus : l'ecran refuse 2 096 cas que l'entite accepte, et
 * l'entite n'en refuse AUCUN que l'ecran promette.
 *
 * Ces 2 096 sont des croisements que le corpus fabrique expres — du « Pastis »
 * range en categorie proteines avec un rendement de 0,2. Sur de vraies valeurs,
 * l'ecran accepte le pastis, le vin, le vinaigre et le cidre (verdict `ecart`,
 * enregistrable). C'est precisement pour eux que
 * `CoherenceNutritionnelle::ATWATER_MINIMUM_POUR_REFUSER` existe : l'alcool
 * fait 7 kcal/g et n'entre dans AUCUNE macro, donc la somme d'Atwater ne peut
 * pas juger ces aliments-la. Rendre l'entite aussi stricte que l'ecran
 * ramenerait exactement la regression du 20 septembre 2026 — un serveur qui
 * refuse le vin.
 *
 * CE TEST NE GARDE DONC QU'UN SENS, et c'est celui qui compte : le bouton
 * allume doit tenir sa promesse. Un bouton eteint sur un aliment que l'entite
 * aurait accepte ne fait perdre personne.
 */
final class EcranEtEcritureDAccordTest extends TestCase
{
    public function testAUCUN_ALIMENT_PROMIS_PAR_L_ECRAN_N_EST_REFUSE_A_L_ECRITURE(): void
    {
        $trahisons = [];
        $promis = 0;

        foreach (self::corpus() as $entree) {
            $verdict = VerdictAliment::pour(self::saisie($entree));
            if (!$verdict['enregistrable']) {
                continue;
            }

            ++$promis;
            $motif = self::motifDeLEntite($entree);

            if (null !== $motif && \count($trahisons) < 5) {
                $trahisons[] = \sprintf('%s (%s, %s kcal, rendement %s) : %s',
                    (string) $entree['nom'], (string) $entree['categorie'],
                    (string) $entree['kcal100'], (string) $entree['ratio'], $motif);
            }
        }

        self::assertGreaterThan(3_000, $promis,
            'trop peu de cas promis : le corpus ne prouve plus rien');

        self::assertSame([], $trahisons,
            "L'ecran a allume son bouton sur des aliments que `POST /api/aliments` "
            . "refusera en 422. C'est la regle 7 prise a revers — on promet, puis "
            . "on refuse :\n  " . \implode("\n  ", $trahisons));
    }

    public function testLE_TEMOIN_L_ASYMETRIE_EXISTE_BIEN_DANS_L_AUTRE_SENS(): void
    {
        /* SANS CE CAS, LE TEST CI-DESSUS SERAIT VRAI POUR UNE MAUVAISE RAISON.
           Si les deux juges devenaient identiques, ou si l'un cessait de
           refuser quoi que ce soit, l'invariant tiendrait toujours — et on
           aurait perdu le garde sans le voir. Ce temoin dit que les deux
           repondent bien a la meme question avec des bornes differentes. */
        $ecranSeul = 0;

        foreach (self::corpus() as $entree) {
            if (!VerdictAliment::pour(self::saisie($entree))['enregistrable']
                && null === self::motifDeLEntite($entree)) {
                ++$ecranSeul;
            }
        }

        self::assertGreaterThan(500, $ecranSeul,
            'l\'ecran devrait rester plus strict que l\'entite sur les croisements '
            . 'impossibles du corpus ; s\'il ne l\'est plus, les bornes ont bouge');
    }

    // ----------------------------------------------------------------- outils

    /** @param array<string, mixed> $entree */
    private static function motifDeLEntite(array $entree): ?string
    {
        return CoherenceNutritionnelle::motifDeRefus(
            (string) $entree['categorie'],
            (float) $entree['kcal100'],
            (float) ($entree['prot100'] ?? 0),
            (float) ($entree['gluc100'] ?? 0),
            (float) ($entree['lip100'] ?? 0),
            null === $entree['fibres100'] ? null : (float) $entree['fibres100'],
            (float) $entree['ratio'],
        );
    }

    /**
     * @param array<string, mixed> $entree
     *
     * @return array<string, string>
     */
    private static function saisie(array $entree): array
    {
        return [
            'nom' => (string) $entree['nom'],
            'categorie' => (string) $entree['categorie'],
            'kcal100' => (string) $entree['kcal100'],
            'prot100' => (string) ($entree['prot100'] ?? 0),
            'gluc100' => (string) ($entree['gluc100'] ?? 0),
            'lip100' => (string) ($entree['lip100'] ?? 0),
            'fibres100' => null === $entree['fibres100'] ? '' : (string) $entree['fibres100'],
            'ratio' => (string) $entree['ratio'],
        ];
    }

    /**
     * Les cas LISIBLES du corpus de portage.
     *
     * On ecarte les « NaN » fabriques pour eprouver la lecture des nombres :
     * ils n'ont pas de valeur a comparer, et les deux juges les traitent par
     * des chemins differents — ce n'est pas ce qu'on mesure ici.
     *
     * @return iterable<array<string, mixed>>
     */
    private static function corpus(): iterable
    {
        $chemin = \dirname(__DIR__) . '/corpus/anomalies-reference.json.gz';

        self::assertFileExists($chemin);

        /** @var list<array{entree: array<string, mixed>}> $cas */
        $cas = (array) \json_decode(
            (string) \gzdecode((string) \file_get_contents($chemin)),
            true, flags: \JSON_THROW_ON_ERROR);

        foreach ($cas as $un) {
            $entree = $un['entree'];
            if ('NaN' === $entree['kcal100'] || null === $entree['kcal100']) {
                continue;
            }

            yield $entree;
        }
    }
}
