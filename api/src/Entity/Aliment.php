<?php

declare(strict_types=1);

namespace App\Entity;

use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use App\State\AlimentProcessor;
use App\State\AlimentSuppressionProcessor;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * Referentiel COMMUN. Valeurs pour 100 g DU PRODUIT TEL QU'ON LE PESE — riz sec,
 * viande crue, legume cru. C'est la regle 3 du projet, et il n'y a plus d'autre
 * etat : `ratio` n'annonce qu'un POIDS SERVI et n'entre dans aucune macro.
 *
 *  - riz blanc : 350 kcal/100 g au sec, ratio 2.26 (155 kcal une fois cuit)
 *  - volaille  : valeurs crues, ratio 0.75 ; poisson 0.85 — ils PERDENT de l'eau
 *
 * CE COMMENTAIRE A DIT L'INVERSE JUSQU'AU 16 SEPTEMBRE 2026 : « feculents :
 * valeurs CUITES, ratio = cuit/sec (riz 3) ». C'etait la convention abolie par
 * `db/manuel/18-un-seul-etat.sql` — trois champs pour un seul fait, donc trois
 * facons de se contredire, et un compte qui mangeait jusqu'a trois fois trop de
 * glucides. Le code avait ete refait, pas ce docblock : celui que lit en
 * premier quiconque ecrit un import. Trouve par deux agents de controle le
 * meme jour.
 *
 * Tout le monde peut en creer ; personne ne peut en supprimer (integrite du stock).
 */
