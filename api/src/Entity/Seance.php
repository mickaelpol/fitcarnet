<?php

declare(strict_types=1);

namespace App\Entity;

use ApiPlatform\Doctrine\Orm\Filter\DateFilter;
use ApiPlatform\Doctrine\Orm\Filter\OrderFilter;
use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Metadata\ApiFilter;
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
        new Get(security: "object.getUtilisateur() == user"),
        new Post(processor: ProprietaireProcessor::class),
        new Patch(security: "object.getUtilisateur() == user", processor: ProprietaireProcessor::class),
        new Delete(security: "object.getUtilisateur() == user"),
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
     */
    #[Groups(['seance:lire'])]
    public function getAvancement(): array
    {
        $total = 0;
        $faites = 0;

        foreach ($this->exercices as $exercice) {
            $mode = $exercice->getMode() ?? $exercice->getExercice()?->getModeDefaut() ?? 'charge';
            $series = $exercice->getSeries()->toArray();
            if ('chrono' === $mode) {
                $series = \array_slice($series, 0, 1);
            }

            foreach ($series as $serie) {
                ++$total;
                if ($serie->isFaite()) {
                    ++$faites;
                }
            }
        }

        return ['faites' => $faites, 'total' => $total];
    }
}
