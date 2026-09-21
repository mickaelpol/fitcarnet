<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\Atwater;
use App\Service\PlanCoach;
use PHPUnit\Framework\TestCase;

/**
 * RECOPIER UN PLAN DE COACH AMERICAIN — porte du front le 21 septembre 2026.
 *
 * Ces cas viennent de `front/src/calcul/planCoach.test.ts`, supprime dans le
 * meme commit. Le module n'etait appele que par `app/objectifs.tsx`, sur un
 * formulaire tape a la main : il est parti EN ENTIER, il n'en reste rien au
 * front.
 *
 * LE PLAN REEL EST GARDE TEL QUEL. Ces quatre repas sont ceux d'un plan de
 * coach recopie, et c'est ce qui donne leur valeur aux cas : « trois repas sur
 * quatre sous-estiment leurs fibres » n'est pas une supposition, c'est ce que
 * ce plan-la fait.
 */
final class PlanCoachTest extends TestCase
{
    /** Le plan reel, recopie tel qu'il est imprime. */
    private const PLAN = [
        'R1' => ['kcal' => 578.6, 'prot' => 26.8, 'glucides' => 64.7, 'lipides' => 25.9, 'fibres' => 3.5],
        'R2' => ['kcal' => 661.9, 'prot' => 42.8, 'glucides' => 61.8, 'lipides' => 25.8, 'fibres' => 8.3],
        'R3' => ['kcal' => 591.7, 'prot' => 57.2, 'glucides' => 51.7, 'lipides' => 16.4, 'fibres' => 0.0],
        'R4' => ['kcal' => 551.8, 'prot' => 30.1, 'glucides' => 80.2, 'lipides' => 15.4, 'fibres' => 2.3],
    ];

    // ------------------------------------------------ la conversion

    public function testLesFibresSeRetranchentDesGlucidesEtRienDAutre(): void
    {
        $c = self::convertir('R2');

        self::assertSame(53.5, $c['gluc'], '61,8 g dont 8,3 de fibres');
        self::assertSame(42.8, $c['prot'], 'les protéines ne bougent pas');
        self::assertSame(25.8, $c['lip'], 'les lipides non plus');
        self::assertSame(8.3, $c['fibres']);
    }

    public function testRienNeBougeQuandLePlanNAnnonceAucuneFibre(): void
    {
        self::assertSame(51.7, self::convertir('R3')['gluc']);
    }

    public function testLesCaloriesSeRecalculentALEuropeenneFibresADeuxKcal(): void
    {
        $c = self::convertir('R2');

        // 4×42,8 + 4×53,5 + 2×8,3 + 9×25,8
        self::assertSame(634.0, $c['kcal']);
        self::assertSame(662.0, $c['kcalAnnoncees'], 'ce que le plan disait, gardé pour comparaison');
    }

    public function testLesQuatreRepasDuPlanReelSeConvertissent(): void
    {
        self::assertSame(
            [61.2, 53.5, 51.7, 77.9],
            array_map(static fn (string $r): float => self::convertir($r)['gluc'], ['R1', 'R2', 'R3', 'R4']),
        );
    }

    /**
     * Retrancher plus de fibres qu'il n'y a de glucides n'a pas de sens : dans
     * cette convention, les fibres SONT une part des glucides.
     */
    public function testAucunGlucideNegatifNEstProduit(): void
    {
        $c = PlanCoach::convertir(kcal: 100.0, prot: 5.0, glucides: 10.0, lipides: 2.0, fibres: 25.0);

        self::assertSame(0.0, $c['gluc']);
    }

    public function testUnPlanDejaSansFibresPasseTelQuel(): void
    {
        $c = PlanCoach::convertir(kcal: 300.0, prot: 20.0, glucides: 30.0, lipides: 10.0, fibres: 0.0);

        self::assertSame(30.0, $c['gluc']);
        self::assertSame(4 * 20.0 + 4 * 30.0 + 9 * 10.0, $c['kcal']);
    }

