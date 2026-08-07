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

/** Un exercice a sa place dans un modele, avec ses series cibles. */
#[ORM\Entity]
#[ORM\Table(name: 'modele_exercice')]
#[ApiResource(operations: [])]   // jamais manipule seul : toujours via le modele
class ModeleExercice
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT)]
    #[Groups(['modele:lire'])]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Modele::class, inversedBy: 'exercices')]
    #[ORM\JoinColumn(name: 'modele_id', nullable: false, onDelete: 'CASCADE')]
    private ?Modele $modele = null;

    #[ORM\ManyToOne(targetEntity: Exercice::class)]
    #[ORM\JoinColumn(name: 'exercice_id', nullable: false)]
    #[Assert\NotNull]
    #[Groups(['modele:lire', 'modele:ecrire'])]
    private ?Exercice $exercice = null;

    #[ORM\Column(type: Types::SMALLINT, options: ['default' => 0])]
    #[Groups(['modele:lire', 'modele:ecrire'])]
    private int $ordre = 0;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Assert\Choice(choices: Exercice::MODES, message: 'Mode attendu : charge, iso ou chrono.')]
    #[Groups(['modele:lire', 'modele:ecrire'])]
    private ?string $mode = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Groups(['modele:lire', 'modele:ecrire'])]
    private ?string $notes = null;

    /** @var Collection<int, ModeleSerie> */
    #[ORM\OneToMany(
        targetEntity: ModeleSerie::class,
        mappedBy: 'modeleExercice',
        cascade: ['persist', 'remove'],
        orphanRemoval: true,
    )]
    #[ORM\OrderBy(['ordre' => 'ASC'])]
    #[Groups(['modele:lire', 'modele:ecrire'])]
    #[Assert\Valid]
    private Collection $series;

    public function __construct() { $this->series = new ArrayCollection(); }

    public function getId(): ?int { return $this->id; }
    public function getModele(): ?Modele { return $this->modele; }
    public function setModele(?Modele $m): self { $this->modele = $m; return $this; }
    public function getExercice(): ?Exercice { return $this->exercice; }
    public function setExercice(?Exercice $e): self { $this->exercice = $e; return $this; }
    public function getOrdre(): int { return $this->ordre; }
    public function setOrdre(int $v): self { $this->ordre = $v; return $this; }
    public function getMode(): ?string { return $this->mode; }
    public function setMode(?string $v): self { $this->mode = $v; return $this; }
    public function getNotes(): ?string { return $this->notes; }
    public function setNotes(?string $v): self { $this->notes = $v; return $this; }

    /** @return Collection<int, ModeleSerie> */
    public function getSeries(): Collection { return $this->series; }

    /**
     * « series » est INVARIABLE en anglais : le desingularisateur de Symfony
     * le rend tel quel, et API Platform cherche donc addSeries()/removeSeries().
     * Seuls addSery()/removeSery() existaient — noms devines a tort. Faute de
     * mutateur reconnu, la collection etait tenue pour non inscriptible et les
     * series envoyees a la creation disparaissaient SANS AUCUNE ERREUR : la
     * reponse renvoyait « series: [] ».
     *
     * On expose les deux noms plutot que de renommer : les appels internes
     * existants continuent de fonctionner.
     */
    public function addSeries(ModeleSerie $s): self { return $this->addSery($s); }

    public function removeSeries(ModeleSerie $s): self { return $this->removeSery($s); }

    public function addSery(ModeleSerie $s): self
    {
        if (!$this->series->contains($s)) {
            $this->series->add($s);
            $s->setModeleExercice($this);
        }

        return $this;
    }

    public function removeSery(ModeleSerie $s): self
    {
        if ($this->series->removeElement($s) && $s->getModeleExercice() === $this) {
            $s->setModeleExercice(null);
        }

        return $this;
    }
}
