<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\JetonRafraichissement;
use App\Entity\Utilisateur;
use App\Service\JetonsRafraichissement;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Uid\Uuid;

/**
 * Voir ses sessions ouvertes, et en couper une.
 *
 * CONSTAT M-02 DE L'AUDIT DU 7 SEPTEMBRE 2026, SECOND VOLET (15 septembre 2026).
 *
 * Le premier volet avait ramene la duree du jeton de rafraichissement d'un an a
 * 90 jours glissants. L'audit disait deja que ce n'etait pas le vrai probleme :
 * « Ce qui manque n'est pas la rotation, c'est la VISIBILITE — rien ne permet
 * de constater ni de couper une session precise. » Les trois leviers qui
 * existaient — deconnexion, changement de mot de passe, desactivation du compte
 * — sont tous « tout ou rien », et supposent qu'on soupconne deja quelque chose.
 *
 * CES ROUTES SONT DANS LE PARE-FEU JWT, ET C'EST TOUTE LA DIFFERENCE AVEC
 * `SessionController`. Ce dernier vit HORS pare-feu, volontairement : on
 * l'appelle quand le jeton d'acces est perime. Ici, au contraire, il faut etre
 * authentifie pour la raison la plus simple qui soit — sans compte identifie,
 * « mes » sessions ne veut rien dire, et la route rendrait celles de tout le
 * monde. Le motif `^/api` du pare-feu `api` les attrape ; les motifs poses avant
 * lui dans `security.yaml` (`session`, `invitation`, `etat`) sont enumeres et ne
 * peuvent pas correspondre a `/api/mes-sessions`. NE PAS ajouter cette route
 * dans le motif du pare-feu `session` en la prenant pour sa voisine.
 *
 * CE QUI NE SORT PAS D'ICI : l'empreinte. Le jeton n'est stocke qu'en SHA-256
 * pour qu'une fuite de la base n'ouvre aucune session ; la rendre au client
 * defairait cette precaution d'un coup. La ligne rendue porte quatre champs,
 * et rien qui permette de reconstituer un jeton.
 */
#[Route('/api/mes-sessions')]
final class MesSessionsController extends AbstractController
{
    public function __construct(private readonly JetonsRafraichissement $jetons)
    {
    }

    #[Route('', name: 'api_mes_sessions_lister', methods: ['GET'])]
    public function lister(): JsonResponse
    {
        return new JsonResponse(\array_map(
            static fn (JetonRafraichissement $jeton): array => [
                'id' => $jeton->getId()->toRfc4122(),
                'creeLe' => $jeton->getCreeLe()->format(\DATE_ATOM),
                'expireLe' => $jeton->getExpireLe()->format(\DATE_ATOM),
                // NULL SE REND TEL QUEL, et l'ecran dira « inconnue ».
                // Les sessions ouvertes avant la migration 32 n'ont pas de
                // derniere utilisation connue ; leur en inventer une serait
                // exactement ce que la regle 6 interdit.
                'vuLe' => $jeton->getVuLe()?->format(\DATE_ATOM),
            ],
            $this->jetons->pour($this->moi()),
        ));
    }

    /**
     * Couper une session precise.
     *
     * MEME REPONSE POUR « CETTE SESSION N'EXISTE PAS » ET « ELLE N'EST PAS A
     * TOI ». Distinguer les deux dirait a un compte quels identifiants de
     * session existent chez les autres. C'est la meme regle que pour
     * `/mon-frigo/stock` : le refus ne doit pas servir d'annuaire.
     *
     * Un identifiant malforme suit le meme chemin, pour la meme raison — la
     * forme de la reponse ne doit rien apprendre non plus.
     */
    #[Route('/{id}', name: 'api_mes_sessions_couper', methods: ['DELETE'])]
    public function couper(string $id): Response
    {
        if (!Uuid::isValid($id)) {
            return $this->introuvable();
        }

        if (!$this->jetons->revoquerPour($this->moi(), Uuid::fromString($id))) {
            return $this->introuvable();
        }

        return new Response(null, Response::HTTP_NO_CONTENT);
    }

    private function introuvable(): JsonResponse
    {
        // Meme forme que les erreurs d'API Platform : le front lit « detail »
        // partout ailleurs, il ne doit pas y avoir d'exception ici.
        return new JsonResponse(
            ['detail' => 'Cette session n\'existe pas.'],
            Response::HTTP_NOT_FOUND,
        );
    }

    private function moi(): Utilisateur
    {
        $u = $this->getUser();
        \assert($u instanceof Utilisateur);

        return $u;
    }
}
