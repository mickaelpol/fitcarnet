<?php

declare(strict_types=1);

namespace App\Entity;

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

/** Seance type, reutilisable. Lue et ecrite en UN SEUL objet complet. */
#[ORM\Entity]
#[ORM\Table(name: 'modele')]
#[ApiResource(
    operations: [
        new GetCollection(),
        // `or object.isPartage()` A ETE RETIRE ICI (constat F-05, 15 sept. 2026).
        //
        // La clause n'a jamais pu s'appliquer : `FiltreProprietaire` pose
        // « WHERE utilisateur = :moi » dans la requete, donc AVANT que cette
        // expression ne soit evaluee. Un modele partage d'un autre compte
        // n'etait jamais trouve — la reponse etait 404, et l'expression
        // n'etait jamais atteinte. Ce n'etait pas un trou : la fermeture
        // gagnait. C'etait une fonctionnalite morte qui affirmait le
        // contraire, et ce genre d'affirmation finit recopie la ou elle
        // ferait effet.
        //
        // Ouvrir vraiment le partage demanderait de sortir `Modele` du filtre
        // en lecture d'item et de laisser le `security:` decider seul. C'est
        // une decision de produit — la fonctionnalite n'a jamais ete
        // demandee — et elle deplacerait l'isolation d'une extension Doctrine
        // vers une expression de securite : le contraire de ce que ce projet
        // a decide. Tant qu'elle n'est pas prise, l'expression dit la verite.
        //
        // `ModeleExposeTest::testAucuneExpressionDeSecuriteNePrometCeQueLeFiltreInterdit`
        // interdit desormais la rechute, sur cette entite comme sur les autres.
        //
        // LE CHAMP ET LA COLONNE ONT ETE RETIRES le 15 septembre 2026, sur
        // decision du proprietaire : le partage de modele ne doit pas exister
        // dans cette application. Migration `db/manuel/33-...`, doublee dans
        // `db/01-schema.sql`, plus le type et l'appel cote front — les quatre
        // ensemble, parce qu'une moitie de suppression est pire que rien.
        // Aucune donnee perdue : la colonne n'a jamais porte que `false`.
        new Get(security: "object.getUtilisateur() == user"),
        new Post(processor: ProprietaireProcessor::class),
        new Patch(security: "object.getUtilisateur() == user", processor: ProprietaireProcessor::class),
        new Delete(security: "object.getUtilisateur() == user"),
    ],
    normalizationContext: ['groups' => ['modele:lire'], 'skip_null_values' => false],
    denormalizationContext: ['groups' => ['modele:ecrire']],
    security: "is_granted('ROLE_USER')",
    order: ['type' => 'ASC'],
    paginationEnabled: false,
)]
class Modele implements ProprieteUtilisateur
{
    public const TYPES = ['Push', 'Pull', 'Legs'];

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT)]
    #[Groups(['modele:lire'])]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Utilisateur::class)]
    #[ORM\JoinColumn(name: 'utilisateur_id', nullable: false, onDelete: 'CASCADE')]
    private ?Utilisateur $utilisateur = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Groups(['modele:lire', 'modele:ecrire'])]
    private ?string $nom = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Assert\Choice(choices: self::TYPES, message: 'Type attendu : Push, Pull ou Legs.')]
    #[Groups(['modele:lire', 'modele:ecrire'])]
    private ?string $type = null;

    #[ORM\Column(name: 'cree_le', type: Types::DATETIMETZ_IMMUTABLE)]
    #[Groups(['modele:lire'])]
    private \DateTimeImmutable $creeLe;

    /** @var Collection<int, ModeleExercice> */
    #[ORM\OneToMany(
        targetEntity: ModeleExercice::class,
        mappedBy: 'modele',
        cascade: ['persist', 'remove'],
        orphanRemoval: true,
    )]
    #[ORM\OrderBy(['ordre' => 'ASC'])]
    #[Groups(['modele:lire', 'modele:ecrire'])]
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
    public function getNom(): ?string { return $this->nom; }
    public function setNom(?string $v): self { $this->nom = $v; return $this; }
    public function getType(): ?string { return $this->type; }
    public function setType(?string $v): self { $this->type = $v; return $this; }
    public function getCreeLe(): \DateTimeImmutable { return $this->creeLe; }

    /** @return Collection<int, ModeleExercice> */
    public function getExercices(): Collection { return $this->exercices; }

    public function addExercice(ModeleExercice $e): self
    {
        if (!$this->exercices->contains($e)) {
            $this->exercices->add($e);
            $e->setModele($this);
        }

        return $this;
    }

    public function removeExercice(ModeleExercice $e): self
    {
        if ($this->exercices->removeElement($e) && $e->getModele() === $this) {
            $e->setModele(null);
        }

        return $this;
    }
}
