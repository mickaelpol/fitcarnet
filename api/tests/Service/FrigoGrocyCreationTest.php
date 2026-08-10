<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\FrigoGrocy;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

/**
 * CREER UN PRODUIT GROCY DEPUIS L'APPLICATION.
 *
 * L'application savait remplir les valeurs d'un produit, jamais en creer un :
 * il fallait ouvrir Grocy, ajouter le produit, revenir dans l'app, saisir les
 * macros. Deux outils pour un geste.
 *
 * Grocy reste le maitre de l'inventaire — c'est lui qui sort la liste de
 * courses — mais rien n'oblige a passer par son interface pour y poser une
 * ligne. Ce qui suit verifie que la creation devine proprement ce que Grocy
 * exige, et surtout qu'elle REFUSE clairement plutot que d'inventer.
 */
final class FrigoGrocyCreationTest extends TestCase
{
    public function testCreeLeProduitEtRendSonIdentifiant(): void
    {
        $envoyees = [];
        $grocy = self::grocy(self::reponsesNormales(), $envoyees);

        self::assertSame(61, $grocy->creerProduit('Lentilles corail'));

        $creation = self::derniere($envoyees, 'POST', '/objects/products');
        self::assertNotNull($creation, 'aucun POST vers /objects/products');
        self::assertSame('Lentilles corail', $creation['name']);
        self::assertSame(3, $creation['location_id'], 'le premier emplacement configure');
        self::assertSame(2, $creation['qu_id_stock'], 'le gramme, pas une unite au hasard');
        self::assertSame(2, $creation['qu_id_purchase']);
    }

    public function testLeNomEstNettoyeAvantEnvoi(): void
    {
        $envoyees = [];
        $grocy = self::grocy(self::reponsesNormales(), $envoyees);
        $grocy->creerProduit('  Lentilles corail  ');

        self::assertSame('Lentilles corail',
            self::derniere($envoyees, 'POST', '/objects/products')['name']);
    }

    public function testUnNomVideEstRefuse(): void
    {
        $envoyees = [];
        $grocy = self::grocy(self::reponsesNormales(), $envoyees);

        $this->expectExceptionMessage('Le nom est obligatoire.');
        $grocy->creerProduit('   ');
    }

    /**
     * Grocy accepte deux produits homonymes sans broncher. Le frigo
     * afficherait alors deux lignes identiques dont une seule porte les
     * macros — et l'utilisateur croirait avoir corrige la bonne.
     */
    public function testUnDoublonEstRefuseAvantDArriverDansGrocy(): void
    {
        $envoyees = [];
        $grocy = self::grocy(self::reponsesNormales(), $envoyees);

        try {
            $grocy->creerProduit('riz  BASMATI');
            self::fail('un doublon aurait du etre refuse');
        } catch (\RuntimeException $e) {
            self::assertStringContainsString('existe déjà dans Grocy', $e->getMessage());
            self::assertStringContainsString('Riz basmati', $e->getMessage(),
                'le message doit nommer le produit existant');
        }

        self::assertNull(self::derniere($envoyees, 'POST', '/objects/products'),
            'rien ne doit avoir ete envoye a Grocy');
    }

    /** Le doublon se reconnait aux accents pres : « Épinards » et « epinards ». */
    public function testLeDoublonIgnoreLesAccentsEtLaPonctuation(): void
    {
        $envoyees = [];
        $grocy = self::grocy(self::reponsesNormales(), $envoyees);

        $this->expectException(\RuntimeException::class);
        $grocy->creerProduit('epinards');
    }

