<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\Utilisateur;
use App\Service\Frigo;
use App\Service\FrigoBase;
use App\Service\FrigoGrocy;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Le frigo, quelle que soit sa provenance.
 *
 * Un seul endpoint pour l'application : elle ignore que l'administrateur lit
 * son stock dans Grocy et les autres dans la base. Le solveur recoit la meme
 * forme dans les deux cas.
 */
#[Route('/api')]
#[IsGranted('ROLE_USER')]
final class FrigoController extends AbstractController
{
    public function __construct(
        private readonly Frigo $frigo,
        private readonly FrigoBase $base,
        private readonly FrigoGrocy $grocy,
    ) {
    }

    #[Route('/mon-frigo', methods: ['GET'])]
    public function lire(): JsonResponse
    {
        $utilisateur = $this->utilisateur();

        $probleme = $this->frigo->diagnostic($utilisateur);
        if (null !== $probleme) {
            return $this->json([
                'source' => $this->frigo->source($utilisateur),
                'aliments' => [],
                'probleme' => $probleme,
            ]);
        }

        try {
            $aliments = $this->frigo->lire($utilisateur);
        } catch (\RuntimeException $e) {
            // une panne de Grocy ne doit pas casser l'application : on rend
            // une liste vide et on explique, plutot qu'une erreur 500
            return $this->json([
                'source' => $this->frigo->source($utilisateur),
                'aliments' => [],
                'probleme' => $e->getMessage(),
            ]);
        }

        return $this->json([
            'source' => $this->frigo->source($utilisateur),
            'aliments' => \array_map(
                static fn ($a) => $a->versTableau(), $aliments),
            'probleme' => null,
        ]);
    }

    /** Produits Grocy sans valeurs nutritionnelles : invisibles au calculateur. */
    #[Route('/mon-frigo/incomplets', methods: ['GET'])]
    public function incomplets(): JsonResponse
    {
        if ('grocy' !== $this->frigo->source($this->utilisateur())) {
            return $this->json(['produits' => []]);
        }

        return $this->json(['produits' => $this->grocy->produitsIncomplets()]);
    }

    /** Fixe la quantite d'un aliment. Reserve aux comptes lisant la base. */
    #[Route('/mon-frigo/stock', methods: ['POST'])]
    public function definirStock(Request $requete): JsonResponse
    {
        $utilisateur = $this->utilisateur();

        if ('base' !== $this->frigo->source($utilisateur)) {
            return $this->json([
                'erreur' => 'Tes quantités se modifient dans Grocy, pas ici.',
            ], 409);
        }

        $donnees = (array) \json_decode($requete->getContent(), true);
        $idAliment = (int) ($donnees['alimentId'] ?? 0);
        $quantite = (float) ($donnees['quantite'] ?? 0);

        if ($idAliment <= 0) {
            return $this->json(['erreur' => 'Aliment non précisé.'], 422);
        }
        if ($quantite < 0) {
            return $this->json(['erreur' => 'Une quantité ne peut pas être négative.'], 422);
        }

        $this->base->definirStock(
            $utilisateur, $idAliment, $quantite,
            isset($donnees['emplacementId']) ? (int) $donnees['emplacementId'] : null);

        return $this->json(['ok' => true]);
    }

    private function utilisateur(): Utilisateur
    {
        $utilisateur = $this->getUser();
        \assert($utilisateur instanceof Utilisateur);

        return $utilisateur;
    }
}
