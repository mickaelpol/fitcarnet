<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\CookieDeSession;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\Request;

/**
 * LE JETON QUI ROUVRE LA SESSION NE DOIT PAS ETRE LISIBLE PAR UN SCRIPT.
 *
 * Constat M5. Sur le web, le coffre retombait sur `localStorage` : le JWT ET
 * le jeton de rafraichissement y etaient en clair, lisibles par n'importe quel
 * script de la page et persistants d'une visite a l'autre. Le second est le
 * plus expose des deux — il rouvre la session pendant quatre-vingt-dix jours,
 * la ou le JWT expire en une heure. C'est la seule chose du front qui, volee,
 * donne un acces durable.
 *
 * Ce fichier eprouve les attributs du cookie qui le remplace. Ce ne sont pas
 * des details de configuration : chacun d'eux retire une facon precise de le
 * voler, et il suffit qu'un seul manque pour que l'ensemble ne serve a rien.
 */
final class CookieDeSessionTest extends TestCase
{
    /** Le site tel qu'il est en production : HTTPS. */
    private const PROD = 'https://carnet.mickael-pol.fr';

    /** Le site tel qu'il est sur le poste : en clair. */
    private const DEV = 'http://localhost:8080';

    private static function sur(string $base): CookieDeSession
    {
        return new CookieDeSession($base);
    }

    public function testLeCookieEstHorsDePorteeDeJavaScript(): void
    {
        /* SANS `HttpOnly`, TOUT CE TRAVAIL NE SERT A RIEN. Un cookie lisible
           par un script est exactement aussi expose que `localStorage` — il
           est meme pire, puisqu'il part en plus a chaque requete. */
        self::assertTrue(self::sur(self::PROD)->poser('abc')->isHttpOnly());
    }

    public function testLeCookieNeSuitPasUnLienVenuDUnAutreSite(): void
    {
        /* `Strict` et pas `Lax` : `Lax` laisse le cookie partir sur une
           navigation de premier niveau venue d'ailleurs. Rien dans cette
           application n'en a besoin — ce cookie ne sert qu'aux appels que la
           page fait elle-meme. */
        self::assertSame(Cookie::SAMESITE_STRICT, self::sur(self::PROD)->poser('abc')->getSameSite());
    }

    public function testLeCookieNeVaQueLaOuIlSert(): void
    {
        /* Pas `/`. Le front est servi par le meme serveur : un cookie de
           chemin `/` accompagnerait chaque image et chaque feuille de style. */
        self::assertSame('/api', self::sur(self::PROD)->poser('abc')->getPath());
    }

    public function testEnProductionLeCookieEstSecure(): void
    {
        /* LE TEST QUI MANQUAIT, ET LA REVUE L'A DIT LE JOUR MEME.
         *
         * Il y en avait un avant, et il ne prouvait RIEN : il posait lui-meme
         * `setSecureDefault(true)` puis `(false)` et verifiait que `Cookie`
         * obeissait. Il eprouvait Symfony, pas ce deploiement — le cas ou
         * `Secure` manque VRAIMENT lui etait invisible.
         *
         * Et il manquait vraiment. Le proxy inverse de DSM termine le TLS puis
         * parle a Caddy en clair ; Symfony n'a aucun `trusted_proxies`, donc
         * `$request->isSecure()` repond FAUX en production. Le cookie de
         * quatre-vingt-dix jours serait parti sans `Secure`, et une seule
         * requete en `http://` — il n'y a pas de HSTS — aurait mis le jeton de
         * rafraichissement en clair sur le reseau. La fuite durable que ce
         * constat visait, reintroduite par le correctif lui-meme.
         *
         * `setSecureDefault(false)` EXPRES : on simule le serveur qui croit
         * etre en clair, c'est-a-dire la production. Si `Secure` depend encore
         * de la requete, cette assertion tombe. */
        $cookie = self::sur(self::PROD)->poser('abc');
        $cookie->setSecureDefault(false);

        self::assertTrue($cookie->isSecure(),
            "DEFAULT_URI est en https : le cookie doit etre Secure meme si le serveur "
            . 'croit repondre en clair, ce qui est le cas derriere le proxy DSM.');
    }

