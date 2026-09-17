<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Controller\FrigoController;
use App\Entity\Utilisateur;
use App\Service\Frigo;
use App\Service\FrigoBase;
use App\Service\FrigoGrocy;
use App\Service\InventaireLots;
use Doctrine\DBAL\Connection;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\DependencyInjection\Container;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Security\Core\Authentication\Token\Storage\TokenStorage;
use Symfony\Component\Security\Core\Authentication\Token\UsernamePasswordToken;

/**
 * UN EMPLACEMENT QUI N'EXISTE PAS SE REFUSE, IL NE FAIT PAS TOMBER LE SERVEUR.
 *
 * `POST /api/mon-frigo/stock` prend `emplacementId` du corps et le passait tel
 * quel à `FrigoBase::definirStock` : un identifiant inconnu atteignait la clé
 * étrangère, et la réponse était un 500 avec le SQL. Relevé par
 * `revue-fitcarnet` le 17 septembre 2026.
 */
final class EmplacementInconnuTest extends TestCase
{
    public function testUnEmplacementInconnuEstRefuseSansRienEcrire(): void
    {
        $ecritures = [];
        $reponse = self::controleur($ecritures, emplacementExiste: false)
            ->definirStock(self::envoi(['alimentId' => 42, 'quantite' => 100, 'emplacementId' => 99]));

        self::assertSame(422, $reponse->getStatusCode());
        self::assertSame([], $ecritures, 'aucune ligne de stock ne doit partir');
    }

    /** LE TÉMOIN : un emplacement connu passe, et la ligne s'écrit. */
    public function testUnEmplacementConnuPasse(): void
    {
        $ecritures = [];
        $reponse = self::controleur($ecritures, emplacementExiste: true)
            ->definirStock(self::envoi(['alimentId' => 42, 'quantite' => 100, 'emplacementId' => 2]));

        self::assertSame(200, $reponse->getStatusCode());
        self::assertNotSame([], $ecritures);
    }

    /** @param array<string, mixed> $corps */
    private static function envoi(array $corps): Request
    {
        return Request::create('/api/mon-frigo/stock', 'POST', content: (string) \json_encode($corps));
    }

    /** @param list<string> $ecritures le SQL d'ecriture vu passer */
    private static function controleur(array &$ecritures, bool $emplacementExiste): FrigoController
    {
        $cnx = self::createStub(Connection::class);
        // « cet aliment est-il le mien ? » : oui, ce n'est pas ce qu'on eprouve ici
        $cnx->method('fetchFirstColumn')->willReturnCallback(
            static fn (string $sql, array $params = []): array => \array_values((array) ($params['a'] ?? [])));
        $cnx->method('fetchOne')->willReturnCallback(
            static fn (string $sql): mixed => \str_contains($sql, 'FROM emplacement') ? ($emplacementExiste ? 1 : false) : 1);
        // `transactional` doit executer sa closure : un stub renverrait null sans rien ecrire
        $cnx->method('transactional')->willReturnCallback(static fn (callable $t): mixed => $t());
        $cnx->method('executeStatement')->willReturnCallback(
            static function (string $sql) use (&$ecritures): int {
                $ecritures[] = $sql;

                return 1;
            });

        $grocy = new FrigoGrocy(new MockHttpClient(), new NullLogger(), 'https://grocy.test', 'cle');
        $base = new FrigoBase($cnx);
        $controleur = new FrigoController(new Frigo($grocy, $base), $base, $grocy, new InventaireLots($cnx));

        $utilisateur = (new Utilisateur())->setEmail('bob@exemple.test')->setSourceFrigo('base');
        $stockage = new TokenStorage();
        $stockage->setToken(new UsernamePasswordToken($utilisateur, 'principal', $utilisateur->getRoles()));
        $conteneur = new Container();
        $conteneur->set('security.token_storage', $stockage);
        $controleur->setContainer($conteneur);

        return $controleur;
    }
}
