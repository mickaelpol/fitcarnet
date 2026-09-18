<?php

declare(strict_types=1);

namespace App\EventListener;

use App\Entity\Utilisateur;
use App\Service\CookieDeSession;
use App\Service\JetonsRafraichissement;
use App\Service\MotDePasse;
use Doctrine\ORM\EntityManagerInterface;
use Lexik\Bundle\JWTAuthenticationBundle\Event\AuthenticationSuccessEvent;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\RequestStack;

/**
 * Ajoute un jeton de rafraichissement a la reponse de connexion.
 *
 * On se greffe sur l'evenement de Lexik plutot que d'ecrire notre propre
 * controleur de connexion : le pare-feu `json_login` reste maitre de la
 * verification du mot de passe, on n'en refait pas une deuxieme version qui
 * finirait par diverger.
 *
 * DEUX FACONS DE RENDRE CE JETON, ET LE CLIENT CHOISIT — constat M5.
 *
 *   - Un navigateur demande `cookieDeSession: true`. Il recoit un cookie
 *     `HttpOnly` que ses scripts ne peuvent pas lire, ET RIEN DANS LE CORPS :
 *     c'est tout l'objet du constat. Laisser le jeton dans le corps « au cas
 *     ou » aurait remis a portee de JavaScript exactement ce qu'on vient d'en
 *     retirer, une seconde par connexion — la seconde ou un script hostile
 *     n'a plus qu'a lire la reponse.
 *   - L'application native ne demande rien et recoit le jeton dans le corps,
 *     comme avant, pour le ranger dans `expo-secure-store`.
 *
 * LA REPONSE NE CHANGE DONC PAS DE FORME PAR HASARD : elle change parce que le
 * client a dit dans quelle forme il la voulait.
 */
#[AsEventListener(event: 'lexik_jwt_authentication.on_authentication_success')]
final class AjouterJetonRafraichissement
{
    public function __construct(
        private readonly JetonsRafraichissement $jetons,
        private readonly RequestStack $requetes,
        private readonly CookieDeSession $cookie,
        private readonly EntityManagerInterface $em,
    ) {
    }

    public function __invoke(AuthenticationSuccessEvent $evenement): void
    {
        $utilisateur = $evenement->getUser();
        if (!$utilisateur instanceof Utilisateur) {
            return;
        }

        $this->releverLaForceDuMotDePasse($utilisateur);

        $jeton = $this->jetons->creer($utilisateur);

        if ($this->parCookie()) {
            $evenement->getResponse()->headers->setCookie($this->cookie->poser($jeton));

            return;
        }

        $donnees = $evenement->getData();
        $donnees['jetonRafraichissement'] = $jeton;
        $evenement->setData($donnees);
    }

    /**
     * LA CONNEXION EST LE SEUL ENDROIT OU L'ON PEUT JUGER CE MOT DE PASSE.
     *
     * La base n'en garde qu'une empreinte — c'est tout l'objet d'une empreinte.
     * On ne peut donc pas relire un compte pour savoir si son mot de passe
     * contient une majuscule : il faut le tenir en clair, et ca n'arrive qu'ici.
     *
     * POURQUOI ON LE FAIT. Les regles ont change le 18 septembre 2026, et les
     * comptes existants ne doivent pas se retrouver dehors un matin. Ce drapeau
     * permet de le DIRE a l'ecran et de proposer un changement, sans rien
     * bloquer.
     *
     * ON N'ECRIT QUE SI LA REPONSE A CHANGE. Une connexion par heure sur trois
     * comptes ne justifie pas un `UPDATE` a chaque fois, et surtout : ecrire
     * sans raison ferait de cette colonne un journal de connexions, ce qu'elle
     * n'est pas.
     *
     * ET CA NE PEUT PAS FAIRE ECHOUER LA CONNEXION. On est dans un ecouteur, a
     * un moment ou le mot de passe est deja verifie : une base momentanement
     * indisponible doit couter un avertissement manquant, jamais l'acces au
     * compte.
     */
    private function releverLaForceDuMotDePasse(Utilisateur $utilisateur): void
    {
        $requete = $this->requetes->getCurrentRequest();
        if (null === $requete) {
            return;
        }

        try {
            /** @var array<string, mixed> $corps */
            $corps = $requete->toArray();
            $clair = $corps['motDePasse'] ?? null;
            if (!\is_string($clair) || '' === $clair) {
                return;
            }

            $faible = !MotDePasse::acceptable($clair);
            if ($faible === $utilisateur->isMotDePasseFaible()) {
                return;
            }

            $utilisateur->setMotDePasseFaible($faible);
            $this->em->flush();
        } catch (\Throwable) {
            // Un avertissement manquant ne vaut pas une connexion refusee.
        }
    }

    /**
     * Le client a-t-il demande le mode cookie, dans le corps de sa connexion ?
     *
     * `json_login` a deja lu ce corps pour y prendre l'adresse et le mot de
     * passe ; le relire ici ne coute rien et evite d'ajouter un en-tete, qui
     * aurait demande une entree de plus dans `allow_headers` de CORS.
     *
     * UN CORPS ILLISIBLE REPOND « NON ». On n'arrive pas ici sans que
     * `json_login` ait reussi a lire le corps, donc le cas ne devrait pas
     * exister — mais un « non » rend le jeton dans le corps, c'est-a-dire le
     * comportement d'avant, et non une connexion sans jeton du tout.
     */
    private function parCookie(): bool
    {
        $requete = $this->requetes->getCurrentRequest();
        if (null === $requete) {
            return false;
        }

        try {
            /** @var array<string, mixed> $corps */
            $corps = $requete->toArray();
        } catch (\Throwable) {
            return false;
        }

        return $this->cookie->demande($corps);
    }
}
