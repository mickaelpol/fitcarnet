<?php

declare(strict_types=1);

namespace App\Service;

use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\Request;

/**
 * LE JETON DE RAFRAICHISSEMENT, HORS DE PORTEE DES SCRIPTS — constat M5.
 *
 * CE QUI N'ALLAIT PAS. Sur le web, le coffre du front retombait sur
 * `localStorage`. Le JWT et le jeton de rafraichissement y etaient en clair,
 * lisibles par n'importe quel script de la page et persistants d'une visite a
 * l'autre. Le second est le plus expose des deux : il rouvre la session
 * pendant quatre-vingt-dix jours, la ou le JWT expire en une heure. C'est la
 * seule chose du front qui, volee, donne un acces durable — et la seule que
 * son proprietaire ne peut pas voir partir.
 *
 * CE QU'ON FAIT A LA PLACE. Le navigateur ne recoit plus le jeton de
 * rafraichissement : il recoit un COOKIE `HttpOnly` que JavaScript ne peut pas
 * lire, que le navigateur renvoie tout seul aux deux routes qui en ont besoin,
 * et que le serveur efface a la deconnexion. Le JWT, lui, ne vit plus que dans
 * une variable de la page : un rechargement le perd, et l'application en
 * redemande un au cookie. Une heure de fenetre au lieu de trois mois, et rien
 * qui survive a la fermeture de l'onglet.
 *
 * SEULEMENT SUR LE WEB, ET SUR DEMANDE. Sur Android, `expo-secure-store`
 * s'adosse au trousseau du systeme : c'est deja mieux qu'un cookie, et les
 * cookies d'un `fetch` React Native ne se comportent pas pareil d'une version
 * a l'autre. Le client DIT donc dans quel mode il est (`cookieDeSession`), au
 * lieu que le serveur le devine d'un `User-Agent`. Une deduction se trompe un
 * jour ; une declaration, non.
 *
 * TOUS LES ATTRIBUTS SONT ICI, ET C'EST LE POINT DE CETTE CLASSE. Chacun
 * retire une facon precise de voler ce jeton, et il suffit qu'un seul manque
 * pour que le reste ne serve a rien. Les ecrire a trois endroits — la
 * connexion, le rafraichissement, la deconnexion — aurait garanti qu'un jour
 * l'un des trois diverge. Ils passent tous par `cookie()`.
 *
 * @see CookieDeSessionTest
 */
