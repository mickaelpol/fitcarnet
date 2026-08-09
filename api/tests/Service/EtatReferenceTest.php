<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\AlimentDisponible;
use App\Service\EtatReference;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * UNE SEULE REGLE, DEUX SOURCES, LE MEME RESULTAT.
 *
 * Ces tests existent a cause d'une panne precise : Grocy DEDUISAIT l'etat de
 * reference de la categorie, la base le LISAIT dans une colonne. Les deux
 * rendaient le meme AlimentDisponible, et personne ne pouvait voir qu'ils ne
 * disaient pas la meme chose. Un compte ordinaire dont la colonne portait
 * « cru » sur un feculent mangeait jusqu'a trois fois trop de glucides.
 *
 * Ce qui est verifie ici n'est donc pas « la regle est bonne » — c'est
 * « il n'y en a qu'une, et rien ne peut la contourner ».
 */
final class EtatReferenceTest extends TestCase
{
    /** Toutes les categories que l'application connait. */
    public static function categories(): array
    {
        return [
            'proteine' => ['prot', EtatReference::CRU],
            'feculent' => ['fec', EtatReference::CUIT],
            'legume' => ['leg', EtatReference::CRU],
            'fruit' => ['fruit', EtatReference::CUIT],
            'oleagineux' => ['ole', EtatReference::CUIT],
            'huile' => ['huile', EtatReference::CUIT],
            'laitage' => ['lait', EtatReference::CUIT],
            'autre' => ['autre', EtatReference::CUIT],
        ];
    }

    #[DataProvider('categories')]
    public function testChaqueCategorieAUnEtatEtUnSeul(string $categorie, string $attendu): void
    {
        self::assertSame($attendu, EtatReference::pour($categorie));
    }

    public function testUneCategorieInconnueSeRapporteAuServi(): void
    {
        /* Le defaut n'est pas arbitraire : « cuit » veut dire « ce qu'on pose
           dans l'assiette », et c'est le cas de tout ce qui n'est pas une
           viande. Un defaut « cru » ferait peser du cru en croyant peser du
           servi — l'erreur exacte qu'on a connue sur le riz. */
        self::assertSame(EtatReference::CUIT, EtatReference::pour('categorie-inventee'));
    }

    /**
     * LE test de non-regression : les deux sources produisent le meme etat.
     *
     * On construit le meme aliment comme le ferait FrigoGrocy, puis comme le
     * ferait FrigoBase. Ni l'un ni l'autre ne peut plus passer d'etat de
     * reference — c'est AlimentDisponible qui le derive.
     */
    #[DataProvider('categories')]
    public function testLesDeuxSourcesNePeuventPlusDiverger(string $categorie, string $attendu): void
    {
        $depuisGrocy = self::aliment('grocy:42', $categorie);
        $depuisLaBase = self::aliment('base:42', $categorie);

        self::assertSame($depuisGrocy->etatReference, $depuisLaBase->etatReference);
        self::assertSame($attendu, $depuisGrocy->etatReference);
    }

    public function testLaColonneStockeeEstJugeeParLaRegle(): void
    {
        self::assertFalse(EtatReference::coherent('fec', 'cru'), 'un feculent cru');
        self::assertTrue(EtatReference::coherent('fec', 'cuit'));
        self::assertFalse(EtatReference::coherent('prot', 'cuit'), 'une proteine cuite');
        self::assertTrue(EtatReference::coherent('prot', 'cru'));
        self::assertTrue(EtatReference::coherent('fec', null), 'colonne absente : tolere');
    }

    /* ------------------------------------------------ le sens du rendement */

    public function testUneProteineNePeutPasGrossirEnCuisant(): void
    {
        self::assertNotNull(EtatReference::sensDuRendement('prot', 1.4));
    }

    public function testUneProteineTresCuiteResteAcceptee(): void
    {
        /* 192 g de truite crue pour 102 g cuite, c'est une cuisson poussee,
           pas une donnee fausse — et de toute facon sans effet sur les macros,
           qui se comptent sur le poids CRU. */
        self::assertNull(EtatReference::sensDuRendement('prot', 0.53));
    }

    public function testUnFeculentNePeutPasRetrecir(): void
    {
        self::assertNotNull(EtatReference::sensDuRendement('fec', 0.8));
    }

    public function testUnRizTresHydrateResteAccepte(): void
    {
        /* 84 g secs pour 393 g cuits : le bilan de matiere l'autorise (73 g de
           matiere seche dans un produit a 81 % d'eau). C'est une mesure, pas
           une faute — on ne la refuse pas. */
        self::assertNull(EtatReference::sensDuRendement('fec', 4.68));
    }

    public function testUnLegumeQuiRendSonEauEstNormal(): void
    {
        /* 467 g de courgettes crues pour 343 g cuites : une mesure, et le
           sens est le bon — un legume perd de l'eau. */
        self::assertNull(EtatReference::sensDuRendement('leg', 0.73));
    }

    public function testUnLegumeNePeutPasGrossirEnCuisant(): void
    {
        /* La version derivee de Ciqual annoncait un epinard a 1,70 : il
           aurait fallu en peser 119 g crus pour en servir 200. */
        self::assertNotNull(EtatReference::sensDuRendement('leg', 1.7));
    }

    public function testUnLegumeSePeseCru(): void
    {
        /* 200 g de brocoli sur la balance, 150 g dans l'assiette apres la
           vapeur. C'est le poids CRU qu'on pese, donc celui qui doit porter
           les valeurs — d'autant qu'a la vapeur, seule l'eau part. */
        self::assertSame(EtatReference::CRU, EtatReference::pour('leg'));
    }

    public function testUnRendementNulEstRefuse(): void
    {
        self::assertNotNull(EtatReference::sensDuRendement('fec', 0.0));
        self::assertNotNull(EtatReference::sensDuRendement('leg', -1.0));
    }

    private static function aliment(string $reference, string $categorie): AlimentDisponible
    {
        return new AlimentDisponible(
            reference: $reference,
            nom: 'Test',
            categorie: $categorie,
            kcal100: 130,
            prot100: 2.7,
            gluc100: 28.2,
            lip100: 0.3,
            fibres100: 0.7,
            ratio: 1.0,
            stock: 100,
        );
    }
}
