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
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * Un complement alimentaire, rattache a un moment de repas.
 *
 * CE N'EST PAS UN JOURNAL DE PRISES. L'objet ne dit pas « j'ai pris ma
 * creatine ce matin », il dit « avec le repas du matin, il y a 5 g de
 * creatine ». Une consigne, comme une cible macro : elle vaut tous les jours
 * jusqu'a ce qu'on la change, et on la lit au moment de preparer l'assiette.
 *
 * POURQUOI PAS UN `Aliment`. Le solveur ajuste des quantites pour atteindre
 * des macros ; une dose de complement est FIXE et ses macros sont nulles. En
 * faire un aliment donnerait au solveur une variable qu'il n'a pas le droit de
 * bouger, et a l'utilisateur un aliment qu'il ne doit pas peser.
 *
 * La ligne de partage : ce qui se MANGE va dans le frigo — une whey, c'est
 * 24 g de proteines, elle doit entrer dans le calcul. Ce qui s'AVALE vient
 * ici.
 *
 * `ProprieteUtilisateur` : `FiltreProprietaire` restreint alors la collection
 * au compte connecte, sans que cette classe ait un mot a dire. C'est la seule
 * raison pour laquelle `GetCollection` peut rester sans `security` autre que
 * ROLE_USER.
 */
#[ORM\Entity]
#[ORM\Table(name: 'complement')]
#[ApiResource(
    operations: [
        new GetCollection(),
        new Get(security: "object.getUtilisateur() == user"),
        new Post(processor: ProprietaireProcessor::class),
        new Patch(security: "object.getUtilisateur() == user", processor: ProprietaireProcessor::class),
        new Delete(security: "object.getUtilisateur() == user"),
    ],
    normalizationContext: ['groups' => ['complement:lire']],
    denormalizationContext: ['groups' => ['complement:ecrire']],
    security: "is_granted('ROLE_USER')",
    /* Personne n'a trente complements. Paginer une liste de six lignes
       obligerait l'ecran repas a boucler sur les pages pour afficher une
       ligne « + 5 g Creatine ». */
    paginationEnabled: false,
)]
class Complement implements ProprieteUtilisateur
{
    /** Le meme vocabulaire que `Cible` : R1 matin, R2 midi, R3 16h, R4 soir. */
    public const REPAS = Cible::REPAS;

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT)]
    #[Groups(['complement:lire'])]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Utilisateur::class)]
    #[ORM\JoinColumn(name: 'utilisateur_id', nullable: false, onDelete: 'CASCADE')]
    private ?Utilisateur $utilisateur = null;

    #[ORM\Column(type: Types::TEXT)]
    #[Assert\NotBlank(message: 'Donne un nom au complément.')]
    #[Assert\Length(max: 80, maxMessage: 'Le nom fait {{ limit }} caractères au plus.')]
    #[Groups(['complement:lire', 'complement:ecrire'])]
    private string $nom = '';

    /**
     * EN DECIMAL ET NON EN FLOTTANT, comme les macros de `Cible`.
     *
     * Une dose se lit et se recopie depuis une etiquette : 2,5 g doit ressortir
     * 2,5 g, pas 2,4999999. Un flottant n'en donne aucune garantie.
     */
    #[ORM\Column(type: Types::DECIMAL, precision: 10, scale: 2)]
    #[Assert\Positive(message: 'La quantité doit être supérieure à zéro.')]
    #[Groups(['complement:lire', 'complement:ecrire'])]
    private string $quantite = '0';

    /**
     * TEXTE LIBRE, ET C'EST UN CHOIX.
     *
     * g, mg, gelule, dosette, mL, sachet, goutte, cuillere. Toute liste fermee
     * rencontre son cas manquant, et il faut alors redeployer pour ajouter un
     * mot. Ce qu'on perd : impossible de convertir automatiquement. On n'en a
     * pas besoin — personne ne fait la somme de deux complements.
     */
    #[ORM\Column(type: Types::TEXT)]
    #[Assert\NotBlank(message: 'Précise une unité : g, mg, gélule…')]
    #[Assert\Length(max: 20, maxMessage: "L'unité fait {{ limit }} caractères au plus.")]
    #[Groups(['complement:lire', 'complement:ecrire'])]
    private string $unite = 'g';

    #[ORM\Column(type: Types::TEXT)]
    #[Assert\Choice(choices: self::REPAS, message: 'Moment de repas inconnu.')]
    #[Groups(['complement:lire', 'complement:ecrire'])]
    private string $repas = 'R1';

    #[ORM\Column(name: 'cree_le', type: Types::DATETIMETZ_IMMUTABLE)]
    private \DateTimeImmutable $creeLe;

    public function __construct()
    {
        $this->creeLe = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getUtilisateur(): ?Utilisateur { return $this->utilisateur; }
    public function setUtilisateur(?Utilisateur $u): self { $this->utilisateur = $u; return $this; }

    public function getNom(): string { return $this->nom; }
    /* Le nom est nettoye A L'ECRITURE et non a l'affichage : l'index unique
       compare `lower(btrim(nom))`, et deux ecrans qui nettoient chacun a leur
       facon finiraient par ne plus voir le meme doublon que la base. */
    public function setNom(string $n): self { $this->nom = \trim($n); return $this; }

    public function getQuantite(): float { return (float) $this->quantite; }
    public function setQuantite(float|string $v): self { $this->quantite = (string) $v; return $this; }

    public function getUnite(): string { return $this->unite; }
    public function setUnite(string $u): self { $this->unite = \trim($u); return $this; }

    public function getRepas(): string { return $this->repas; }
    public function setRepas(string $r): self { $this->repas = $r; return $this; }

    public function getCreeLe(): \DateTimeImmutable { return $this->creeLe; }
}
