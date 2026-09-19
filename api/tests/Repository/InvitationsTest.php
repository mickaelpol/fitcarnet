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
     * L'INVITATION SE RESERVE AVANT QUE LE COMPTE SOIT ECRIT.
     *
     * CE TEST FIGEAIT L'ORDRE INVERSE, ET C'EST CE QUI A LAISSE PASSER LE
     * DEFAUT — mesure le 19 septembre 2026, deux POST vraiment simultanes sur
     * le meme jeton :
     *
     *     requete A : HTTP 201
     *     requete B : HTTP 500 — 407 Ko de page d'exception
     *       duplicate key value violates unique constraint "utilisateur_email_unique"
     *
     * L'en-tete de `creerLeCompteEtConsommer` promettait pourtant : « si deux
     * envois arrivent ensemble, le second ne marque rien, la levee fait tomber
     * sa transaction ». Faux : avec `persist`+`flush` EN PREMIER, le perdant de
     * la course butait sur l'unicite de l'adresse et n'atteignait jamais le
     * `if (0 === $marquees)`. Et l'exception levee par la base,
     * `UniqueConstraintViolationException`, ne descend PAS de `\RuntimeException`
     * (verifie) : le `catch` du controleur ne pouvait pas l'attraper non plus.
     * Deux gardes ecrites, aucune atteinte, sur l'ecran d'entree de tout
     * nouvel arrivant.
     *
     * L'ORDRE JUSTE FAIT DE LA LIGNE `invitation` LE POINT DE SERIALISATION :
     * le second envoi attend le verrou de ligne, lit `accepte_le` desormais
     * non nul, ne marque rien, et leve — sans jamais tenter d'INSERT.
     *
     * TROIS TEMPS, ET PAS DEUX : `invitation.utilisateur_id` porte une cle
     * etrangere immediate vers `utilisateur`, donc on ne peut pas la poser
     * avant que le compte existe. On reserve, on cree, on rattache.
     */
    public function testLInvitationEstReserveeAvantQueLeCompteSoitEcrit(): void
    {
        $trace = [];
        $cnx = self::createStub(Connection::class);
        $cnx->method('executeStatement')->willReturnCallback(
            function (string $sql) use (&$trace): int {
                $trace[] = \str_contains($sql, 'accepte_le = now()')
                    ? 'invitation reservee'
                    : (\str_contains($sql, 'utilisateur_id') ? 'invitation rattachee' : $sql);

                return 1;
            });

        $depot = new Invitations($cnx, self::em($trace));
        $depot->creerLeCompteEtConsommer(new Utilisateur(), 7);

        self::assertSame(
            ['transaction', 'invitation reservee', 'compte persiste', 'flush', 'invitation rattachee'],
            $trace,
            'La reservation doit precede l\'INSERT du compte : c\'est elle qui serialise la course.',
        );
    }

    /**
     * ET LE PERDANT NE TENTE MEME PAS DE CREER LE COMPTE.
     *
     * C'est la difference entre un 409 et un 500 : si l'INSERT partait quand
     * meme, la base trancherait par l'unicite de l'adresse et rendrait une
     * exception que personne n'attrape.
     */
    public function testLePerdantDeLaCourseNEcritAucunCompte(): void
    {
        $trace = [];
        $cnx = self::createStub(Connection::class);
        $cnx->method('executeStatement')->willReturn(0);

        $depot = new Invitations($cnx, self::em($trace));

        try {
            $depot->creerLeCompteEtConsommer(new Utilisateur(), 7);
            self::fail('Une invitation deja consommee doit lever.');
        } catch (\RuntimeException) {
            self::assertSame(['transaction'], $trace,
                'Ni persist ni flush ne doivent avoir eu lieu.');
        }
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
