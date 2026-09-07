<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\DeductionGrocy;
use App\Service\FrigoGrocy;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

/**
 * DEDUIRE DU STOCK GROCY CE QU'UN PLAN CUISINE A CONSOMME.
 *
 * CE QUI S'EST PASSE.
 *
 * PlansController appelait `$this->grocy->inventorier($quantites)` — une
 * methode supprimee par le commit 1055cc2, qui avait mis a jour deux appelants
 * sur trois. Pour un compte en `sourceFrigo = 'grocy'`, le bouton « J'ai
 * cuisine » marquait le plan, flushait, puis PHP levait « Call to undefined
 * method » que le `catch (\RuntimeException)` ne rattrapait pas : 500, stock
 * jamais deduit, et un second appui refuse en 409 « deja cuisine ». Le plan
 * cessait de reserver son stock et le solveur composait ensuite sur des
 * quantites qui n'existaient plus — le bac vide une semaine plus tard.
 *
 * POURQUOI UNE CLASSE ET PAS UNE METHODE SUR FrigoGrocy.
 *
 * `inventorier(array)` n'a pas ete supprimee par accident : c'est le geste du
 * 14 aout 2026, ou pousser quarante lignes dans une requete a laisse le frigo
 * a moitie corrige. Une methode qui prend un lot entier laisse croire qu'il
 * part d'un bloc. La boucle est donc ecrite ici, visible, avec la
 * responsabilite de NOMMER ce qui n'est pas passe.
 */
final class DeductionGrocyTest extends TestCase
{
    public function testChaqueLigneProduitSonPropreAppel(): void
    {
        $appels = [];
        $deduction = new DeductionGrocy(self::grocy($appels));

        $echecs = $deduction->appliquer([42 => 3.5, 7 => 0.0]);

        self::assertSame([], $echecs);
        self::assertCount(2, $appels, 'deux lignes, deux appels — jamais un envoi groupe');
        self::assertSame('/stock/products/42/inventory', $appels[0]['chemin']);
        self::assertSame(3.5, $appels[0]['corps']['new_amount']);
        self::assertSame('/stock/products/7/inventory', $appels[1]['chemin']);
        self::assertSame(0.0, $appels[1]['corps']['new_amount']);
    }

    public function testUneLigneRefuseeNArretePasLesSuivantes(): void
    {
        /* La panne d'origine s'arretait a la premiere difficulte et rendait un
           500 muet. Ici la ligne fautive est nommee et les autres passent :
           c'est deja ce que fait la branche « frigo base » du meme
           controleur. */
        $appels = [];
        $grocy = self::grocy($appels, static function (string $chemin): MockResponse {
            return \str_contains($chemin, '/products/7/')
                ? new MockResponse('{"error_message":"Product does not exist"}', ['http_code' => 400])
                : new MockResponse('{}');
        });

        $echecs = (new DeductionGrocy($grocy))->appliquer([42 => 1.0, 7 => 2.0, 9 => 3.0]);

        self::assertCount(3, $appels, 'la ligne fautive ne doit pas interrompre la boucle');
        self::assertArrayHasKey(7, $echecs, "l'echec doit etre indexe par l'identifiant de la ligne");
        self::assertStringContainsString('Product does not exist', $echecs[7]);
        self::assertArrayNotHasKey(42, $echecs);
        self::assertArrayNotHasKey(9, $echecs);
    }

    public function testDejaALaBonneQuantiteNEstPasUnEchec(): void
    {
        /* Meme regle que pour l'inventaire ligne a ligne : l'ecran peut avoir
           une vision datee du stock. Compter « deja a jour » comme un echec
           pousse a rejouer, et rejouer est le geste qui fabrique le desordre. */
        $appels = [];
        $grocy = self::grocy($appels, static fn (): MockResponse => new MockResponse(
            '{"error_message":"The new amount cannot equal the current stock amount"}',
            ['http_code' => 400]));

        self::assertSame([], (new DeductionGrocy($grocy))->appliquer([42 => 1.0]));
    }

    public function testGrocyNonConfigureRemonteAuControleur(): void
    {
        /* Le controleur compte sur cette exception pour rendre la liste de
           rattrapage plutot qu'une erreur seche. La rattraper ici la lui
           volerait : le plan resterait cuisine sans que rien ne dise quoi
           retirer a la main. */
        $grocy = new FrigoGrocy(new MockHttpClient(), new NullLogger(), '', '');

        $this->expectException(\RuntimeException::class);

        (new DeductionGrocy($grocy))->appliquer([42 => 1.0]);
    }

    /**
     * @param list<array{methode: string, chemin: string, corps: array<string, mixed>}>|null $appels
     */
    private static function grocy(?array &$appels = null, ?callable $reponse = null): FrigoGrocy
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

                return null !== $reponse ? $reponse($chemin) : new MockResponse('{}');
            });

        return new FrigoGrocy($client, new NullLogger(), 'https://grocy.test', 'cle');
    }
}
