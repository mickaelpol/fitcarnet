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
        // renseigner une vidéo ou un nom français relève de l'administration :
        // le catalogue est commun, une erreur s'afficherait pour tout le monde
        new Patch(security: "is_granted('ROLE_ADMIN')"),
    ],
    normalizationContext: ['groups' => ['exercice:lire']],
    denormalizationContext: ['groups' => ['exercice:ecrire']],
    // 'perso' passe avant 'import' en ordre décroissant : tes exercices
    // restent en tête, y compris si la collection est paginée.
    order: ['source' => 'DESC', 'nom' => 'ASC'],
    paginationItemsPerPage: 1500,
)]
#[ApiFilter(SearchFilter::class, properties: [
    'nom' => 'ipartial', 'nomFr' => 'ipartial',
    'partieCorps' => 'exact', 'equipement' => 'exact', 'source' => 'exact',
])]
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

    /** Nom francais facultatif ; a defaut, « nom » est affiche. */
    #[ORM\Column(name: 'nom_fr', type: Types::TEXT, nullable: true)]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private ?string $nomFr = null;

    /** Lien YouTube de demonstration, reserve a l'administrateur. */
    #[ORM\Column(name: 'video_url', type: Types::TEXT, nullable: true)]
    #[Assert\Url(message: 'Adresse de vidéo invalide.')]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private ?string $videoUrl = null;

    #[ORM\Column(name: 'partie_corps', type: Types::TEXT, nullable: true)]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private ?string $partieCorps = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private ?string $equipement = null;

    #[ORM\Column(name: 'muscle_cible', type: Types::TEXT, nullable: true)]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private ?string $muscleCible = null;

    #[ORM\Column(name: 'muscles_secondaires', type: Types::TEXT, nullable: true)]
    #[Groups(['exercice:lire'])]
    private ?string $musclesSecondaires = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Groups(['exercice:lire'])]
    private ?string $instructions = null;

    /** 'perso' = tes exercices · 'import' = catalogue commun */
    #[ORM\Column(type: Types::TEXT, options: ['default' => 'perso'])]
    #[Groups(['exercice:lire'])]
    private string $source = 'perso';

    #[ORM\Column(name: 'reference_source', type: Types::TEXT, nullable: true)]
    private ?string $referenceSource = null;

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

    public function getNomFr(): ?string { return $this->nomFr; }
    public function setNomFr(?string $v): self { $this->nomFr = $v; return $this; }
    public function getVideoUrl(): ?string { return $this->videoUrl; }
    public function setVideoUrl(?string $v): self { $this->videoUrl = $v; return $this; }
    public function getPartieCorps(): ?string { return $this->partieCorps; }
    public function setPartieCorps(?string $v): self { $this->partieCorps = $v; return $this; }
    public function getEquipement(): ?string { return $this->equipement; }
    public function setEquipement(?string $v): self { $this->equipement = $v; return $this; }
    public function getMuscleCible(): ?string { return $this->muscleCible; }
    public function setMuscleCible(?string $v): self { $this->muscleCible = $v; return $this; }
    public function getMusclesSecondaires(): ?string { return $this->musclesSecondaires; }
    public function setMusclesSecondaires(?string $v): self { $this->musclesSecondaires = $v; return $this; }
    public function getInstructions(): ?string { return $this->instructions; }
    public function setInstructions(?string $v): self { $this->instructions = $v; return $this; }
    public function getSource(): string { return $this->source; }
    public function setSource(string $v): self { $this->source = $v; return $this; }
    public function getReferenceSource(): ?string { return $this->referenceSource; }

    /** Le nom a afficher : le francais s'il existe, sinon l'original. */
    #[Groups(['exercice:lire'])]
    public function getNomAffiche(): string
    {
        return $this->nomFr ?? $this->nom;
    }
}
