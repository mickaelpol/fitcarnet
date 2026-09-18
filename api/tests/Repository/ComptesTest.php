<?php

declare(strict_types=1);

namespace App\Tests\Repository;

use App\Repository\Comptes;
use App\Service\JetonsRafraichissement;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\EntityRepository;
use PHPUnit\Framework\TestCase;

/**
 * LE SQL DES COMPTES, HORS DU CONTROLEUR.
 *
 * `ComptesController` portait cinq requetes, dont la plus delicate du projet :
 * l'ordre dans lequel on detruit un compte. Cet ordre n'est pas un detail de
 * style, c'est la seule chose qui separe une suppression propre d'une erreur
 * de cle etrangere en pleine transaction — et il n'etait ecrit nulle part
 * ailleurs que dans le corps du controleur.
 *
 * Ces tests viennent AVANT le depot, et ont ete vus rouges.
 */
final class ComptesTest extends TestCase
{
    private const CIBLE = '0191f4d2-8f4a-7000-8000-000000000002';

    /**
     * UN IDENTIFIANT MAL FORME N'ATTEINT PAS LA BASE.
     *
     * PostgreSQL refuse un UUID mal forme par une erreur 500 illisible plutot
     * que par un resultat vide. On borne donc la forme avant d'interroger —
     * et si quelqu'un retire ce garde-fou, ce test tombe.
     */
    public function testUnIdentifiantMalFormeNeDeclencheAucuneRequete(): void
    {
        $requetes = 0;
        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchAssociative')->willReturnCallback(
            function () use (&$requetes): false {
                ++$requetes;

                return false;
            });

        $depot = new Comptes($cnx, self::jetons());

