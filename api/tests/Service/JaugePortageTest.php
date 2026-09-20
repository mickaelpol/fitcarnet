<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\MotDePasse;
use PHPUnit\Framework\TestCase;

/**
 * LA JAUGE DU SERVEUR DIT-ELLE CE QUE DISAIT CELLE DU FRONT ?
 *
 * `MotDePasse::force()` est le portage de `front/src/calcul/motDePasse.ts`,
 * ecrit le 20 septembre 2026 pour que le metier vive sur le serveur : « comme
 * ca je peux changer le front quand bon me semble ».
 *
 * ON NE SE RELIT PAS, ON COMPARE — la lecon du portage des anomalies, le meme
 * jour : trois messages sur 4 409 differaient d'un dixieme de gramme, et
 * personne ne les aurait vus. Le front a tourne sur 3 605 mots de passe
 * construits pour balayer toutes les combinaisons — chaque famille presente ou
 * absente, chaque longueur autour des deux bornes, et les accents — et sa
 * reponse est figee dans `tests/corpus/jauge-motdepasse.json.gz`.
 *
 * LE CAS QUI A MOTIVE LES ACCENTS EST DEDANS : « Été3cetÉtéLà! ». Avec des
 * classes ASCII, « É » n'est ni une majuscule ni une lettre, et ce mot de
 * passe se voyait refuser sa majuscule tout en obtenant un caractere special
 * qu'il n'a pas — deux erreurs qui se compensent presque, la pire espece.
 */
final class JaugePortageTest extends TestCase
{
    public function testLaJaugeRendExactementCeQueLeFrontRendait(): void
    {
        $reference = self::reference();

        self::assertGreaterThan(3_000, \count($reference),
            'un corpus trop maigre ne prouverait rien');

        $ecarts = [];
        foreach ($reference as $cas) {
            $m = (string) $cas['m'];
            $obtenu = [
                'manquements' => MotDePasse::manquements($m),
                'force' => MotDePasse::force($m),
                'mot' => MotDePasse::motDeLaForce(MotDePasse::force($m)),
            ];
            $attendu = [
                'manquements' => $cas['manquements'],
                'force' => $cas['force'],
                'mot' => $cas['mot'],
            ];

            if ($attendu !== $obtenu) {
                $ecarts[] = \sprintf("« %s »\n    front : %s\n    api   : %s",
                    $m,
                    \json_encode($attendu, \JSON_UNESCAPED_UNICODE),
                    \json_encode($obtenu, \JSON_UNESCAPED_UNICODE));
            }

            if (\count($ecarts) >= 5) {
                break;
            }
        }

        self::assertSame([], $ecarts,
            "La jauge du serveur ne dit pas la meme chose que celle du front :\n"
            . \implode("\n", $ecarts));
    }

    /**
     * LE TEMOIN : le corpus eprouve bien les cinq niveaux ET les cinq
     * exigences.
     *
     * Sans lui, un corpus reduit a des mots de passe vides passerait le test
     * ci-dessus en ne garantissant rien.
     */
    public function testLeCorpusEprouveLesCinqNiveauxEtLesCinqExigences(): void
    {
        $forces = [];
        $exigences = [];
        foreach (self::reference() as $cas) {
            $forces[(string) $cas['force']] = true;
            foreach ($cas['manquements'] as $e) {
                $exigences[(string) $e] = true;
            }
        }

        self::assertCount(5, $forces,
            'les cinq niveaux : ' . \implode(', ', \array_keys($forces)));
        self::assertCount(5, $exigences,
            'les cinq exigences : ' . \implode(', ', \array_keys($exigences)));
    }

    /** @return list<array<string, mixed>> */
    private static function reference(): array
    {
        $chemin = \dirname(__DIR__) . '/corpus/jauge-motdepasse.json.gz';

        self::assertFileExists($chemin);

        /** @var list<array<string, mixed>> */
        return (array) \json_decode(
            (string) \gzdecode((string) \file_get_contents($chemin)),
            true, flags: \JSON_THROW_ON_ERROR);
    }
}
