<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\AlimentDisponible;
use PHPUnit\Framework\TestCase;

/**
 * Ce qu'un aliment doit dire de lui-meme avant qu'on batisse un repas dessus.
 *
 * Le solveur est juste : il resout exactement le systeme qu'on lui donne. Sa
 * faiblesse n'est pas l'algebre, c'est ce qu'on lui raconte sur les aliments.
 * Les controles ci-dessous ne jugent pas du gout ni d'une moyenne nationale —
 * ils attrapent ce qui est physiquement impossible.
 */
final class AlimentDisponibleTest extends TestCase
{
    public function testUnAlimentOrdinaireNeSignaleRien(): void
    {
        self::assertSame([], self::riz()->incoherences());
    }

    public function testLesGlucidesAmericainsComptentLesFibresDeuxFois(): void
    {
        /* Amande USDA : 21,5 g de glucides FIBRES COMPRISES. Reprise telle
           quelle a cote d'une colonne fibres, elle fait tenir 104,5 g de
           nutriments dans 100 g de produit. En Ciqual : 6,7 g de glucides. */
        $amandes = self::aliment('ole', 1.0, 575, 21.0, 21.5, 49.5, 12.5);

        self::assertCount(1, $amandes->incoherences());
        self::assertStringContainsString('104.5 g', $amandes->incoherences()[0]);
    }

    public function testLesMemesAmandesEnCiqualPassent(): void
    {
        $amandes = self::aliment('ole', 1.0, 634, 25.4, 6.7, 53.4, 12.6);
        self::assertSame([], $amandes->incoherences());
    }

    public function testUnRendementAContresensEstSignale(): void
    {
        $poisson = self::aliment('prot', 1.4, 148, 20.8, 0, 6.8, 0);
        self::assertCount(1, $poisson->incoherences());
    }

    public function testLesPeseesDeMickaelNeSontPasMisesEnCause(): void
    {
        /* Riz 84 g secs -> 393 g cuits (4,68) et truite 192 g crue -> 102 g
           cuite (0,53) : deux mesures reelles, faites a la balance. Elles vont
           dans le bon sens et le bilan de matiere les autorise. Les refuser
           reviendrait a preferer une moyenne nationale a une mesure. */
        self::assertSame([], self::aliment('fec', 4.68, 155, 3.15, 33.2, 0.7, 1.4)->incoherences());
        self::assertSame([], self::aliment('prot', 0.53, 148, 20.8, 0, 6.8, 0)->incoherences());
    }

    public function testLEtatDeReferenceEstDeduitEtExpose(): void
    {
        self::assertSame('cuit', self::riz()->etatReference);
        self::assertSame('cuit', self::riz()->versTableau()['etatReference']);
        self::assertSame('cru', self::aliment('prot', 0.85, 148, 20.8, 0, 6.8, 0)->etatReference);
    }

    /* ------------------------------------------------------------- stock */

    public function testUnProduitSansPoidsUnitaireEstEcarte(): void
    {
        /* Un litre de lait ou un pack n'ont pas de poids connu. Inventer une
           densite fausserait la diete sans que rien ne le signale. */
        $lait = new AlimentDisponible(
            reference: 'grocy:9', nom: 'Lait', categorie: 'lait',
            kcal100: 47.7, prot100: 3.5, gluc100: 5, lip100: 1.6,
            fibres100: 0, ratio: 1.0, stock: 2,
            unite: 'L', grammesParUnite: null,
        );

        self::assertFalse($lait->exploitable());
        self::assertNull($lait->stockEnGrammes());
    }

    public function testUnStockEnPiecesSeRameneAuGramme(): void
    {
        $oeufs = new AlimentDisponible(
            reference: 'grocy:3', nom: 'Oeufs', categorie: 'prot',
            kcal100: 146, prot100: 12, gluc100: 2, lip100: 10,
            fibres100: 0, ratio: 1.0, stock: 6,
            unite: 'piece', grammesParUnite: 55.0,
        );

        self::assertTrue($oeufs->exploitable());
        self::assertSame(330.0, $oeufs->stockEnGrammes());
    }

    private static function riz(): AlimentDisponible
    {
        return self::aliment('fec', 3.0, 130, 2.7, 28.2, 0.3, 0.7);
    }

    private static function aliment(
        string $categorie, float $ratio,
        float $kcal, float $prot, float $gluc, float $lip, float $fibres,
    ): AlimentDisponible {
        return new AlimentDisponible(
            reference: 'test:1', nom: 'Test', categorie: $categorie,
            kcal100: $kcal, prot100: $prot, gluc100: $gluc, lip100: $lip,
            fibres100: $fibres, ratio: $ratio, stock: 100,
        );
    }
}
