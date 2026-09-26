<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\RendementExplique;
use PHPUnit\Framework\TestCase;

/**
 * LE RENDEMENT CRU/CUIT, EXPLIQUE EN PHRASES — extrait de `VerdictAliment` le
 * 26 septembre 2026, feature `macros-editeur-vide-pas-zero`.
 *
 * `depuisPesees()` calcule le ratio a partir de deux pesees ; `explication()`
 * le traduit en phrase lisible ; `provenance()` dit d'ou vient la mesure
 * quand elle est venue d'une pesee, `null` sinon. Les valeurs decrivent
 * TOUJOURS le produit tel qu'on le pese (regle 3 du projet) : un rendement
 * > 1 veut dire que l'aliment GONFLE a la cuisson (les feculents), < 1 qu'il
 * PERD de l'eau (legumes, viandes, poissons, oeufs).
 */
final class RendementExpliqueTest extends TestCase
{
    // --------------------------------------------------------- depuisPesees()

    public function testDepuisPeseesCalculeLeRatio(): void
    {
        // CA-8
        self::assertEqualsWithDelta(2.3, RendementExplique::depuisPesees(100.0, 230.0), 0.0001);
    }

    public function testDepuisPeseesAutreExemple(): void
    {
        // CA-8
        self::assertEqualsWithDelta(0.53, RendementExplique::depuisPesees(350.0, 187.0), 0.0001);
    }

    public function testDepuisPeseesNullSiLavantManque(): void
    {
        // CA-8
        self::assertNull(RendementExplique::depuisPesees(null, 230.0));
    }

    public function testDepuisPeseesNullSiLapresManque(): void
    {
        // CA-8
        self::assertNull(RendementExplique::depuisPesees(100.0, null));
    }

    public function testDepuisPeseesNullSiLavantEstNulOuNegatif(): void
    {
        // CA-8
        self::assertNull(RendementExplique::depuisPesees(0.0, 230.0));
        self::assertNull(RendementExplique::depuisPesees(-5.0, 230.0));
    }

    public function testDepuisPeseesNullSiLapresEstNulOuNegatif(): void
    {
        // CA-8
        self::assertNull(RendementExplique::depuisPesees(100.0, 0.0));
        self::assertNull(RendementExplique::depuisPesees(100.0, -5.0));
    }

    public function testLE_TEMOIN_DEUX_PESEES_VALIDES_RENDENT_UN_RATIO(): void
    {
        /* TEMOIN : sans lui, rendre systematiquement `null` passerait tous
           les cas de refus ci-dessus tout en rendant la methode inutile. */
        self::assertNotNull(RendementExplique::depuisPesees(42.5, 96.0));
    }

    // ----------------------------------------------------------- explication()

    public function testExplicationPoidsInchangeSousLeSeuil(): void
    {
        // CA-8 — |1,005 - 1| = 0,005 < 0,01
        self::assertSame('Le poids ne change pas à la cuisson.',
            RendementExplique::explication(1.005));
    }

    public function testExplicationJusteAuDelaDuSeuilEstChiffree(): void
    {
        // CA-8 — |1,02 - 1| = 0,02, au-dela du seuil : une vraie mesure a chiffrer
        self::assertSame('100 g avant cuisson donnent 102 g une fois cuits.',
            RendementExplique::explication(1.02));
    }

    public function testExplicationUnFeculentGonfle(): void
    {
        // CA-8
        self::assertSame('100 g avant cuisson donnent 226 g une fois cuits.',
            RendementExplique::explication(2.26));
    }

    public function testExplicationUnLegumePerdDeLEau(): void
    {
        // CA-8
        self::assertSame(
            '100 g avant cuisson donnent 32 g une fois cuits (perte d\'eau).',
            RendementExplique::explication(0.32));
    }

    public function testLE_TEMOIN_LE_SEUIL_EST_UNE_BORNE_STRICTE(): void
    {
        /* TEMOIN : a exactement 1,01, l'ecart vaut 0,01 — pas strictement
           inferieur au seuil de `POIDS_INCHANGE` — et la phrase doit donc
           chiffrer, pas dire « inchange ». Un seuil ecrit avec `<=` casserait
           ce cas. */
        self::assertSame('100 g avant cuisson donnent 101 g une fois cuits.',
            RendementExplique::explication(1.01));
    }

    // ------------------------------------------------------------ provenance()

    public function testProvenanceAvecUneDecimaleEtUnEntier(): void
    {
        // CA-8
        self::assertSame('mesuré : 42,5 g avant cuisson → 96 g après',
            RendementExplique::provenance(42.5, 96.0));
    }

    public function testProvenanceAvecDeuxPeseesEntieres(): void
    {
        // CA-8
        self::assertSame('mesuré : 100 g avant cuisson → 230 g après',
            RendementExplique::provenance(100.0, 230.0));
    }

    public function testProvenanceNullSiLavantManque(): void
    {
        // CA-8
        self::assertNull(RendementExplique::provenance(null, 96.0));
    }

    public function testProvenanceNullSiLapresManque(): void
    {
        // CA-8
        self::assertNull(RendementExplique::provenance(42.5, null));
    }

    public function testProvenanceNullSansAucunePesee(): void
    {
        // CA-8 (témoin)
        self::assertNull(RendementExplique::provenance(null, null));
    }

    // ------------------------------------------------------------------ const

    public function testLaConstantePoidsInchangeVautUnCentieme(): void
    {
        self::assertSame(0.01, RendementExplique::POIDS_INCHANGE);
    }
}
