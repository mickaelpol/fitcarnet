<?php

declare(strict_types=1);

namespace App\Entity;

use ApiPlatform\Doctrine\Orm\Filter\DateFilter;
use ApiPlatform\Doctrine\Orm\Filter\OrderFilter;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Metadata\ApiProperty;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use App\State\ProprietaireProcessor;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * Une seance realisee. Lue et ecrite en UN SEUL objet complet
 * (seance + exercices + series), pour eviter la dizaine d'appels
 * qu'imposeraient des ressources imbriquees.
 */
#[ORM\Entity]
#[ORM\Table(name: 'seance')]
#[ApiResource(
    operations: [
        new GetCollection(),
        new Get(security: "is_granted('MIEN', object)"),
        new Post(processor: ProprietaireProcessor::class),
        new Patch(security: "is_granted('MIEN', object)", processor: ProprietaireProcessor::class),
        new Delete(security: "is_granted('MIEN', object)"),
    ],
    normalizationContext: ['groups' => ['seance:lire'], 'skip_null_values' => false],
    denormalizationContext: ['groups' => ['seance:ecrire']],
    security: "is_granted('ROLE_USER')",
    order: ['date' => 'DESC'],
    paginationItemsPerPage: 30,
)]
#[ApiFilter(DateFilter::class, properties: ['date'])]
#[ApiFilter(SearchFilter::class, properties: ['type' => 'exact'])]
#[ApiFilter(OrderFilter::class, properties: ['date'])]
class Seance implements ProprieteUtilisateur
{
    /**
     * La forme de `avancement`, pour les deux generateurs de schema.
     *
     * Ecrite une fois et citee deux fois plutot que recopiee : c'est la regle 5
     * du projet appliquee a un bout de schema. Deux litteraux identiques dans
     * le meme attribut, c'est deja un jumeau a oublier.
     */
    private const array SCHEMA_AVANCEMENT = [
        'type' => 'object',
        'properties' => [
            'faites' => ['type' => 'integer', 'minimum' => 0],
            'total' => ['type' => 'integer', 'minimum' => 0],
        ],
        'required' => ['faites', 'total'],
    ];

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT)]
    #[Groups(['seance:lire'])]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Utilisateur::class)]
    #[ORM\JoinColumn(name: 'utilisateur_id', nullable: false, onDelete: 'CASCADE')]
    private ?Utilisateur $utilisateur = null;

    #[ORM\Column(type: Types::DATE_IMMUTABLE)]
    #[Assert\NotNull]
    #[Groups(['seance:lire', 'seance:ecrire'])]
    private ?\DateTimeImmutable $date = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Assert\Choice(choices: Modele::TYPES, message: 'Type attendu : Push, Pull ou Legs.')]
    #[Groups(['seance:lire', 'seance:ecrire'])]
    private ?string $type = null;

    #[ORM\ManyToOne(targetEntity: Modele::class)]
    #[ORM\JoinColumn(name: 'modele_id', nullable: true, onDelete: 'SET NULL')]
    #[Groups(['seance:lire', 'seance:ecrire'])]
    private ?Modele $modele = null;

    #[ORM\Column(name: 'cree_le', type: Types::DATETIMETZ_IMMUTABLE)]
    #[Groups(['seance:lire'])]
    private \DateTimeImmutable $creeLe;

    /** @var Collection<int, SeanceExercice> */
    #[ORM\OneToMany(
        targetEntity: SeanceExercice::class,
        mappedBy: 'seance',
        cascade: ['persist', 'remove'],
        orphanRemoval: true,
    )]
    #[ORM\OrderBy(['ordre' => 'ASC'])]
    #[Groups(['seance:lire', 'seance:ecrire'])]
    #[Assert\Valid]
    private Collection $exercices;

    public function __construct()
    {
        $this->creeLe = new \DateTimeImmutable();
        $this->exercices = new ArrayCollection();
    }

    public function getId(): ?int { return $this->id; }
    public function getUtilisateur(): ?Utilisateur { return $this->utilisateur; }
    public function setUtilisateur(?Utilisateur $u): self { $this->utilisateur = $u; return $this; }
    public function getDate(): ?\DateTimeImmutable { return $this->date; }
    public function setDate(?\DateTimeImmutable $d): self { $this->date = $d; return $this; }
    public function getType(): ?string { return $this->type; }
    public function setType(?string $v): self { $this->type = $v; return $this; }
    public function getModele(): ?Modele { return $this->modele; }
    public function setModele(?Modele $m): self { $this->modele = $m; return $this; }
    public function getCreeLe(): \DateTimeImmutable { return $this->creeLe; }

    /** @return Collection<int, SeanceExercice> */
    public function getExercices(): Collection { return $this->exercices; }

    public function addExercice(SeanceExercice $e): self
    {
        if (!$this->exercices->contains($e)) {
            $this->exercices->add($e);
            $e->setSeance($this);
        }

        return $this;
    }

    public function removeExercice(SeanceExercice $e): self
    {
        if ($this->exercices->removeElement($e) && $e->getSeance() === $this) {
            $e->setSeance(null);
        }

        return $this;
    }

    /**
     * Avancement : series faites sur le total.
     *
     * Un exercice « for time » (mode chrono) ne compte que pour UNE serie :
     * il n'a qu'un temps total, meme si des lignes vides subsistent.
     *
     * IL NE REECRIT PAS LA REGLE, IL LA DEMANDE — 21 septembre 2026. Elle vit
     * dans `ModesDeTravail`, et `SeanceExercice::compteUneSeuleSerie()` la lui
     * demande. L'ecran d'une seance obtient la meme reponse par
     * `GET /api/modes-de-travail` : une seule ecriture, deux lecteurs.
     *
     * LE SCHEMA EST ECRIT A LA MAIN parce que PHP ne sait pas le dire. Le type
     * de retour est `array`, et API Platform en deduisait « tableau de
     * string|null » — mesure le 21 septembre 2026 sur `api:openapi:export`.
     * Un client genere depuis ce schema attendait donc une liste de chaines la
     * ou il recoit `{"faites": 3, "total": 4}`. Le PHPDoc `array{}` ne suffit
     * pas : c'est `jsonSchemaContext` que lit le generateur.
     *
     * @return array{faites: int, total: int}
     */
    #[Groups(['seance:lire'])]
    #[ApiProperty(
        description: 'Series faites sur le total. Un exercice chrono ne compte que pour une serie.',
        jsonSchemaContext: self::SCHEMA_AVANCEMENT,
        openapiContext: self::SCHEMA_AVANCEMENT,
    )]
    public function getAvancement(): array
    {
        $total = 0;
        $faites = 0;

        foreach ($this->exercices as $bloc) {
            /* Un « for time » n'a qu'un temps total : seule sa premiere ligne
               compte, les suivantes notent le detail. */
            $comptees = $bloc->compteUneSeuleSerie()
                ? \array_slice($bloc->getSeries()->toArray(), 0, 1)
                : $bloc->getSeries()->toArray();

            $total += \count($comptees);
            foreach ($comptees as $serie) {
                if ($serie->isFaite()) {
                    ++$faites;
                }
            }
        }

        return ['faites' => $faites, 'total' => $total];
    }
}
