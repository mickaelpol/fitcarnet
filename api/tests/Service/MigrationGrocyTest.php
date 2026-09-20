<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\MigrationGrocy;
use PHPUnit\Framework\TestCase;

/**
 * QUITTER GROCY : rapprocher ses emplacements de ceux de la base.
 *
 * Premier morceau de l'ecran de migration, et le seul qui se decide sans
 * base : l'appariement des emplacements. Mesure sur le frigo reel du
 * proprietaire du projet, le 20 septembre 2026 :
 *
 *     Grocy : Congelateur, Fridge, Frigo, Placard
 *     base  : Frigo, Congelateur, Placard, Autre
 *
 * DEUX PIEGES, ET LES DEUX SONT DANS CETTE LISTE. « Fridge » est un doublon
 * anglais de « Frigo », cree un jour et jamais range — il porte le flageolet
 * rouge. Et « Congelateur » n'a pas d'accent cote Grocy la ou la base ecrit
 * « Congelateur » avec un e accent aigu.
 *
 * CE QU'ON NE FAIT PAS : deviner au-dela de ca. Un emplacement qu'on ne sait
 * pas rapprocher tombe dans « Autre », et l'ecran le DIT. Inventer un
 * rapprochement ferait ranger des surgeles dans le placard sans que personne
 * le voie (regle 7 appliquee a un rangement).
 */
final class MigrationGrocyTest extends TestCase
{
    /** @return array<string, array{string, string}> */
    public static function emplacements(): array
    {
        return [
            'identique' => ['Placard', 'Placard'],
            'la casse ne compte pas' => ['PLACARD', 'Placard'],
            'les accents non plus' => ['Congelateur', 'Congélateur'],
            'accentue des deux cotes' => ['Congélateur', 'Congélateur'],
            'l\'anglais oublie dans Grocy' => ['Fridge', 'Frigo'],
            'freezer aussi' => ['Freezer', 'Congélateur'],
            'inconnu -> Autre' => ['Cellier', 'Autre'],
            'vide -> Autre' => ['', 'Autre'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('emplacements')]
    public function testUnEmplacementGrocyTrouveSonEquivalent(string $grocy, string $attendu): void
    {
        self::assertSame($attendu, MigrationGrocy::emplacementEquivalent($grocy, self::EN_BASE));
    }

    /**
     * LE TEMOIN : si la base n'a pas « Autre », on ne l'invente pas.
     *
     * Sans ce cas, un repli code en dur passerait tous les tests ci-dessus tout
     * en renvoyant un emplacement qui n'existe pas — et l'ecriture echouerait
     * a la toute fin, sur la soixante-deuxieme ligne.
     */
    public function testLeRepliSortDeLaListeReelle(): void
    {
        self::assertSame('Frigo', MigrationGrocy::emplacementEquivalent('Cellier', ['Frigo']));
    }

    private const EN_BASE = ['Frigo', 'Congélateur', 'Placard', 'Autre'];
}
