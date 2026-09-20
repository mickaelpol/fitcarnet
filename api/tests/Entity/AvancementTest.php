<?php

declare(strict_types=1);

namespace App\Tests\Entity;

use App\Entity\Exercice;
use App\Entity\Seance;
use App\Entity\SeanceExercice;
use App\Entity\Serie;
use PHPUnit\Framework\TestCase;

/**
 * « OU EN EST CETTE SEANCE ? » — les dix cas qui tiennent la regle.
 *
 * CE FICHIER REMPLACE `AvancementPartageTest`, et le changement dit tout du
 * chantier : il lisait `api/regles/avancement.json`, un fichier qui n'existait
 * que pour empecher DEUX ecritures de la meme regle de diverger — une en PHP,
 * une dans le front.
 *
 * Depuis le 21 septembre 2026, il n'y en a plus qu'une. Le serveur donne a
 * chaque serie son POIDS dans le decompte, et l'ecran se contente de les
 * additionner. Le fichier de regles n'avait plus rien a tenir : c'etait le
 * DERNIER du depot.
 *
 * Les cas, eux, restent — ils portent le metier, pas le dispositif.
 */
final class AvancementTest extends TestCase
{
    /** @return array<string, array{list<array<string, mixed>>, int, int, string}> */
    public static function cas(): array
    {
        return [
            'une seance vide' => [[], 0, 0,
                'rien a compter n\'est pas une division par zero : c\'est 0 sur 0'],
            'trois series dont deux cochees' => [[['mode' => 'charge', 'modeDefaut' => 'charge', 'series' => [true, true, false]]], 2, 3,
                'le cas ordinaire, celui de presque toutes les seances'],
            'deux exercices s\'additionnent' => [[['mode' => 'charge', 'modeDefaut' => 'charge', 'series' => [true, false]], ['mode' => 'charge', 'modeDefaut' => 'charge', 'series' => [true, true, true]]], 4, 5,
                'l\'avancement porte sur la seance entiere, pas sur un exercice'],
            'un chrono ne compte que pour une serie' => [[['mode' => 'chrono', 'modeDefaut' => 'charge', 'series' => [true, false, false]]], 1, 1,
                'un « for time » n\'a qu\'un temps total ; ses lignes vides ne sont pas des series a faire'],
            'un chrono non fait compte quand meme dans le total' => [[['mode' => 'chrono', 'modeDefaut' => 'charge', 'series' => [false, false]]], 0, 1,
                'il reste une chose a faire : l\'ecarter du total ferait afficher « termine » a tort'],
            'un chrono sans aucune ligne ne compte pour rien' => [[['mode' => 'chrono', 'modeDefaut' => 'charge', 'series' => []]], 0, 0,
                'on plafonne a une serie, on n\'en invente pas une'],
            'le mode du catalogue s\'applique quand l\'exercice n\'en precise pas' => [[['mode' => null, 'modeDefaut' => 'chrono', 'series' => [true, false, false]]], 1, 1,
                'le mode pose sur la ligne est une exception ; sans lui c\'est celui de l\'exercice qui vaut'],
            'le mode de la ligne l\'emporte sur celui du catalogue' => [[['mode' => 'charge', 'modeDefaut' => 'chrono', 'series' => [true, true, false]]], 2, 3,
                'faire un exercice chrono a la charge un jour donne est un choix, il doit etre respecte'],
            'sans mode nulle part, on compte tout' => [[['mode' => null, 'modeDefaut' => null, 'series' => [true, false]]], 1, 2,
                'le repli est « charge », donc le decompte complet : mieux vaut annoncer trop a faire que trop peu'],
            'un chrono et un exercice a la charge dans la meme seance' => [[['mode' => 'chrono', 'modeDefaut' => 'chrono', 'series' => [true, false, false, false]], ['mode' => 'charge', 'modeDefaut' => 'charge', 'series' => [true, true, false]]], 3, 4,
                'LE CAS QUI SEPARE VRAIMENT LES DEUX REGLES : compter bêtement donnerait 5 sur 7'],
        ];
    }

    /**
     * @param list<array<string, mixed>> $exercices
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('cas')]
    public function testChaqueCasEstCompteAinsi(
        array $exercices,
        int $faites,
        int $total,
        string $pourquoi,
    ): void {
        self::assertSame(
            ['faites' => $faites, 'total' => $total],
            self::monter($exercices)->getAvancement(),
            \sprintf('%d sur %d attendu (%s)', $faites, $total, $pourquoi),
        );
    }

    /**
     * LE TEMOIN : la regle du chrono est bien celle qui est eprouvee.
     *
     * Sans ce controle, quelqu'un pourrait vider la liste de ses cas chrono et
     * le test par donnees resterait vert en ne garantissant plus rien — motif 4
     * du projet, le test qui ne peut pas echouer. Toute la regle tient
     * la-dedans : s'il n'est pas eprouve, rien ne l'est.
     */
    public function testLaListeEprouveVraimentLaRegleDuChrono(): void
    {
        $melange = null;
        foreach (self::cas() as $c) {
            $modes = \array_column($c[0], 'mode');
            if (\count($c[0]) > 1 && \in_array('chrono', $modes, true)
                && \in_array('charge', $modes, true)) {
                $melange = $c;
                break;
            }
        }

        self::assertNotNull($melange,
            'il faut un cas ou les deux modes cohabitent dans la meme seance');

        $lignes = 0;
        foreach ($melange[0] as $e) {
            /** @var list<bool> $series */
            $series = $e['series'];
            $lignes += \count($series);
        }

        self::assertNotSame($lignes, $melange[2],
            'ce cas doit avoir un total DIFFERENT du simple nombre de lignes, '
            . 'sans quoi un decompte naif le passerait sans appliquer la regle');
    }

    /**
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
}