final readonly class CookieDeSession
{
    /**
     * L'adresse publique du site, d'ou l'on sait si `Secure` s'impose.
     *
     * POURQUOI PAS `$request->isSecure()`, QUI SERAIT LE REFLEXE. Parce qu'il
     * repond FAUX en production, et la revue du 18 septembre 2026 l'a attrape
     * avant la mise en ligne. La chaine reelle : le proxy inverse de DSM
     * termine le TLS, puis parle a Caddy EN CLAIR (`docker/Caddyfile` :
     * `auto_https off`, `:80`, et son propre commentaire le dit). Symfony
     * n'avait AUCUN `trusted_proxies` configure : il ignorait donc
     * `X-Forwarded-Proto` et voyait une requete HTTP.
     *
     * DEPUIS, `SYMFONY_TRUSTED_PROXIES` EXISTE (18 septembre 2026, pour une
     * toute autre raison : `login_throttling` comptait toutes les tentatives
     * sous l'adresse du proxy). `isSecure()` repondrait donc juste
     * aujourd'hui — ET ON NE REVIENT PAS DESSUS POUR AUTANT. Une declaration
     * de configuration ne depend de personne ; `isSecure()` depend de ce
     * qu'un proxy a bien voulu transmettre, et d'une variable d'environnement
     * qu'un deploiement peut perdre. Le jour ou elle disparaitrait, le cookie
     * continuerait d'etre `Secure` au lieu de cesser de l'etre en silence. `Response::prepare()`
     * n'aurait jamais pose `Secure`, et le jeton de rafraichissement de
     * quatre-vingt-dix jours serait parti en clair a la premiere requete
     * `http://` — il n'y a pas de HSTS, le Caddyfile explique pourquoi.
     * C'est-a-dire exactement la fuite durable que ce constat visait.
     *
     * `DEFAULT_URI` est la DECLARATION du projet sur l'endroit ou il vit. Elle
     * sert deja a fabriquer les liens d'invitation, qui doivent etre ouvrables
     * par quelqu'un d'autre : si elle etait fausse, ca se verrait tout de
     * suite. C'est la seule source du projet qui sache repondre « ce site est
     * en HTTPS » sans dependre de ce qu'un proxy a bien voulu transmettre.
     */
    public function __construct(
        #[Autowire('%env(DEFAULT_URI)%')]
        private string $basePublique,
    ) {
    }

    /**
     * Le nom du cookie.
     *
     * Prefixe du projet pour ne pas entrer en collision avec un autre service
     * du meme domaine — le NAS en heberge plusieurs.
     */
    public const NOM = 'fitcarnet_rafraichissement';

    /**
     * Le champ par lequel un client declare qu'il veut le mode cookie.
     *
     * Il voyage dans le CORPS des trois appels de session, jamais dans l'URL :
     * une URL se retrouve dans les journaux du serveur, et c'est la meme
     * raison qui met deja le jeton de rafraichissement dans le corps.
     */
    public const CHAMP_DEMANDE = 'cookieDeSession';

    /**
     * LA REPONSE D'UNE SESSION PROLONGEE, DANS LA FORME QUE LE CLIENT A
     * DEMANDEE — et surtout, JAMAIS LES DEUX A LA FOIS.
     *
     * C'est ici, et pas dans le controleur, parce que c'est ici que
     * s'eprouve la seule chose qui compte pour M5 : que le corps de la
     * reponse NE PORTE PAS le jeton quand le cookie le porte. Assembler cette
     * reponse a la main dans le controleur a d'ailleurs coute une 500 le
     * 18 septembre 2026 — `JsonResponse::getPayload()` n'existe pas, c'est
     * `Request` qui a cette methode —, et aucun test ne pouvait la voir : le
     * controleur depend d'un service `final` qu'on ne peut pas doubler, et
     * d'une base. La forme de la reponse, elle, ne depend de rien.
     */
    public function reponse(string $jwt, string $jetonRafraichissement, bool $parCookie): JsonResponse
    {
        if (!$parCookie) {
            return new JsonResponse([
                'token' => $jwt,
                'jetonRafraichissement' => $jetonRafraichissement,
            ]);
        }

        $reponse = new JsonResponse(['token' => $jwt]);
        $reponse->headers->setCookie($this->poser($jetonRafraichissement));

        return $reponse;
    }

    /** Le cookie a poser, portant le jeton. */
    public function poser(string $jeton): Cookie
    {
        return $this->cookie($jeton, new \DateTimeImmutable(JetonsRafraichissement::DUREE));
    }

    /**
     * Le cookie qui efface le precedent.
     *
     * VIDE *ET* EXPIRE, pas l'un ou l'autre : un cookie vide mais encore
     * valable resterait dans le navigateur, un cookie expire portant encore la
     * valeur laisserait le jeton sur le disque le temps que le navigateur
     * fasse son menage.
     *
     * ET SUR LE MEME CHEMIN, ce qui est le piege classique du cookie qu'on
     * n'arrive pas a supprimer : un navigateur ne remplace un cookie que si le
     * nom, le chemin et le domaine correspondent. Un effacement sur `/`
     * laisserait celui de `/api` intact, et « Se deconnecter » ne
     * deconnecterait pas. D'ou la methode commune ci-dessous.
     */
    public function retirer(): Cookie
    {
        return $this->cookie('', new \DateTimeImmutable('-1 year'));
    }

    /**
     * Le jeton porte par le cookie de cette requete, s'il y en a un.
     *
     * Un cookie vide n'est pas un jeton — regle 6, vide n'est pas une valeur.
     * Il en traine un le temps que le navigateur retire pour de bon celui
     * qu'on vient d'effacer ; le prendre pour un jeton ferait chercher en base
     * l'empreinte de la chaine vide.
     */
    public function lire(Request $requete): ?string
    {
        $valeur = $requete->cookies->get(self::NOM);

        return \is_string($valeur) && '' !== $valeur ? $valeur : null;
    }

    /**
     * Ce client demande-t-il le mode cookie ?
     *
     * STRICTEMENT UN BOOLEEN. `"true"`, `1`, `"oui"` sont autant de facons de
     * croire qu'on l'a demande. On repond non, franchement, plutot que
     * d'accepter une forme approchante : le client qui se trompe le voit tout
     * de suite, au lieu de decouvrir dans six mois que son jeton voyageait
     * dans le corps de la reponse.
     *
     * @param array<string, mixed> $corps
     */
    public function demande(array $corps): bool
    {
        return true === ($corps[self::CHAMP_DEMANDE] ?? null);
    }

    /**
     * LE SEUL ENDROIT OU LES ATTRIBUTS SONT ECRITS.
     *
     * `httpOnly: true`    — sans lui, tout ceci ne sert a rien : un cookie
     *                       lisible par un script est aussi expose que
     *                       `localStorage`, en pire, puisqu'il part en plus a
     *                       chaque requete.
     * `sameSite: strict`  — `Lax` laisserait le cookie suivre une navigation
     *                       de premier niveau venue d'ailleurs. Ce cookie ne
     *                       sert qu'aux appels que la page fait elle-meme.
     * `path: /api`        — pas `/` : le meme serveur sert le front, et un
     *                       cookie de chemin `/` accompagnerait chaque image.
     * `secure`            — VRAI DES QUE LE SITE PUBLIC EST EN HTTPS, et lu
     *                       dans `DEFAULT_URI`, pas dans la requete. Voir le
     *                       constructeur : derriere le proxy DSM, Symfony voit
     *                       une requete en clair et n'aurait jamais pose
     *                       `Secure`. En developpement sur `http://localhost`,
     *                       on ne le pose pas — un cookie `Secure` y serait
     *                       simplement jete par le navigateur, et la session
     *                       web ne fonctionnerait plus du tout sur le poste.
     *
     * Et pas de `domain` : sans lui, le cookie vaut pour l'hote exact qui l'a
     * pose. Le nommer l'etendrait aux sous-domaines, c'est-a-dire aux autres
     * services du NAS.
     */
    private function cookie(string $valeur, \DateTimeImmutable $echeance): Cookie
    {
        return Cookie::create(self::NOM)
            ->withValue($valeur)
            ->withExpires($echeance)
            ->withPath('/api')
            ->withHttpOnly(true)
            ->withSecure($this->siteEnHttps())
            ->withSameSite(Cookie::SAMESITE_STRICT);
    }

    /**
     * Le site public est-il servi en HTTPS ?
     *
     * `str_starts_with` sur `DEFAULT_URI`, et rien de plus subtil : cette
     * variable vaut `https://carnet.mickael-pol.fr` en production et
     * `http://localhost:8080` en developpement. On ne cherche pas a deviner —
     * on lit ce que la configuration declare.
     */
    private function siteEnHttps(): bool
    {
        return \str_starts_with($this->basePublique, 'https://');
    }
}
