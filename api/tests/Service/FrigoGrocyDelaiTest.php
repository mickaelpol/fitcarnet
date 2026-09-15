<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\FrigoGrocy;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

/**
 * UN GROCY BLOQUE NE DOIT PAS PARLER A LA PLACE DE L'API.
 *
 * LA PANNE, RELEVEE PAR LA REVUE LE 15 SEPTEMBRE 2026. `FrigoGrocy` n'imposait
 * aucune duree a ses appels : l'attente suivait `default_socket_timeout`, soit
 * SOIXANTE secondes. Le front, lui, coupe desormais a TRENTE. Un Grocy qui
 * accepte sans repondre produisait donc, cote utilisateur :
 *
 *  - « Le serveur ne répond pas » au lieu du 502 « Grocy est injoignable sur
 *    /objects/products » que l'API aurait rendu — le vrai diagnostic perdu ;
 *  - sur `/plan_repas/{id}/cuisine`, une coupure pendant que le serveur
 *    continuait : relancer donnait 409 « déjà marqué cuisiné », sans la liste
 *    de ce qui n'avait pas pu etre deduit.
 *
 * ET LE JUMEAU EN TACHE DE FOND. `inventorierUn` tourne hors requete HTTP, dans
 * `TraiterInventaires`. Sans borne, un Grocy muet y figeait un des deux
 * travailleurs pour toujours, et l'inventaire cessait d'avancer sans un mot.
 *
 * LA REGLE TESTEE N'EST PAS UNE VALEUR, C'EST UN ORDRE : l'API doit toujours
 * repondre AVANT que le front abandonne. Si le delai de garde du front change
 * (`DELAI_DE_GARDE_MS`, `front/src/api/client.ts`), c'est ce test qui dira que
 * celui-ci doit suivre.
 */
final class FrigoGrocyDelaiTest extends TestCase
{
    /** Le delai de garde du front, en secondes : l'API doit repondre avant. */
    private const DELAI_DU_FRONT_S = 30.0;

    /**
     * @param list<array{url: string, timeout: float, max_duration: float}> $vues
     */
    private static function grocy(array &$vues): FrigoGrocy
    {
        $http = new MockHttpClient(static function (string $methode, string $url, array $options) use (&$vues): MockResponse {
            $vues[] = [
                'url' => $url,
                'timeout' => (float) $options['timeout'],
                'max_duration' => (float) $options['max_duration'],
            ];

            return new MockResponse('[]', ['http_code' => 200]);
        });

        return new FrigoGrocy($http, new NullLogger(), 'https://grocy.test', 'cle');
    }

    /**
     * @param list<array{url: string, timeout: float, max_duration: float}> $vues
     */
    private static function exigerDesAppelsBornes(array $vues, string $chemin): void
    {
        self::assertNotSame([], $vues, "{$chemin} n'a rien envoye a Grocy : ce test ne prouverait rien");

        foreach ($vues as $vue) {
            self::assertGreaterThan(0.0, $vue['max_duration'],
                "{$vue['url']} : aucune duree maximale. Un Grocy muet fait attendre jusqu'a default_socket_timeout.");
            self::assertLessThan(self::DELAI_DU_FRONT_S, $vue['max_duration'],
                "{$vue['url']} : le front abandonne a " . self::DELAI_DU_FRONT_S . ' s. Au-dela, il ne recoit jamais le diagnostic.');
            self::assertLessThanOrEqual($vue['max_duration'], $vue['timeout'],
                "{$vue['url']} : une attente d'inactivite plus longue que la duree maximale ne sert a rien.");
        }
    }

    public function testLesAppelsFaitsPendantUneRequeteSontBornes(): void
    {
        $vues = [];

        try {
            self::grocy($vues)->lire();
        } catch (\RuntimeException) {
            /* Des reponses vides peuvent ne pas se lire : seul l'ENVOI nous interesse ici. */
        }

        self::exigerDesAppelsBornes($vues, 'lire()');
    }

    /**
     * ET QUAND LA BORNE SAUTE, LA LIGNE ECHOUE EN LE DISANT — sans faire tomber le lot.
     *
     * Un delai depasse n'a pas de reponse HTTP : c'est une `TransportException`,
     * pas une `HttpException`. `corpsDe` le sait et rend une chaine vide, si bien
     * que le motif devient le message du client HTTP. Sans ce temoin, poser une
     * borne pouvait tres bien transformer un Grocy lent en exception non
     * rattrapee au milieu de `TraiterInventaires`.
     */
    public function testUnDelaiDepasseDevientUnMotifDEchecLisible(): void
    {
        $http = new MockHttpClient(new MockResponse('', ['error' => 'Idle timeout reached for "https://grocy.test".']));
        $grocy = new FrigoGrocy($http, new NullLogger(), 'https://grocy.test', 'cle');

        $motif = $grocy->inventorierUn(12, 100.0);

        self::assertNotNull($motif, 'un delai depasse n\'est pas une ligne passee');
        self::assertStringContainsString('timeout', $motif, "le motif doit dire ce qui s'est passe, pas un texte vide");
    }

    public function testUneLigneDInventaireEnTacheDeFondEstBorneeAussi(): void
    {
        $vues = [];
        self::grocy($vues)->inventorierUn(12, 100.0);

        self::exigerDesAppelsBornes($vues, 'inventorierUn()');
    }
}