    /**
     * F6, 15 septembre 2026. UNE SEULE DES QUATRE MACROS ENTRAIT ARRONDIE DANS
     * LE TOTAL.
     *
     * `gluc` etait arrondi au dixieme puis reutilise pour les calories, tandis
     * que `prot`, `lipides` et `fibres` y entraient bruts. Le total ne decrivait
     * donc ni les grammes annonces ni ceux du plan d'origine — un troisieme
     * nombre, celui de personne.
     *
     * La regle du projet tranche dans un seul sens : ce qui est affiche est ce
     * qui sera pese, donc les calories se comptent sur les grammes RENDUS. On
     * le verifie avec `Atwater`, qui porte la formule, et non avec une copie de
     * 4/4/2/9 ecrite ici — un test qui reimplemente ce qu'il garantit ne
     * garantit que sa propre copie.
     */
    public function testLesCaloriesSeComptentSurLesGrammesRENDUS(): void
    {
        /* Un plan saisi au centieme : c'est la que l'arrondi au dixieme se voit.
           Chacune des trois macros brutes perd 0,04 g a l'arrondi, soit
           0,60 kcal en tout — assez pour faire basculer le total d'une unite. */
        $c = PlanCoach::convertir(kcal: 500.0, prot: 30.44, glucides: 60.04, lipides: 10.44, fibres: 5.04);

        self::assertSame([30.4, 55.0, 10.4, 5.0], [$c['prot'], $c['gluc'], $c['lip'], $c['fibres']],
            'les grammes rendus sont arrondis au dixième');
        self::assertSame(round(Atwater::kcal($c['prot'], $c['gluc'], $c['lip'], $c['fibres'])), $c['kcal'],
            'les calories doivent décrire CES grammes-là, pas ceux d’avant l’arrondi');
        self::assertSame(445.0, $c['kcal']);
    }

    // ------------------------------------------------ les fibres douteuses

    /**
     * Le cas reel : 0 g de fibres annonce pour un repas de 200 g de haricots
     * verts et 300 g de patates douces. Ce n'est pas une valeur, c'est un champ
     * vide.
     */
    public function testUnRepasGlucidiqueSansFibresEstSignale(): void
    {
        self::assertNotNull(self::avertissement('R3'), '51,7 g de glucides et 0 fibre');
    }

    public function testLeDinerAPeineMieuxRenseigneEstSignaleAussi(): void
    {
        self::assertNotNull(self::avertissement('R4'), '80,2 g de glucides et 2,3 de fibres');
    }

    /**
     * Verifie aliment par aliment : 80 g de farine d'avoine, 55 g de fraises et
     * 20 g d'amandes font environ 10 g de fibres, pas 3,5.
     */
    public function testLePetitDejeunerSousEstimeEstSignale(): void
    {
        self::assertNotNull(self::avertissement('R1'), '64,7 g de glucides et 3,5 de fibres');
    }

    /** LE TEMOIN : sans lui, une regle qui signale tout le monde passerait. */
    public function testRienNEstDitQuandLesFibresSontPlausibles(): void
    {
        self::assertNull(self::avertissement('R2'), '61,8 g de glucides et 8,3 de fibres');
    }

    /** Trois repas sur quatre : ce plan n'a pas compte ses fibres. */
    public function testTroisRepasSurQuatreSontSignalesDansLePlanReel(): void
    {
        $signales = array_values(array_filter(['R1', 'R2', 'R3', 'R4'],
            static fn (string $r): bool => null !== self::avertissement($r)));

        self::assertSame(['R1', 'R3', 'R4'], $signales);
    }

    public function testUnRepasSansGlucidesNAlarmePersonne(): void
    {
        self::assertNull(PlanCoach::avertissementDesFibres(glucides: 2.0, fibres: 0.0),
            'un steak n’a pas à contenir de fibres');
    }

    /**
     * LA PHRASE, MOT POUR MOT — c'est elle que l'ecran affiche telle quelle.
     * Elle nomme les deux chiffres du plan, pas ceux de la conversion : c'est
     * ce que l'utilisateur vient de recopier qu'on lui montre.
     */
    public function testLaPhraseNommeLesDeuxChiffresDuPlan(): void
    {
        self::assertSame(
            '3,5 g de fibres pour 64,7 g de glucides : ton plan les sous-estime. '
            . 'Sans conséquence ici — c’est justement pour ça qu’on ne s’en sert pas.',
            self::avertissement('R1'),
        );
    }

    // ------------------------------------------------ outils

    /** @return array{prot: float, gluc: float, lip: float, fibres: float, kcal: float, kcalAnnoncees: float} */
    private static function convertir(string $repas): array
    {
        $p = self::PLAN[$repas];

        return PlanCoach::convertir($p['kcal'], $p['prot'], $p['glucides'], $p['lipides'], $p['fibres']);
    }

    private static function avertissement(string $repas): ?string
    {
        $p = self::PLAN[$repas];

        return PlanCoach::avertissementDesFibres($p['glucides'], $p['fibres']);
    }
}
