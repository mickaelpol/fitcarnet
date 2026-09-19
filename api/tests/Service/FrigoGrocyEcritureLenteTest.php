<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\FrigoGrocy;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

/**
 * UNE ECRITURE QUI EXPIRE N'A PAS FORCEMENT ECHOUE — ET ON NE DOIT PAS DIRE
 * QU'ELLE A ECHOUE.
 *
 * Vecu le 19 septembre 2026, sur le Grocy du proprietaire du projet. Il
 * renseigne les valeurs de « flageolet rouge » et lit :
 *
 *   « Grocy est injoignable sur /userfields/products/64 : Idle timeout
 *     reached for "https://grocy.…/api/userfields/products/64". »
 *
 * CE QUI EST SU : l'appel a expire. CE QUI NE L'EST PAS : si Grocy avait
 * applique le PUT avant de se taire. Une attente qui expire pendant un PUT ne
 * distingue pas « rien recu » de « tout applique, repondu trop tard ».
 *
 * LA PREMIERE ECRITURE DE CE TEST AFFIRMAIT LE CONTRAIRE — « verifie ensuite :
 * l'ecriture ETAIT passee » — sur la foi du produit trouve complet quelques
 * minutes plus tard. C'etait une cause deduite d'un etat, et c'etait faux : le
 * proprietaire du projet l'avait rempli lui-meme entre-temps. L'erreur reste
 * ecrite ici parce qu'elle a ete commise DANS un correctif dont le sujet est
 * « ne pas affirmer ce qu'on n'a pas constate ».
 *
 * Le message, lui, annonce un echec qu'il n'a pas constate non plus. C'est le
 * pire des deux sens : on recommence une ecriture peut-etre deja faite, ou on
 * renonce en croyant l'outil casse. La regle 7 du projet vaut ici pour un ETAT
 * et non un chiffre — mieux vaut avouer qu'on ne sait pas que d'affirmer faux.
 *
 * DEUX CORRECTIFS, ET LES DEUX COMPTENT :
 *
 *  1. Une ECRITURE attend plus longtemps qu'une lecture. Une lecture se fait
 *     pendant qu'on regarde un ecran ; une ecriture est un geste decide, et on
 *     accepte d'attendre. La borne reste sous les trente secondes du front
 *     (`DELAI_DE_GARDE_MS`), sans quoi c'est lui qui abandonne le premier et
 *     le vrai diagnostic se perd. Mesure de contexte : les cinq appels de
 *     lecture de `lire()` prennent 1 a 5 s sur ce Grocy, l'ecriture a depasse
 *     dix. Vingt donnent de l'air, SANS GARANTIE que ce soit assez — d'ou le
 *     point 2, qui compte autant.
 *  2. Quand l'attente expire sur une ecriture, le message DIT QU'ON NE SAIT
 *     PAS, et invite a verifier avant de recommencer.
 */
final class FrigoGrocyEcritureLenteTest extends TestCase
{
    public function testUneLectureQuiExpireDitBienQueGrocyEstInjoignable(): void
    {
        /* Sur une LECTURE, rien n'a ete modifie : « injoignable » est exact,
           et il ne faut pas le remplacer par un doute qui n'existe pas. */
        $grocy = self::grocyQuiExpire();

        try {
            $grocy->lire();
            self::fail('une lecture qui expire doit lever.');
        } catch (\RuntimeException $e) {
            self::assertStringContainsString('injoignable', $e->getMessage());
            self::assertStringNotContainsString('peut-être', $e->getMessage());
        }
    }

    public function testUneEcritureQuiExpireNAnnonceAucunEchec(): void
    {
        $grocy = self::grocyQuiExpire();

        try {
            $grocy->enregistrer(64, ['cat' => 'prot']);
            self::fail('l\'appel doit lever : on ne peut pas faire comme si de rien n\'etait.');
        } catch (\RuntimeException $e) {
            $message = $e->getMessage();

            self::assertStringNotContainsString('injoignable', $message,
                'Grocy a peut-etre tout enregistre : le declarer injoignable est un mensonge.');
            self::assertStringContainsString('peut-être enregistrée', $message,
                'il faut dire que le resultat est INCONNU');
            self::assertStringContainsString('avant de recommencer', $message,
                'et dire quoi faire : verifier, pas retaper');
        }
    }

    /**
     * L'ECRITURE PATIENTE PLUS QUE LA LECTURE, ET MOINS QUE LE FRONT.
     *
     * Le test porte sur l'ORDRE et non sur les valeurs : les chiffres
     * bougeront, la relation entre eux ne doit pas. C'est la meme forme que
     * `FrigoGrocyDelaiTest`.
     */
    public function testLesBornesDEcritureSontPlusLonguesQueCellesDeLecture(): void
    {
        $lues = self::constante('ATTENTE_MAX_S');
        $ecrites = self::constante('ATTENTE_ECRITURE_S');
        $duree = self::constante('DUREE_ECRITURE_S');

        self::assertGreaterThan($lues, $ecrites,
            'une ecriture est un geste decide : on accepte d\'attendre plus qu\'a la lecture');
        self::assertGreaterThanOrEqual($ecrites, $duree,
            'la duree totale ne peut pas etre plus courte que l\'attente qu\'elle contient');
        self::assertLessThan(30, $duree,
            'le front abandonne a 30 s : au-dela, c\'est lui qui parle et le diagnostic est perdu');
    }

    // ---------------------------------------------------------------- outils

    private static function constante(string $nom): int
    {
        /** @var int */
        return (new \ReflectionClass(FrigoGrocy::class))->getConstant($nom);
    }

    private static function grocyQuiExpire(): FrigoGrocy
    {
        $client = new MockHttpClient(
            static fn (): MockResponse => new MockResponse([], [
                'error' => 'Idle timeout reached',
            ]));

        return new FrigoGrocy($client, new NullLogger(), 'https://grocy.test', 'cle');
    }
}
