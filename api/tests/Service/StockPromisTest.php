<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\StockPromis;
use PHPUnit\Framework\TestCase;

/**
 * CE QUI EST DEJA PROMIS A UN AUTRE PLAN — porte du front le 21 septembre 2026.
 *
 * LE BUG QUE CETTE REGLE CORRIGE. Deux batch cooking d'affilee comptaient deux
 * fois le meme frigo : on compose lundi-mercredi, on enregistre ; on compose
 * jeudi-samedi, et le solveur repartait du stock d'AVANT. Le premier plan avait
 * beau vider les 800 g de poulet, le second annoncait « objectifs atteints » sur
 * du poulet qui n'existait plus — et personne n'etait prevenu, puisque chaque
 * plan etait juste tout seul.
 *
 * Ces cas viennent de `front/src/calcul/planFige.test.ts` et de
 * `planCalcule.test.ts`, dont les fonctions sont SUPPRIMEES dans le meme
 * commit : `dejaPromis`, `grammesEnStock` et `grammesDisponibles`. Ce n'est donc
 * pas un jumeau declare comme `Atwater` — le front ne fait plus la
 * soustraction, il lit `grammesDisponibles` que `GET /api/mon-frigo` rend.
 *
 * CE QUI RESTE AU FRONT, ET POURQUOI : `estCuisine`. Deux ecrans s'en servent
 * pour AFFICHER le badge « prevu » d'un plan (`planRelu.tsx`,
 * `etapeReglage.tsx`). Il lit le meme champ que la regle ci-dessous, mais il ne
 * decide rien du stock. Le jour ou la ressource `PlanRepas` exposera un booleen
 * `prevu`, il disparaitra a son tour.
 */
final class StockPromisTest extends TestCase
{
    public function testDeuxPlansPrevusNePeuventPlusCompterLeMemePoulet(): void
    {
        $promis = StockPromis::parReference([
            self::plan([['reference' => 'grocy:7', 'nom' => 'Poulet', 'grammes' => 800]], null),
        ]);

        self::assertSame(800.0, $promis['grocy:7']);
    }

    /**
     * Son stock a deja ete decremente pour de vrai. Le compter encore le
     * deduirait deux fois — la meme erreur, prise par l'autre bout.
     */
    public function testUnPlanCUISINENeReservePlusRien(): void
    {
        $promis = StockPromis::parReference([
            self::plan([['reference' => 'grocy:7', 'nom' => 'Poulet', 'grammes' => 800]],
                '2026-08-10T12:00:00Z'),
        ]);

        self::assertSame([], $promis);
    }

    public function testDeuxPlansPrevusSurLeMemeAlimentSAdditionnent(): void
    {
        $ligne = [['reference' => 'grocy:7', 'nom' => 'Poulet', 'grammes' => 300]];

        $promis = StockPromis::parReference([self::plan($ligne, null), self::plan($ligne, null)]);

        self::assertSame(600.0, $promis['grocy:7']);
    }

    /**
     * Il ne dit pas ce qu'il consomme. Deviner a partir de ses noms d'aliments
     * donnerait une reservation FAUSSE, qu'on ne voit pas — pire qu'une
     * reservation manquante, qu'on voit.
     */
    public function testUnPlanVersion1NeReserveRienPlutotQueDInventer(): void
    {
        $ancien = ['version' => 1, 'courses' => [], 'fournees' => [], 'boites' => []];

        self::assertSame([], StockPromis::parReference([['contenu' => $ancien, 'cuisineLe' => null]]));
    }

    public function testAucunPlanAucuneReservation(): void
    {
        self::assertSame([], StockPromis::parReference([]));
    }

    /**
     * LE BUG DU 13/08 : UN CHAMP ABSENT VAUT « PREVU », PAS « CUISINE ».
     *
     * Tant que le serveur n'avait pas vide son cache apres la migration, il ne
     * renvoyait pas `cuisineLe` du tout, et le front repondait « cuisine » pour
     * TOUS les plans : plus aucune reservation, et l'ecran affichait
     * « Cuisine le Invalid Date » sur un plan jamais cuisine.
     *
     * Le defaut va vers PREVU, et c'est le bon sens du risque : reserver un
     * stock qui ne l'etait pas se voit tout de suite et se corrige d'un appui ;
     * ne pas reserver laisse trois plans se partager le meme brocoli en
     * silence, et on le decouvre devant le bac.
     */
    public function testUnChampAbsentVautPREVU(): void
    {
        $promis = StockPromis::parReference([
            ['contenu' => ['version' => 2, 'consomme' => [
                ['reference' => 'grocy:7', 'nom' => 'Poulet', 'grammes' => 800]]]],
        ]);

        self::assertSame(800.0, $promis['grocy:7']);
    }

    public function testUneChaineVideVautPREVUElleAussi(): void
    {
        $promis = StockPromis::parReference([
            self::plan([['reference' => 'grocy:7', 'nom' => 'Poulet', 'grammes' => 800]], ''),
        ]);

        self::assertSame(800.0, $promis['grocy:7']);
    }

    /**
     * LE CAS REEL : TROIS PLANS QUI SE PARTAGENT 800 g DE BROCOLI SUR 500.
     *
     * Trois plans prevus, 300 + 300 + 200. Sans reservation, chacun repartait
     * des 500 g du frigo et se croyait servi. Avec, le troisieme ne trouve plus
     * rien — et le dit.
     */
    public function testTroisPlansQuiSePartagentHuitCentsGrammesSurCinqCents(): void
    {
        $brocoli = static fn (int $g): array => [
            'contenu' => ['version' => 2, 'courses' => [], 'fournees' => [], 'boites' => [],
                'consomme' => [['reference' => 'base:3', 'nom' => 'Brocoli', 'grammes' => $g]]],
            'cuisineLe' => null,
        ];

        $promis = StockPromis::parReference([$brocoli(300), $brocoli(300), $brocoli(200)]);

        self::assertSame(800.0, $promis['base:3']);
        self::assertSame(0.0, StockPromis::disponible(500.0, $promis['base:3']),
            'il ne doit plus rien rester de disponible');
    }

    // --------------------------------------------- ce que le frigo en fait

    public function testLeStockDisponibleNeDescendJamaisSousZero(): void
    {
        /* Un frigo negatif n'existe pas, et le solveur le lirait comme une
           dette a rembourser sur les repas suivants. */
        self::assertSame(0.0, StockPromis::disponible(400.0, 900.0));
    }

    public function testCeQuiResteApresLesPlansPrevus(): void
    {
        self::assertSame(100.0, StockPromis::disponible(400.0, 300.0));
    }

    /**
     * UN STOCK INCONNU RESTE INCONNU (regle 6 : vide n'est pas zero). Un litre
     * ou un pack n'ont pas de poids ; rendre « 0 g disponible » ferait croire
     * qu'il n'y en a plus, alors qu'on ne sait pas combien il y en a.
     */
    public function testUnStockInconnuResteInconnu(): void
    {
        self::assertNull(StockPromis::disponible(null, 300.0));
    }

    /** @param list<array{reference: string, nom: string, grammes: int}> $consomme
     *  @return array{contenu: array<string, mixed>, cuisineLe: ?string} */
    private static function plan(array $consomme, ?string $cuisineLe): array
    {
        return [
            'contenu' => ['version' => 2, 'courses' => [], 'fournees' => [],
                'boites' => [], 'consomme' => $consomme],
            'cuisineLe' => $cuisineLe,
        ];
    }
}
