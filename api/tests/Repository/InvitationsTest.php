<?php

declare(strict_types=1);

namespace App\Tests\Repository;

use App\Entity\Utilisateur;
use App\Repository\Invitations;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use PHPUnit\Framework\TestCase;

/**
 * LE SQL DES INVITATIONS, HORS DU CONTROLEUR.
 *
 * `InvitationsController` portait neuf requetes, dont une transaction qui mele
 * l'ORM (creer le compte) et DBAL (consommer l'invitation). Ces deux ecritures
 * sont UN SEUL FAIT : separees, une coupure au mauvais moment laisse soit un
 * compte sans trace, soit un lien deja utilise qui ne mene a rien — et dans les
 * deux cas quelqu'un attend devant un ecran.
 *
 * Tests ecrits avant le depot, et vus rouges.
 */
final class InvitationsTest extends TestCase
{
    private const EMPREINTE = 'e3b0c44298fc1c149afbf4c8996fb924';

    /**
     * L'EMPREINTE NE SORT JAMAIS DE LA BASE.
     *
     * Le jeton en clair n'existe qu'une fois, dans la reponse a la creation ;
     * la base n'en garde que l'empreinte. Si un jour cette liste selectionne
     * `jeton_empreinte`, elle finira dans une reponse JSON — et une empreinte
     * qui circule est un secret a moitie perdu.
     */
    public function testLaListeNeSelectionneJamaisLEmpreinteDuJeton(): void
    {
        $sqlVu = '';
        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchAllAssociative')->willReturnCallback(
            function (string $sql) use (&$sqlVu): array {
                $sqlVu = $sql;

                return [];
            });

        (new Invitations($cnx, self::em()))->recentes();

