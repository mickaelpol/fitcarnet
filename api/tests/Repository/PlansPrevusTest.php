<?php

declare(strict_types=1);

namespace App\Tests\Repository;

use App\Repository\PlansPrevus;
use Doctrine\DBAL\Connection;
use PHPUnit\Framework\TestCase;

/**
 * LE DEPOT QUI LIT LES PLANS ENCORE PREVUS — palier B, 21 septembre 2026.
 *
 * Sans base : on regarde le SQL qui PART, et les parametres poses. C'est le
 * motif des tests de ce projet, et il suffit ici — ce qu'on veut garantir tient
 * en deux points, et tous deux sont dans la requete.
 *
 * LE PREMIER EST UNE REGLE DU PROJET (regle 2) : un plan appartient a un
 * compte, et la lecture doit le filtrer. Une jointure oubliee ici rendrait le
 * frigo de chacun dependant des plans de TOUS.
 *
 * LE SECOND EST LE FILTRE `cuisine_le IS NULL` : un plan cuisine a deja fait
 * baisser le stock pour de vrai (`DeductionDuPlan`), le compter encore le
 * deduirait deux fois.
 */
final class PlansPrevusTest extends TestCase
{
    public function testLaLectureEstFiltreeParLeCompteEtParLEtatPrevu(): void
    {
        $sql = '';
        $parametres = [];

        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchAllAssociative')->willReturnCallback(
            static function (string $requete, array $params) use (&$sql, &$parametres): array {
                $sql = $requete;
                $parametres = $params;

                return [];
            });

        (new PlansPrevus($cnx))->duCompte('un-compte');

        self::assertStringContainsString('utilisateur_id = :u', $sql,
            'sans ce filtre, le frigo d’un compte dépendrait des plans de tous les autres');
        self::assertStringContainsString('cuisine_le IS NULL', $sql,
            'un plan cuisiné a déjà décrémenté le stock : le compter encore le déduirait deux fois');
        self::assertSame(['u' => 'un-compte'], $parametres);
    }

    public function testLeContenuEstRenduDecodeEtLEtatAvecLui(): void
    {
        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchAllAssociative')->willReturn([
            ['contenu' => '{"version":2,"consomme":[{"reference":"grocy:7","grammes":800}]}'],
        ]);

        $plans = (new PlansPrevus($cnx))->duCompte('un-compte');

        self::assertCount(1, $plans);
        self::assertSame(800, $plans[0]['contenu']['consomme'][0]['grammes']);
        /* LA CLE DOIT ETRE LA, meme si sa valeur est toujours `null` ici : la
           requete ne rend que des plans prevus. C'est `StockPromis` qui la lit,
           et un champ absent y vaut « prevu » — donc l'omettre ne casserait
           rien AUJOURD'HUI et casserait tout le jour ou cette methode rendrait
           aussi des plans cuisines.

           `assertNull` ETAIT ECRIT ICI, ET PHPSTAN L'A REFUSE : le type de
           retour annonce `cuisineLe: null`, donc l'assertion etait vraie par
           construction. Un test qui ne peut pas echouer — motif n° 4. */
        self::assertArrayHasKey('cuisineLe', $plans[0]);
    }

    /**
     * UN CONTENU ILLISIBLE NE FAIT PAS TOMBER LE FRIGO. `contenu` est un JSONB
     * ecrit par le front : si une ligne devenait indechiffrable, elle ne doit
     * pas emporter tout l'ecran du frigo avec elle. Une reservation manquante se
     * voit ; un frigo qui ne s'affiche plus, aussi, mais il ne se repare pas.
     */
    public function testUnContenuIllisibleEstIgnoreSansFaireTomberLaLecture(): void
    {
        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchAllAssociative')->willReturn([
            ['contenu' => 'ceci n’est pas du JSON'],
            ['contenu' => '{"version":2,"consomme":[{"reference":"grocy:7","grammes":300}]}'],
        ]);

        $plans = (new PlansPrevus($cnx))->duCompte('un-compte');

        self::assertCount(1, $plans, 'la ligne illisible est écartée, l’autre passe');
        self::assertSame(300, $plans[0]['contenu']['consomme'][0]['grammes']);
    }
}
