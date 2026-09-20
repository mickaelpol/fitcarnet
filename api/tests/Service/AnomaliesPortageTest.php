<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\AnomaliesAliment;
use PHPUnit\Framework\TestCase;

/**
 * LE PORTAGE DIT-IL EXACTEMENT LA MEME CHOSE QUE LE FRONT ?
 *
 * `AnomaliesAliment` est la traduction de `front/src/calcul/plausibilite.ts`,
 * ecrite le 20 septembre 2026 pour que le metier vive sur le serveur : « comme
 * ca je peux changer le front quand bon me semble ».
 *
 * QUATORZE ANOMALIES, TROIS GRAVITES, DES MESSAGES DE DIX LIGNES. On ne verifie
 * pas ca en se relisant — c'est exactement la methode qui produit une
 * divergence silencieuse, celle que ce depot passe son temps a rattraper.
 *
 * ON COMPARE DONC SUR UN CORPUS. Le front a tourne sur 14 400 combinaisons —
 * 50 aliments CIQUAL reels x 8 categories x 12 rendements, plus douze cas
 * fabriques pour les anomalies que des donnees propres ne declenchent jamais —
 * et sa reponse est figee dans `tests/corpus/anomalies-reference.json.gz`.
 * Ce test exige le MEME resultat : meme gravite, meme code, meme message, dans
 * le meme ordre.
 *
 * LE FICHIER EST UN ARTEFACT DE MIGRATION, pas un fichier de regles. Il fige ce
 * que l'ancien code repondait, le temps de prouver que le nouveau repond pareil.
 * Une fois le juge du front retire et cette suite verte quelque temps, il n'a
 * plus de raison d'exister — contrairement a un contrat, qu'on garde.
 */
final class AnomaliesPortageTest extends TestCase
{
    public function testLePortageRendExactementCeQueLeFrontRendait(): void
    {
        $reference = self::reference();

        self::assertGreaterThan(3_000, \count($reference),
            'un corpus trop maigre ne prouverait rien');

        $ecarts = [];
        foreach ($reference as $cas) {
            $attendu = $cas['anomalies'];
            $obtenu = self::rejouer($cas['entree']);

            if ($attendu !== $obtenu) {
                $ecarts[] = \sprintf(
                    "%s\n    front : %s\n    api   : %s",
                    (string) $cas['cle'],
                    \json_encode($attendu, \JSON_UNESCAPED_UNICODE),
                    \json_encode($obtenu, \JSON_UNESCAPED_UNICODE),
                );
            }

            if (\count($ecarts) >= 5) {
                break;
            }
        }

        self::assertSame([], $ecarts,
            "Le portage PHP ne dit pas la meme chose que le front :\n"
            . \implode("\n", $ecarts));
    }

    /**
     * LE TEMOIN : le corpus eprouve bien les quatorze anomalies.
     *
     * Sans ce controle, un corpus reduit a des cas sans anomalie passerait le
     * test ci-dessus en ne garantissant rien — motif 4 du projet, le test qui
     * ne peut pas echouer.
     */
    public function testLeCorpusCouvreLesQuatorzeAnomalies(): void
    {
        $codes = [];
        foreach (self::reference() as $cas) {
            foreach ($cas['anomalies'] as $a) {
                $codes[(string) $a['code']] = true;
            }
        }

        self::assertCount(14, $codes,
            'le corpus doit eprouver les quatorze anomalies, il en couvre '
            . \count($codes) . ' : ' . \implode(', ', \array_keys($codes)));
    }

    // ----------------------------------------------------------------- outils

    /**
     * @param array<string, mixed> $entree
     *
     * @return list<array{gravite: string, code: string, message: string}>
     */
    private static function rejouer(array $entree): array
    {
        return AnomaliesAliment::pour(
            (string) $entree['nom'],
            (string) $entree['categorie'],
            self::nombre($entree['kcal100']) ?? 0.0,
            self::nombre($entree['prot100']) ?? 0.0,
            self::nombre($entree['gluc100']) ?? 0.0,
            self::nombre($entree['lip100']) ?? 0.0,
            self::nombre($entree['fibres100']),
            (float) $entree['ratio'],
        );
    }

    /**
     * JSON n'a pas de quoi dire « pas un nombre » : le generateur ecrit la
     * chaine « NaN ». Sans cette relecture, les cas « valeur illisible »
     * arriveraient en zeros et le portage paraitrait diverger alors qu'il
     * n'aurait jamais recu l'entree.
     */
    private static function nombre(mixed $v): ?float
    {
        if ('NaN' === $v) {
            return \NAN;
        }

        return null === $v ? null : (float) $v;
    }

    /** @return list<array<string, mixed>> */
    private static function reference(): array
    {
        $chemin = \dirname(__DIR__) . '/corpus/anomalies-reference.json.gz';

        self::assertFileExists($chemin,
            'le corpus de comparaison est ce qui prouve que le portage est fidele');

        /** @var list<array<string, mixed>> */
        return (array) \json_decode(
            (string) \gzdecode((string) \file_get_contents($chemin)),
            true, flags: \JSON_THROW_ON_ERROR);
    }
}
