<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\NombreSaisi;
use PHPUnit\Framework\TestCase;

/**
 * LA LECTURE D'UN NOMBRE TAPE, EXTRAITE DE `VerdictAliment` — 26 septembre
 * 2026, feature `macros-editeur-vide-pas-zero`.
 *
 * Cette lecture vivait en prive dans `VerdictAliment::nombreSaisi()`. Les
 * pesees (`peseeAvant`, `peseeApres`) et `quantite` en ont besoin aussi :
 * plutot qu'une troisieme copie, ce service devient le point unique.
 *
 * « 12,5 » est un nombre, « 4,2,1 » n'en est pas un — releve le 15 septembre
 * 2026, `parseFloat` le lisait 4,2 et un stock invente partait en base. Un
 * champ vide n'est pas un zero (regle 6 du projet) : `estVide()` le dit sans
 * ambiguite, avant meme d'essayer de lire un nombre.
 */
final class NombreSaisiTest extends TestCase
{
    // ------------------------------------------------------------- estVide()

    public function testEstVideAvecNull(): void
    {
        self::assertTrue(NombreSaisi::estVide(null));
    }

    public function testEstVideAvecChaineVide(): void
    {
        self::assertTrue(NombreSaisi::estVide(''));
    }

    public function testEstVideAvecDesEspacesSeuls(): void
    {
        self::assertTrue(NombreSaisi::estVide('   '));
    }

    public function testLE_TEMOIN_ESTVIDE_EST_FAUX_POUR_UNE_VALEUR_TAPEE(): void
    {
        /* TEMOIN : sans lui, `estVide` qui rendrait toujours `true` passerait
           les trois cas ci-dessus tout en rendant le service inutile. Le zero
           est une reponse, pas une absence (regle 6). */
        self::assertFalse(NombreSaisi::estVide('0'));
    }

    // ----------------------------------------------------------------- lire()

    public function testLireUneVirguleFrancaise(): void
    {
        self::assertEqualsWithDelta(12.5, NombreSaisi::lire('12,5'), 0.0001);
    }

    public function testLireUnPoint(): void
    {
        self::assertEqualsWithDelta(12.5, NombreSaisi::lire('12.5'), 0.0001);
    }

    public function testLireUnNegatifEstRenduTelQuel(): void
    {
        /* La lecture ne juge pas le signe : « -2 » EST un nombre lisible.
           C'est a l'appelant de decider si le negatif a un sens ici (regle 7
           du projet — releve le 21 septembre 2026 sur VerdictAliment). */
        self::assertEqualsWithDelta(-2.0, NombreSaisi::lire('-2'), 0.0001);
    }

    public function testLireUnEntierJSON(): void
    {
        self::assertEqualsWithDelta(12.0, NombreSaisi::lire(12), 0.0001);
    }

    public function testLireUnFloatJSON(): void
    {
        self::assertEqualsWithDelta(12.5, NombreSaisi::lire(12.5), 0.0001);
    }

    public function testLireRendNullPourUneChaineVide(): void
    {
        self::assertNull(NombreSaisi::lire(''));
    }

    public function testLireRendNullPourNull(): void
    {
        self::assertNull(NombreSaisi::lire(null));
    }

    public function testLireRendNullPourUneSaisieAVirgulesMultiples(): void
    {
        /* « 4,2,1 » se lisait 4,2 avec `parseFloat` : un stock invente
           partait en base — releve le 15 septembre 2026. */
        self::assertNull(NombreSaisi::lire('4,2,1'));
    }

    public function testLireRendNullPourDuTexteNonNumerique(): void
    {
        self::assertNull(NombreSaisi::lire('abc'));
    }

    public function testLireRendNullPourUnBooleen(): void
    {
        self::assertNull(NombreSaisi::lire(true));
    }

    public function testLireRendNullPourUnTableau(): void
    {
        self::assertNull(NombreSaisi::lire([]));
    }

    public function testLE_TEMOIN_LIRE_RECONNAIT_UNE_SAISIE_LISIBLE(): void
    {
        /* TEMOIN : sans lui, `lire` qui rendrait toujours `null` passerait
           tous les cas de refus ci-dessus tout en rendant le service
           inutile. */
        self::assertEqualsWithDelta(3.0, NombreSaisi::lire('3'), 0.0001);
    }
}
