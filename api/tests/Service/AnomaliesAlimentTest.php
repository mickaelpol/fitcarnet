<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\AnomaliesAliment;
use PHPUnit\Framework\TestCase;

/**
 * LES ANOMALIES D'UN ALIMENT, CAS PAR CAS — portes le 20 septembre 2026.
 *
 * `AnomaliesPortageTest` prouve que ce service rend la MEME chose que l'ancien
 * juge du front, sur 4 409 cas. Il ne dit pas POURQUOI chaque regle existe, ni
 * laquelle a casse quand un message change.
 *
 * Ces cas-la viennent de `front/src/calcul/plausibilite.test.ts`, qui a ete
 * supprime avec le juge qu'il eprouvait. Chacun porte une panne reelle et sa
 * date : c'est la memoire du projet, et elle ne devait pas partir avec le
 * fichier.
 */
final class AnomaliesAlimentTest extends TestCase
{
    /**
     * Le riz basmati, dans l'unique convention de l'application : les valeurs
     * du grain SEC, celui qu'on pose sur la balance.
     *
     * CES NOMBRES SONT CEUX D'HIER, ET ON LES GARDE EXPRES — ce fichier eprouve
     * la conversion, pas la justesse du riz. Mais qu'on ne les recopie pas
     * ailleurs comme une reference : 130 est la valeur USDA du riz blanc long
     * CUIT. CIQUAL 2025 donne 350 au riz blanc cru et 155 au cuit, d'ou le
     * rendement 2,26 du catalogue, et non 3. Releve le 16 septembre 2026.
     *
     * @return list<array{gravite: string, code: string, message: string}>
     */
    private static function riz(
        float $kcal100 = 390,
        float $prot100 = 8.1,
        float $gluc100 = 84.6,
        float $lip100 = 0.9,
        ?float $fibres100 = 2.1,
        float $ratio = 3,
        string $categorie = 'fec',
        string $nom = 'Test',
    ): array {
        return AnomaliesAliment::pour($nom, $categorie, $kcal100, $prot100,
            $gluc100, $lip100, $fibres100, $ratio);
    }

    /** @param list<array{gravite: string, code: string, message: string}> $a */
    private static function codes(array $a): array
    {
        return \array_column($a, 'code');
    }

    // ------------------------------------------------- le riz de mars

    public function testDesValeursCuitesSaisiesSurUnGrainSecSontUnBlocage(): void
    {
        /* LE BUG REEL : les macros du riz CUIT posees sur un riz qu'on pese
           SEC. Le solveur calculait juste, et faisait peser trois fois trop. */
        self::assertSame(['valeurs_deja_cuites'], self::codes(
            self::riz(kcal100: 130, prot100: 2.7, gluc100: 28.2, lip100: 0.3, fibres100: 0.7)));
    }

    public function testEtLeMessageDonneUNECorrectionPasUnChoix(): void
    {
        $a = self::riz(kcal100: 130, prot100: 2.7, gluc100: 28.2, lip100: 0.3, fibres100: 0.7);

        self::assertSame('blocage', $a[0]['gravite']);
        self::assertStringContainsString('Multiplie tout par le rendement', $a[0]['message']);
        self::assertStringContainsString('390 kcal', $a[0]['message']);
        self::assertStringContainsString('84.6 g de glucides', $a[0]['message']);
        /* Ce qui a disparu du message, et c'est delibere : la question posee a
           l'utilisateur. On lui donne la correction, pas un choix a faire. */
        self::assertStringNotContainsString('toi seul sais', $a[0]['message']);
    }

    public function testDesValeursQuAucunRendementNExpliqueRecoiventUnAutreMessage(): void
    {
        /* 40 kcal pour un grain sec : multiplier par 3 donne 120, toujours hors
           bande. Ce n'est pas une saisie cuite, c'est une saisie fausse — et
           lui proposer une multiplication serait un mauvais conseil. */
        $codes = self::codes(self::riz(kcal100: 40, prot100: 0.8, gluc100: 8.7, lip100: 0.1));

        self::assertContains('grain_sec_invraisemblable', $codes);
        self::assertNotContains('valeurs_deja_cuites', $codes);
    }