    /**
     * Les valeurs nutritionnelles sont pour 100 g et le calculateur ecarte
     * silencieusement tout ce qui ne se convertit pas en grammes. Creer un
     * produit en pieces serait donc creer un produit inutilisable.
     */
    public function testSansUniteGrammeOnRefuseAuLieuDeChoisirAuHasard(): void
    {
        $envoyees = [];
        $grocy = self::grocy([
            '/objects/products' => [],
            '/objects/quantity_units' => [['id' => 9, 'name' => 'Pieces']],
            '/objects/locations' => [['id' => 3, 'name' => 'Frigo']],
        ], $envoyees);

        try {
            $grocy->creerProduit('Lentilles corail');
            self::fail('la creation aurait du etre refusee');
        } catch (\RuntimeException $e) {
            self::assertStringContainsString('gramme', $e->getMessage());
            self::assertStringContainsString('100 g', $e->getMessage(),
                'le message doit dire POURQUOI le gramme est indispensable');
        }

        self::assertNull(self::derniere($envoyees, 'POST', '/objects/products'));
    }

    public function testSansEmplacementOnRefuseAussi(): void
    {
        $envoyees = [];
        $grocy = self::grocy([
            '/objects/products' => [],
            '/objects/quantity_units' => [['id' => 2, 'name' => 'Gramme']],
            '/objects/locations' => [],
        ], $envoyees);

        $this->expectExceptionMessage("Grocy n'a aucun emplacement");
        $grocy->creerProduit('Lentilles corail');
    }

    /**
     * Un identifiant absent veut dire qu'on ne sait pas si le produit existe.
     * Se taire ferait recommencer l'utilisateur, et creerait un doublon.
     */
    public function testUneCreationSansIdentifiantEstUneErreurFranche(): void
    {
        $envoyees = [];
        $grocy = self::grocy(self::reponsesNormales(['created_object_id' => null]), $envoyees);

        $this->expectExceptionMessage("sans rendre d'identifiant");
        $grocy->creerProduit('Lentilles corail');
    }

    public function testGrocyNonConfigureLeDitAvantDAppeler(): void
    {
        $grocy = new FrigoGrocy(new MockHttpClient([]), new NullLogger(), '', '');

        $this->expectExceptionMessage("Grocy n'est pas configuré");
        $grocy->creerProduit('Lentilles corail');
    }

    /* ------------------------------------------------------------ le banc */

    /** @param array<string, mixed> $reponses */
    private static function grocy(array $reponses, array &$envoyees): FrigoGrocy
    {
        $client = new MockHttpClient(
            static function (string $methode, string $url, array $options) use ($reponses, &$envoyees): MockResponse {
                $chemin = \parse_url($url, \PHP_URL_PATH) ?? '';
                $chemin = \str_replace('/api', '', (string) $chemin);

                $envoyees[] = [
                    'methode' => $methode,
                    'chemin' => $chemin,
                    'corps' => isset($options['body']) && \is_string($options['body'])
                        ? (array) \json_decode($options['body'], true) : [],
                ];

                if ('POST' === $methode && '/objects/products' === $chemin) {
                    return new MockResponse(
                        \json_encode($reponses['creation'] ?? ['created_object_id' => 61]));
                }

                return new MockResponse(\json_encode($reponses[$chemin] ?? []));
            });

        return new FrigoGrocy($client, new NullLogger(), 'https://grocy.test', 'cle');
    }

    /** @return array<string, mixed> */
    private static function reponsesNormales(?array $creation = null): array
    {
        return [
            '/objects/products' => [
                ['id' => 1, 'name' => 'Riz basmati'],
                ['id' => 2, 'name' => 'Épinards'],
            ],
            '/objects/quantity_units' => [
                ['id' => 9, 'name' => 'Pieces'],
                ['id' => 2, 'name' => 'Gramme'],
            ],
            '/objects/locations' => [
                ['id' => 3, 'name' => 'Frigo'],
                ['id' => 4, 'name' => 'Placard'],
            ],
            'creation' => $creation ?? ['created_object_id' => 61],
        ];
    }

    private static function derniere(array $envoyees, string $methode, string $chemin): ?array
    {
        foreach (\array_reverse($envoyees) as $appel) {
            if ($appel['methode'] === $methode && $appel['chemin'] === $chemin) {
                return $appel['corps'];
            }
        }

        return null;
    }
}
