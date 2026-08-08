<?php

declare(strict_types=1);

namespace App\EventListener;

use App\Entity\Utilisateur;
use App\Service\JetonsRafraichissement;
use Lexik\Bundle\JWTAuthenticationBundle\Event\AuthenticationSuccessEvent;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;

/**
 * Ajoute un jeton de rafraichissement a la reponse de connexion.
 *
 * On se greffe sur l'evenement de Lexik plutot que d'ecrire notre propre
 * controleur de connexion : le pare-feu `json_login` reste maitre de la
 * verification du mot de passe, on n'en refait pas une deuxieme version qui
 * finirait par diverger.
 */
#[AsEventListener(event: 'lexik_jwt_authentication.on_authentication_success')]
final class AjouterJetonRafraichissement
{
    public function __construct(private readonly JetonsRafraichissement $jetons)
    {
    }

    public function __invoke(AuthenticationSuccessEvent $evenement): void
    {
        $utilisateur = $evenement->getUser();
        if (!$utilisateur instanceof Utilisateur) {
            return;
        }

        $donnees = $evenement->getData();
        $donnees['jetonRafraichissement'] = $this->jetons->creer($utilisateur);
        $evenement->setData($donnees);
    }
}
