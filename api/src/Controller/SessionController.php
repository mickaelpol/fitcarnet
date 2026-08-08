<?php

declare(strict_types=1);

namespace App\Controller;

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
 * L'authentification se fait donc par le seul jeton de rafraichissement,
 * porte dans le corps de la requete et jamais dans l'URL — une URL se
 * retrouve dans les journaux du serveur.
 */
#[Route('/api')]
final class SessionController extends AbstractController
{
    public function __construct(
        private readonly JetonsRafraichissement $jetons,
        private readonly JWTTokenManagerInterface $jwt,
    ) {
    }

    /**
     * Un jeton d'acces neuf, contre un jeton de rafraichissement valide.
     *
     * La reponse renvoie le meme jeton de rafraichissement : le client n'a
     * rien a remplacer, et une reponse perdue en route ne coute qu'un
     * nouvel essai.
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

        $this->jetons->purger();

        return new JsonResponse([
            'token' => $this->jwt->create($utilisateur),
            'jetonRafraichissement' => $fourni,
        ]);
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

        return new Response(null, Response::HTTP_NO_CONTENT);
    }

    private function lireJeton(Request $request): ?string
    {
        try {
            /** @var array<string, mixed> $corps */
            $corps = $request->toArray();
        } catch (\JsonException) {
            return null;
        }

        $jeton = $corps['jetonRafraichissement'] ?? null;

        return \is_string($jeton) && $jeton !== '' ? $jeton : null;
    }

    private function refus(string $message): JsonResponse
    {
        // Meme forme que les erreurs d'API Platform : le front lit « detail »
        // partout ailleurs, il ne doit pas y avoir d'exception ici.
        return new JsonResponse(['detail' => $message], Response::HTTP_UNAUTHORIZED);
    }
}
