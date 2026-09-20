<?php

declare(strict_types=1);

namespace App\Tests\Entity;

use App\Entity\Exercice;
use App\Entity\Seance;
use App\Entity\SeanceExercice;
use App\Entity\Serie;
use PHPUnit\Framework\TestCase;

/**
 * LE VERROU ENTRE LES DEUX JUGES DE L'AVANCEMENT — releve le 19 septembre 2026.
 *
 * L'API et le front repondent tous les deux a « ou en est cette seance ? » :
 * `Seance::getAvancement()` ici, `avancementDe()` la-bas. Et les deux tournent
 * vraiment, a deux ecrans de distance :
 *
 *     app/(onglets)/seances.tsx:51   lit le champ calcule par le serveur
 *     app/seance/[id].tsx:113        recalcule a chaque case cochee
 *
 * S'ils divergeaient, le compteur changerait tout seul en passant d'un ecran a
 * l'autre. Rien ne les tenait alignes : chacun etait teste de son cote, ce qui
 * est exactement la situation qui rend une divergence invisible — les deux
 * suites restent vertes en se contredisant.
 *
 * Ce test et son jumeau `front/src/calcul/avancementPartage.test.ts` lisent LE
 * MEME fichier, `api/regles/avancement.json`.
 */
final class AvancementPartageTest extends TestCase
{
    /** @return array<string, array{list<array<string, mixed>>, int, int, string}> */
    public static function casPartages(): array
    {
        $cas = [];

        /** @var list<array<string, mixed>> $liste */
        $liste = self::regles()['cas'];
        foreach ($liste as $c) {
            /** @var list<array<string, mixed>> $exercices */
            $exercices = $c['exercices'];
            $cas[(string) $c['nom']] = [
                $exercices, (int) $c['faites'], (int) $c['total'], (string) $c['pourquoi'],
            ];
        }

        return $cas;
    }

    /**
     * @param list<array<string, mixed>> $exercices
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('casPartages')]
    public function testChaqueCasPartageEstCompteCommeLaListeLeDit(
        array $exercices,
        int $faites,
        int $total,
        string $pourquoi,
    ): void {
        self::assertSame(
            ['faites' => $faites, 'total' => $total],
            self::monter($exercices)->getAvancement(),
            \sprintf(
                'api/regles/avancement.json dit %d sur %d (%s), l\'API dit autre chose',
                $faites, $total, $pourquoi,
            ),
        );
    }

    /**
     * LE TEMOIN : la liste couvre bien le cas qui separe les deux regles.
     *
     * Sans ce controle, quelqu'un pourrait vider `cas` de ses exercices chrono
     * et le test ci-dessus resterait vert en ne garantissant plus rien —
     * motif 4 du projet, le test qui ne peut pas echouer. Toute la regle tient
     * dans le traitement du mode « chrono » : s'il n'est pas eprouve, rien ne
     * l'est.
     */
    public function testLaListeEprouveVraimentLaRegleDuChrono(): void
    {
        /** @var list<array<string, mixed>> $liste */
        $liste = self::regles()['cas'];

        $melange = null;
        foreach ($liste as $c) {
            /** @var list<array<string, mixed>> $exercices */
            $exercices = $c['exercices'];
            $modes = \array_column($exercices, 'mode');
            if (\count($exercices) > 1 && \in_array('chrono', $modes, true) && \in_array('charge', $modes, true)) {
                $melange = $c;
                break;
            }
        }

        self::assertNotNull($melange,
            'il faut un cas ou les deux modes cohabitent dans la meme seance');

        /** @var list<array<string, mixed>> $exercices */
        $exercices = $melange['exercices'];
        $lignes = 0;
        foreach ($exercices as $e) {
            /** @var list<bool> $series */
            $series = $e['series'];
            $lignes += \count($series);
        }

        self::assertNotSame($lignes, (int) $melange['total'],
            'ce cas doit avoir un total DIFFERENT du simple nombre de lignes, sans quoi '
            . 'un decompte naif le passerait sans appliquer la regle du chrono');
    }

    // ----------------------------------------------------------------- outils

    /**
     * Le cas de la liste, monte dans de vraies entites.
     *
     * Aucune base, aucun noyau : `getAvancement()` ne lit que ce qui est en
     * memoire. Un `modeDefaut` a `null` decrit un exercice ABSENT du catalogue,
     * pas un exercice au mode vide — la colonne est NOT NULL cote base.
     *
     * @param list<array<string, mixed>> $exercices
     */
    private static function monter(array $exercices): Seance
    {
        $seance = new Seance();

        foreach ($exercices as $rang => $e) {
            $bloc = (new SeanceExercice())
                ->setOrdre($rang)
                ->setMode(null === $e['mode'] ? null : (string) $e['mode']);

            if (null !== $e['modeDefaut']) {
                $bloc->setExercice((new Exercice())->setModeDefaut((string) $e['modeDefaut']));
            }

            /** @var list<bool> $series */
            $series = $e['series'];
            foreach ($series as $ordre => $faite) {
                $bloc->addSery((new Serie())->setOrdre($ordre)->setFaite($faite));
            }

            $seance->addExercice($bloc);
        }

        return $seance;
    }

    /** @return array<string, mixed> */
    private static function regles(): array
    {
        $chemin = \dirname(__DIR__, 2) . '/regles/avancement.json';

        self::assertFileExists($chemin,
            'api/regles/avancement.json est la liste unique des cas : sans elle, '
            . 'les deux juges de l\'avancement peuvent diverger en silence.');

        /** @var array<string, mixed> */
        return (array) \json_decode((string) \file_get_contents($chemin), true, flags: \JSON_THROW_ON_ERROR);
    }
}
