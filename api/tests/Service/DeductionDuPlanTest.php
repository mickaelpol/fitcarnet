<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\AlimentDisponible;
use App\Service\DeductionDuPlan;
use PHPUnit\Framework\TestCase;

/**
 * Ce que « J'ai cuisine » retire du frigo — le seul calcul du projet qui
 * ECRIVE dans le stock de quelqu'un sans qu'il ait tape le chiffre.
 *
 * Une erreur ici ne se voit pas a l'ecran. Elle se voit devant un bac vide, ou
 * devant un bac plein que le solveur croit vide, une semaine plus tard.
 */
final class DeductionDuPlanTest extends TestCase
{
    public function testUneDeductionOrdinaireEnGrammes(): void
    {
        /* 1000 g de riz en stock, 300 g cuisines : il en reste 700. Le riz est
           tenu au gramme, donc unites et grammes se confondent. */
        $sortie = DeductionDuPlan::calculer(
            [['reference' => 'base:5', 'nom' => 'Riz', 'grammes' => 300]],
            ['base:5' => self::aliment('base:5', 'Riz', stock: 1000)],
        );

        self::assertSame([5 => 700.0], $sortie->quantites);
        self::assertSame([], $sortie->ignores);
    }

    public function testLeFrigoCompteEnUNITES(): void
    {
        /* LE piege. Un pot de skyr n'est pas « 400 g », c'est « 1 » avec 400 g
           par unite. Retirer 200 g, c'est poser le stock a 0,5 — pas a 200.
           Sans cette conversion, deux pots deviendraient deux cents pots. */
        $sortie = DeductionDuPlan::calculer(
            [['reference' => 'grocy:12', 'nom' => 'Skyr', 'grammes' => 200]],
            ['grocy:12' => self::aliment('grocy:12', 'Skyr', stock: 1, parUnite: 400)],
        );

        self::assertSame([12 => 0.5], $sortie->quantites);
    }

    public function testLeStockNeDescendJamaisSousZero(): void
    {
        /* Un frigo negatif n'existe pas, et le solveur le lirait comme une
           dette a rembourser sur les repas suivants — il refuserait de servir
           du poulet jusqu'a ce que le compte soit apure. */
        $sortie = DeductionDuPlan::calculer(
            [['reference' => 'base:7', 'nom' => 'Poulet', 'grammes' => 900]],
            ['base:7' => self::aliment('base:7', 'Poulet', stock: 400)],
        );

        self::assertSame([7 => 0.0], $sortie->quantites);
    }

    public function testUnAlimentSortiDuFrigoEstRENDU_pasDevine(): void
    {
        /* On ne cherche pas « un aliment qui lui ressemble ». Retirer du
           mauvais bac est pire que ne rien retirer : le stock deviendrait faux
           a deux endroits au lieu d'un, et personne ne le saurait. */
        $sortie = DeductionDuPlan::calculer(
            [['reference' => 'base:99', 'nom' => 'Truite', 'grammes' => 200]],
            ['base:5' => self::aliment('base:5', 'Riz', stock: 1000)],
        );

        self::assertSame([], $sortie->quantites);
        self::assertSame([['nom' => 'Truite', 'motif' => 'plus dans ton frigo']], $sortie->ignores);
    }

    public function testUnAlimentSansPoidsParUniteEstRENDU(): void
    {
        /* Un litre de lait, un pack : sans grammes par unite, on ne sait pas
           combien d'unites retirer. Retirer « a peu pres » fausserait le stock
           en silence. */
        $sortie = DeductionDuPlan::calculer(
            [['reference' => 'grocy:3', 'nom' => 'Lait', 'grammes' => 250]],
            ['grocy:3' => self::aliment('grocy:3', 'Lait', stock: 2, parUnite: null)],
        );

        self::assertSame([], $sortie->quantites);
        self::assertSame(
            [['nom' => 'Lait', 'motif' => 'poids par unité inconnu']], $sortie->ignores);
    }

