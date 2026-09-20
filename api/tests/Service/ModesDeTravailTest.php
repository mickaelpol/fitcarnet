<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\ModesDeTravail;
use PHPUnit\Framework\TestCase;

/**
 * LA REGLE DU CHRONO, ET LA SEULE ECRITURE QUI LA PORTE.
 *
 * « Un exercice for time ne compte que pour UNE serie » : il n'a qu'un temps
 * total, ses lignes supplementaires notent le detail.
 *
 * CE TEST GARDE AUSSI LA FORME DU CATALOGUE, parce que l'ecran en depend pour
 * afficher « 7 sur 12 » pendant que l'utilisateur modifie sa seance. Voir
 * `ModesDeTravail` pour la panne qui a mene a ce dispositif.
 */
final class ModesDeTravailTest extends TestCase
{
    public function testUN_CHRONO_NE_COMPTE_QUE_POUR_UNE_SERIE(): void
    {
        self::assertSame(1, ModesDeTravail::seriesQuiComptent('chrono'));
        self::assertTrue(ModesDeTravail::compteUneSeuleSerie('chrono'));
    }

    public function testLES_AUTRES_MODES_COMPTENT_TOUTES_LEURS_SERIES(): void
    {
        /* LE TEMOIN. Sans lui, un `ModesDeTravail` qui rendrait 1 partout
           passerait le test ci-dessus en faisant afficher « 0 sur 1 » sur une
           seance de musculation a douze series. */
        foreach (['charge', 'iso'] as $mode) {
            self::assertNull(ModesDeTravail::seriesQuiComptent($mode), $mode);
            self::assertFalse(ModesDeTravail::compteUneSeuleSerie($mode), $mode);
        }
    }

    public function testSANS_MODE_TOUT_COMPTE(): void
    {
        /* Mieux vaut annoncer trop a faire que trop peu : un compteur qui
           masque du travail restant est pire qu'un compteur trop prudent. */
        self::assertNull(ModesDeTravail::seriesQuiComptent(null));
    }

    public function testUN_MODE_INCONNU_COMPTE_TOUT_AU_LIEU_DE_TOMBER(): void
    {
        /* La base a un CHECK, donc ca ne devrait pas arriver. Mais une valeur
           inattendue ne doit pas lever une erreur au milieu d'une lecture de
           seance ni, pire, masquer des series. */
        self::assertNull(ModesDeTravail::seriesQuiComptent('trampoline'));
    }

    /* LA COMPARAISON AVEC LE `CHECK` DE `db/01-schema.sql` N'EST PAS ICI, et
       ce n'est pas un oubli : le conteneur ne monte que `api/` sous `/app`, et
       PHPUnit ne peut pas lire `db/`. Essaye le 21 septembre 2026 — le test
       echouait en disant « aucun CHECK trouve », ce qui est le bon
       comportement d'un garde qui ne peut pas garder.

       Elle vit donc dans `front/src/calcul/avancementUnique.test.ts`, qui lit
       tout le depot depuis l'hote. C'est le meme dispositif qu'`epleyUnique` :
       une divergence entre deux langages ne se voit d'aucun des deux cotes. */

    public function testLE_CATALOGUE_A_LA_FORME_QUE_L_ECRAN_ATTEND(): void
    {
        $catalogue = ModesDeTravail::catalogue();

        self::assertCount(3, $catalogue);
        self::assertSame(
            ['cle' => 'chrono', 'seriesQuiComptent' => 1],
            $catalogue[2],
            'l\'ecran lit `cle` et `seriesQuiComptent` : renommer l\'un des deux '
            . 'le rend muet sans rien casser ici');
    }
}
