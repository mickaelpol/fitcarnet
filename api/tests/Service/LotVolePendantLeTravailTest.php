<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\InventaireLots;
use Doctrine\DBAL\Connection;
use PHPUnit\Framework\TestCase;

/**
 * UN LOT NE DOIT PAS ETRE VOLE A UN TRAVAILLEUR VIVANT.
 *
 * CONSTAT E6 DE L'AUDIT DU 7 SEPTEMBRE 2026.
 *
 * `prendre()` fait bien `FOR UPDATE SKIP LOCKED`, mais referme sa transaction
 * aussitot : le verrou ne dure que le temps de la prise. Passe cet instant, la
 * seule chose qui dit « quelqu'un travaille ici » est `vu_le`, touche a chaque
 * ligne envoyee, et `reprendreLesAbandonnes()` rend le lot au bout de deux
 * minutes de silence.
 *
 * DEUX MINUTES, C'EST LONG POUR UNE LIGNE ET COURT POUR GROCY QUI RAME. Le
 * scenario n'a rien de theorique :
 *
 *   1. le travailleur A prend le lot et envoie une ligne ;
 *   2. Grocy met trois minutes a repondre — reseau, verrou, peu importe ;
 *   3. B constate le silence, remet le lot en attente, et le prend ;
 *   4. A revient, ecrit `traites`, et ecrase l'avancement de B.
 *
 * Les deux travaillent alors sur le meme lot. Les lignes renvoyees deux fois
 * ne font pas de degat — `definirStock` pose une quantite absolue, Grocy
 * repond « deja a jour » — mais `traites` devient faux, `terminer()` part deux
 * fois avec des listes d'echecs differentes, et l'invariant « un seul lot
 * actif par compte » que la migration 26 existe pour garantir ne protege rien :
 * c'est le MEME lot.
 *
 * LE REMEDE : un jeton pose a la prise. Chaque ecriture le presente, et la
 * base ne l'accepte que s'il est encore le bon. Un travailleur depossede
 * l'apprend a sa premiere ecriture et s'arrete, au lieu de se battre en
 * silence avec son remplacant.
 */
final class LotVolePendantLeTravailTest extends TestCase
{
    public function testPrendreUnLotPoseUnJetonEtLeRend(): void
    {
        $sql = [];
        $lots = self::lots($sql, lignesTouchees: 1);

        $lot = $lots->prendre();

        self::assertNotNull($lot, 'un lot en attente doit etre pris');
        self::assertArrayHasKey('jeton', $lot,
            'le lot rendu doit porter le jeton qui autorise ses ecritures');
        self::assertNotSame('', (string) $lot['jeton']);
    }

    /**
     * LE COEUR DU CONSTAT. La base n'a modifie aucune ligne : le jeton presente
     * n'est plus celui du lot, donc quelqu'un d'autre l'a pris.
     */
    public function testAvancerAvecUnJetonPerimeEstRefuse(): void
    {
        $sql = [];
        $lots = self::lots($sql, lignesTouchees: 0);   // la base n'a rien touche

        $encoreAMoi = $lots->avancer(1, 5, 'jeton-perime');

        self::assertFalse($encoreAMoi,
            'un travailleur depossede doit l\'apprendre, pas ecraser l\'avancement du suivant');
    }

    /**
     * Le temoin : tant que le jeton est bon, l'avancement passe. Sans lui, un
     * `avancer()` qui refuserait TOUJOURS passerait le test precedent et
     * bloquerait tous les inventaires.
     */
    public function testAvancerAvecLeBonJetonPasse(): void
    {
        $sql = [];
        $lots = self::lots($sql, lignesTouchees: 1);

        self::assertTrue($lots->avancer(1, 5, 'le-bon-jeton'));
    }

    /**
     * Terminer est la derniere ecriture, et la plus couteuse a laisser passer :
     * elle fige `traites` et la liste des echecs. Un travailleur depossede qui
     * termine ecraserait le travail reel de son remplacant.
     */
    public function testTerminerAvecUnJetonPerimeEstRefuse(): void
    {
        $sql = [];
        $lots = self::lots($sql, lignesTouchees: 0);

        self::assertFalse($lots->terminer(1, 5, [], 'jeton-perime'),
            'un lot deja repris par un autre ne doit pas etre cloture par l\'ancien');
    }

    /**
     * Le jeton doit etre POSE en base a la prise, sinon rien ne le compare.
     */
    public function testLaPriseEcritLeJetonEnBase(): void
    {
        $sql = [];
        self::lots($sql, lignesTouchees: 1)->prendre();

        $ecritures = implode(' ', $sql);
        self::assertStringContainsString('jeton', $ecritures,
            'la prise doit inscrire le jeton sur le lot');
    }

    /**
     * Et chaque ecriture doit le PRESENTER, faute de quoi la base ne peut rien
     * refuser.
     */
    public function testChaqueEcritureCompareLeJeton(): void
    {
        $sql = [];
        $lots = self::lots($sql, lignesTouchees: 1);

        $lots->avancer(1, 5, 'j');
        $lots->terminer(1, 5, [], 'j');

        foreach ($sql as $requete) {
            self::assertStringContainsString('jeton = :jeton', $requete,
                'toute ecriture sur un lot doit etre conditionnee au jeton : ' . $requete);
        }
    }

    /**
     * @param list<string> $sql les requetes d'ecriture reellement parties
     */
    private static function lots(array &$sql, int $lignesTouchees): InventaireLots
    {
        $cnx = self::createStub(Connection::class);

        $cnx->method('fetchAssociative')->willReturn([
            'id' => 1, 'utilisateur_id' => '00000000-0000-4000-8000-000000000000',
            'source' => 'base', 'lignes' => '[]', 'total' => 1, 'traites' => 0,
        ]);

        $cnx->method('executeStatement')->willReturnCallback(
            static function (string $requete) use (&$sql, $lignesTouchees): int {
                $sql[] = $requete;

                return $lignesTouchees;
            });

        /* Le stub n'appelle pas la closure de lui-meme : sans cela la prise ne
           partirait jamais et le test passerait pour une mauvaise raison. */
        $cnx->method('transactional')->willReturnCallback(
            static fn (callable $travail): mixed => $travail($cnx));

        return new InventaireLots($cnx);
    }
}
