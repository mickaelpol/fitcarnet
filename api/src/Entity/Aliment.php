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
use App\State\AlimentProcessor;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * Referentiel COMMUN. Valeurs pour 100 g dans l'etat de reference :
 *  - proteines : valeurs CRUES,  ratio = cuit/cru (0.85 poisson, 0.75 volaille)
 *  - feculents : valeurs CUITES, ratio = cuit/sec (riz 3, patate douce 1)
 * Tout le monde peut en creer ; personne ne peut en supprimer (integrite du stock).
 */
#[ORM\Entity]
#[ORM\Table(name: 'aliment')]
#[ApiResource(
    operations: [
        new GetCollection(),
        new Get(),
        new Post(security: "is_granted('ROLE_USER')", processor: AlimentProcessor::class),
        new Patch(security: "is_granted('ROLE_ADMIN')"),
    ],
    normalizationContext: ['groups' => ['aliment:lire']],
    denormalizationContext: ['groups' => ['aliment:ecrire']],
    order: ['nom' => 'ASC'],
    paginationItemsPerPage: 200,
)]
#[ApiFilter(SearchFilter::class, properties: ['nom' => 'ipartial', 'categorie' => 'exact', 'codeBarres' => 'exact'])]
class Aliment
{
    public const CATEGORIES = ['prot', 'fec', 'leg', 'ole', 'huile', 'lait', 'fruit', 'autre'];

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT)]
    #[Groups(['aliment:lire'])]
    private ?int $id = null;

    #[ORM\Column(type: Types::TEXT, unique: true)]
    #[Assert\NotBlank]
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    private string $nom = '';

    #[ORM\Column(type: Types::TEXT)]
    #[Assert\Choice(choices: self::CATEGORIES)]
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    private string $categorie = 'autre';

    #[ORM\Column(name: 'kcal_100', type: Types::DECIMAL, precision: 7, scale: 2)]
    #[Assert\PositiveOrZero]
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    private string $kcal100 = '0';

    #[ORM\Column(name: 'prot_100', type: Types::DECIMAL, precision: 6, scale: 2)]
    #[Assert\PositiveOrZero]
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    private string $prot100 = '0';

    #[ORM\Column(name: 'gluc_100', type: Types::DECIMAL, precision: 6, scale: 2)]
    #[Assert\PositiveOrZero]
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    private string $gluc100 = '0';

    #[ORM\Column(name: 'lip_100', type: Types::DECIMAL, precision: 6, scale: 2)]
    #[Assert\PositiveOrZero]
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    private string $lip100 = '0';

    /**
     * Fibres pour 100 g, facultatif. Convention europeenne : comptees 2 kcal/g
     * et separees des glucides. Sans elles, le controle « 4·P + 4·G + 2·F + 9·L
     * = kcal » perd sa fiabilite sur les legumes et les cereales completes.
     */
    #[ORM\Column(name: 'fibres_100', type: Types::DECIMAL, precision: 6, scale: 2, nullable: true)]
    #[Assert\PositiveOrZero]
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    private ?string $fibres100 = null;

    #[ORM\Column(type: Types::DECIMAL, precision: 5, scale: 3, options: ['default' => 1])]
    #[Assert\Positive]
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    private string $ratio = '1';

    /**
     * Les deux pesees ayant servi a mesurer le ratio. NULL quand le ratio vient
     * d'une valeur courante : l'application distingue ainsi une mesure propre au
     * produit d'une estimation generique.
     */
    #[ORM\Column(name: 'pesee_avant', type: Types::DECIMAL, precision: 7, scale: 1, nullable: true)]
    #[Assert\Positive]
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    private ?string $peseeAvant = null;

    #[ORM\Column(name: 'pesee_apres', type: Types::DECIMAL, precision: 7, scale: 1, nullable: true)]
    #[Assert\Positive]
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    private ?string $peseeApres = null;

    #[ORM\Column(name: 'etat_reference', type: Types::TEXT, options: ['default' => 'cuit'])]
    #[Assert\Choice(choices: ['cru', 'cuit'])]
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    private string $etatReference = 'cuit';

    #[ORM\Column(name: 'code_barres', type: Types::TEXT, nullable: true)]
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    private ?string $codeBarres = null;

    #[ORM\Column(type: Types::TEXT, options: ['default' => 'manuel'])]
    #[Assert\Choice(choices: ['manuel', 'openfoodfacts', 'reference'])]
    #[Groups(['aliment:lire'])]
    private string $source = 'manuel';

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
    public function getCategorie(): string { return $this->categorie; }
    public function setCategorie(string $v): self { $this->categorie = $v; return $this; }
    public function getKcal100(): float { return (float) $this->kcal100; }
    public function setKcal100(float|string $v): self { $this->kcal100 = (string) $v; return $this; }
    public function getProt100(): float { return (float) $this->prot100; }
    public function setProt100(float|string $v): self { $this->prot100 = (string) $v; return $this; }
    public function getGluc100(): float { return (float) $this->gluc100; }
    public function setGluc100(float|string $v): self { $this->gluc100 = (string) $v; return $this; }
    public function getLip100(): float { return (float) $this->lip100; }
    public function setLip100(float|string $v): self { $this->lip100 = (string) $v; return $this; }
    public function getFibres100(): ?float { return null !== $this->fibres100 ? (float) $this->fibres100 : null; }
    public function setFibres100(float|string|null $v): self { $this->fibres100 = null !== $v ? (string) $v : null; return $this; }
    public function getRatio(): float { return (float) $this->ratio; }
    public function setRatio(float|string $v): self { $this->ratio = (string) $v; return $this; }
    public function getPeseeAvant(): ?float { return null !== $this->peseeAvant ? (float) $this->peseeAvant : null; }
    public function setPeseeAvant(float|string|null $v): self { $this->peseeAvant = null !== $v ? (string) $v : null; return $this; }
    public function getPeseeApres(): ?float { return null !== $this->peseeApres ? (float) $this->peseeApres : null; }
    public function setPeseeApres(float|string|null $v): self { $this->peseeApres = null !== $v ? (string) $v : null; return $this; }
    public function getEtatReference(): string { return $this->etatReference; }
    public function setEtatReference(string $v): self { $this->etatReference = $v; return $this; }
    public function getCodeBarres(): ?string { return $this->codeBarres; }
    public function setCodeBarres(?string $v): self { $this->codeBarres = $v; return $this; }
    public function getSource(): string { return $this->source; }
    public function setSource(string $v): self { $this->source = $v; return $this; }
    public function isPublic(): bool { return $this->public; }
    public function setPublic(bool $v): self { $this->public = $v; return $this; }
    public function getCreePar(): ?Utilisateur { return $this->creePar; }
    public function setCreePar(?Utilisateur $u): self { $this->creePar = $u; return $this; }
    public function getCreeLe(): \DateTimeImmutable { return $this->creeLe; }
}
