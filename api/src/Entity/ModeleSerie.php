<?php

declare(strict_types=1);

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

/** Une serie CIBLE d'un modele : ce qui est prevu, jamais ce qui est realise. */
#[ORM\Entity]
#[ORM\Table(name: 'modele_serie')]
#[ApiResource(operations: [])]
class ModeleSerie
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT)]
    #[Groups(['modele:lire'])]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: ModeleExercice::class, inversedBy: 'series')]
    #[ORM\JoinColumn(name: 'modele_exercice_id', nullable: false, onDelete: 'CASCADE')]
    private ?ModeleExercice $modeleExercice = null;

    #[ORM\Column(type: Types::SMALLINT, options: ['default' => 0])]
    #[Groups(['modele:lire', 'modele:ecrire'])]
    private int $ordre = 0;

    #[ORM\Column(name: 'reps_cible', type: Types::SMALLINT, nullable: true)]
    #[Assert\Range(min: 1, max: 100)]
    #[Groups(['modele:lire', 'modele:ecrire'])]
    private ?int $repsCible = null;

    #[ORM\Column(name: 'poids_cible', type: Types::DECIMAL, precision: 6, scale: 2, nullable: true)]
    #[Assert\PositiveOrZero]
    #[Groups(['modele:lire', 'modele:ecrire'])]
    private ?string $poidsCible = null;

    #[ORM\Column(name: 'secondes_cible', type: Types::INTEGER, nullable: true)]
    #[Assert\PositiveOrZero]
    #[Groups(['modele:lire', 'modele:ecrire'])]
    private ?int $secondesCible = null;

    public function getId(): ?int { return $this->id; }
    public function getModeleExercice(): ?ModeleExercice { return $this->modeleExercice; }
    public function setModeleExercice(?ModeleExercice $me): self { $this->modeleExercice = $me; return $this; }
    public function getOrdre(): int { return $this->ordre; }
    public function setOrdre(int $v): self { $this->ordre = $v; return $this; }
    public function getRepsCible(): ?int { return $this->repsCible; }
    public function setRepsCible(?int $v): self { $this->repsCible = $v; return $this; }
    public function getPoidsCible(): ?float { return null === $this->poidsCible ? null : (float) $this->poidsCible; }
    public function setPoidsCible(float|string|null $v): self { $this->poidsCible = null === $v ? null : (string) $v; return $this; }
    public function getSecondesCible(): ?int { return $this->secondesCible; }
    public function setSecondesCible(?int $v): self { $this->secondesCible = $v; return $this; }
}
