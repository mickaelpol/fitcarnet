<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\LotDHabitudes;
use PHPUnit\Framework\TestCase;

/**
 * Ce qui doit etre refuse AVANT de toucher la base, et ce qui doit passer.
 *
 * Un envoi d'habitudes vient d'un telephone : il peut arriver tronque,
 * dedouble, ou porter un identifiant de mode qui n'existe plus parce que
 * l'administrateur l'a supprime pendant que l'ecran etait ouvert. Chacun de
 * ces cas doit donner un refus lisible, jamais une erreur 500 — et surtout
 * jamais une ecriture a moitie faite.
 */
final class LotDHabitudesTest extends TestCase
{
    /** Les modes que la table contient, dans tous les tests ci-dessous. */
    private const MODES = [1, 2, 3];

    public function testUnEnvoiOrdinairePasse(): void
    {
        $lot = LotDHabitudes::depuis([
            ['aliment' => 'riz basmati', 'mode' => 2],
            ['aliment' => 'poulet', 'mode' => 3],
        ], self::MODES);

        self::assertTrue($lot->estValide());
        self::assertSame(['riz basmati' => 2, 'poulet' => 3], $lot->aEcrire);
    }

    public function testUnLotVideNEstPasUneErreur(): void
    {
        /* C'est meme le cas le plus frequent : une semaine sans changement
           n'a rien de nouveau a dire. Refuser obligerait l'ecran a savoir
           s'il a quelque chose a dire avant de le dire. */
        $lot = LotDHabitudes::depuis([], self::MODES);

        self::assertTrue($lot->estValide());
        self::assertSame([], $lot->aEcrire);
    }

    public function testSansCuissonEstUneReponse(): void
    {
        /* `null` veut dire « se mange tel quel ». Le confondre avec l'absence
           ferait redemander eternellement pour le skyr et les amandes. */
        $lot = LotDHabitudes::depuis([['aliment' => 'skyr', 'mode' => null]], self::MODES);

        self::assertTrue($lot->estValide());
        self::assertArrayHasKey('skyr', $lot->aEcrire);
        self::assertNull($lot->aEcrire['skyr']);
    }

    public function testUnModeAbsentNEstPasUnModeNull(): void
    {
        /* `isset` les confondrait, et une habitude « jamais decidee » partirait
           en base comme « se mange tel quel ». */
        $lot = LotDHabitudes::depuis([['aliment' => 'skyr']], self::MODES);

        self::assertFalse($lot->estValide());
        self::assertStringContainsString('skyr', (string) $lot->erreur);
    }

    public function testUnModeInconnuEstRefuseAvantLaBase(): void
    {
        /* Sans ce controle, l'identifiant partirait en base et reviendrait en
           violation de cle etrangere — une 500, c'est-a-dire une panne de
           serveur pour dire « ce mode n'existe pas ». */
        $lot = LotDHabitudes::depuis([['aliment' => 'riz', 'mode' => 99]], self::MODES);

        self::assertFalse($lot->estValide());
        self::assertStringContainsString('99', (string) $lot->erreur);
    }

    public function testLeMemeAlimentDeuxFoisNeFaitQuUneLigne(): void
    {
        /* PostgreSQL refuse un ON CONFLICT dont le lot contient deux fois la
           meme cle : sans dedoublonnage, TOUT le lot echouerait. Et c'est la
           DERNIERE qui gagne, comme si les deux etaient parties l'une apres
           l'autre. */
        $lot = LotDHabitudes::depuis([
            ['aliment' => 'riz', 'mode' => 1],
            ['aliment' => 'riz', 'mode' => 3],
        ], self::MODES);

        self::assertTrue($lot->estValide());
        self::assertSame(['riz' => 3], $lot->aEcrire);
    }

    public function testUnAlimentVideEstRefuse(): void
    {
        foreach ([['aliment' => '', 'mode' => 1], ['aliment' => '   ', 'mode' => 1]] as $cas) {
            $lot = LotDHabitudes::depuis([$cas], self::MODES);
            self::assertFalse($lot->estValide());
        }
    }

    public function testLesEspacesAutourDuNomSontEnleves(): void
    {
        /* La cle vient deja normalisee de l'ecran ; ce trim n'est qu'une
           ceinture. Mais s'il n'existait pas, « riz » et « riz » avec une
           espace finale feraient deux habitudes pour un seul riz. */
        $lot = LotDHabitudes::depuis([['aliment' => '  riz  ', 'mode' => 1]], self::MODES);

        self::assertSame(['riz' => 1], $lot->aEcrire);
    }

    public function testUnNomDemesureEstRefuse(): void
    {
        $lot = LotDHabitudes::depuis(
            [['aliment' => \str_repeat('a', LotDHabitudes::NOM_MAX + 1), 'mode' => 1]],
            self::MODES);

        self::assertFalse($lot->estValide());
    }

