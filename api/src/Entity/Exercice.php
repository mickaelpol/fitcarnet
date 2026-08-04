<?php

declare(strict_types=1);

namespace App\Entity;

use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * Referentiel COMMUN d'exercices. Chacun peut en ajouter, tout le monde en profite.
 * formatPrescrit : « 4 s x 12 rep », « 100 for time », « 2 s iso max »...
 */
#[ORM\Entity]
#[ORM\Table(name: 'exercice')]
#[ApiResource(
    operations: [
        new GetCollection(),
        new Get(),
        new Post(security: "is_granted('ROLE_USER')"),
        new Patch(security: "is_granted('ROLE_ADMIN')"),
    ],
    normalizationContext: ['groups' => ['exercice:lire']],
    denormalizationContext: ['groups' => ['exercice:ecrire']],
    order: ['nom' => 'ASC'],
    paginationItemsPerPage: 200,
)]
#[ApiFilter(SearchFilter::class, properties: ['nom' => 'ipartial'])]
class Exercice
{
    public const MODES = ['charge', 'iso', 'chrono'];

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT)]
    #[Groups(['exercice:lire'])]
    private ?int $id = null;

    #[ORM\Column(type: Types::TEXT, unique: true)]
    #[Assert\NotBlank]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private string $nom = '';

    #[ORM\Column(name: 'format_prescrit', type: Types::TEXT, nullable: true)]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private ?string $formatPrescrit = null;

    #[ORM\Column(name: 'mode_defaut', type: Types::TEXT, options: ['default' => 'charge'])]
    #[Assert\Choice(choices: self::MODES)]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private string $modeDefaut = 'charge';

    /** @var string[] */
    #[ORM\Column(type: Types::SIMPLE_ARRAY, options: ['default' => ''])]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private array $groupes = [];

    #[ORM\Column(type: Types::BOOLEAN, options: ['default' => true])]
    private bool $public = true;

    #[ORM\ManyToOne(targetEntity: Utilisateur::class)]
    #[ORM\JoinColumn(name: 'cree_par', nullable: true, onDelete: 'SET NULL')]
    private ?Utilisateur $creePar = null;

    #[ORM\Column(name: 'cree_le', type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $creeLe;

    public function __construct() { $this->creeLe = new \DateTimeImmutable(); }

    public function getId(): ?int { return $this->id; }
    public function getNom(): string { return $this->nom; }
    public function setNom(string $v): self { $this->nom = $v; return $this; }
    public function getFormatPrescrit(): ?string { return $this->formatPrescrit; }
    public function setFormatPrescrit(?string $v): self { $this->formatPrescrit = $v; return $this; }
    public function getModeDefaut(): string { return $this->modeDefaut; }
    public function setModeDefaut(string $v): self { $this->modeDefaut = $v; return $this; }
    public function getGroupes(): array { return $this->groupes; }
    public function setGroupes(array $v): self { $this->groupes = $v; return $this; }
    public function isPublic(): bool { return $this->public; }
    public function setPublic(bool $v): self { $this->public = $v; return $this; }
    public function getCreePar(): ?Utilisateur { return $this->creePar; }
    public function setCreePar(?Utilisateur $u): self { $this->creePar = $u; return $this; }
    public function getCreeLe(): \DateTimeImmutable { return $this->creeLe; }
}
