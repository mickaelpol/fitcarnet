<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\CoherenceDesCibles;
use PHPUnit\Framework\TestCase;

/**
 * LA COHERENCE D'UNE CIBLE, JUGEE PAR LE SERVEUR — palier B, 21 septembre 2026.
 *
 * Ces cas sont le portage de ceux que portait `front/src/solveur/solveur.test.ts`,
 * dans un `describe` qui disait deja pourquoi il existait : « la coherence des
 * cibles, TELLE QUE L'ECRAN OBJECTIFS LA LIT ». L'ecran ne pouvait pas etre
 * teste lui-meme — le motif de `tsconfig.tests.json` ne descend que sous `src/`,
 * donc un test pose dans `app/` n'est jamais execute, sans le moindre signal.
 * La regle etait donc verifiee A COTE de l'endroit ou elle servait.
 *
 * Elle est maintenant verifiee LA OU ELLE VIT.
 *
 * DEUX QUESTIONS DIFFERENTES, ET C'EST MESURE. `CoherenceNutritionnelle::
 * motifDeRefusDUneCible` REFUSE un soupcon de kilojoules ; cette classe-ci
 * AVERTIT d'un ecart entre les calories annoncees et ce que les grammes peuvent
 * donner. Sur 1 125 combinaisons de cibles, le 21 septembre 2026 : 248 fois les
 * deux disent quelque chose, 733 fois l'avertissement parle seul, et ZERO fois
 * le serveur refuse sans que l'avertissement parle. L'un n'est pas l'autre.
 */
final class CoherenceDesCiblesTest extends TestCase
{
    /** 4×40 + 9×20 = 340 de socle ; 100 g de glucides valent 200 kcal tout en
        fibres, 400 sans aucune fibre. */
    private const KCAL = 710.0;
    private const PROT = 40.0;
    private const GLUC = 100.0;
    private const LIP = 20.0;

    public function testLesBornesSeTiennentALaPartDeFibres(): void
    {
        self::assertSame(
            ['min' => 540.0, 'max' => 740.0],
            CoherenceDesCibles::bornes(self::PROT, self::GLUC, self::LIP),
        );
    }

    public function testEnEuropeenLEcartSeLitSurUnChiffreUnique(): void
    {
        self::assertSame(710.0 - 740.0, self::ecart(self::KCAL));
        self::assertSame(0.0, self::ecart(740.0));
    }

    public function testEnGlucidesTotauxToutCeQuiTombeDansLIntervalleEstAtteignable(): void
    {
        foreach ([540.0, 600.0, 710.0, 740.0] as $kcal) {
            self::assertSame(0.0, self::ecart($kcal, glucidesTotaux: true),
                "$kcal kcal tombe dans [540 ; 740] : une part de fibres l'explique");
        }
    }

    public function testEnGlucidesTotauxLEcartSeCompteDepuisLaBorneFranchie(): void
    {
        self::assertSame(800.0 - 740.0, self::ecart(800.0, glucidesTotaux: true));
        self::assertSame(300.0 - 540.0, self::ecart(300.0, glucidesTotaux: true));
    }

    public function testSansGlucidesLesDeuxConventionsDisentLaMemeChose(): void
    {
        /* Pas de glucides, donc pas de fibres possibles : l'intervalle se
           referme sur un point et la question de la convention ne se pose plus. */
        self::assertSame(
            CoherenceDesCibles::ecart(340.0, 40.0, 0.0, 20.0, true),
            CoherenceDesCibles::ecart(340.0, 40.0, 0.0, 20.0, false),
        );
        self::assertSame(['min' => 340.0, 'max' => 340.0], CoherenceDesCibles::bornes(40.0, 0.0, 20.0));
    }

    /**
     * LA PHRASE, MOT POUR MOT. C'est elle que l'ecran affiche telle quelle : il
     * n'a plus ni seuil, ni formule, ni formulation. Une virgule qui bouge ici
     * change ce que l'utilisateur lit.
     */
    public function testLAvertissementEuropeenSeLitEnUnSeulChiffre(): void
    {
        self::assertSame(
            'Tes grammes représentent 740 calories, pas 710. '
            . "L'app respecte les grammes ; les calories suivent.",
            CoherenceDesCibles::avertissement(710.0, 40.0, 100.0, 20.0, false),
        );
    }

    public function testLAvertissementEnGlucidesTotauxAnnonceLIntervalle(): void
    {
        self::assertSame(
            'Tes grammes représentent entre 540 et 740 calories selon la part de fibres, pas 900. '
            . "L'app respecte les grammes ; les calories suivent.",
            CoherenceDesCibles::avertissement(900.0, 40.0, 100.0, 20.0, true),
        );
    }

    /**
     * LE TEMOIN, sans lequel une regle qui avertit TOUT LE MONDE passerait pour
     * une correction. Un ecart d'arrondi ne se reproche pas.
     */
    public function testUnEcartDArrondiNeSeReprochePas(): void
    {
        self::assertNull(CoherenceDesCibles::avertissement(730.0, 40.0, 100.0, 20.0, false),
            '10 kcal sous le seuil : rien a dire');
        self::assertNull(CoherenceDesCibles::avertissement(725.0, 40.0, 100.0, 20.0, false),
            '15 kcal PILE : le seuil se franchit strictement');
    }

    /**
     * Le formatage est celui de `nb` (`front/src/theme/index.ts:174`) : entier
     * tant qu'on en est a moins de 0,05, sinon UNE decimale et une VIRGULE.
     * L'ecran affichait ces chiffres ainsi avant le palier B ; il les recoit
     * maintenant deja ecrits, et ne doit rien y refaire.
     */
    public function testLesChiffresSontEcritsCommeLEcranLesEcrivait(): void
    {
        self::assertSame(
            'Tes grammes représentent 740 calories, pas 700,5. '
            . "L'app respecte les grammes ; les calories suivent.",
            CoherenceDesCibles::avertissement(700.5, 40.0, 100.0, 20.0, false),
        );
    }

    private static function ecart(float $kcal, bool $glucidesTotaux = false): float
    {
        return CoherenceDesCibles::ecart($kcal, self::PROT, self::GLUC, self::LIP, $glucidesTotaux);
    }
}
