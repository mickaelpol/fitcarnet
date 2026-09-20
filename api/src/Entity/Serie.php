<?php

declare(strict_types=1);

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * Une serie realisee. Conserve le PREVU (champs « cible ») a cote du REALISE,
 * ce qui permet de comparer la seance a son modele sans dupliquer les donnees.
 */
#[ORM\Entity]
#[ORM\Table(name: 'serie')]
#[ApiResource(operations: [])]
class Serie
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT)]
    #[Groups(['seance:lire'])]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: SeanceExercice::class, inversedBy: 'series')]
    #[ORM\JoinColumn(name: 'seance_exercice_id', nullable: false, onDelete: 'CASCADE')]
    private ?SeanceExercice $seanceExercice = null;

    #[ORM\Column(type: Types::SMALLINT, options: ['default' => 0])]
    #[Groups(['seance:lire', 'seance:ecrire'])]
    private int $ordre = 0;

    #[ORM\Column(type: Types::SMALLINT, nullable: true)]
    #[Assert\Range(min: 1, max: 100)]
    #[Groups(['seance:lire', 'seance:ecrire'])]
    private ?int $reps = null;

    #[ORM\Column(type: Types::DECIMAL, precision: 6, scale: 2, nullable: true)]
    #[Assert\PositiveOrZero]
    #[Groups(['seance:lire', 'seance:ecrire'])]
    private ?string $poids = null;

    #[ORM\Column(type: Types::INTEGER, nullable: true)]
    #[Assert\PositiveOrZero]
    #[Groups(['seance:lire', 'seance:ecrire'])]
    private ?int $secondes = null;

    #[ORM\Column(type: Types::BOOLEAN, options: ['default' => false])]
    #[Groups(['seance:lire', 'seance:ecrire'])]
    private bool $faite = false;

    #[ORM\Column(name: 'reps_cible', type: Types::SMALLINT, nullable: true)]
    #[Groups(['seance:lire', 'seance:ecrire'])]
    private ?int $repsCible = null;

    #[ORM\Column(name: 'poids_cible', type: Types::DECIMAL, precision: 6, scale: 2, nullable: true)]
    #[Groups(['seance:lire', 'seance:ecrire'])]
    private ?string $poidsCible = null;

    #[ORM\Column(name: 'secondes_cible', type: Types::INTEGER, nullable: true)]
    #[Groups(['seance:lire', 'seance:ecrire'])]
    private ?int $secondesCible = null;

    public function getId(): ?int { return $this->id; }
    public function getSeanceExercice(): ?SeanceExercice { return $this->seanceExercice; }
    public function setSeanceExercice(?SeanceExercice $se): self { $this->seanceExercice = $se; return $this; }
    public function getOrdre(): int { return $this->ordre; }
    public function setOrdre(int $v): self { $this->ordre = $v; return $this; }
    public function getReps(): ?int { return $this->reps; }
    public function setReps(?int $v): self { $this->reps = $v; return $this; }
    public function getPoids(): ?float { return null === $this->poids ? null : (float) $this->poids; }
    public function setPoids(float|string|null $v): self { $this->poids = null === $v ? null : (string) $v; return $this; }
    public function getSecondes(): ?int { return $this->secondes; }
    public function setSecondes(?int $v): self { $this->secondes = $v; return $this; }
    public function isFaite(): bool { return $this->faite; }
    public function setFaite(bool $v): self { $this->faite = $v; return $this; }
    public function getRepsCible(): ?int { return $this->repsCible; }
    public function setRepsCible(?int $v): self { $this->repsCible = $v; return $this; }
    public function getPoidsCible(): ?float { return null === $this->poidsCible ? null : (float) $this->poidsCible; }
    public function setPoidsCible(float|string|null $v): self { $this->poidsCible = null === $v ? null : (string) $v; return $this; }
    public function getSecondesCible(): ?int { return $this->secondesCible; }
    public function setSecondesCible(?int $v): self { $this->secondesCible = $v; return $this; }
}
