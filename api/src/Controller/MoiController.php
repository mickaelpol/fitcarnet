<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\Utilisateur;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * QUI SUIS-JE ? UNE QUESTION, UNE ROUTE.
 *
 * CE QUI A RENDU CETTE ROUTE NECESSAIRE — 14 AOUT 2026.
 *
 * L'application le demandait ainsi :
 *
 *     GET /api/utilisateurs   puis   [0]
 *
 * avec, en commentaire, « la collection est filtree sur le compte courant ».
 * Elle ne l'est pas. `FiltreProprietaire` ne restreint que les entites
 * `ProprieteUtilisateur` — les seances, le stock, les objectifs. `Utilisateur`
 * n'en est pas une : c'est le PROPRIETAIRE, pas une propriete. Et
 * `GetCollection` y porte `security: "is_granted('ROLE_ADMIN')"`.
 *
 * Il y avait donc deux comportements, tous deux faux, et aucun ne se voyait
 * tant que l'administrateur etait seul dans la base :
 *
 *   - Pour un ADMINISTRATEUR, la collection rend TOUT LE MONDE. `[0]` est le
 *     premier de la liste, sans ordre garanti. Le 14 aout, un second compte
 *     est apparu avec un identifiant qui precedait celui de l'administrateur :
 *     l'application lui a affiche le nom, l'adresse et les droits de quelqu'un
 *     d'autre. Ses ecrans d'administration, qui se gardent sur `roles`, y ont
 *     lu ROLE_USER et lui ont ferme la porte.
 *
 *   - Pour TOUS LES AUTRES, la collection repond 403. Leur onglet Compte
 *     n'a jamais pu s'afficher.
 *
 * LA LECON N'EST PAS « IL FALLAIT FILTRER LA COLLECTION ». C'est qu'on
 * demandait « qui suis-je » a une route qui repond « qui existe ». La reponse
 * juste dependait alors du nombre de comptes et de l'ordre des lignes — deux
 * choses qui n'ont rien a voir avec la question. Une route qui ne peut rendre
 * qu'une seule personne ne peut pas se tromper de personne.
 *
 * Elle ne remplace pas `/api/utilisateurs` : l'ecran d'administration a
 * toujours besoin de la liste, et c'est bien la liste qu'il demande.
 */
final class MoiController extends AbstractController
{
    /**
     * Le compte connecte, et lui seul.
     *
     * LES CHAMPS SONT ECRITS A LA MAIN, ET C'EST UN CHOIX CONTRE MON PREMIER
     * REFLEXE.
     *
     * J'avais ecrit `$this->json($utilisateur, 200, [], ['groups' => [...]])`,
     * pour reutiliser le groupe `utilisateur:lire` de la ressource et n'avoir
     * qu'une seule definition de la forme. Sauf qu'`Utilisateur` EST une
     * ressource API Platform : ses normaliseurs sont branches sur le
     * serialiseur principal et se saisissent de la classe. Ce que ca rend
     * exactement depuis un controleur ordinaire — avec ou sans `@id`, avec ou
     * sans operation dans le contexte — je ne l'ai pas verifie. Ca marcherait
     * sans doute.
     *
     * « Sans doute » est precisement le mot qui a produit le bug de ce matin :
     * quelqu'un avait ecrit que Grocy menait six appels de front sans jamais
     * le mesurer. Cinq champs ecrits en clair ne peuvent surprendre personne.
     *
     * CE QU'ON PERD, ET C'EST REEL : un champ ajoute a `utilisateur:lire` ne
     * viendra pas ici tout seul. La panne est alors petite et visible — un
     * champ manquant a l'ecran — la ou une serialisation qui derape se voit
     * mal.
     *
     * `roles` passe par `getRoles()` et non par la propriete : c'est lui qui
     * ajoute ROLE_USER. Lire la propriete rendrait `["ROLE_ADMIN"]` seul, et
     * un ecran qui cherche ROLE_USER n'y trouverait rien.
     */
    #[Route('/api/moi', name: 'api_moi', methods: ['GET'])]
    #[IsGranted('ROLE_USER')]
    public function moi(): JsonResponse
    {
        $utilisateur = $this->getUser();
        \assert($utilisateur instanceof Utilisateur);

        return $this->json([
            'id' => (string) $utilisateur->getId(),
            'email' => $utilisateur->getEmail(),
            'nom' => $utilisateur->getNom(),
            'roles' => $utilisateur->getRoles(),
            'sourceFrigo' => $utilisateur->getSourceFrigo(),
            'actif' => $utilisateur->isActif(),
            /* Pose a la DERNIERE CONNEXION, seul moment ou le mot de passe est
               en clair. L'ecran Compte s'en sert pour proposer un changement
               quand les regles ont bouge depuis. Il n'interdit rien. */
            'motDePasseFaible' => $utilisateur->isMotDePasseFaible(),
        ]);
    }
}
