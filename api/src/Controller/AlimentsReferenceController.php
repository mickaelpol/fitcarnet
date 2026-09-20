<?php

declare(strict_types=1);

namespace App\Controller;

use App\Repository\AlimentsReference;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/**
 * Le selecteur « ca ressemble a… ».
 *
 * CATALOGUE PARTAGE, comme les exercices publics et les emplacements : il ne
 * porte aucune donnee de personne, donc rien a filtrer par proprietaire
 * (regle 2). Il reste derriere le pare-feu `api` — un inconnu n'a pas besoin
 * de la table de l'Anses par notre intermediaire, elle est publique chez elle.
 *
 * CE QUE CETTE ROUTE PERMET, ET CE QU'ELLE NE PERMET PAS. Elle sert a
 * RATTACHER un aliment : dire ce qu'il EST, pour savoir a quel repas il
 * convient. Elle rend aussi les valeurs de reference, et c'est assume — mais
 * pour un seul usage, AVERTIR : « tu as saisi 90 kcal, un aliment de ce type
 * en fait ~350, verifie ton etiquette ». Jamais pour remplir un formulaire a
 * la place de quelqu'un. L'etiquette d'un paquet est la verite pour CET
 * aliment (20 septembre 2026, regle 7).
 */
#[Route('/api')]
final class AlimentsReferenceController extends AbstractController
{
    public function __construct(private readonly AlimentsReference $catalogue)
    {
    }

    #[Route('/aliments-reference', methods: ['GET'])]
    #[IsGranted('IS_AUTHENTICATED_FULLY')]
    public function chercher(Request $requete): JsonResponse
    {
        return $this->json([
            'aliments' => $this->catalogue->chercher((string) $requete->query->get('q', '')),
        ]);
    }
}
