<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Controller\FrigoController;
use App\Entity\Utilisateur;
use App\Repository\PlansPrevus;
use App\Service\Frigo;
use App\Service\FrigoBase;
use App\Service\FrigoGrocy;
use App\Service\InventaireLots;
use Doctrine\DBAL\Connection;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\DependencyInjection\Container;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Security\Core\Authentication\Token\Storage\TokenStorage;
use Symfony\Component\Security\Core\Authentication\Token\UsernamePasswordToken;

/**
 * UNE QUANTITE TAPEE AVEC UNE VIRGULE NE PERD PAS SA MOITIE.
 *
 * Palier « serveur autoritaire », 26 septembre 2026. `(float) "12,5"` vaut
 * 12.0 en PHP — la partie apres la virgule est silencieusement perdue, jamais
 * signalee (regle 7). `App\Service\NombreSaisi::lire` est la meme lecture que
 * `VerdictAliment` : virgule francaise comprise, "4,2,1" refuse plutot que
 * tronque en 4.
 *
 * DEUX ROUTES, LE MEME DEFAUT. `POST /mon-frigo/stock` (base) et
 * `POST /mon-frigo/aliment` (Grocy) lisent chacune leurs nombres avec un cast
 * `(float)` nu ; le corollaire de la regle 2 vaut aussi pour une lecture de
 * nombre, pas seulement pour la propriete d'une donnee : verifier CHAQUE
 * chemin d'ecriture.
 *
 * Modeles de style : `EmplacementInconnuTest` (montage de `FrigoController`
 * sans noyau, stub de `Connection`) et `ValeursGrocyObligatoiresTest` (stub de
 * Grocy par `MockHttpClient`).
 */
final class QuantiteSaisieTest extends TestCase
{
    /** CA-14 : une quantite en virgule s'ecrit telle que lue, pas tronquee. */
    public function testUneQuantiteEnVirguleSEcritTelleQueLue(): void
    {
        $parametres = [];
        $reponse = self::controleurBase($parametres)
            ->definirStock(self::envoiStock(['alimentId' => 42, 'quantite' => '12,5']));

        self::assertSame(200, $reponse->getStatusCode());
        self::assertNotSame([], $parametres, 'la ligne de stock doit avoir ete ecrite');
        self::assertSame(12.5, $parametres[0]['q'] ?? null,
            'la virgule francaise doit etre lue, pas tronquee par un cast (float) nu');
    }

    /**
     * LE TEMOIN : une quantite absente ou vide reste 0 — regle 6, "vide" n'est
     * pas une erreur pour ce champ, qui a un zero raisonnable par defaut.
     * Sans ce temoin, faire toujours refuser passerait le test ci-dessus tout
     * en rendant l'ecran inutilisable pour vider une ligne de stock.
     */
    public function testUneQuantiteAbsenteVautZero(): void
    {
        $parametres = [];
        $reponse = self::controleurBase($parametres)
            ->definirStock(self::envoiStock(['alimentId' => 42, 'quantite' => '']));

        self::assertSame(200, $reponse->getStatusCode());
        self::assertNotSame([], $parametres);
        self::assertSame(0.0, $parametres[0]['q'] ?? null);
    }

    /** CA-14 : une quantite illisible refuse en 422, sans rien ecrire. */
    public function testUneQuantiteIllisibleRefuseSansRienEcrire(): void
    {
        $parametres = [];
        $reponse = self::controleurBase($parametres)
            ->definirStock(self::envoiStock(['alimentId' => 42, 'quantite' => '4,2,1']));

        self::assertSame(422, $reponse->getStatusCode());
        $corps = \json_decode((string) $reponse->getContent(), true, flags: \JSON_THROW_ON_ERROR);
        self::assertSame('quantite', $corps['refus'][0]['champ'] ?? null);
        self::assertSame([], $parametres, 'aucune ligne de stock ne doit partir');
    }

