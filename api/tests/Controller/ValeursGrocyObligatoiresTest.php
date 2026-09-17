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
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\DependencyInjection\Container;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Security\Core\Authentication\Token\Storage\TokenStorage;
use Symfony\Component\Security\Core\Authentication\Token\UsernamePasswordToken;

/**
 * LE JUMEAU GROCY DE `AlimentMacrosObligatoiresTest`.
 *
 * `POST /api/mon-frigo/aliment` écrit les valeurs d'un produit dans Grocy pour
 * les comptes qui le lisent. Il exigeait les calories, puis écrivait
 * `($donnees['prot100'] ?? 0)` pour les trois autres macros : une clé absente
 * partait dans Grocy comme un zéro — la panne corrigée le même jour, le
 * 17 septembre 2026, sur `/api/aliments`, et relevée par `revue-fitcarnet`
 * comme son jumeau oublié.
 */
final class ValeursGrocyObligatoiresTest extends TestCase
{
    /** @return iterable<string, array{string}> */
    public static function macros(): iterable
    {
        yield 'protéines' => ['prot100'];
        yield 'glucides' => ['gluc100'];
        yield 'lipides' => ['lip100'];
    }

    #[DataProvider('macros')]
    public function testUneMacroAbsenteNePartPasDansGrocy(string $absente): void
    {
        $appels = [];
        $corps = self::corpsComplet();
        unset($corps[$absente]);

        $reponse = self::controleur($appels)->enregistrerAliment(self::envoi($corps));

        self::assertSame(422, $reponse->getStatusCode(), "{$absente} absent : Grocy aurait recu 0");
        $erreur = \json_decode((string) $reponse->getContent(), true, flags: \JSON_THROW_ON_ERROR)['erreur'] ?? '';
        self::assertStringContainsString('écris 0', (string) $erreur);
        self::assertSame([], $appels, 'rien ne doit partir vers Grocy');
    }

    /**
     * UNE CRÉATION INCOMPLÈTE NE LAISSE PAS DE PRODUIT NU DANS GROCY.
     *
     * Sans référence, la route crée d'abord le produit, puis écrit ses
     * valeurs. Les contrôles venaient APRÈS la création : un corps sans
     * lipides recevait bien son 422, mais le produit restait dans Grocy, sans
     * catégorie ni calories. Relevé par l'agent de documentation le
     * 17 septembre 2026 ; ce test ne visait jusque-là que la correction.
     */
    public function testUneCreationIncompleteNeCreeRienDansGrocy(): void
    {
        $appels = [];
        $corps = ['reference' => '', 'nom' => 'Saumon'] + self::corpsComplet();
        unset($corps['lip100']);

        $reponse = self::controleur($appels)->enregistrerAliment(self::envoi($corps));

        self::assertSame(422, $reponse->getStatusCode());
        self::assertSame([], $appels, 'aucun produit ne doit etre cree dans Grocy');
    }

    public function testUneMacroIllisibleNePartPasDansGrocy(): void
    {
        $appels = [];
        $reponse = self::controleur($appels)->enregistrerAliment(
            self::envoi(['lip100' => 'beaucoup'] + self::corpsComplet()));

        self::assertSame(422, $reponse->getStatusCode());
        self::assertSame([], $appels);
    }

    /** LE TÉMOIN : un zéro écrit est une valeur, et la requête part vers Grocy. */
    public function testDesZerosEcritsPartentDansGrocy(): void
    {
        $appels = [];
        $reponse = self::controleur($appels)->enregistrerAliment(
            self::envoi(['gluc100' => 0, 'lip100' => 0] + self::corpsComplet()));

        self::assertNotSame(422, $reponse->getStatusCode());
        self::assertNotSame([], $appels, 'un corps complet doit atteindre Grocy');
    }

    /** @return array<string, mixed> */
    private static function corpsComplet(): array
    {
        return ['reference' => 'grocy:12', 'categorie' => 'prot', 'kcal100' => 200,
            'prot100' => 20, 'gluc100' => 0, 'lip100' => 13, 'ratio' => 1];
    }

    /** @param array<string, mixed> $corps */
    private static function envoi(array $corps): Request
    {
        return Request::create('/api/mon-frigo/aliment', 'POST', content: (string) \json_encode($corps));
    }

    /** @param list<string> $appels les URL demandees a Grocy */
    private static function controleur(array &$appels): FrigoController
    {
        $http = new MockHttpClient(static function (string $methode, string $url) use (&$appels): MockResponse {
            $appels[] = "{$methode} {$url}";

            return new MockResponse('[]');
        });

        $cnx = self::createStub(Connection::class);
        $grocy = new FrigoGrocy($http, new NullLogger(), 'https://grocy.test', 'cle');
        $base = new FrigoBase($cnx);
        $controleur = new FrigoController(new Frigo($grocy, $base), $base, $grocy, new InventaireLots($cnx));

        $utilisateur = (new Utilisateur())->setEmail('admin@exemple.test')->setSourceFrigo('grocy');
        $stockage = new TokenStorage();
        $stockage->setToken(new UsernamePasswordToken($utilisateur, 'principal', $utilisateur->getRoles()));
        $conteneur = new Container();
        $conteneur->set('security.token_storage', $stockage);
        $controleur->setContainer($conteneur);

        return $controleur;
    }
}
