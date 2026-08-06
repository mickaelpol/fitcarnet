<?php

declare(strict_types=1);

namespace App\Dto;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Post;
use App\State\OrdreModeleProcessor;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * Applique l'ordre d'un modele a ses seances.
 *
 * Le modele fait autorite : reorganiser ses exercices reorganise d'un coup
 * toutes les seances correspondantes, y compris les anciennes. C'est un
 * changement d'affichage — aucune serie, aucune charge n'est touchee.
 */
#[ApiResource(
    shortName: 'OrdreModele',
    operations: [
        new Post(
            uriTemplate: '/modeles/{id}/appliquer-ordre',
            security: "is_granted('ROLE_USER')",
            processor: OrdreModeleProcessor::class,
        ),
    ],
    normalizationContext: ['groups' => ['ordre:lire']],
    denormalizationContext: ['groups' => ['ordre:ecrire']],
)]
class OrdreModele
{
    #[Assert\Positive]
    public ?int $id = null;

    /**
     * Sans ce drapeau, l'operation se contente de COMPTER les seances
     * concernees : de quoi afficher « 3 seances seront reorganisees »
     * avant de valider.
     */
    #[Groups(['ordre:ecrire'])]
    public bool $appliquer = false;

    #[Groups(['ordre:lire'])]
    public int $seancesConcernees = 0;

    #[Groups(['ordre:lire'])]
    public int $seancesModifiees = 0;

    #[Groups(['ordre:lire'])]
    public string $message = '';
}
