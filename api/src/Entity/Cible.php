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
use App\Service\CoherenceNutritionnelle;
use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Context\ExecutionContextInterface;

/** Cibles macro d'UN repas pour UN utilisateur. R1 matin, R2 midi, R3 16h, R4 soir. */
#[ORM\Entity]
#[ORM\Table(name: 'cible')]
#[ORM\UniqueConstraint(columns: ['utilisateur_id', 'repas'])]
#[ApiResource(
    operations: [
        new GetCollection(),
        new Get(security: "is_granted('MIEN', object)"),
        new Post(processor: ProprietaireProcessor::class),
        new Patch(security: "is_granted('MIEN', object)", processor: ProprietaireProcessor::class),
        new Delete(security: "is_granted('MIEN', object)"),
    ],
    normalizationContext: ['groups' => ['cible:lire']],
    denormalizationContext: ['groups' => ['cible:ecrire']],
    security: "is_granted('ROLE_USER')",
    paginationEnabled: false,
)]
class Cible implements ProprieteUtilisateur
{
    public const REPAS = ['R1', 'R2', 'R3', 'R4'];

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT)]
    #[Groups(['cible:lire'])]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Utilisateur::class)]
    #[ORM\JoinColumn(name: 'utilisateur_id', nullable: false, onDelete: 'CASCADE')]
    private ?Utilisateur $utilisateur = null;

    #[ORM\Column(type: Types::TEXT)]
    #[Assert\Choice(choices: self::REPAS)]
    #[Groups(['cible:lire', 'cible:ecrire'])]
    private string $repas = 'R2';

    #[ORM\Column(type: Types::DECIMAL, precision: 7, scale: 2)]
    #[Assert\PositiveOrZero]
    #[Groups(['cible:lire', 'cible:ecrire'])]
    private string $kcal = '0';

    #[ORM\Column(type: Types::DECIMAL, precision: 6, scale: 2)]
    #[Assert\PositiveOrZero]
    #[Groups(['cible:lire', 'cible:ecrire'])]
    private string $prot = '0';

    #[ORM\Column(type: Types::DECIMAL, precision: 6, scale: 2)]
    #[Assert\PositiveOrZero]
    #[Groups(['cible:lire', 'cible:ecrire'])]
    private string $gluc = '0';

    #[ORM\Column(type: Types::DECIMAL, precision: 6, scale: 2)]
    #[Assert\PositiveOrZero]
    #[Groups(['cible:lire', 'cible:ecrire'])]
    private string $lip = '0';

    /**
     * La cible en glucides comprend-elle les fibres ?
     *
     * Une quantite sans son unite est un bug qui attend son heure. « 61,8 g
     * de glucides » ne veut pas dire la meme chose selon la convention : les
     * plans nord-americains — USDA, Fitlog, MyFitnessPal — y comprennent les
     * fibres, les etiquettes francaises les comptent a part. Huit grammes
     * d'ecart par repas, sans que rien ne le signale.
     *
     * Le drapeau vit ICI et non sur le compte : c'est la cible qui porte son
     * unite, et on peut changer de plan sans que les anciennes valeurs se
     * mettent a vouloir dire autre chose.
     *
     * Faux par defaut : convention europeenne, celle des donnees de l'app.
     */
    #[ORM\Column(name: 'glucides_totaux', type: Types::BOOLEAN, options: ['default' => false])]
    #[Groups(['cible:lire', 'cible:ecrire'])]
    private bool $glucidesTotaux = false;

    public function getId(): ?int { return $this->id; }
    public function getUtilisateur(): ?Utilisateur { return $this->utilisateur; }
    public function setUtilisateur(?Utilisateur $u): self { $this->utilisateur = $u; return $this; }
    public function getRepas(): string { return $this->repas; }
    public function setRepas(string $r): self { $this->repas = $r; return $this; }
    public function isGlucidesTotaux(): bool { return $this->glucidesTotaux; }
    public function setGlucidesTotaux(bool $v): self { $this->glucidesTotaux = $v; return $this; }
    public function getKcal(): float { return (float) $this->kcal; }
    public function setKcal(float|string $v): self { $this->kcal = (string) $v; return $this; }
    public function getProt(): float { return (float) $this->prot; }
    public function setProt(float|string $v): self { $this->prot = (string) $v; return $this; }
    public function getGluc(): float { return (float) $this->gluc; }
    public function setGluc(float|string $v): self { $this->gluc = (string) $v; return $this; }
    public function getLip(): float { return (float) $this->lip; }
    public function setLip(float|string $v): self { $this->lip = (string) $v; return $this; }

    /**
     * CETTE CIBLE EST-ELLE SAISIE EN KILOJOULES ?
     *
     * Palier 1, 20 septembre 2026. C'est la SEULE chose qu'on refuse sur une
     * cible, et le reste est delibere : l'ecran des objectifs affiche « tes
     * grammes representent 1850 calories, pas 2100 » puis, en toutes lettres,
     * « l'app respecte les grammes ; les calories suivent » — et laisse
     * enregistrer. Quelqu'un recopie un plan de coach qui ne tombe pas juste,
     * et on ne lui interdit pas de le saisir. Refuser ici casserait ce
     * parcours.
     *
     * Les kilojoules, eux, ne sont pas une tolerance mais une erreur d'unite :
     * la cible devient quatre fois trop haute et le calculateur vise une
     * journee a 8 000 calories. Le rapport de 4,184 ne se produit pas par
     * hasard.
     *
     * La regle n'est pas reecrite ici, elle est appelee.
     */
    #[Assert\Callback]
    public function verifierLUniteDesCalories(ExecutionContextInterface $contexte): void
    {
        $motif = CoherenceNutritionnelle::motifDeRefusDUneCible(
            $this->getKcal(), $this->getProt(), $this->getGluc(), $this->getLip());

        if (null !== $motif) {
            $contexte->buildViolation($motif)->atPath('kcal')->addViolation();
        }
    }
}
