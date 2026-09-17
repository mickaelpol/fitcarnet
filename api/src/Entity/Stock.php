<?php

declare(strict_types=1);

namespace App\Entity;

use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use App\State\ProprietaireProcessor;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

/** « Mon frigo » : ce que possede UN utilisateur. Quantites en grammes. */
#[ORM\Entity]
#[ORM\Table(name: 'stock')]
#[ORM\UniqueConstraint(columns: ['utilisateur_id', 'aliment_id', 'emplacement_id'])]
#[ApiResource(
    operations: [
        new GetCollection(),
        new Get(security: "object.getUtilisateur() == user"),
        new Post(processor: ProprietaireProcessor::class),
        new Patch(security: "object.getUtilisateur() == user", processor: ProprietaireProcessor::class),
        new Delete(security: "object.getUtilisateur() == user"),
    ],
    normalizationContext: ['groups' => ['stock:lire']],
    denormalizationContext: ['groups' => ['stock:ecrire']],
    security: "is_granted('ROLE_USER')",
    paginationItemsPerPage: 300,
)]
#[ApiFilter(SearchFilter::class, properties: ['emplacement' => 'exact', 'aliment' => 'exact'])]
class Stock implements ProprieteUtilisateur
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT)]
    #[Groups(['stock:lire'])]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Utilisateur::class)]
    #[ORM\JoinColumn(name: 'utilisateur_id', nullable: false, onDelete: 'CASCADE')]
    private ?Utilisateur $utilisateur = null;

    #[ORM\ManyToOne(targetEntity: Aliment::class)]
    #[ORM\JoinColumn(name: 'aliment_id', nullable: false)]
    #[Assert\NotNull]
    #[Groups(['stock:lire', 'stock:ecrire'])]
    private ?Aliment $aliment = null;

    #[ORM\ManyToOne(targetEntity: Emplacement::class)]
    #[ORM\JoinColumn(name: 'emplacement_id', nullable: false)]
    #[Assert\NotNull]
    #[Groups(['stock:lire', 'stock:ecrire'])]
    private ?Emplacement $emplacement = null;

    #[ORM\Column(type: Types::DECIMAL, precision: 9, scale: 2, options: ['default' => 0])]
    #[Assert\PositiveOrZero]
    #[Groups(['stock:lire', 'stock:ecrire'])]
    private string $quantite = '0';

    #[ORM\Column(type: Types::DATE_IMMUTABLE, nullable: true)]
    #[Groups(['stock:lire', 'stock:ecrire'])]
    private ?\DateTimeImmutable $peremption = null;

    #[ORM\Column(name: 'maj_le', type: Types::DATETIMETZ_IMMUTABLE)]
    #[Groups(['stock:lire'])]
    private \DateTimeImmutable $majLe;

    public function __construct() { $this->majLe = new \DateTimeImmutable(); }

    public function getId(): ?int { return $this->id; }
    public function getUtilisateur(): ?Utilisateur { return $this->utilisateur; }
    public function setUtilisateur(?Utilisateur $u): self { $this->utilisateur = $u; return $this; }
    public function getAliment(): ?Aliment { return $this->aliment; }
    public function setAliment(?Aliment $a): self { $this->aliment = $a; return $this; }
    public function getEmplacement(): ?Emplacement { return $this->emplacement; }
    public function setEmplacement(?Emplacement $e): self { $this->emplacement = $e; return $this; }
    public function getQuantite(): float { return (float) $this->quantite; }
    public function setQuantite(float|string $q): self
    {
        $this->quantite = (string) $q;
        $this->majLe = new \DateTimeImmutable();
        return $this;
    }
    public function getPeremption(): ?\DateTimeImmutable { return $this->peremption; }
    public function setPeremption(?\DateTimeImmutable $d): self { $this->peremption = $d; return $this; }
    public function getMajLe(): \DateTimeImmutable { return $this->majLe; }
}