    public function testUnEnvoiDemesureEstRefuse(): void
    {
        /* Au-dela, ce n'est plus un geste d'utilisateur : une semaine de
           quatre repas met en jeu une trentaine d'aliments distincts. */
        $trop = [];
        for ($i = 0; $i <= LotDHabitudes::MAX; ++$i) {
            $trop[] = ['aliment' => 'aliment ' . $i, 'mode' => 1];
        }

        $lot = LotDHabitudes::depuis($trop, self::MODES);

        self::assertFalse($lot->estValide());
        self::assertStringContainsString((string) LotDHabitudes::MAX, (string) $lot->erreur);
    }

    public function testUnCorpsQuiNEstPasUneListeEstRefuse(): void
    {
        foreach ([null, 'riz', 42] as $nImporteQuoi) {
            $lot = LotDHabitudes::depuis($nImporteQuoi, self::MODES);
            self::assertFalse($lot->estValide(), \var_export($nImporteQuoi, true));
        }
    }

    public function testUneLigneQuiNEstPasUnObjetEstRefusee(): void
    {
        $lot = LotDHabitudes::depuis(['riz basmati'], self::MODES);

        self::assertFalse($lot->estValide());
    }

    public function testRienNEstEcritQuandUneSeuleLigneEstMauvaise(): void
    {
        /* Le lot est un geste : il passe entierement ou pas du tout. Ecrire
           les deux bonnes et refuser la troisieme laisserait l'utilisateur
           avec la moitie de ce qu'il vient de decider, sans savoir quelle
           moitie. */
        $lot = LotDHabitudes::depuis([
            ['aliment' => 'riz', 'mode' => 1],
            ['aliment' => 'poulet', 'mode' => 2],
            ['aliment' => 'brocoli', 'mode' => 77],
        ], self::MODES);

        self::assertFalse($lot->estValide());
        self::assertSame([], $lot->aEcrire);
    }

    public function testUnEnvoiBrutDemesureEstRefuseAvantDedoublonnage(): void
    {
        // CA-R4 (a)
        /* Le front enverra desormais une ligne par couple (repas, aliment) du
           plan, sans juger : cette borne-la porte sur ce qui ARRIVE, avant
           tout dedoublonnage — un mois entier coche (31 j x 4 repas x
           15 aliments) fait 1 860 couples, donc MAX_LIGNES doit laisser
           passer bien plus que MAX. */
        $trop = [];
        for ($i = 0; $i <= LotDHabitudes::MAX_LIGNES; ++$i) {
            $trop[] = ['aliment' => 'aliment ' . $i, 'mode' => 1];
        }

        $lot = LotDHabitudes::depuis($trop, self::MODES);

        self::assertFalse($lot->estValide());
        self::assertStringContainsString((string) LotDHabitudes::MAX_LIGNES, (string) $lot->erreur);
    }

    public function testUnPlanAvecRepetitionsPasseSousLaBorneBrute(): void
    {
        // CA-R4 (b)
        /* Le cas d'un vrai plan : le meme riz revient a chaque repas. 1 500
           lignes mais seulement 12 aliments distincts — la borne brute ne
           doit plus refuser ce geste legitime, seul le compte APRES
           dedoublonnage compte pour MAX. */
        $alimentsDistincts = [];
        for ($i = 0; $i < 12; ++$i) {
            $alimentsDistincts[] = 'aliment ' . $i;
        }

        $lignes = [];
        for ($i = 0; $i < 1500; ++$i) {
            $lignes[] = ['aliment' => $alimentsDistincts[$i % 12], 'mode' => 1];
        }

        $lot = LotDHabitudes::depuis($lignes, self::MODES);

        self::assertTrue($lot->estValide());
        self::assertCount(12, $lot->aEcrire);
    }

    public function testLesAlimentsDistinctsRestentPlafonnesSousLaBorneBrute(): void
    {
        // CA-R4 (c)
        /* MAX+1 aliments tous distincts, mais un total de lignes largement
           sous MAX_LIGNES : les deux bornes se prouvent separement, celle-ci
           ne doit rien devoir a la premiere. */
        $nombreDAlimentsDistincts = LotDHabitudes::MAX + 1;
        self::assertLessThan(LotDHabitudes::MAX_LIGNES, $nombreDAlimentsDistincts);

        $trop = [];
        for ($i = 0; $i < $nombreDAlimentsDistincts; ++$i) {
            $trop[] = ['aliment' => 'aliment ' . $i, 'mode' => 1];
        }

        $lot = LotDHabitudes::depuis($trop, self::MODES);

        self::assertFalse($lot->estValide());
        self::assertStringContainsString((string) LotDHabitudes::MAX, (string) $lot->erreur);
    }
}
