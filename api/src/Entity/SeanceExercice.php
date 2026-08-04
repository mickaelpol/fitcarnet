<?php

declare(strict_types=1);

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

/** Un exercice a sa place dans une seance, avec ses series realisees. */
#[ORM\Entity]
#[ORM\Table(name: 'seance_exercice')]
#[ApiResource(operations: [])]
class SeanceExercice
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT)]
    #[Groups(['seance:lire'])]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Seance::class, inversedBy: 'exercices')]
    #[ORM\JoinColumn(name: 'seance_id', nullable: false, onDelete: 'CASCADE')]
    private ?Seance $seance = null;

    #[ORM\ManyToOne(targetEntity: Exercice::class)]
    #[ORM\JoinColumn(name: 'exercice_id', nullable: false)]
    #[Assert\NotNull]
    #[Groups(['seance:lire', 'seance:ecrire'])]
    private ?Exercice $exercice = null;

    #[ORM\Column(type: Types::SMALLINT, options: ['default' => 0])]
    #[Groups(['seance:lire', 'seance:ecrire'])]
    private int $ordre = 0;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Assert\Choice(choices: Exercice::MODES, message: 'Mode attendu : charge, iso ou chrono.')]
    #[Groups(['seance:lire', 'seance:ecrire'])]
    private ?string $mode = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Groups(['seance:lire', 'seance:ecrire'])]
    private ?string $notes = null;

    /** @var Collection<int, Serie> */
    #[ORM\OneToMany(
        targetEntity: Serie::class,
        mappedBy: 'seanceExercice',
        cascade: ['persist', 'remove'],
        orphanRemoval: true,
    )]
    #[ORM\OrderBy(['ordre' => 'ASC'])]
    #[Groups(['seance:lire', 'seance:ecrire'])]
    #[Assert\Valid]
    private Collection $series;

    public function __construct() { $this->series = new ArrayCollection(); }

    public function getId(): ?int { return $this->id; }
    public function getSeance(): ?Seance { return $this->seance; }
    public function setSeance(?Seance $s): self { $this->seance = $s; return $this; }
    public function getExercice(): ?Exercice { return $this->exercice; }
    public function setExercice(?Exercice $e): self { $this->exercice = $e; return $this; }
    public function getOrdre(): int { return $this->ordre; }
    public function setOrdre(int $v): self { $this->ordre = $v; return $this; }
    public function getMode(): ?string { return $this->mode; }
    public function setMode(?string $v): self { $this->mode = $v; return $this; }
    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $v): self { $this->notes = $v; return $this; }

    /** @return Collection<int, Serie> */
    public function getSeries(): Collection { return $this->series; }

    public function addSery(Serie $s): self
    {
        if (!$this->series->contains($s)) {
            $this->series->add($s);
            $s->setSeanceExercice($this);
        }

        return $this;
    }

    public function removeSery(Serie $s): self
    {
        if ($this->series->removeElement($s) && $s->getSeanceExercice() === $this) {
            $s->setSeanceExercice(null);
        }

        return $this;
    }

    /**
     * 1RM estime (Epley) : poids x (1 + 0,0333 x repetitions).
     * Fiable jusqu'a une quinzaine de repetitions, indicatif au-dela.
     */
    #[Groups(['seance:lire'])]
    public function getRmEstime(): ?float
    {
        $meilleur = null;
        foreach ($this->series as $serie) {
            $reps = $serie->getReps();
            $poids = $serie->getPoids();
            if (null === $reps || null === $poids || $reps < 1 || $poids <= 0) {
                continue;
            }
            $rm = $poids * (1 + 0.0333 * $reps);
            if (null === $meilleur || $rm > $meilleur) {
                $meilleur = $rm;
            }
        }

        return null === $meilleur ? null : round($meilleur, 1);
    }
}
