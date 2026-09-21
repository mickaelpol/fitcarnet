<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Service\EcartDInventaire;
use PHPUnit\Framework\TestCase;

/**
 * LE SEUIL D'ECART D'INVENTAIRE APPARTIENT AU SERVEUR — palier B, 21 septembre 2026.
 *
 * `front/src/calcul/frigo.ts` portait `SEUIL_ECART = 0.001` en dur, avec sa
 * raison : « en deca, la difference vient de l'arrondi d'affichage, pas de la
 * balance ». C'est une regle metier, et elle etait ecrite dans l'ecran.
 *
 * POURQUOI LE SERVEUR ENVOIE LE NOMBRE ET NON LE VERDICT. L'inventaire se
 * compare a chaque frappe, sur jusqu'a cinq cents lignes. Demander le verdict
 * au serveur ferait un aller-retour PAR TOUCHE — « exactement ce que le §3 du
 * plan cherche a eviter », et le plan le dit en toutes lettres : appliquer
 * cette ligne-la serait une regression.
 *
 * C'est donc le motif de `GET /api/modes-de-travail`, repris tel quel : le
 * serveur transmet LA REGLE, indexee sur ce que le client possede deja (le
 * stock et ce qui est tape). L'ecran fait une comparaison parametree, il ne
 * decide rien.
 */
final class SeuilDEcartPublieTest extends TestCase
{
    public function testLeSeuilEstCeluiQueLEcranAppliquait(): void
    {
        self::assertSame(0.001, EcartDInventaire::SEUIL,
            'changer ce nombre change ce qui part vers Grocy : il se décide ici, pas dans un écran');
    }
}
