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

        self::assertSame(
            ['seances' => 0, 'series' => 0, 'modeles' => 0, 'plans' => 0, 'aliments' => 12, 'stock' => 9],
            $corps['comptes'][0]['contenu'],
            'un compte sans seance mais au frigo plein doit l\'annoncer'
        );
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
