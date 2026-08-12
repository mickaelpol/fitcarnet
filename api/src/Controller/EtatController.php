<?php

declare(strict_types=1);

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

/**
 * « LE SERVEUR REPOND-IL ? » — ET RIEN D'AUTRE.
 *
 * POURQUOI CETTE ROUTE EXISTE
 *
 * L'ecran Compte affiche une pastille verte ou rouge. Pour la remplir, il
 * interrogeait `/api`, la racine d'API Platform — qui etait donc PUBLIQUE.
 * Or cette racine liste toutes les ressources exposees : un inconnu y lisait
 * la carte complete de l'application, sans compte, en une requete.
 *
 * On a donc ferme `/api` et `/api/docs`, et on a mis ici la seule chose dont
 * la pastille avait besoin.
 *
 * CE QU'ELLE NE DIT PAS, ET C'EST VOULU
 *
 * Ni version, ni nom de serveur, ni etat de la base, ni nombre de comptes.
 * Une route de sante publique est une route qu'on peut interroger en boucle
 * sans s'authentifier : tout ce qu'elle rend est offert au premier venu.
 *
 * Elle repond 200 avec `{"ok":true}`. Que le PHP reponde suffit a savoir que
 * le conteneur tourne et que le proxy route correctement — c'est exactement
 * la question que pose la pastille, et rien de plus.
 *
 * Si la base est tombee, cette route repond quand meme : c'est assume. La
 * pastille dit « le serveur est joignable », pas « tout va bien ». Les vraies
 * requetes, elles, echoueront avec un message qui nomme le probleme.
 */
final class EtatController extends AbstractController
{
    #[Route('/api/etat', methods: ['GET'])]
    public function etat(): JsonResponse
    {
        return $this->json(['ok' => true]);
    }
}
