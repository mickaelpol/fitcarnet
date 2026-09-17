<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Controller\ComptesController;
use App\Entity\Utilisateur;
use App\Service\JetonsRafraichissement;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\TestCase;
use Symfony\Component\DependencyInjection\Container;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Security\Core\Authentication\Token\Storage\TokenStorage;
use Symfony\Component\Security\Core\Authentication\Token\UsernamePasswordToken;

/**
 * CE QUE LA SUPPRESSION D'UN COMPTE DÉTRUIT, L'ÉCRAN DOIT POUVOIR LE DIRE.
 *
 * `ComptesController` promet de « COMPTER ce qui sera détruit » : c'est ce qui
 * rend la suppression pensable. Depuis le 17 septembre 2026, chaque aliment
 * appartient à un compte et part avec lui, son stock aussi — mais `lister`
 * ne comptait que séances, séries, modèles et plans. L'administrateur lisait
 * « 0 séance » et supprimait un compte dont le frigo était plein. Relevé par
 * `verification-bout-en-bout` le jour même.
 */
final class ComptesContenuTest extends TestCase
{
    public function testLeContenuCompteLesAlimentsEtLeStock(): void
    {
        $requetes = [];
        $moi = new Utilisateur();

        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchAllAssociative')->willReturnCallback(
            static function (string $sql) use (&$requetes, $moi): array {
                $requetes[] = $sql;

                return [[
                    'id' => $moi->getId()->toRfc4122(), 'email' => 'marie@test.local',
                    'nom' => 'Marie', 'roles' => 'ROLE_USER', 'actif' => true,
                    'source_frigo' => 'base', 'cree_le' => '2026-09-17 09:25:10+00',
                    'seances' => 0, 'series' => 0, 'modeles' => 0, 'plans' => 0,
                    'aliments' => 12, 'stock' => 9,
                    'cibles' => 4, 'complements' => 3, 'exercices' => 2,
                ]];
            });

        $corps = self::corps(self::controleur($cnx, $moi)->lister());

        self::assertCount(1, $requetes);
        self::assertMatchesRegularExpression(
            '/count\(\*\)\s+FROM\s+aliment\s+\w+\s+WHERE\s+\w+\.utilisateur_id\s*=\s*u\.id/i', $requetes[0],
            'les aliments du compte ne sont pas comptes');
        self::assertMatchesRegularExpression(
            '/count\(\*\)\s+FROM\s+stock\s+\w+\s+WHERE\s+\w+\.utilisateur_id\s*=\s*u\.id/i', $requetes[0],
            'le stock du compte n\'est pas compte');
        foreach (['cible', 'complement'] as $table) {
            self::assertMatchesRegularExpression(
                "/count\\(\\*\\)\\s+FROM\\s+{$table}\\s+\\w+\\s+WHERE\\s+\\w+\\.utilisateur_id\\s*=\\s*u\\.id/i", $requetes[0],
                "la table {$table} part avec le compte et n'est pas comptee");
        }
        self::assertMatchesRegularExpression(
            '/count\(\*\)\s+FROM\s+exercice\s+\w+\s+WHERE\s+\w+\.cree_par\s*=\s*u\.id\s+AND\s+NOT\s+\w+\.public/i',
            $requetes[0], 'les exercices personnels du compte ne sont pas comptes');

        self::assertSame(
            ['seances' => 0, 'series' => 0, 'modeles' => 0, 'plans' => 0, 'aliments' => 12, 'stock' => 9,
                'cibles' => 4, 'complements' => 3, 'exercices' => 2],
            $corps['comptes'][0]['contenu'],
            'un compte sans seance mais au frigo plein doit l\'annoncer'
        );
    }

    /**
     * LES EXERCICES PERSONNELS PARTENT AVEC LE COMPTE — SANS BLOQUER SUR CEUX
     * QU'UN AUTRE CITE ENCORE.
     *
     * `exercice.cree_par` est en `ON DELETE SET NULL` : supprimer le compte
     * laissait ses exercices privés sans auteur et non publics, donc visibles
     * de personne — des lignes mortes. Relevé par `revue-fitcarnet` le
     * 17 septembre 2026. Mais avant le 14 septembre un exercice « perso » se
     * voyait de tous, et la séance d'un autre compte peut en citer un :
     * `seance_exercice.exercice_id` est en RESTRICT, et le supprimer ferait
     * échouer toute la suppression. On relève donc les identifiants AVANT,
     * et on ne retire APRÈS que ceux que plus personne ne cite.
     */
    public function testLaSuppressionRetireSesExercicesPersonnelsQuePersonneNeCite(): void
    {
        $ecritures = [];
        $moi = new Utilisateur();
        $cible = '0b4d6c2e-8f3a-4c1b-9d7e-5a6b7c8d9e0f';

        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchAssociative')->willReturn(
            ['id' => $cible, 'email' => 'marie@test.local', 'nom' => 'Marie', 'roles' => 'ROLE_USER', 'actif' => true]);
        $cnx->method('fetchOne')->willReturn(2);
        $cnx->method('fetchFirstColumn')->willReturnCallback(
            static fn (string $sql): array => \str_contains($sql, 'FROM exercice') ? [7, 8] : []);
        $cnx->method('transactional')->willReturnCallback(static fn (callable $t): mixed => $t());
        $cnx->method('executeStatement')->willReturnCallback(
            static function (string $sql) use (&$ecritures): int {
                $ecritures[] = \preg_replace('/\s+/', ' ', $sql);

                return 1;
            });

        $reponse = self::controleur($cnx, $moi)->supprimer($cible);

        self::assertSame(200, $reponse->getStatusCode());
        $compte = self::rang($ecritures, 'DELETE FROM utilisateur');
        $exercices = self::rang($ecritures, 'DELETE FROM exercice');
        self::assertGreaterThan($compte, $exercices,
            'avant la suppression du compte, ses seances citent encore ces exercices : RESTRICT refuserait');
        self::assertStringContainsString('NOT EXISTS (SELECT 1 FROM seance_exercice', $ecritures[$exercices],
            'un exercice que la seance d\'un autre compte cite encore doit rester');
        self::assertStringContainsString('NOT EXISTS (SELECT 1 FROM modele_exercice', $ecritures[$exercices]);
    }

    /** @param list<string> $ecritures */
    private static function rang(array $ecritures, string $debut): int
    {
        foreach ($ecritures as $i => $sql) {
            if (\str_starts_with(\ltrim($sql), $debut)) {
                return $i;
            }
        }
        self::fail("aucune ecriture « {$debut} »");
    }

    private static function controleur(Connection $cnx, Utilisateur $moi): ComptesController
    {
        $controleur = new ComptesController(
            $cnx,
            new JetonsRafraichissement(self::createStub(EntityManagerInterface::class)),
        );

        $stockage = new TokenStorage();
        $stockage->setToken(new UsernamePasswordToken($moi, 'principal', ['ROLE_ADMIN']));
        $conteneur = new Container();
        $conteneur->set('security.token_storage', $stockage);
        $controleur->setContainer($conteneur);

        return $controleur;
    }

    /** @return array<string, mixed> */
    private static function corps(JsonResponse $reponse): array
    {
        /** @var array<string, mixed> */
        return json_decode((string) $reponse->getContent(), true, flags: \JSON_THROW_ON_ERROR);
    }
}
