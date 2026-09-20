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

    /**
     * Temps total d'un effort chronometre. Coexiste avec les series :
     * un « 100 for time » dure 4:21 ET se compose de 93 rep a 32 kg
     * puis 7 a 35 kg. Les deux comptent dans la progression.
     */
    #[ORM\Column(name: 'secondes_total', nullable: true)]
    #[Assert\PositiveOrZero]
    #[Groups(['seance:lire', 'seance:ecrire'])]
    private ?int $secondesTotal = null;

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
    public function getSecondesTotal(): ?int { return $this->secondesTotal; }
    public function setSecondesTotal(?int $v): self { $this->secondesTotal = $v; return $this; }
    public function setNotes(?string $v): self { $this->notes = $v; return $this; }

    /** @return Collection<int, Serie> */
    /**
     * COMBIEN DE SERIES CE BLOC COMPTE-T-IL DANS L'AVANCEMENT ?
     *
     * C'EST LE SEUL ENDROIT OU LA REGLE DU CHRONO EST ECRITE, depuis le
     * 21 septembre 2026. Un exercice « for time » n'a qu'UN temps total : ses
     * lignes supplementaires ne sont pas des series a faire, meme si elles
     * subsistent a l'ecran.
     *
     * `Seance::getAvancement()` et `Serie::getPoidsDansLAvancement()` s'y
     * ramenent tous les deux — et le second est ce qui permet a l'ecran
     * d'additionner sans connaitre la regle.
     *
     * LE MODE DE LA LIGNE L'EMPORTE sur celui du catalogue : faire un exercice
     * chrono a la charge un jour donne est un choix, et il se respecte. Sans
     * mode nulle part, le repli est « charge », donc le decompte complet —
     * mieux vaut annoncer trop a faire que trop peu.
     */
    public function compteUneSeuleSerie(): bool
    {
        $mode = $this->mode ?? $this->exercice?->getModeDefaut() ?? 'charge';

        return 'chrono' === $mode;
    }

    /**
     * CE QUE PESERAIT UNE SERIE AJOUTEE MAINTENANT DANS CE BLOC.
     *
     * L'ECRAN GARDE UN ETAT LOCAL, avec sauvegarde automatique : une serie
     * qu'on vient d'ajouter n'a pas encore de poids rendu par le serveur, et
     * le compteur doit pourtant bouger tout de suite.
     *
     * Sans ce champ, l'ecran devrait DEDUIRE le poids — c'est-a-dire
     * reecrire la regle du chrono, et le double juge reviendrait par la
     * fenetre. Ici il lit un nombre : zero si ce bloc compte deja sa seule
     * serie, un sinon.
     */
    #[Groups(['seance:lire'])]
    public function getPoidsDUneNouvelleSerie(): int
    {
        return $this->compteUneSeuleSerie() && !$this->series->isEmpty() ? 0 : 1;
    }

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
    public function addSeries(Serie $s): self { return $this->addSery($s); }

    public function removeSeries(Serie $s): self { return $this->removeSery($s); }

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

    /* LE 1RM NE SE CALCULE PLUS ICI — retire le 19 septembre 2026, a la
       demande du proprietaire du projet : « je veux qu'un seul endroit qui
       calcule le 1RM […] si un jour on touche a l'un sans toucher a l'autre il
       va y avoir une divergence sans s'en rendre compte ».

       Cette classe portait `getRmEstime()`, expose en `seance:lire`, avec sa
       propre ecriture d'Epley et son propre plafond de 15 repetitions. Le
       commentaire d'alors assumait la copie et jurait que
       `tests/Entity/RmEstimeTest.php` « la tient alignee » : c'etait faux dans
       un sens, ce test n'eprouvait que le PHP. Deplacer le plafond cote front
       laissait les deux suites vertes et l'API renvoyer un autre chiffre.

       PERSONNE NE LISAIT CE CHAMP. Ni le front — il recalcule tout ce qu'il
       affiche —, ni rien d'autre dans le depot. On retire donc la copie au
       lieu de la synchroniser : `front/src/calcul/performance.ts` est le seul
       domicile de la formule, et `front/src/calcul/epleyUnique.test.ts` refuse
       desormais toute reecriture du coefficient, PHP et SQL compris.

       Si un jour l'API doit rendre ce chiffre a un autre lecteur, ce sera une
       decision a prendre — et il faudra alors un `api/regles/rm.json` lu par
       les deux suites, comme pour le mot de passe et le rendement. */
}
