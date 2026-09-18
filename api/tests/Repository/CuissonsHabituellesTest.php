<?php

declare(strict_types=1);

namespace App\Tests\Repository;

use App\Repository\CuissonsHabituelles;
use Doctrine\DBAL\Connection;
use PHPUnit\Framework\TestCase;

/**
 * LE SQL DES CUISSONS HABITUELLES, HORS DU CONTROLEUR.
 *
 * POURQUOI CETTE CLASSE EXISTE
 *
 * Le 18 septembre 2026, le proprietaire a ouvert un controleur et y a trouve
 * du SQL. La documentation Symfony 7.4 montre du SQL brut — mais dans un
 * DEPOT (`$conn->executeQuery(...)` dans `src/Repository/`), jamais dans un
 * controleur, dont le role est de lire la requete, appeler, et repondre.
 *
 * Le deplacement n'etait protege par AUCUN test : `CuissonsController`
 * n'etait cite par aucun fichier de `tests/`. Deplacer du code non teste,
 * c'est parier. Ce test vient donc AVANT le depot, et il a ete vu rouge
 * (« Class "App\Repository\CuissonsHabituelles" not found »).
 *
 * CE QU'IL SURVEILLE, ET POURQUOI
 *
 * Les trois choses que le SQL portait et qu'un simple « ca compile » ne dit
 * pas : le filtre par compte, les trois etats d'une habitude, et l'upsert en
 * une seule requete.
 */
final class CuissonsHabituellesTest extends TestCase
{
    private const MOI = '0191f4d2-8f4a-7000-8000-000000000001';

    /**
     * L'UTILISATEUR EST DANS LA REQUETE, PAS DANS L'APPELANT.
     *
     * Un depot qui rendrait toutes les habitudes de toute la base, a charge
     * pour le controleur de filtrer, serait une fuite en attente : la regle 2
     * du projet veut que le filtre soit pose au point de passage oblige.
     */
    public function testLireNeDemandeQueLesHabitudesDuCompte(): void
    {
        $vu = [];
        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchAllAssociative')->willReturnCallback(
            function (string $sql, array $params) use (&$vu): array {
                $vu[] = [$sql, $params];

                return [];
            });

        (new CuissonsHabituelles($cnx))->lire(self::MOI);

        self::assertCount(1, $vu, 'une seule requete');
        [$sql, $params] = $vu[0];
        self::assertStringContainsString('cuisson_habituelle', $sql);
        self::assertStringContainsString('utilisateur_id = :u', $sql, 'le filtre par compte');
        self::assertStringContainsString('ORDER BY aliment', $sql, "l'ordre, pour un ecran stable");
        self::assertSame(['u' => self::MOI], $params);
    }

    /**
     * LES DEUX ETATS QUI SE RESSEMBLENT ET NE SE VALENT PAS.
     *
     * `mode = null` veut dire « se mange sans cuisson, c'est decide ».
     * L'ABSENCE de ligne veut dire « personne n'a decide ». Rendre 0 ou une
     * chaine vide pour l'un des deux les confondrait — c'est la regle 6 du
     * projet, vide n'est pas zero.
     */
    public function testUnModeAbsentResteNullEtUnModeConnuDevientUnEntier(): void
    {
        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchAllAssociative')->willReturn([
            ['aliment' => 'riz blanc', 'mode_cuisson_id' => '2'],
            ['aliment' => 'skyr', 'mode_cuisson_id' => null],
        ]);

        $habitudes = (new CuissonsHabituelles($cnx))->lire(self::MOI);

        self::assertSame([
            ['aliment' => 'riz blanc', 'mode' => 2],
            ['aliment' => 'skyr', 'mode' => null],
        ], $habitudes, 'le mode est un entier ou null, jamais une chaine');
    }

    /** Les identifiants de modes sortent de la base en chaines : on les rend en entiers. */
    public function testLesModesConnusSontDesEntiers(): void
    {
        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchFirstColumn')->willReturn(['1', '2', '3']);

        self::assertSame([1, 2, 3], (new CuissonsHabituelles($cnx))->modesConnus());
    }

    /**
     * UN GESTE DE L'UTILISATEUR PASSE ENTIEREMENT OU PAS DU TOUT.
     *
     * `transactional` doit executer sa closure : un stub qui rend `null` sans
     * rien appeler laisserait ce test au vert alors qu'aucune ecriture ne
     * part. C'est le piege ecrit dans la skill `tests-api`.
     */
    public function testRemplacerEcritToutDansUneSeuleTransaction(): void
    {
        $vu = [];
        $cnx = self::createStub(Connection::class);
        $cnx->method('transactional')->willReturnCallback(
            static fn (callable $travail): mixed => $travail($cnx));
        $cnx->method('executeStatement')->willReturnCallback(
            function (string $sql, array $params) use (&$vu): int {
                $vu[] = [$sql, $params];

                return 1;
            });

        $ecrites = (new CuissonsHabituelles($cnx))->remplacer(
            self::MOI, ['riz blanc' => 2, 'skyr' => null]);

        self::assertSame(2, $ecrites);
        self::assertCount(2, $vu, 'une requete par habitude, dans la meme transaction');
        self::assertSame(['u' => self::MOI, 'a' => 'riz blanc', 'm' => 2], $vu[0][1]);
        self::assertSame(['u' => self::MOI, 'a' => 'skyr', 'm' => null], $vu[1][1]);
    }

    /**
     * L'UPSERT, ET POURQUOI IL COMPTE.
     *
     * « Chercher puis ecrire » laisse une fenetre entre les deux : un second
     * envoi passe, et le premier tombe sur l'index unique. `ON CONFLICT DO
     * UPDATE` ferme la fenetre en un aller-retour. Si un jour quelqu'un
     * remplace cette requete par un couple SELECT/INSERT, ce test tombe.
     */
    public function testLEcritureEstUnRemplacementSansFenetre(): void
    {
        $sqlVu = '';
        $cnx = self::createStub(Connection::class);
        $cnx->method('transactional')->willReturnCallback(
            static fn (callable $travail): mixed => $travail($cnx));
        $cnx->method('executeStatement')->willReturnCallback(
            function (string $sql) use (&$sqlVu): int {
                $sqlVu = $sql;

                return 1;
            });

        (new CuissonsHabituelles($cnx))->remplacer(self::MOI, ['riz blanc' => 2]);

        self::assertStringContainsString('INSERT INTO cuisson_habituelle', $sqlVu);
        self::assertStringContainsString('ON CONFLICT (utilisateur_id, aliment)', $sqlVu);
        self::assertStringContainsString('DO UPDATE SET mode_cuisson_id', $sqlVu);
    }

    /** Rien a ecrire : aucune transaction ouverte pour rien. */
    public function testUnLotVideNOuvrePasDeTransaction(): void
    {
        $ouvertures = 0;
        $cnx = self::createStub(Connection::class);
        $cnx->method('transactional')->willReturnCallback(
            static function (callable $travail) use (&$ouvertures, $cnx): mixed {
                ++$ouvertures;

                return $travail($cnx);
            });

        self::assertSame(0, (new CuissonsHabituelles($cnx))->remplacer(self::MOI, []));
        self::assertSame(0, $ouvertures);
    }
}
