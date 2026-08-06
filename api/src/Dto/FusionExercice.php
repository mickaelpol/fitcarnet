<?php

declare(strict_types=1);

namespace App\Dto;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Post;
use App\State\FusionExerciceProcessor;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * Fusion de deux exercices du catalogue.
 *
 * Reservee a l'administrateur : le catalogue est commun, une fusion
 * modifierait l'historique de tous les utilisateurs.
 */
#[ApiResource(
    shortName: 'FusionExercice',
    operations: [
        new Post(
            uriTemplate: '/exercices/fusion',
            security: "is_granted('ROLE_ADMIN')",
            processor: FusionExerciceProcessor::class,
        ),
    ],
    normalizationContext: ['groups' => ['fusion:lire']],
    denormalizationContext: ['groups' => ['fusion:ecrire']],
)]
class FusionExercice
{
    /** L'exercice qui disparait. */
    #[Assert\NotNull]
    #[Assert\Positive]
    #[Groups(['fusion:ecrire', 'fusion:lire'])]
    public ?int $ancienId = null;

    /** Celui qui le remplace partout. */
    #[Assert\NotNull]
    #[Assert\Positive]
    #[Groups(['fusion:ecrire', 'fusion:lire'])]
    public ?int $nouveauId = null;

    #[Groups(['fusion:lire'])]
    public int $seancesModifiees = 0;

    #[Groups(['fusion:lire'])]
    public int $modelesModifies = 0;

    #[Groups(['fusion:lire'])]
    public string $message = '';
}