        self::assertStringNotContainsString('jeton_empreinte', $sqlVu);
        self::assertStringContainsString('LEFT JOIN utilisateur', $sqlVu, 'le nom de l invite');
        self::assertStringContainsString('ORDER BY i.cree_le DESC', $sqlVu);
        self::assertStringContainsString('LIMIT', $sqlVu, 'une liste bornee');
    }

    /**
     * UNE NOUVELLE INVITATION REMPLACE CELLE QUI ATTENDAIT.
     *
     * Dans cet ordre, et dans une seule transaction : si l'ancienne survivait a
     * la creation de la nouvelle, deux liens vivants circuleraient pour la meme
     * adresse. Et la suppression ne vise QUE les invitations en attente — une
     * invitation acceptee porte la trace de qui a invite qui.
     */
    public function testInviterRemplaceLInvitationEnAttenteDansUneTransaction(): void
    {
        $trace = [];
        $cnx = self::createStub(Connection::class);
        $cnx->method('transactional')->willReturnCallback(
            static function (callable $travail) use (&$trace, $cnx): mixed {
                $trace[] = 'transaction';

                return $travail($cnx);
            });
        $cnx->method('executeStatement')->willReturnCallback(
            function (string $sql) use (&$trace): int {
                $trace[] = \str_starts_with(\ltrim($sql), 'DELETE') ? $sql : 'INSERT';

                return 1;
            });

        (new Invitations($cnx, self::em()))->remplacer(
            'marie@test.local', self::EMPREINTE, null,
            new \DateTimeImmutable('2026-09-18 10:00:00'),
            new \DateTimeImmutable('2026-09-25 10:00:00'));

        self::assertSame('transaction', $trace[0]);
        self::assertStringContainsString('DELETE FROM invitation', $trace[1]);
        self::assertStringContainsString('accepte_le IS NULL', $trace[1],
            'une invitation acceptee ne se supprime pas ici');
        self::assertSame('INSERT', $trace[2]);
    }

    /** Revoquer ne touche pas a une invitation deja acceptee, et rend le compte. */
    public function testRevoquerNeViseQueLesInvitationsEnAttente(): void
    {
        $sqlVu = '';
        $cnx = self::createStub(Connection::class);
        $cnx->method('executeStatement')->willReturnCallback(
            function (string $sql) use (&$sqlVu): int {
                $sqlVu = $sql;

                return 0;
            });

        self::assertSame(0, (new Invitations($cnx, self::em()))->revoquer(12));
        self::assertStringContainsString('accepte_le IS NULL', $sqlVu);
    }

    /**
     * ON CHERCHE PAR EMPREINTE, JAMAIS PAR JETON.
     *
     * C'est ce qui fait qu'une lecture de la base ne donne aucun lien
     * utilisable : le parametre envoye est l'empreinte, et la colonne
     * interrogee aussi.
     */
    public function testOnCherchLInvitationParEmpreinte(): void
    {
        $vu = [];
        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchAssociative')->willReturnCallback(
            function (string $sql, array $params) use (&$vu): false {
                $vu = [$sql, $params];

                return false;
            });

        self::assertNull((new Invitations($cnx, self::em()))->parEmpreinte(self::EMPREINTE));
        self::assertStringContainsString('jeton_empreinte = :h', $vu[0]);
        self::assertSame(['h' => self::EMPREINTE], $vu[1]);
    }

    /**
     * LE COMPTE ET LA CONSOMMATION DU LIEN SONT UN SEUL FAIT.
     *
     * Le compte est ecrit, PUIS l'invitation marquee — jamais l'inverse : si
     * l'UPDATE ne marque rien, c'est qu'un second envoi est passe entre-temps,
     * et toute la transaction doit tomber.
     */
    public function testLeCompteEstCreeEtLInvitationConsommeeEnsemble(): void
    {
        $trace = [];
        $cnx = self::createStub(Connection::class);
        $cnx->method('executeStatement')->willReturnCallback(
            function (string $sql) use (&$trace): int {
                $trace[] = \str_contains($sql, 'UPDATE invitation') ? 'invitation marquee' : $sql;

                return 1;
            });

        $depot = new Invitations($cnx, self::em($trace));
        $depot->creerLeCompteEtConsommer(new Utilisateur(), 7);

        self::assertSame(['transaction', 'compte persiste', 'flush', 'invitation marquee'], $trace);
    }

    /**
     * UN LIEN CONSOMME ENTRE-TEMPS FAIT TOMBER LA TRANSACTION.
     *
     * Sans cette levee, deux envois simultanes creeraient deux comptes et un
     * seul lien serait marque : le second compte existerait sans invitation.
     */
    public function testUnLienDejaConsommeFaitEchouerToutLeGeste(): void
    {
        $cnx = self::createStub(Connection::class);
        $cnx->method('executeStatement')->willReturn(0);

        $depot = new Invitations($cnx, self::em());

        $this->expectException(\RuntimeException::class);
        $depot->creerLeCompteEtConsommer(new Utilisateur(), 7);
    }

    /** L'adresse se compare en minuscules, des deux cotes. */
    public function testLAdresseSeCompareEnMinuscules(): void
    {
        $sqlVu = '';
        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchOne')->willReturnCallback(
            function (string $sql) use (&$sqlVu): false {
                $sqlVu = $sql;

                return false;
            });

        $depot = new Invitations($cnx, self::em());

        self::assertNull($depot->nomDuCompte('marie@test.local'));
        self::assertStringContainsString('lower(email) = :e', $sqlVu);
    }

    // ---------------------------------------------------------------- outils

    /**
     * Un gestionnaire d'entites double, qui note ce qu'on lui demande.
     *
     * `wrapInTransaction` DOIT executer sa closure : un double qui rend `null`
     * sans rien appeler laisserait le test au vert alors qu'aucune ecriture ne
     * part. C'est le piege ecrit dans la skill `tests-api`, cote ORM.
     */
    private static function em(array &$trace = []): EntityManagerInterface
    {
        $em = self::createStub(EntityManagerInterface::class);
        $em->method('wrapInTransaction')->willReturnCallback(
            static function (callable $travail) use (&$trace, $em): mixed {
                $trace[] = 'transaction';

                return $travail($em);
            });
        $em->method('persist')->willReturnCallback(
            static function () use (&$trace): void {
                $trace[] = 'compte persiste';
            });
        $em->method('flush')->willReturnCallback(
            static function () use (&$trace): void {
                $trace[] = 'flush';
            });

        return $em;
    }
}
