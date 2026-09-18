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

    public function testLesDomainesQuiNePeuventPasRecevoirSontRefuses(): void
    {
        /* `filter_var` accepte ces quatre adresses : elles sont
           syntaxiquement parfaites. Aucune ne peut recevoir de courrier —
           les trois dernieres sont RESERVEES par la norme, precisement pour
           ne jamais exister. Une invitation envoyee la n'arrive nulle part,
           et personne ne l'apprend. */
        self::assertFalse(Invitation::adresseValide('jean@localhost'));
        self::assertFalse(Invitation::adresseValide('jean@exemple.invalid'));
        self::assertFalse(Invitation::adresseValide('jean@monsite.test'));
        self::assertFalse(Invitation::adresseValide('jean@example.com'));
        self::assertFalse(Invitation::adresseValide('jean@nas.local'));
    }

    public function testUnDomaineSansPointNePeutPasExister(): void
    {
        self::assertFalse(Invitation::adresseValide('jean@intranet'));
        self::assertFalse(Invitation::adresseValide('jean@nas'));
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

    // --------------------------------------------------------------- purge

    /*
     * LA PURGE — constat 02#17, tranche le 18 septembre 2026.
     *
     * UN SEUL JUGE, ET IL EST ICI. La tentation etait d'ecrire la regle
     * directement dans un `DELETE ... WHERE`. C'aurait fait deux juges de la
     * meme question — le motif de defaut le plus frequent de ce projet, celui
     * du jumeau oublie — et le second aurait ete intestable sans base. La
     * commande lit les lignes, demande a cette fonction, et supprime par
     * identifiant. La table compte une poignee de lignes : il n'y a rien a
     * optimiser, et tout a gagner a n'avoir qu'un endroit ou la regle vit.
     */

    public function testUneInvitationVivanteNeSePurgeJamais(): void
    {
        $maintenant = new \DateTimeImmutable('2026-09-18 12:00:00');

        /* Meme tres vieille : tant qu'elle n'est ni acceptee ni perimee, le
           lien est en circulation. Le purger, c'est le tuer sans le dire. */
        self::assertFalse(Invitation::aPurger(
            Invitation::expiration($maintenant), null, false, $maintenant,
        ));
    }

    public function testUneInvitationPerimeeAttendLaRetention(): void
    {
        $expire = new \DateTimeImmutable('2026-08-01 12:00:00');

        /* La veille du terme, elle reste : l'ecran dit « perimee, reinvite
           pour un lien neuf », et c'est une information utile. */
        self::assertFalse(Invitation::aPurger(
            $expire, null, false, $expire->modify('+' . (Invitation::RETENTION_JOURS - 1) . ' days'),
        ));

        self::assertTrue(Invitation::aPurger(
            $expire, null, false, $expire->modify('+' . (Invitation::RETENTION_JOURS + 1) . ' days'),
        ));
    }

    public function testUneInvitationAccepteeAttendLaRetentionTantQueLeCompteVit(): void
    {
        $accepte = new \DateTimeImmutable('2026-08-01 12:00:00');
        $expire = new \DateTimeImmutable('2026-08-05 12:00:00');

        self::assertFalse(Invitation::aPurger(
            $expire, $accepte, true, $accepte->modify('+' . (Invitation::RETENTION_JOURS - 1) . ' days'),
        ));

        self::assertTrue(Invitation::aPurger(
            $expire, $accepte, true, $accepte->modify('+' . (Invitation::RETENTION_JOURS + 1) . ' days'),
        ));
    }

    public function testLeDelaiDUneAccepteeCourtDepuisLAcceptation(): void
    {
        /* Le piege : une invitation acceptee le jour meme de sa creation a
           quand meme un `expire_le` sept jours plus tard. Compter a partir de
           `expire_le` la garderait une semaine de trop — et, pire, une
           acceptee le DERNIER jour de validite serait purgee plus tot qu'une
           acceptee le premier. Le fait qu'on date, c'est l'acceptation. */
        $accepte = new \DateTimeImmutable('2026-08-01 12:00:00');
        $expire = new \DateTimeImmutable('2026-08-08 12:00:00');
        $juste = $accepte->modify('+' . (Invitation::RETENTION_JOURS + 1) . ' days');

        self::assertTrue(Invitation::aPurger($expire, $accepte, true, $juste),
            'Le delai doit courir depuis l\'acceptation, pas depuis la peremption.');
    }

    public function testUneAccepteeOrphelinePartToutDeSuite(): void
    {
        /* LE CAS QUI A MOTIVE LE CONSTAT. Supprimer un compte met
           `invitation.utilisateur_id` a NULL (`ON DELETE SET NULL`) : la ligne
           reste, marquee « acceptee », sans nom, pour toujours. Elle ne porte
           plus aucune trace — le compte dont elle etait la trace n'existe
           plus. Et elle encombre l'ecran juste au moment ou l'administrateur
           reinvite cette adresse : deux lignes pour la meme personne, dont une
           qui ne veut plus rien dire.

           Aucune retention ici : il n'y a rien a laisser refroidir. */
        $accepte = new \DateTimeImmutable('2026-09-18 11:59:00');
        $expire = new \DateTimeImmutable('2026-09-25 12:00:00');

        self::assertTrue(Invitation::aPurger(
            $expire, $accepte, false, new \DateTimeImmutable('2026-09-18 12:00:00'),
        ));
    }

    public function testUneEnAttenteNEstJamaisOrpheline(): void
    {
        /* `utilisateur_id` est nul sur TOUTE invitation non acceptee : c'est
           son etat normal, pas un orphelinat. Confondre les deux purgerait a
           l'instant meme chaque invitation qu'on vient de creer. */
        $maintenant = new \DateTimeImmutable('2026-09-18 12:00:00');

        self::assertFalse(Invitation::aPurger(
            Invitation::expiration($maintenant), null, false, $maintenant,
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

    public function testLaVerificationDNSNeBloqueJamais(): void
    {
        /* Elle CONSEILLE. Un DNS lent, une coupure, un domaine achete il y a
           dix minutes : chacun ferait refuser une adresse juste. Les trois
           reponses possibles sont `true`, `false` et `null` — et `null` veut
           dire « je n'ai pas pu savoir », ce qui n'est pas « non ». */
        $reponse = Invitation::domaineAccepteDuCourrier('jean@exemple-qui-nexiste-pas-du-tout-42.fr', 1);
        self::assertContains($reponse, [true, false, null]);

        /* Une adresse sans domaine ne demande aucune resolution. */
        self::assertFalse(Invitation::domaineAccepteDuCourrier('pasdarobase'));
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