    public function testUnFeculentQuiNeGonflePasNEstPasJugeSurLaBandeDuGrainSec(): void
    {
        /* Pommes de terre, patate douce : rendement 1, 92 kcal, et c'est
           normal. Sans cette condition, la borne des 300 kcal refuserait la
           moitie des feculents reels. */
        self::assertSame([], self::riz(kcal100: 92, prot100: 2, gluc100: 20.7,
            lip100: 0.16, fibres100: 2.5, ratio: 1, nom: 'Patate douce'));
    }

    public function testLesFloconsDAvoineNonPlus(): void
    {
        /* 375 kcal/100 g, rendement 1 : on ne les cuit pas dans cette app. */
        self::assertSame([], self::riz(kcal100: 375, prot100: 12.5, gluc100: 59.5,
            lip100: 7.5, fibres100: 8, ratio: 1, nom: 'Flocons avoine'));
    }

    public function testLeCasDeLaSemouleUnFeculentQuiRetrecitEstUnBlocage(): void
    {
        /* 142 kcal declarees seches avec un rendement de 0,41. Les 142 kcal ne
           peuvent PAS etre attrapees seules — une pomme de terre en fait 92, et
           c'est normal. Le rendement impossible est le seul indice visible que
           le reste de la fiche est faux. */
        $a = self::riz(kcal100: 142, prot100: 4.3, gluc100: 26.8, lip100: 1,
            fibres100: 1.9, ratio: 0.41, nom: 'Semoule complète');

        $bloquant = \array_values(\array_filter($a,
            static fn (array $x): bool => 'feculent_qui_retrecit' === $x['code']));

        self::assertNotSame([], $bloquant);
        self::assertSame('blocage', $bloquant[0]['gravite']);
        self::assertStringContainsString('le produit CUIT', $bloquant[0]['message']);
    }

    public function testMaisUnRendementTropGrandNeBloquePas(): void
    {
        /* Il n'annonce qu'un poids : se tromper dessus ne fait pas manger de
           travers. C'est la regle de toute la section, et le feculent qui
           retrecit en est la seule exception — parce que lui est IMPOSSIBLE. */
        $a = self::riz(ratio: 5.5);
        $hors = \array_values(\array_filter($a,
            static fn (array $x): bool => 'rendement_hors_norme' === $x['code']));

        self::assertNotSame([], $hors);
        self::assertSame('avertissement', $hors[0]['gravite']);
    }

    public function testLePoidsDeMatiereSecheAnnonceTientCompteDes88Pourcent(): void
    {
        /**
         * F5, 15 septembre 2026. LA PHRASE POSAIT 88 g DE MATIERE SECHE PUIS
         * CALCULAIT COMME S'IL Y EN AVAIT 100.
         *
         * `100 / ratio` au lieu de `88 / ratio` : pour un rendement de 6, elle
         * annoncait 17 g la ou son propre raisonnement en donne 15. Un
         * avertissement dont le chiffre contredit sa propre premisse n'apprend
         * rien — il donne un troisieme nombre a demeler.
         */
        $message = static function (float $ratio): string {
            foreach (self::riz(ratio: $ratio) as $x) {
                if ('rendement_hors_norme' === $x['code']) {
                    return $x['message'];
                }
            }

            return '';
        };

        self::assertStringContainsString('15 g pour 100 g de produit cuit', $message(6));
    }

    // ------------------------------------------------- les deux bornes

    public function testUnLegumeQuiATropPerduNEstPasAccuseDAvoirGagneDeLEau(): void
    {
        /**
         * LE JUMEAU DU CORRECTIF DU 16 SEPTEMBRE 2026.
         *
         * Ce jour-la, les deux bornes de `prot` ont ete separees : un seul
         * message servait les deux, et il mentait sur la borne haute. Le
         * commentaire disait « comme son jumeau le legume » — et ce jumeau,
         * lui, a garde UN message pour DEUX bornes. La revue l'a releve le
         * soir meme.
         *
         * Un epinard poele : 500 g crus, 120 g cuits, rendement 0,24. Il
         * s'enregistre, et l'ecran lui repondait « un legume rend son eau, il
         * n'en gagne pas » — l'inverse de ce qui s'est passe.
         */
        $a = self::riz(kcal100: 23, prot100: 2.7, gluc100: 1.4, lip100: 0.4,
            fibres100: 2.2, ratio: 0.24, categorie: 'leg', nom: 'Épinard');

        $dit = \implode(' ', \array_column($a, 'message'));
        self::assertNotSame('', $dit, 'une perte des trois quarts mérite un signalement');
        self::assertStringNotContainsString('n\'en gagne pas', $dit,
            'c\'est le message de la borne HAUTE : il dit l\'inverse du constat');
    }