#[ORM\Entity]
#[ORM\Table(name: 'aliment')]
#[ApiResource(
    operations: [
        new GetCollection(),
        new Get(),
        new Post(security: "is_granted('ROLE_USER')", processor: AlimentProcessor::class),
        // Chacun corrige ses propres aliments ; l'administrateur reste seul
        // a pouvoir toucher aux 50 de reference, qui n'appartiennent a personne.
        // Meme processeur qu'a la creation, mais il regarde l'OPERATION et non
        // l'etat du champ : `$operation instanceof Post`. Ce commentaire disait
        // « il ne pose le proprietaire que s'il manque » -- la formulation exacte
        // du bug M-01, ou corriger un aliment commun se l'appropriait et le
        // retirait a tout le monde. Corrige le 14 septembre 2026, commentaire
        // rectifie le 15. Il rattrape aussi le doublon de nom, aux deux
        // operations.
        new Patch(
            security: "is_granted('ROLE_ADMIN') or object.getCreePar() == user",
            processor: AlimentProcessor::class,
        ),
        // Supprimer n'est possible que sur SES aliments. Un commun ne se
        // supprime jamais : d'autres comptes s'en servent comme reference.
        // Un compte lisant Grocy n'a rien ici — tout s'y passe dans Grocy.
        new Delete(
            security: 'object.getCreePar() == user',
            processor: AlimentSuppressionProcessor::class,
        ),
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

    /**
     * Pas de « unique: true » ici : l'unicite n'est plus globale mais PAR
     * PROPRIETAIRE, portee par deux index partiels que Doctrine ne sait pas
     * exprimer (voir db/manuel/10-aliment-unicite-par-proprietaire.sql).
     * Deux comptes peuvent nommer pareil ; un compte ne le peut pas deux fois.
     */
    #[ORM\Column(type: Types::TEXT)]
    #[Assert\NotBlank]
    /* PLAFONDS DE LONGUEUR — CONSTAT F-08, 15 SEPTEMBRE 2026.
       `POST /api/aliments` est ouvert a ROLE_USER, `nom` et `codeBarres` sont
       des `TEXT` : aucune borne, ni ici ni en base. Les deux plafonds sont
       tires des donnees reelles — pire cas mesure sur les 50 aliments de
       reference : nom 24 caracteres. Un code-barres EAN-13 en fait 13, un
       GTIN-14 quatorze ; 64 laisse la place aux formats exotiques sans
       laisser passer un fichier. Un plafond sous ce que la base porte deja
       rendrait la ligne existante inenregistrable au PATCH. */
    #[Assert\Length(max: 150, maxMessage: 'Nom trop long : {{ limit }} caractères au plus.')]
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    private string $nom = '';

    #[ORM\Column(type: Types::TEXT)]
    #[Assert\Choice(choices: self::CATEGORIES)]
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    private string $categorie = 'autre';

    #[ORM\Column(name: 'kcal_100', type: Types::DECIMAL, precision: 7, scale: 2)]
    #[Assert\PositiveOrZero]
    private string $kcal100 = '0';

    #[ORM\Column(name: 'prot_100', type: Types::DECIMAL, precision: 6, scale: 2)]
    #[Assert\PositiveOrZero]
    private string $prot100 = '0';

    #[ORM\Column(name: 'gluc_100', type: Types::DECIMAL, precision: 6, scale: 2)]
    #[Assert\PositiveOrZero]
    private string $gluc100 = '0';

    #[ORM\Column(name: 'lip_100', type: Types::DECIMAL, precision: 6, scale: 2)]
    #[Assert\PositiveOrZero]
    private string $lip100 = '0';

    /**
     * Fibres pour 100 g, facultatif. Convention europeenne : comptees 2 kcal/g
     * et separees des glucides. Sans elles, le controle « 4·P + 4·G + 2·F + 9·L
     * = kcal » perd sa fiabilite sur les legumes et les cereales completes.
     */
    #[ORM\Column(name: 'fibres_100', type: Types::DECIMAL, precision: 6, scale: 2, nullable: true)]
    #[Assert\PositiveOrZero]
    private ?string $fibres100 = null;

    #[ORM\Column(type: Types::DECIMAL, precision: 5, scale: 3, options: ['default' => 1])]
    #[Assert\Positive]
    private string $ratio = '1';

    /**
     * Les deux pesees ayant servi a mesurer le ratio. NULL quand le ratio vient
     * d'une valeur courante : l'application distingue ainsi une mesure propre au
     * produit d'une estimation generique.
     */
    #[ORM\Column(name: 'pesee_avant', type: Types::DECIMAL, precision: 7, scale: 1, nullable: true)]
    #[Assert\Positive]
    private ?string $peseeAvant = null;

    #[ORM\Column(name: 'pesee_apres', type: Types::DECIMAL, precision: 7, scale: 1, nullable: true)]
    #[Assert\Positive]
    private ?string $peseeApres = null;

    #[ORM\Column(name: 'code_barres', type: Types::TEXT, nullable: true)]
    #[Assert\Length(max: 64, maxMessage: 'Code-barres trop long : {{ limit }} caractères au plus.')]
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

    /*
     * Les groupes des champs decimaux vivent sur les ACCESSEURS, pas sur les
     * proprietes. Doctrine hydrate un DECIMAL en chaine : la propriete est
     * donc typee string, et le serialiseur en deduisait « kcal100 doit etre
     * une chaine » — refusant 150 envoye par l'application, et renvoyant des
     * chaines la ou le front attend des nombres. Les accesseurs, eux, sont
     * typés float : le contrat de l'API redevient numerique dans les deux sens.
     */
    public function getId(): ?int { return $this->id; }
    public function getNom(): string { return $this->nom; }
    public function setNom(string $v): self { $this->nom = $v; return $this; }
    public function getCategorie(): string { return $this->categorie; }
    public function setCategorie(string $v): self { $this->categorie = $v; return $this; }
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    public function getKcal100(): float { return (float) $this->kcal100; }
    public function setKcal100(float|string $v): self { $this->kcal100 = (string) $v; return $this; }
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    public function getProt100(): float { return (float) $this->prot100; }
    public function setProt100(float|string $v): self { $this->prot100 = (string) $v; return $this; }
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    public function getGluc100(): float { return (float) $this->gluc100; }
    public function setGluc100(float|string $v): self { $this->gluc100 = (string) $v; return $this; }
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    public function getLip100(): float { return (float) $this->lip100; }
    public function setLip100(float|string $v): self { $this->lip100 = (string) $v; return $this; }
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    public function getFibres100(): ?float { return null !== $this->fibres100 ? (float) $this->fibres100 : null; }
    public function setFibres100(float|string|null $v): self { $this->fibres100 = null !== $v ? (string) $v : null; return $this; }
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    public function getRatio(): float { return (float) $this->ratio; }
    public function setRatio(float|string $v): self { $this->ratio = (string) $v; return $this; }
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    public function getPeseeAvant(): ?float { return null !== $this->peseeAvant ? (float) $this->peseeAvant : null; }
    public function setPeseeAvant(float|string|null $v): self { $this->peseeAvant = null !== $v ? (string) $v : null; return $this; }
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    public function getPeseeApres(): ?float { return null !== $this->peseeApres ? (float) $this->peseeApres : null; }
    public function setPeseeApres(float|string|null $v): self { $this->peseeApres = null !== $v ? (string) $v : null; return $this; }
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