    /**
     * Le jumeau Grocy : une macro en virgule ne doit pas non plus etre
     * tronquee avant d'atteindre Grocy. Meme defaut, meme correction,
     * deuxieme route.
     */
    public function testUneMacroEnVirguleEstLueAvantDAtteindreGrocy(): void
    {
        $requetes = [];
        $controleur = self::controleurGrocy($requetes);

        $corps = ['reference' => 'grocy:12', 'categorie' => 'fec', 'kcal100' => '350,5',
            'prot100' => 7, 'gluc100' => 78, 'lip100' => 0.6, 'ratio' => 2.26];

        $reponse = $controleur->enregistrerAliment(
            Request::create('/api/mon-frigo/aliment', 'POST', content: (string) \json_encode($corps)));

        self::assertSame(200, $reponse->getStatusCode());

        // `assurerLesChamps()` fait ses propres allers-retours avant l'ecriture
        // des valeurs : seule celle-ci nous interesse, identifiee par son URL.
        $ecriture = null;
        foreach ($requetes as $requete) {
            if ('PUT' === $requete['methode'] && \str_contains($requete['url'], '/userfields/products/12')) {
                $ecriture = $requete;
            }
        }
        self::assertNotNull($ecriture, "la requete d'ecriture des valeurs doit avoir ete envoyee a Grocy");

        $corpsEnvoye = \json_decode((string) ($ecriture['options']['body'] ?? '{}'), true,
            flags: \JSON_THROW_ON_ERROR);
        self::assertSame('350.5', $corpsEnvoye['kcal100'] ?? null,
            'la virgule francaise doit etre lue AVANT Grocy, pas tronquee par un cast (float) nu');
    }

    /** @param array<string, mixed> $corps */
    private static function envoiStock(array $corps): Request
    {
        return Request::create('/api/mon-frigo/stock', 'POST', content: (string) \json_encode($corps));
    }

    /** @param list<array<string, mixed>> $parametres les parametres SQL de chaque INSERT dans "stock" */
    private static function controleurBase(array &$parametres): FrigoController
    {
        $cnx = self::createStub(Connection::class);
        // « cet aliment est-il le mien ? » : oui, ce n'est pas ce qu'on eprouve ici
        $cnx->method('fetchFirstColumn')->willReturnCallback(
            static fn (string $sql, array $params = []): array => \array_values((array) ($params['a'] ?? [])));
        $cnx->method('fetchOne')->willReturn(1);
        // `transactional` doit executer sa closure : un stub renverrait null sans rien ecrire
        $cnx->method('transactional')->willReturnCallback(static fn (callable $t): mixed => $t());
        $cnx->method('executeStatement')->willReturnCallback(
            static function (string $sql, array $params = []) use (&$parametres): int {
                if (\str_contains($sql, 'INSERT INTO stock')) {
                    $parametres[] = $params;
                }

                return 1;
            });

        $grocy = new FrigoGrocy(new MockHttpClient(), new NullLogger(), 'https://grocy.test', 'cle');
        $base = new FrigoBase($cnx);
        $controleur = new FrigoController(new Frigo($grocy, $base), $base, $grocy, new InventaireLots($cnx), new PlansPrevus($cnx));

        $utilisateur = (new Utilisateur())->setEmail('bob@exemple.test')->setSourceFrigo('base');
        $stockage = new TokenStorage();
        $stockage->setToken(new UsernamePasswordToken($utilisateur, 'principal', $utilisateur->getRoles()));
        $conteneur = new Container();
        $conteneur->set('security.token_storage', $stockage);
        $controleur->setContainer($conteneur);

        return $controleur;
    }

    /** @param list<array{methode: string, url: string, options: array<string, mixed>}> $requetes */
    private static function controleurGrocy(array &$requetes): FrigoController
    {
        $http = new MockHttpClient(
            static function (string $methode, string $url, array $options = []) use (&$requetes): MockResponse {
                $requetes[] = ['methode' => $methode, 'url' => $url, 'options' => $options];

                return new MockResponse('[]');
            });

        $cnx = self::createStub(Connection::class);
        $grocy = new FrigoGrocy($http, new NullLogger(), 'https://grocy.test', 'cle');
        $base = new FrigoBase($cnx);
        $controleur = new FrigoController(new Frigo($grocy, $base), $base, $grocy, new InventaireLots($cnx), new PlansPrevus($cnx));

        $utilisateur = (new Utilisateur())->setEmail('admin@exemple.test')->setSourceFrigo('grocy');
        $stockage = new TokenStorage();
        $stockage->setToken(new UsernamePasswordToken($utilisateur, 'principal', $utilisateur->getRoles()));
        $conteneur = new Container();
        $conteneur->set('security.token_storage', $stockage);
        $controleur->setContainer($conteneur);

        return $controleur;
    }
}