    public function testEnDeveloppementLeCookieNEstPasSecure(): void
    {
        /* L'AUTRE MOITIE, ET ELLE COMPTE AUTANT. Un cookie `Secure` sur
         * `http://localhost` est simplement JETE par le navigateur : poser
         * `Secure` en dur rendrait la session web impossible a eprouver sur le
         * poste, et on ne s'en apercevrait qu'au moment de vouloir la tester. */
        $cookie = self::sur(self::DEV)->poser('abc');
        $cookie->setSecureDefault(false);

        self::assertFalse($cookie->isSecure(),
            'Sur http://localhost, un cookie Secure serait jete par le navigateur.');
    }

    public function testLeCookieQuiEffaceEstSecureLuiAussi(): void
    {
        /* LE JUMEAU. Un navigateur ne remplace un cookie que si les attributs
         * concordent : un effacement non-`Secure` ne retire pas un cookie
         * `Secure`, et « Se deconnecter » ne deconnecterait pas. */
        $efface = self::sur(self::PROD)->retirer();
        $efface->setSecureDefault(false);

        self::assertTrue($efface->isSecure());
    }

    public function testLeCookieDureAussiLongtempsQueLeJetonQuIlPorte(): void
    {
        /* UN COOKIE QUI MEURT AVANT SON JETON DECONNECTE SANS RAISON ; un
           cookie qui vit apres lui laisse le navigateur presenter un jeton
           mort a chaque demarrage. Les deux durees viennent donc de la meme
           constante. */
        $avant = new \DateTimeImmutable();
        $cookie = self::sur(self::PROD)->poser('abc');
        $apres = new \DateTimeImmutable();

        $attenduTot = $avant->modify(\App\Service\JetonsRafraichissement::DUREE)->getTimestamp();
        $attenduTard = $apres->modify(\App\Service\JetonsRafraichissement::DUREE)->getTimestamp();

        self::assertGreaterThanOrEqual($attenduTot, $cookie->getExpiresTime());
        self::assertLessThanOrEqual($attenduTard, $cookie->getExpiresTime());
    }

    public function testRetirerLeCookieLeFaitExpirerEtLeVide(): void
    {
        /* Les deux, et pas l'un ou l'autre. Un cookie vide mais toujours
           valable resterait dans le navigateur ; un cookie expire mais
           portant encore la valeur laisserait le jeton sur le disque le temps
           que le navigateur fasse son menage. */
        $cookie = self::sur(self::PROD)->retirer();

        self::assertSame('', (string) $cookie->getValue());
        self::assertLessThan((new \DateTimeImmutable())->getTimestamp(), $cookie->getExpiresTime());
    }

    public function testRetirerViseLeMemeCheminQuePoser(): void
    {
        /* LE PIEGE CLASSIQUE DU COOKIE QU'ON N'ARRIVE PAS A SUPPRIMER : un
           navigateur ne remplace un cookie que si le nom, le chemin et le
           domaine correspondent. Un `retirer()` sur `/` laisserait celui de
           `/api` intact — et « Se deconnecter » ne deconnecterait pas.

           Les deux passent par la meme methode privee ; ce test est ce qui
           interdit de les separer plus tard. */
        self::assertSame(self::sur(self::PROD)->poser('abc')->getName(), self::sur(self::PROD)->retirer()->getName());
        self::assertSame(self::sur(self::PROD)->poser('abc')->getPath(), self::sur(self::PROD)->retirer()->getPath());
    }

    // ------------------------------------------------- forme de la reponse

    /*
     * LA 500 DU 18 SEPTEMBRE 2026, ET CE QU'ELLE APPREND.
     *
     * La reponse etait assemblee a la main dans `SessionController`, avec un
     * `$reponse->getPayload()->all()` — methode qui existe sur `Request` et
     * pas sur `JsonResponse`. Les 392 tests restaient verts : le controleur
     * depend d'un service `final` qu'on ne peut pas doubler et d'une base, donc
     * rien ne l'eprouvait. Seul un appel reel l'a montre, et il a fallu le
     * faire expres.
     *
     * La forme de la reponse, elle, ne depend de rien. Elle est donc ici.
     */

