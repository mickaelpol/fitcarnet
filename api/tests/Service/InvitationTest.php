<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\Invitation;
use PHPUnit\Framework\TestCase;

/**
 * Ce qui separe un inconnu de la creation d'un compte.
 *
 * Un lien d'invitation est le seul endroit du projet ou quelqu'un qui n'est
 * pas authentifie ecrit dans la base. Tout ce qui suit protege ce passage :
 * un jeton qu'on ne devine pas, une empreinte qu'on ne remonte pas, une
 * validite qui expire, et une adresse que la personne invitee ne choisit pas.
 */
final class InvitationTest extends TestCase
{
    // ------------------------------------------------------------- jetons

    public function testDeuxJetonsNeSeRessemblentJamais(): void
    {
        $vus = [];
        for ($i = 0; $i < 500; ++$i) {
            $vus[Invitation::nouveauJeton()] = true;
        }

        self::assertCount(500, $vus, 'Deux jetons identiques : le tirage est cassé.');
    }

    public function testUnJetonVoyageDansUneUrlSansEtreReecrit(): void
    {
        /* base64 ordinaire produit `+`, `/` et `=`. Dans un chemin d'URL, le
           `/` couperait le jeton en deux et le `+` deviendrait un espace :
           le lien marcherait chez celui qui l'a fabrique et nulle part
           ailleurs. On verifie sur beaucoup de tirages, parce que le
           caractere fautif n'apparait pas a tous les coups. */
        for ($i = 0; $i < 200; ++$i) {
            $jeton = Invitation::nouveauJeton();
            self::assertSame(
                $jeton,
                \rawurlencode($jeton),
                "Ce jeton est réécrit par l'encodage d'URL : $jeton",
            );
        }
    }

    public function testUnJetonEstAssezLongPourNePasEtreDevine(): void
    {
        // 32 octets en base64 sans remplissage : 43 caracteres.
        self::assertSame(43, \strlen(Invitation::nouveauJeton()));
    }

    // --------------------------------------------------------- empreintes

    public function testLEmpreinteEstStableEtNeContientPasLeJeton(): void
    {
        $jeton = Invitation::nouveauJeton();
        $empreinte = Invitation::empreinte($jeton);

        self::assertSame($empreinte, Invitation::empreinte($jeton));
        self::assertSame(64, \strlen($empreinte));
        self::assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $empreinte);
        self::assertStringNotContainsString($jeton, $empreinte);
    }

    public function testDeuxJetonsDifferentsDonnentDeuxEmpreintes(): void
    {
        self::assertNotSame(
            Invitation::empreinte('a'),
            Invitation::empreinte('b'),
        );
    }

    // ------------------------------------------------------------ adresses

    public function testLaCasseEtLesEspacesNeFontPasDeuxComptes(): void
    {
        self::assertSame(
            'jean@exemple.fr',
            Invitation::adresseNormalisee('  Jean@Exemple.FR '),
        );
    }

    public function testLesAdressesImpossiblesSontRefusees(): void
    {
        self::assertFalse(Invitation::adresseValide(''));
        self::assertFalse(Invitation::adresseValide('   '));
        self::assertFalse(Invitation::adresseValide('pas une adresse'));
        self::assertFalse(Invitation::adresseValide('jean@'));
        self::assertFalse(Invitation::adresseValide('@exemple.fr'));
        self::assertFalse(Invitation::adresseValide(\str_repeat('a', 175) . '@exemple.fr'));
    }

    public function testUneAdresseOrdinairePasse(): void
    {
        self::assertTrue(Invitation::adresseValide('jean.dupont+sport@exemple.fr'));
        self::assertTrue(Invitation::adresseValide('  Jean@Exemple.fr  '));
    }

    // ------------------------------------------------------------ validite

    public function testUneInvitationFraicheEstValable(): void
    {
        $maintenant = new \DateTimeImmutable('2026-08-11 12:00:00');

        self::assertTrue(Invitation::estValable(
            Invitation::expiration($maintenant),
            null,
            $maintenant,
        ));
    }

    public function testUneInvitationPerimeeNeVautPlusRien(): void
    {
        $creation = new \DateTimeImmutable('2026-08-01 12:00:00');
        $expire = Invitation::expiration($creation);

        self::assertTrue(Invitation::estValable($expire, null, new \DateTimeImmutable('2026-08-07 12:00:00')));
        self::assertFalse(Invitation::estValable($expire, null, new \DateTimeImmutable('2026-08-09 12:00:00')));
    }

    public function testUneInvitationExpireALaSecondeAnnoncee(): void
    {
        $instant = new \DateTimeImmutable('2026-08-08 12:00:00');

        self::assertFalse(Invitation::estValable($instant, null, $instant));
    }

    public function testUnJetonDejaUtiliseNeSertPasDeuxFois(): void
    {
        /* Sans ca, un lien retrouve dans un historique de messages recreerait
           un compte — ou echouerait sur l'unicite de l'adresse, ce qui est a
           peine mieux : l'erreur apprendrait a l'inconnu que le compte
           existe. */
        $maintenant = new \DateTimeImmutable('2026-08-11 12:00:00');

        self::assertFalse(Invitation::estValable(
            Invitation::expiration($maintenant),
            new \DateTimeImmutable('2026-08-11 11:00:00'),
            $maintenant,
        ));
    }

    public function testUnJetonInconnuNeVautRien(): void
    {
        self::assertFalse(Invitation::estValable(null, null, new \DateTimeImmutable()));
    }

    // ----------------------------------------------------- mot de passe et nom

    public function testUnMotDePasseTropCourtEstRefuse(): void
    {
        self::assertFalse(Invitation::motDePasseAcceptable(''));
        self::assertFalse(Invitation::motDePasseAcceptable('court'));
        self::assertFalse(Invitation::motDePasseAcceptable('123456789'));
        self::assertTrue(Invitation::motDePasseAcceptable('1234567890'));
    }

    public function testOnCompteLesCaracteresEtPasLesOctets(): void
    {
        /* « Étéétéétée » fait 10 caracteres et 15 octets. `strlen` accepterait
           donc, ici, un mot de passe de 7 caracteres accentues — deux fois
           plus court que la regle affichee a l'ecran. */
        self::assertTrue(Invitation::motDePasseAcceptable('Étéétéétée'));
        self::assertFalse(Invitation::motDePasseAcceptable('Étéétéé'));
    }

    public function testUnNomVideOuDemesureEstRefuse(): void
    {
        self::assertFalse(Invitation::nomAcceptable(''));
        self::assertFalse(Invitation::nomAcceptable('     '));
        self::assertFalse(Invitation::nomAcceptable(\str_repeat('a', 81)));
        self::assertTrue(Invitation::nomAcceptable(' Mickaël '));
    }

    // ---------------------------------------------------------------- lien

    public function testLeLienNePorteJamaisDeDoubleBarre(): void
    {
        self::assertSame(
            'https://carnet.mickael-pol.fr/invitation/abc',
            Invitation::lien('https://carnet.mickael-pol.fr/', 'abc'),
        );
        self::assertSame(
            'https://carnet.mickael-pol.fr/invitation/abc',
            Invitation::lien('https://carnet.mickael-pol.fr', 'abc'),
        );
    }
}
