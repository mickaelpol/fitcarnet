<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\FormatCourt;
use PHPUnit\Framework\TestCase;

/**
 * LE SERVEUR ECRIT LES MEMES NOMBRES QUE L'ECRAN ECRIVAIT — et ce n'etait pas
 * le cas, releve par `revue-fitcarnet` le 21 septembre 2026.
 *
 * `FormatCourt::nb` employait `number_format($v, 1)`. Ce n'est pas `toFixed(1)`
 * de JavaScript, et le dossier le savait : `AnomaliesAliment` porte depuis le
 * 20 septembre un `decimale()` ecrit expres parce que « LES DEUX CANDIDATS PHP
 * ECHOUENT, chacun d'un cote ». La lecon a ete oubliee trois fichiers plus
 * loin, le lendemain — le jumeau oublie, motif n° 1 de l'audit.
 *
 * MESURE SUR LES DEUX MOTEURS (Node 22 et PHP 8.3.33 du conteneur) :
 *
 *   | valeur   | l'ecran ecrivait | `number_format` ecrivait |
 *   |----------|------------------|--------------------------|
 *   | 300,45   | 300,4            | 300,5                    |
 *   | 4,35     | 4,3              | 4,4                      |
 *   | 0,15     | 0,1              | 0,2                      |
 *
 * Soit 3 410 divergences sur 100 001 valeurs au pas de 0,01, c'est-a-dire
 * environ un tiers de toutes les valeurs en `x,x5`. Toutes ATTEIGNABLES AU
 * CLAVIER : taper « 300,45 » dans les calories d'une cible suffit.
 *
 * C'est la regle 7 prise a revers : un chiffre faux affiche, dans une phrase
 * que l'utilisateur lit pour corriger ses objectifs.
 */
final class FormatCourtTest extends TestCase
{
    /**
     * LES TROIS CAS QUI DEPARTAGENT LES TROIS ECRITURES.
     *
     * `number_format` PRE-ARRONDIT : 5,649999999999999 5 est traite comme 5,65
     * et rend « 5,7 », la ou JavaScript rend « 5,6 ».
     *
     * `sprintf('%.1F')` ARRONDIT AU PAIR sur les egalites : 8,25 est
     * exactement representable, et il rend « 8,2 » la ou JavaScript rend
     * « 8,3 » — ECMA-262 dit « s'il y en a deux, prendre le PLUS GRAND ».
     *
     * Aucun des deux n'est faux en soi ; ils appliquent une autre convention.
     * Mais l'utilisateur doit lire la MEME phrase qu'avant la refonte, au
     * caractere pres.
     */
    public function testLeFormatSuitToFixedEtNonNumberFormat(): void
    {
        self::assertSame('300,4', FormatCourt::nb(300.45),
            'number_format rendait « 300,5 » : le pré-arrondi');
        self::assertSame('4,3', FormatCourt::nb(4.35));
        self::assertSame('0,1', FormatCourt::nb(0.15));
    }

    public function testLesEgalitesVONTVERSLEHAUTCommeLeDitECMA262(): void
    {
        /* 8,25 est exactement representable : ce n'est pas un « presque ».
           `sprintf('%.1F')` rendrait « 8,2 », au pair. */
        self::assertSame('8,3', FormatCourt::nb(8.25));
        self::assertSame('2,7', FormatCourt::nb(2.675));
    }

    /**
     * LE TEMOIN : sans lui, une ecriture qui rendrait TOUT a l'entier passerait
     * les deux cas ci-dessus en apparence.
     */
    public function testUnNombreQuasiEntierSEcritEntier(): void
    {
        self::assertSame('740', FormatCourt::nb(740.0));
        self::assertSame('740', FormatCourt::nb(740.04), 'moins de 0,05 : c’est un arrondi d’affichage');
        self::assertSame('740,1', FormatCourt::nb(740.06), 'au-delà, la décimale se montre');
        self::assertSame('0', FormatCourt::nb(0.0));
    }

    /** Les valeurs de ce projet sont positives, mais rien ne l'impose au type. */
    public function testUnNombreNegatifGardeSonSigne(): void
    {
        self::assertSame('-30', FormatCourt::nb(-30.0));
        self::assertSame('-4,3', FormatCourt::nb(-4.35), 'JavaScript rend « -4.3 » : l’arrondi porte sur la valeur absolue');
    }
}