    public function testEnModeCookieLeCorpsNePortePasLeJeton(): void
    {
        /* LE TEST QUI RESUME TOUT M5. Si cette assertion tombe, le jeton de
           rafraichissement est redevenu lisible par un script — et le cookie
           `HttpOnly` ne protege plus rien, puisque la meme valeur arrive par
           l'autre porte. */
        $reponse = self::sur(self::PROD)->reponse('le-jwt', 'le-jeton', parCookie: true);

        /** @var array<string, mixed> $corps */
        $corps = (array) \json_decode((string) $reponse->getContent(), true);

        self::assertSame(['token'], \array_keys($corps));
        self::assertStringNotContainsString('le-jeton', (string) $reponse->getContent());
    }

    public function testEnModeCookieLeJetonEstDansLeCookie(): void
    {
        $reponse = self::sur(self::PROD)->reponse('le-jwt', 'le-jeton', parCookie: true);
        $cookies = $reponse->headers->getCookies();

        self::assertCount(1, $cookies);
        self::assertSame(CookieDeSession::NOM, $cookies[0]->getName());
        self::assertSame('le-jeton', $cookies[0]->getValue());
    }

    public function testEnModeNatifRienNeChange(): void
    {
        /* L'application installee sur un telephone ne doit pas s'apercevoir de
           ce chantier. Aucun cookie, et les deux memes cles qu'avant. */
        $reponse = self::sur(self::PROD)->reponse('le-jwt', 'le-jeton', parCookie: false);

        /** @var array<string, mixed> $corps */
        $corps = (array) \json_decode((string) $reponse->getContent(), true);

        self::assertSame([], $reponse->headers->getCookies());
        self::assertSame(['token', 'jetonRafraichissement'], \array_keys($corps));
        self::assertSame('le-jeton', $corps['jetonRafraichissement']);
    }

    // ------------------------------------------------------------- lecture

    public function testOnLitLeJetonDansLeCookie(): void
    {
        $requete = new Request();
        $requete->cookies->set(CookieDeSession::NOM, 'le-jeton');

        self::assertSame('le-jeton', self::sur(self::PROD)->lire($requete));
    }

    public function testUnCookieVideNEstPasUnJeton(): void
    {
        /* Regle 6 : vide n'est pas une valeur. Un cookie vide traine apres
           une deconnexion, le temps que le navigateur le retire pour de bon.
           Le prendre pour un jeton ferait chercher en base une empreinte de
           la chaine vide. */
        $requete = new Request();
        $requete->cookies->set(CookieDeSession::NOM, '');

        self::assertNull(self::sur(self::PROD)->lire($requete));
    }

    public function testSansCookieOnNeLitRien(): void
    {
        self::assertNull(self::sur(self::PROD)->lire(new Request()));
    }

    // ---------------------------------------------------- qui en veut un

    public function testLeClientDoitDemanderLeModeCookie(): void
    {
        /* L'APPLICATION NATIVE NE DOIT PAS BASCULER EN MODE COOKIE, et c'est
           la raison d'etre de ce drapeau. Sur Android le jeton vit dans
           `expo-secure-store`, adosse au trousseau du systeme : c'est deja
           mieux qu'un cookie, et les cookies d'un `fetch` React Native ne se
           comportent pas pareil d'une version a l'autre. Le navigateur
           demande, le telephone ne demande pas, et le serveur repond a chacun
           dans sa langue — au lieu de deviner a partir d'un `User-Agent`. */
        self::assertTrue(self::sur(self::PROD)->demande(['cookieDeSession' => true]));
        self::assertFalse(self::sur(self::PROD)->demande(['cookieDeSession' => false]));
        self::assertFalse(self::sur(self::PROD)->demande([]));
    }

    public function testUneDemandeQuiNEstPasUnBooleenNEnEstPasUne(): void
    {
        /* `"true"`, `1`, `"oui"` : autant de facons de croire qu'on a demande
           le mode cookie. On repond non, franchement, plutot que d'accepter
           une forme approchante — le client qui se trompe le verra tout de
           suite, au lieu de decouvrir dans six mois que son jeton etait dans
           le corps de la reponse. */
        self::assertFalse(self::sur(self::PROD)->demande(['cookieDeSession' => 'true']));
        self::assertFalse(self::sur(self::PROD)->demande(['cookieDeSession' => 1]));
    }
}
