<?php

declare(strict_types=1);

namespace App\Controller;

use App\Service\CookieDeSession;
use App\Service\JetonsRafraichissement;
use Lexik\Bundle\JWTAuthenticationBundle\Services\JWTTokenManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Prolonger et terminer une session.
 *
 * Ces deux routes sont HORS du pare-feu JWT — voir `config/packages/
 * security.yaml`. C'est la condition pour qu'elles fonctionnent : on les
 * appelle precisement quand le jeton d'acces est perime, et un pare-feu JWT
 * repond 401 avant meme d'atteindre le controleur des qu'un en-tete
 * `Authorization` invalide traine dans la requete.
 *
 * L'authentification se fait donc par le seul jeton de rafraichissement, qui
 * arrive par un COOKIE `HttpOnly` sur le web et dans le CORPS de la requete
 * depuis l'application native — jamais dans l'URL, qui se retrouve dans les
 * journaux du serveur. Voir `App\Service\CookieDeSession` pour le pourquoi
 * des deux chemins (constat M5).
 */
#[Route('/api')]
final class SessionController extends AbstractController
{
    public function __construct(
        private readonly JetonsRafraichissement $jetons,
        private readonly JWTTokenManagerInterface $jwt,
        private readonly CookieDeSession $cookie,
    ) {
    }

    /**
     * Un jeton d'acces neuf, contre un jeton de rafraichissement valide.
     *
     * LE JETON DE RAFRAICHISSEMENT N'EST PAS REMPLACE. Le client n'a donc rien
     * a remplacer non plus, et une reponse perdue en route ne coute qu'un
     * nouvel essai. En mode natif il repart dans le corps, tel qu'il est
     * arrive ; en mode cookie le cookie est repose avec une echeance repoussee
     * — voir plus bas, c'est la seule raison de le reposer.
     */
    #[Route('/jeton/rafraichir', name: 'api_jeton_rafraichir', methods: ['POST'])]
    public function rafraichir(Request $request): JsonResponse
    {
        $fourni = $this->lireJeton($request);
        if ($fourni === null) {
            return $this->refus('Jeton de rafraichissement absent.');
        }

        $utilisateur = $this->jetons->utilisateurPour($fourni);
        if ($utilisateur === null) {
            return $this->refus('Session expiree, reconnecte-toi.');
        }

        /* UN COMPTE DESACTIVE NE PROLONGE PAS SA SESSION.
         *
         * Cette route est HORS PARE-FEU, volontairement (voir security.yaml) :
         * `App\Security\CompteActif`, qui refuse partout ailleurs, ne passe
         * donc pas ici. Sans cette ligne, un jeton de rafraichissement valide
         * redonnerait un jeton d'acces neuf toutes les heures, indefiniment —
         * et « bloquer un compte » n'aurait d'effet qu'a la prochaine
         * deconnexion volontaire. Personne ne se deconnecte volontairement.
         *
         * Meme message que pour un jeton inconnu : dans les deux cas il faut
         * se reconnecter, et c'est l'ecran de connexion qui dira pourquoi ca
         * ne passe pas. */
        if (!$utilisateur->isActif()) {
            return $this->refus('Session expiree, reconnecte-toi.');
        }

        $this->jetons->purger();

        /* LA FORME DE LA REPONSE EST DECIDEE PAR `CookieDeSession`, ET PAS
           ICI. Le jeton part par le cookie OU par le corps, jamais par les
           deux — c'est la seule chose que M5 demande, et elle s'eprouve sans
           base ni noyau la-bas, alors qu'ici rien ne le pourrait : ce
           controleur depend d'un service `final` qu'on ne peut pas doubler.

           En mode cookie, on REPOSE le cookie a chaque rafraichissement. Ce
           n'est pas une precaution : `JetonsRafraichissement::prolonger()`
           repousse l'echeance en base a chaque usage, et un cookie dont la
           date resterait celle de la premiere connexion expirerait AVANT le
           jeton qu'il porte. L'application se serait alors deconnectee toute
           seule au bout de quatre-vingt-dix jours d'usage quotidien — le
           contraire exact de ce que la duree glissante promet.

           LE CAS DE BASCULE evite de deconnecter tout le monde le jour de la
           mise a jour : un navigateur qui porte encore l'ancien jeton dans
           `localStorage` l'envoie UNE FOIS dans le corps en demandant le mode
           cookie. Il n'a pas de cookie, on lui en pose un, et il efface son
           `localStorage`. Personne n'a a se reconnecter. */
        return $this->cookie->reponse(
            $this->jwt->create($utilisateur),
            $fourni,
            $this->modeCookie($request),
        );
    }

