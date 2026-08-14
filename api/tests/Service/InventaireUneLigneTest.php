<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\FrigoGrocy;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

/**
 * ENVOYER UNE CORRECTION D'INVENTAIRE, UNE SEULE.
 *
 * CE QUI S'EST PASSE LE 14 AOUT 2026.
 *
 * L'application poussait toutes les corrections d'un inventaire en meme temps,
 * en croyant paralleliser. Grocy tourne avec cinq ouvriers PHP et une base
 * SQLite qui n'accepte qu'un ecrivain : rien n'etait parallelise, tout faisait
 * la queue. PHP s'est arrete a 30 s au milieu de quarante lignes, pendant que
 * Grocy continuait d'appliquer ce qu'il avait deja recu.
 *
 * En rappuyant sur le bouton, l'utilisateur a renvoye des lignes DEJA
 * appliquees. Grocy les a refusees — « The new amount cannot equal the current
 * stock amount » — et l'ecran les a affichees en rouge, ce qui invite a
 * renvoyer encore. Le seul geste qui aggravait la situation etait celui que le
 * message encourageait.
 *
 * Ces deux tests tiennent la lecon : une ligne a la fois, et « c'etait deja
 * fait » n'est pas un echec.
 */
final class InventaireUneLigneTest extends TestCase
{
    public function testUnSeulAppelParLigne(): void
    {
        $appels = [];
        $grocy = self::grocy($appels);

        self::assertNull($grocy->inventorierUn(42, 3.5));

        self::assertCount(1, $appels, 'une ligne doit produire un appel, pas deux');
        self::assertSame('POST', $appels[0]['methode']);
        self::assertSame('/stock/products/42/inventory', $appels[0]['chemin']);
        self::assertSame(3.5, $appels[0]['corps']['new_amount']);
    }

    public function testUneQuantiteAZeroPartCommeLesAutres(): void
    {
        /* Zero n'est pas « rien a envoyer » : c'est « il n'en reste plus ».
           Grocy le traite comme une consommation. Le confondre avec une
           absence de saisie laisserait le stock theorique en place. */
        $appels = [];
        $grocy = self::grocy($appels);

        self::assertNull($grocy->inventorierUn(7, 0.0));
        self::assertSame(0.0, $appels[0]['corps']['new_amount']);
    }

    public function testDejaALaBonneQuantiteNEstPasUnEchec(): void
    {
        $grocy = self::grocy($appels, new MockResponse(
            \json_encode(['error_message' => 'The new amount cannot equal the current stock amount']),
            ['http_code' => 400]));

        self::assertNull(
            $grocy->inventorierUn(22, 2.0),
            'Grocy dit « c\'etait deja fait » — l\'ecran ne doit pas crier a l\'echec');
    }

    public function testUnVraiRefusEstRapporte(): void
    {
        $grocy = self::grocy($appels, new MockResponse(
            \json_encode(['error_message' => 'Product does not exist or is inactive']),
            ['http_code' => 400]));

        $motif = $grocy->inventorierUn(9999, 1.0);

        self::assertNotNull($motif, 'un produit inexistant doit remonter');
        /* LE MOTIF DOIT PORTER LA PHRASE DE GROCY, pas seulement un code.
           « HTTP 400 returned for https://... » ne dit rien a qui lit l'ecran :
           ni ce qui a ete refuse, ni pourquoi. */
        self::assertStringContainsString('does not exist or is inactive', $motif);
    }

    public function testUneErreurBavardeEstTronquee(): void
    {
        /* Une 500 de Grocy renvoie une trace complete — trois kilo-octets vus
           en production. Non tronquee, elle remplit la colonne `echecs` et
           deborde de l'ecran. */
        $grocy = self::grocy($appels, new MockResponse(
            \str_repeat('trace ', 600), ['http_code' => 500]));

        $motif = $grocy->inventorierUn(49, 1.0);

        self::assertNotNull($motif);
        self::assertLessThan(400, \mb_strlen($motif), 'le motif doit rester lisible');
    }

    public function testUnePanneReseauEstRapporteeSansExploser(): void
    {
        /* Le travailleur de fond enchaine les lignes : une exception qui
           traverse tuerait le processus et laisserait le lot « en cours »
           jusqu'a ce que le filet des dix minutes le reprenne. */
        /* `['error' => …]` DANS LES INFOS, ET PAS UNE EXCEPTION EN GUISE DE
           CORPS : c'est ainsi que `MockResponse` represente une requete qui
           n'a jamais abouti. Le client leve alors une `TransportException`, et
           la reponse n'existe pas — donc aucun corps a lire, ce qui est
           exactement le cas que `corpsDe` doit traverser sans broncher. */
        $grocy = self::grocy($appels, new MockResponse('', ['error' => 'Grocy injoignable']));

        $motif = $grocy->inventorierUn(3, 1.0);

        self::assertNotNull($motif, 'une panne doit remonter, pas disparaitre');
        self::assertStringContainsString('Grocy injoignable', $motif);
    }

    /**
     * @param array<int, array{methode: string, chemin: string, corps: array<string, mixed>}>|null $appels
     */
    private static function grocy(?array &$appels = null, ?MockResponse $reponse = null): FrigoGrocy
    {
        $appels = [];
        $client = new MockHttpClient(
            static function (string $methode, string $url, array $options) use (&$appels, $reponse): MockResponse {
                $chemin = \str_replace('/api', '', (string) (\parse_url($url, \PHP_URL_PATH) ?? ''));

                $appels[] = [
                    'methode' => $methode,
                    'chemin' => $chemin,
                    'corps' => isset($options['body']) && \is_string($options['body'])
                        ? (array) \json_decode($options['body'], true) : [],
                ];

                return $reponse ?? new MockResponse('{}');
            });

        return new FrigoGrocy($client, new NullLogger(), 'https://grocy.test', 'cle');
    }
}