    public function testUneLigneAZeroGrammeNEcritRien(): void
    {
        /* Reecrire le stock a sa valeur actuelle n'est pas anodin sur Grocy :
           c'est une operation d'inventaire, elle laisse une trace et une date.
           Une ligne a zero ne merite pas ca. */
        $sortie = DeductionDuPlan::calculer(
            [['reference' => 'base:5', 'nom' => 'Riz', 'grammes' => 0]],
            ['base:5' => self::aliment('base:5', 'Riz', stock: 1000)],
        );

        self::assertSame([], $sortie->quantites);
        self::assertSame([], $sortie->ignores);
    }

    public function testLesBonnesLignesPassentMemeQuandUneAutreEchoue(): void
    {
        /* Le plan EST cuisine : refuser tout parce qu'un aliment a disparu
           laisserait le frigo entier faux. On fait ce qu'on peut, et on dit
           ce qu'on n'a pas pu faire. */
        $sortie = DeductionDuPlan::calculer(
            [
                ['reference' => 'base:5', 'nom' => 'Riz', 'grammes' => 300],
                ['reference' => 'base:99', 'nom' => 'Truite', 'grammes' => 200],
                ['reference' => 'base:7', 'nom' => 'Poulet', 'grammes' => 100],
            ],
            [
                'base:5' => self::aliment('base:5', 'Riz', stock: 1000),
                'base:7' => self::aliment('base:7', 'Poulet', stock: 500),
            ],
        );

        self::assertSame([5 => 700.0, 7 => 400.0], $sortie->quantites);
        self::assertCount(1, $sortie->ignores);
    }

    public function testUnContenuAbsentOuIllisibleNeCasseRien(): void
    {
        /* Les plans enregistres avant cette fonctionnalite n'ont pas de
           `consomme`. Le controleur les refuse plus haut, mais ce calcul ne
           doit pas exploser si un jour on l'appelle quand meme. */
        foreach ([null, 'du texte', 42, []] as $nImporteQuoi) {
            $sortie = DeductionDuPlan::calculer($nImporteQuoi, []);
            self::assertSame([], $sortie->quantites, \var_export($nImporteQuoi, true));
        }
    }

    public function testLIdentifiantSourceSeLitDesDeuxCotes(): void
    {
        /* Ni Grocy ni la base ne connaissent le prefixe : il n'existe que pour
           distinguer les deux mondes cote application. */
        self::assertSame(12, DeductionDuPlan::identifiantSource('grocy:12'));
        self::assertSame(5, DeductionDuPlan::identifiantSource('base:5'));
        self::assertSame(7, DeductionDuPlan::identifiantSource('7'));
    }

    public function testDeuxLignesSurLeMemeAlimentNeSeCumulentPas(): void
    {
        /* `consommationDuPlan` cote ecran additionne deja par aliment : une
           reference n'apparait qu'une fois. Si jamais elle apparaissait deux
           fois, la SECONDE ecrase la premiere — et surtout, on n'ecrit pas
           deux inventaires successifs sur le meme produit, ce que Grocy
           enregistrerait comme deux mouvements. */
        $sortie = DeductionDuPlan::calculer(
            [
                ['reference' => 'base:5', 'nom' => 'Riz', 'grammes' => 300],
                ['reference' => 'base:5', 'nom' => 'Riz', 'grammes' => 200],
            ],
            ['base:5' => self::aliment('base:5', 'Riz', stock: 1000)],
        );

        self::assertCount(1, $sortie->quantites);
        self::assertSame([5 => 800.0], $sortie->quantites);
    }

    private static function aliment(
        string $reference,
        string $nom,
        float $stock,
        ?float $parUnite = 1.0,
    ): AlimentDisponible {
        return new AlimentDisponible(
            reference: $reference,
            nom: $nom,
            categorie: 'prot',
            kcal100: 100,
            prot100: 20,
            gluc100: 0,
            lip100: 2,
            fibres100: 0,
            ratio: 1.0,
            stock: $stock,
            grammesParUnite: $parUnite,
        );
    }
}
