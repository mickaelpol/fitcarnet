<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Entity\Utilisateur;
use App\Service\FrigoBase;
use Doctrine\DBAL\Connection;
use PHPUnit\Framework\TestCase;

/**
 * LA DERNIERE PORTE AVANT D'ECRIRE DU STOCK.
 *
 * CONSTAT E-01 DE L'AUDIT DU 7 SEPTEMBRE 2026, SECOND VOLET.
 *
 * Le controle de propriete vivait dans `FrigoController`, devant UNE de ses
 * routes. `FrigoBase::definirStock` a pourtant TROIS appelants : cette
 * route-la, l'inventaire differe applique en tache de fond, et le bouton
 * « J'ai cuisine » de `PlansController`. Deux d'entre eux n'ont jamais rien
 * verifie.
 *
 * C'est le corollaire de la regle 2 du projet : verifier la propriete sur
 * CHAQUE chemin d'ecriture, pas seulement sur le principal. La faille de
 * septembre 2026 venait exactement de la — un controle present sur
 * `POST /mon-frigo/stock`, absent de son jumeau `POST /mon-frigo/inventaire`.
 * Le poser ici ferme les trois chemins d'un coup, et le prochain appelant
 * naitra protege.
 */
final class StockProprieteTest extends TestCase
{
    public function testEcrireSurLAlimentDUnAutreEstRefuse(): void
    {
        $ecritures = [];
        $base = self::frigoBase($ecritures, alimentAccessible: false);

        $refus = null;
        try {
            $base->definirStock(self::utilisateur(), 42, 1.0);
        } catch (\Throwable $e) {
            $refus = $e;
        }

        self::assertInstanceOf(\RuntimeException::class, $refus,
            'poser du stock sur un aliment qui n\'est ni commun ni le mien doit etre refuse');
        self::assertSame([], $ecritures,
            'et refuse AVANT d\'ecrire : une ligne posee rendrait l\'aliment de la victime indelebile');
    }

    public function testEcrireSurSonPropreAlimentPasse(): void
    {
        /* SANS CE TEMOIN, UN CONTROLE QUI REFUSE TOUT LE MONDE PASSERAIT POUR
           UNE CORRECTION. C'est le meme frigo, la meme methode : seule change
           la reponse a « cet aliment est-il commun, ou le mien ? ». */
        $ecritures = [];
        $base = self::frigoBase($ecritures, alimentAccessible: true);

        $base->definirStock(self::utilisateur(), 42, 1.0);

        self::assertCount(2, $ecritures,
            'le DELETE puis l\'INSERT de la transaction doivent partir comme avant');
    }

    private static function utilisateur(): Utilisateur
    {
        return (new Utilisateur())->setEmail('alice@exemple.test');
    }

    /**
     * @param array<int, string> $ecritures les requetes d'ecriture reellement parties
     */
    private static function frigoBase(array &$ecritures, bool $alimentAccessible): FrigoBase
    {
        $ecritures = [];

        $cnx = self::createStub(Connection::class);

        $cnx->method('fetchFirstColumn')->willReturnCallback(
            static function (string $sql, array $params = []) use ($alimentAccessible): array {
                // « cet aliment est-il commun, ou le mien ? », posee en lot
                return $alimentAccessible ? \array_values((array) ($params['a'] ?? [])) : [];
            });

        // l'emplacement deja connu pour cet aliment
        $cnx->method('fetchOne')->willReturn(1);

        /* Le stub n'appelle pas la closure de lui-meme : sans cela les deux
           ecritures de la transaction ne partiraient jamais, et le temoin
           passerait au vert pour une mauvaise raison. */
        $cnx->method('transactional')->willReturnCallback(
            static fn (callable $travail): mixed => $travail());

        $cnx->method('executeStatement')->willReturnCallback(
            static function (string $sql) use (&$ecritures): int {
                $ecritures[] = $sql;

                return 1;
            });

        return new FrigoBase($cnx);
    }
}
