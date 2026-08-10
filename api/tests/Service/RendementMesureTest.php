<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\AlimentDisponible;
use PHPUnit\Framework\TestCase;

/**
 * TA BALANCE PASSE AVANT LA TABLE.
 *
 * Quand quelqu'un pese son aliment cru, le cuit, l'egoutte et le repese, ce
 * chiffre porte SA cuisson, SON eau, SON temps de feu. Une moyenne nationale
 * ne peut pas faire mieux. Le laisser ecraser par un import reviendrait a lui
 * dire que sa balance ne compte pas.
 *
 * C'etait pourtant ce qui arrivait : le rendement etait une colonne, et le
 * script Ciqual la reecrivait a chaque passage. La regle vit maintenant dans
 * `AlimentDisponible`, ou elle s'applique A LA LECTURE — quoi qu'il ait ete
 * ecrit, et quelle que soit la source, Grocy ou base.
 *
 * Elle vaut donc pour l'administrateur comme pour un compte ordinaire, ce qui
 * est bien le but : les deux ont le meme bouton « je prefere mesurer ».
 */
final class RendementMesureTest extends TestCase
{
    public function testLaPeseeDuRizPrimeSurCiqual(): void
    {
        /* 84 g secs -> 393 g cuits, la vraie mesure. Ciqual dit 2,26 pour un
           riz moyen ; celui-ci est plus hydrate, et c'est le sien. */
        $riz = self::aliment('fec', ratioTable: 2.26, avant: 84, apres: 393);

        self::assertEqualsWithDelta(4.679, $riz->ratio, 0.002);
        self::assertTrue($riz->mesureParLUtilisateur());
        self::assertSame([], $riz->incoherences());
    }

    public function testLaPeseeDuBrocoliPrimeAussi(): void
    {
        // 200 g crus -> 150 g a la vapeur
        $brocoli = self::aliment('leg', ratioTable: 1.0, avant: 200, apres: 150);

        self::assertEqualsWithDelta(0.75, $brocoli->ratio, 0.002);
        self::assertTrue($brocoli->mesureParLUtilisateur());
    }

    public function testEtCelleDeLaTruite(): void
    {
        $truite = self::aliment('prot', ratioTable: 0.85, avant: 129, apres: 102);

        self::assertEqualsWithDelta(0.791, $truite->ratio, 0.002);
        self::assertTrue($truite->mesureParLUtilisateur());
    }

    public function testSansPeseeLaTableSert(): void
    {
        $sans = self::aliment('fec', ratioTable: 3.0);

        self::assertSame(3.0, $sans->ratio);
        self::assertFalse($sans->mesureParLUtilisateur());
        self::assertSame([], $sans->incoherences());
    }

    /* ------------------------------------------------ la seule exception */

    public function testUneMesureAContresensNEstPasRetenue(): void
    {
        /* Une viande qui doublerait en cuisant : les deux colonnes de l'ecran
           s'inverseraient. C'est le seul cas ou la table reprend la main. */
        $absurde = self::aliment('prot', ratioTable: 0.85, avant: 100, apres: 200);

        self::assertSame(0.85, $absurde->ratio);
        self::assertFalse($absurde->mesureParLUtilisateur());
    }

    public function testEtOnLeDitPlutotQueDeLeTaire(): void
    {
        /* Quelqu'un a pris sa balance et note deux chiffres. Ne pas s'en
           servir sans rien dire lui laisserait croire le contraire. */
        $absurde = self::aliment('prot', ratioTable: 0.85, avant: 100, apres: 200);
        $dits = $absurde->incoherences();

        self::assertNotEmpty($dits);
        self::assertStringContainsString("n'a pas ete retenue", implode(' ', $dits));
        self::assertStringContainsString('100 g -> 200 g', implode(' ', $dits));
    }

    public function testUnFeculentQuiRetreciraitEstEcarteAussi(): void
    {
        $absurde = self::aliment('fec', ratioTable: 3.0, avant: 200, apres: 100);

        self::assertSame(3.0, $absurde->ratio);
        self::assertFalse($absurde->mesureParLUtilisateur());
    }

    /* ---------------------------------------------- pesees inutilisables */

    public function testUnePeseeIncompleteOuNulleEstIgnoree(): void
    {
        foreach ([[0.0, 300.0], [100.0, 0.0], [-5.0, 300.0], [100.0, null], [null, 300.0]] as [$av, $ap]) {
            $a = self::aliment('fec', ratioTable: 3.0, avant: $av, apres: $ap);
            self::assertSame(3.0, $a->ratio, \sprintf('pesees %s / %s', $av ?? 'null', $ap ?? 'null'));
            self::assertFalse($a->mesureParLUtilisateur());
            self::assertSame([], $a->incoherences(), 'une pesee vide ne se signale pas');
        }
    }

    public function testUnRendementDeTableNulRetombeSurUn(): void
    {
        self::assertSame(1.0, self::aliment('fec', ratioTable: 0.0)->ratio);
    }

    /* ------------------------------------------------------- l'affichage */

    public function testLaProvenanceRemonteJusquALEcran(): void
    {
        /* L'ecran doit pouvoir dire « ✓ mesure par toi » plutot que de
           laisser croire a une valeur de table. */
        $riz = self::aliment('fec', ratioTable: 2.26, avant: 84, apres: 393);

        self::assertSame('mesure', $riz->versTableau()['provenanceRatio']);
        self::assertSame('table', self::aliment('fec', ratioTable: 3.0)
            ->versTableau()['provenanceRatio']);
    }

    public function testLesDeuxSourcesAppliquentLaMemeRegle(): void
    {
        /* Grocy pour l'administrateur, la base pour les comptes ordinaires :
           les deux ont le meme bouton « je prefere mesurer », donc la meme
           regle. Elle vit dans le type partage, pas dans chaque lecteur. */
        $grocy = self::aliment('fec', ratioTable: 2.26, avant: 84, apres: 393, reference: 'grocy:1');
        $base = self::aliment('fec', ratioTable: 2.26, avant: 84, apres: 393, reference: 'base:1');

        self::assertSame($grocy->ratio, $base->ratio);
        self::assertSame($grocy->provenanceRatio, $base->provenanceRatio);
    }

    private static function aliment(
        string $categorie,
        float $ratioTable,
        ?float $avant = null,
        ?float $apres = null,
        string $reference = 'test:1',
    ): AlimentDisponible {
        return new AlimentDisponible(
            reference: $reference,
            nom: 'Test',
            categorie: $categorie,
            // le riz basmati tel qu'on le pese : SEC
            kcal100: 390,
            prot100: 8.1,
            gluc100: 84.6,
            lip100: 0.9,
            fibres100: 2.1,
            ratio: $ratioTable,
            stock: 100,
            peseeAvant: $avant,
            peseeApres: $apres,
        );
    }
}