        self::assertNull($depot->parId('pas-un-uuid'));
        self::assertNull($depot->parId("' OR 1=1 --"));
        self::assertSame(0, $requetes, 'aucune de ces deux formes ne doit partir en base');
    }

    /** Un identifiant bien forme mais inconnu rend `null`, pas `false`. */
    public function testUnCompteInconnuRendNull(): void
    {
        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchAssociative')->willReturn(false);

        self::assertNull((new Comptes($cnx, self::jetons()))->parId(self::CIBLE));
    }

    /**
     * DESACTIVER COUPE LES SESSIONS, DANS LA MEME TRANSACTION.
     *
     * Le jeton d'acces vit une heure et celui de rafraichissement des
     * semaines : sans cette revocation, un compte « bloque » se prolongerait
     * tout seul aussi longtemps qu'on le laisse. Les deux ecritures tiennent
     * donc dans une seule transaction — bloquer sans couper laisserait la
     * porte ouverte, et le journal dirait pourtant que le compte est bloque.
     */
    public function testDesactiverCoupeLesSessionsDansLaMemeTransaction(): void
    {
        $trace = [];
        $cnx = self::traceur($trace);
        $em = self::entityManager($trace);

        (new Comptes($cnx, new JetonsRafraichissement($em)))->definirActif(self::CIBLE, false);

        self::assertSame(
            ['transaction', 'UPDATE utilisateur SET actif', 'jetons lus', 'flush'],
            $trace,
            'la revocation part APRES la mise a jour, et dans la transaction');
    }

    /** Reactiver ne touche a aucune session : il n'y a rien a couper. */
    public function testReactiverNeRevoqueRien(): void
    {
        $trace = [];
        $cnx = self::traceur($trace);
        $em = self::entityManager($trace);

        (new Comptes($cnx, new JetonsRafraichissement($em)))->definirActif(self::CIBLE, true);

        self::assertSame(['transaction', 'UPDATE utilisateur SET actif'], $trace);
        self::assertNotContains('jetons lus', $trace);
    }

    /**
     * L'ORDRE DE SUPPRESSION, QUI EST TOUT LE SUJET.
     *
     * `aliment.utilisateur_id` est en CASCADE mais `stock.aliment_id` en
     * RESTRICT, et PostgreSQL ne garantit pas l'ordre de deux cascades parties
     * du meme compte : on retire donc le stock, puis les aliments. Les
     * exercices personnels, eux, sont en SET NULL — on les releve AVANT (apres,
     * on ne saurait plus lesquels etaient a lui) et on les retire APRES le
     * compte, dont les seances les citaient encore en RESTRICT.
     */
    public function testLaSuppressionSuitLOrdreQueLesClesEtrangeresImposent(): void
    {
        $trace = [];
        $cnx = self::createStub(Connection::class);
        $cnx->method('transactional')->willReturnCallback(
            static fn (callable $travail): mixed => $travail($cnx));
        $cnx->method('executeStatement')->willReturnCallback(
            function (string $sql) use (&$trace): int {
                $trace[] = self::resume($sql);

                return 1;
            });
        $cnx->method('fetchFirstColumn')->willReturnCallback(
            function (string $sql) use (&$trace): array {
                $trace[] = self::resume($sql);

                return [7, 9];
            });

        (new Comptes($cnx, self::jetons()))->supprimer(self::CIBLE);

        self::assertSame([
            'DELETE stock',
            'DELETE aliment',
            'SELECT exercices personnels',
            'DELETE utilisateur',
            'DELETE exercices personnels',
        ], $trace);
    }

    /**
     * SANS EXERCICE PERSONNEL, PAS DE CINQUIEME REQUETE.
     *
     * `IN (:ids)` avec une liste vide produit du SQL invalide : c'est le genre
     * de panne qui n'arrive que sur le compte qui n'a jamais rien cree.
     */
    public function testAucunExercicePersonnelNEnvoieAucuneRequeteDeTrop(): void
    {
        $trace = [];
        $cnx = self::createStub(Connection::class);
        $cnx->method('transactional')->willReturnCallback(
            static fn (callable $travail): mixed => $travail($cnx));
        $cnx->method('executeStatement')->willReturnCallback(
            function (string $sql) use (&$trace): int {
                $trace[] = self::resume($sql);

                return 1;
            });
        $cnx->method('fetchFirstColumn')->willReturn([]);

        (new Comptes($cnx, self::jetons()))->supprimer(self::CIBLE);

        self::assertSame(['DELETE stock', 'DELETE aliment', 'DELETE utilisateur'], $trace);
    }

    /** Les compteurs de l'ecran : un administrateur desactive ne compte pas. */
    public function testOnNeCompteQueLesAdministrateursActifs(): void
    {
        $sqlVu = '';
        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchOne')->willReturnCallback(
            function (string $sql) use (&$sqlVu): string {
                $sqlVu = $sql;

                return '2';
            });

        self::assertSame(2, (new Comptes($cnx, self::jetons()))->administrateursActifs());
        self::assertStringContainsString('actif = true', $sqlVu);
        self::assertStringContainsString('ROLE_ADMIN', $sqlVu);
    }

    // ---------------------------------------------------------------- outils

    /** Une Connection qui note la transaction et l'ecriture attendue. */
    private static function traceur(array &$trace): Connection
    {
        $cnx = self::createStub(Connection::class);
        $cnx->method('transactional')->willReturnCallback(
            static function (callable $travail) use (&$trace, $cnx): mixed {
                $trace[] = 'transaction';

                return $travail($cnx);
            });
        $cnx->method('executeStatement')->willReturnCallback(
            function (string $sql) use (&$trace): int {
                $trace[] = self::resume($sql);

                return 1;
            });

        return $cnx;
    }

    /**
     * `JetonsRafraichissement` est `final` : PHPUnit ne sait pas le doubler.
     * On l'instancie donc pour de vrai autour d'un gestionnaire double — et le
     * test porte alors sur le cablage reel, comme le veut la skill `tests-api`.
     */
    private static function entityManager(array &$trace): EntityManagerInterface
    {
        $depot = self::createStub(EntityRepository::class);
        $depot->method('findBy')->willReturnCallback(
            function () use (&$trace): array {
                $trace[] = 'jetons lus';

                return [];
            });

        $em = self::createStub(EntityManagerInterface::class);
        $em->method('getRepository')->willReturn($depot);
        $em->method('flush')->willReturnCallback(
            function () use (&$trace): void {
                $trace[] = 'flush';
            });

        return $em;
    }

    private static function jetons(): JetonsRafraichissement
    {
        $depot = self::createStub(EntityRepository::class);
        $depot->method('findBy')->willReturn([]);
        $em = self::createStub(EntityManagerInterface::class);
        $em->method('getRepository')->willReturn($depot);

        return new JetonsRafraichissement($em);
    }

    /** Le SQL reduit a ce qu'on veut lire dans l'ordre. */
    private static function resume(string $sql): string
    {
        return match (true) {
            \str_contains($sql, 'DELETE FROM stock') => 'DELETE stock',
            \str_contains($sql, 'DELETE FROM aliment') => 'DELETE aliment',
            \str_contains($sql, 'SELECT id FROM exercice') => 'SELECT exercices personnels',
            \str_contains($sql, 'DELETE FROM utilisateur') => 'DELETE utilisateur',
            \str_contains($sql, 'DELETE FROM exercice') => 'DELETE exercices personnels',
            \str_contains($sql, 'UPDATE utilisateur SET actif') => 'UPDATE utilisateur SET actif',
            default => $sql,
        };
    }
}