    /**
     * Fin de session, cote serveur.
     *
     * Effacer le jeton du telephone ne suffit pas : tant que la ligne existe
     * en base, une copie du jeton rouvrirait la session. C'est ici que « Se
     * deconnecter » prend effet.
     *
     * Repond 204 meme sur un jeton inconnu : se deconnecter deux fois n'est
     * pas une erreur, et distinguer les deux cas dirait a un inconnu si un
     * jeton existe.
     */
    #[Route('/deconnexion', name: 'api_deconnexion', methods: ['POST'])]
    public function deconnexion(Request $request): Response
    {
        $fourni = $this->lireJeton($request);
        if ($fourni !== null) {
            $this->jetons->revoquer($fourni);
        }

        $reponse = new Response(null, Response::HTTP_NO_CONTENT);

        /* LE COOKIE PART DANS TOUS LES CAS, MEME S'IL N'Y EN AVAIT PAS.
           Le conditionner a sa presence aurait ajoute une branche pour ne rien
           gagner : effacer un cookie absent ne coute qu'un en-tete, tandis
           qu'un cookie qu'on oublie d'effacer rouvre la session au prochain
           demarrage. Ce n'est pas symetrique, et la branche qui manque n'est
           jamais celle qu'on teste.

           ET C'EST INDISPENSABLE MEME QUAND LA REVOCATION A ECHOUE : un jeton
           inconnu rend 204 (se deconnecter deux fois n'est pas une erreur),
           mais laisser le cookie ferait echouer la reconnexion suivante sur un
           jeton mort que le navigateur represente indefiniment. */
        $reponse->headers->setCookie($this->cookie->retirer());

        return $reponse;
    }

    /**
     * Le jeton de rafraichissement de cette requete.
     *
     * LE COOKIE D'ABORD, LE CORPS ENSUITE — et l'ordre porte une decision.
     *
     * Un navigateur deja bascule a un cookie et rien dans son corps : il passe
     * par la premiere ligne. Un navigateur qui bascule tout juste n'a pas
     * encore de cookie mais porte l'ancien jeton dans `localStorage` : il
     * passe par la seconde, et repart avec un cookie. L'application native
     * n'a jamais de cookie et passe toujours par la seconde.
     *
     * Si les deux etaient presents, le cookie gagne : c'est celui que le
     * serveur a pose lui-meme, la derniere fois qu'il a vu ce navigateur.
     */
    private function lireJeton(Request $request): ?string
    {
        return $this->cookie->lire($request) ?? $this->jetonDuCorps($request);
    }

    /**
     * Ce client veut-il que le jeton reparte dans un cookie ?
     *
     * DEUX FACONS DE DIRE OUI, ET C'EST VOULU. Porter deja le cookie en est
     * une : un navigateur bascule n'a pas a le redemander a chaque appel, et
     * l'oubli du champ ne doit pas le faire retomber en mode « jeton dans le
     * corps » — ce qui lui renverrait en clair ce qu'on venait de lui
     * retirer. Le demander explicitement en est l'autre : c'est le seul
     * moyen qu'a un navigateur qui n'a pas encore de cookie d'en obtenir un.
     */
    private function modeCookie(Request $request): bool
    {
        return null !== $this->cookie->lire($request)
            || $this->cookie->demande($this->corps($request));
    }

    private function jetonDuCorps(Request $request): ?string
    {
        $jeton = $this->corps($request)['jetonRafraichissement'] ?? null;

        return \is_string($jeton) && $jeton !== '' ? $jeton : null;
    }

    /**
     * Le corps JSON de la requete, ou rien du tout.
     *
     * UN SEUL ENDROIT LIT CE CORPS, et ce n'est pas de la coquetterie : ses
     * deux lecteurs — « quel jeton » et « quel mode » — avaient chacun leur
     * `try/catch`, et deux filets pour la meme chute finissent par ne plus
     * attraper la meme chose.
     *
     * `\Throwable` et pas `\JsonException` : `Request::toArray()` leve sa
     * PROPRE exception, et PHPStan l'a dit — « Dead catch ». Un catch qui ne
     * rattrape rien est pire qu'absent : il affiche une precaution qu'il ne
     * prend pas. Et la reponse juste ne depend pas du type de l'echec : un
     * corps illisible n'est pas un corps.
     *
     * @return array<string, mixed>
     */
    private function corps(Request $request): array
    {
        try {
            /** @var array<string, mixed> */
            return $request->toArray();
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * UN REFUS DE PROLONGATION EMPORTE LE COOKIE — releve par la revue le
     * 18 septembre 2026.
     *
     * Le raisonnement etait ecrit pour la deconnexion — « laisser le cookie
     * ferait echouer la reconnexion suivante sur un jeton mort que le
     * navigateur represente indefiniment » — et n'etait applique qu'a cette
     * porte-la. Or c'est ICI qu'on vient de CONSTATER que le jeton est mort :
     * revoque depuis un autre appareil, echeance passee, compte desactive. Le
     * laisser, c'est laisser un navigateur rejouer un secret mort pendant
     * quatre-vingt-dix jours.
     *
     * DEUX JUMELLES RESTENT, ET ELLES SONT ECRITES ICI POUR NE PAS ETRE
     * OUBLIEES : `DELETE /api/mes-sessions/{id}` sur sa propre session, et le
     * changement de mot de passe (`revoquerTout`). Elles ne peuvent pas
     * effacer le cookie du navigateur courant sans comparer l'empreinte du
     * cookie a celle de la ligne visee. Leur consequence est bornee : le
     * prochain rafraichissement passe par ici, au plus tard une heure apres,
     * et c'est cette ligne qui nettoie.
     */
    private function refus(string $message): JsonResponse
    {
        // Meme forme que les erreurs d'API Platform : le front lit « detail »
        // partout ailleurs, il ne doit pas y avoir d'exception ici.
        $reponse = new JsonResponse(['detail' => $message], Response::HTTP_UNAUTHORIZED);
        $reponse->headers->setCookie($this->cookie->retirer());

        return $reponse;
    }
}