    public function testUnLegumeQuiGonfleEstToujoursSignalePourLaBonneRaison(): void
    {
        /* LE TEMOIN INVERSE : separer les bornes ne doit pas eteindre celle-ci. */
        $a = self::riz(kcal100: 23, prot100: 2.7, gluc100: 1.4, lip100: 0.4,
            fibres100: 2.2, ratio: 1.5, categorie: 'leg', nom: 'Épinard');

        self::assertStringContainsString('n\'en gagne pas', \implode(' ', \array_column($a, 'message')));
    }

    // ------------------------------------------------- arithmetique

    public function testPlusDeCentGrammesDeNutrimentsDansCentGrammes(): void
    {
        self::assertContains('plus_de_cent', self::codes(
            self::riz(kcal100: 400, prot100: 40, gluc100: 40, lip100: 20, fibres100: 10, ratio: 1)));
    }

    public function testUneValeurNegativeBloqueToutDeSuite(): void
    {
        /* Et elle bloque SEULE : juger le reste d'une fiche dont une valeur est
           absurde reviendrait a commenter un chiffre qu'on n'a pas lu. */
        self::assertSame(['valeur_negative'], self::codes(self::riz(prot100: -2)));
    }

    public function testUnRendementNulBloque(): void
    {
        self::assertSame(['rendement_nul'], self::codes(self::riz(ratio: 0)));
    }

    public function testUnNaNNePassePasAuTravers(): void
    {
        self::assertSame(['valeur_illisible'], self::codes(self::riz(kcal100: \NAN)));
    }

    public function testLesFibresComptentDeuxKcalParGrammeCommeAilleurs(): void
    {
        /* Convention EUROPEENNE, regle 4. L'Atwater americain declarerait
           incoherents des aliments riches en fibres dont les valeurs sont
           pourtant justes — et le chia en est le cas type. */
        /* DES GRAINES DE CHIA REELLES, et aucune des deux valeurs n'est
           fausse : 4x17 + 4x7,7 + 2x34 + 9x31 = 445,8, pour 486 declarees.
           En ignorant les 34 g de fibres, le calcul tombait a 378 et l'ecart
           de 108 kcal depassait la marge de 20 % — le module dont la raison
           d'etre est de reperer les donnees qui mentent accusait une donnee
           juste, sur toute la famille des oleagineux. */
        $chia = self::riz(kcal100: 486, prot100: 17, gluc100: 7.7, lip100: 31,
            fibres100: 34, ratio: 1, categorie: 'ole');

        self::assertNotContains('calories_incoherentes', self::codes($chia),
            'un aliment très riche en fibres ne doit pas être accusé à tort');
    }

    public function testUnAlimentDontLesCaloriesSontDoubleesEstSignale(): void
    {
        $a = self::riz(kcal100: 780);

        self::assertContains('calories_incoherentes', self::codes($a));
        self::assertSame('avertissement', $a[0]['gravite'],
            'on le DIT sans rien empêcher : un alcool ou un polyol s\'écarte légitimement');
    }

    public function testUnEcartDeTableOrdinaireNeDeclencheRien(): void
    {
        /* LE TEMOIN : sans lui, un seuil trop serre crierait sur chaque aliment
           juste, et on apprendrait a ignorer le message. */
        self::assertSame([], self::riz());
    }

    public function testLesAlimentsTresPeuCaloriquesNeCrientPasAuLoup(): void
    {
        /* 5 kcal d'ecart sur un legume a 20 kcal font 25 % : la marge ABSOLUE
           de 25 kcal evite de signaler tous les legumes de la table. Sans
           elle, le message deviendrait du bruit de fond. */
        self::assertNotContains('calories_incoherentes', self::codes(
            self::riz(kcal100: 33, prot100: 2.8, gluc100: 2.4, lip100: 0.4,
                fibres100: 2.9, ratio: 1, categorie: 'leg')));
    }
}
