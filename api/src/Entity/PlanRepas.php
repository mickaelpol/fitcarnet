<?php

declare(strict_types=1);

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Post;
use App\State\ProprietaireProcessor;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * UN PLAN DE BATCH COOKING, CONSERVE POUR LE RELIRE.
 *
 * `CALCULATEUR.md` disait « rien n'est enregistre : le plan est un outil
 * d'organisation, pas un journal ». Le batch cooking a rendu cette regle
 * intenable. On cuisine le dimanche pour la semaine ; le jeudi midi, devant
 * sa boite, il faut savoir combien s'en servir. Sans conservation il faudrait
 * recomposer tout le plan ce jeudi-la — avec un frigo qui a change, donc des
 * quantites differentes — pour lire un chiffre decide le dimanche.
 *
 * ON ENREGISTRE UN INSTANTANE, PAS UNE RECETTE A REJOUER.
 *
 * `contenu` porte le RESULTAT deja calcule : des noms d'aliments et des
 * grammes, pas des identifiants. Un plan doit rester lisible meme si un
 * aliment a ete supprime du frigo depuis, et surtout il ne doit PAS se
 * recalculer a la lecture — le jeudi, on ne veut pas savoir ce qu'on
 * cuisinerait aujourd'hui, on veut savoir ce qu'on a cuisine dimanche.
 *
 * D'ou le JSON plutot qu'un schema en cinq tables : ces donnees ne sont
 * jamais requetees par leur contenu, jamais jointes, jamais modifiees ligne a
 * ligne. On les ecrit une fois et on les relit entieres.
 *
 * PAS DE PATCH, VOLONTAIREMENT. Un instantane ne se modifie pas — sinon ce
 * n'en est plus un. On en refait un, et on supprime l'ancien.
 */
#[ORM\Entity]
#[ORM\Table(name: 'plan_repas')]
/* Declare a Doctrine l'index que pose la migration 21. Sans cette ligne,
   `doctrine:schema:update --dump-sql` propose de le SUPPRIMER : il ne le
   connait pas, donc il le croit de trop. Un jour quelqu'un appliquerait la
   suggestion, et la seule requete que cette table sert perdrait son index. */
#[ORM\Index(name: 'plan_repas_par_compte', columns: ['utilisateur_id', 'cree_le'])]
#[ApiResource(
    operations: [
        new GetCollection(),
        new Get(security: 'object.getUtilisateur() == user'),
        new Post(processor: ProprietaireProcessor::class),
        new Delete(security: 'object.getUtilisateur() == user'),
    ],
    normalizationContext: ['groups' => ['plan:lire']],
    denormalizationContext: ['groups' => ['plan:ecrire']],
    security: "is_granted('ROLE_USER')",
    order: ['creeLe' => 'DESC'],
    paginationEnabled: false,
)]
class PlanRepas implements ProprieteUtilisateur
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT)]
    #[Groups(['plan:lire'])]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Utilisateur::class)]
    #[ORM\JoinColumn(name: 'utilisateur_id', nullable: false, onDelete: 'CASCADE')]
    private ?Utilisateur $utilisateur = null;

    /** « Semaine du 11/08 », ou ce que l'utilisateur aura tape. */
    #[ORM\Column(type: Types::TEXT)]
    #[Assert\NotBlank]
    #[Assert\Length(max: 80)]
    #[Groups(['plan:lire', 'plan:ecrire'])]
    private string $libelle = '';

    #[ORM\Column(name: 'cree_le', type: Types::DATETIME_IMMUTABLE)]
    #[Groups(['plan:lire'])]
    private \DateTimeImmutable $creeLe;

    /**
     * L'instantane : courses, fournees et boites, deja calcules.
     *
     * Sa forme appartient a l'ecran qui l'ecrit et le relit. L'API ne
     * l'interprete pas — elle le transporte. Le jour ou cette forme change,
     * les plans deja enregistres restent lisibles par la version de l'ecran
     * qui les a ecrits, et c'est a lui de gerer l'ancien format s'il y tient.
     *
     * @var array<string, mixed>
     */
    /* `jsonb` et non `json` : PostgreSQL le stocke sous forme binaire, ce qui
       le rend indexable et comparable. La migration cree deja un jsonb ; sans
       cette option, Doctrine croit voir un `json` et propose de convertir la
       colonne a chaque verification de schema. */
    #[ORM\Column(type: Types::JSON, options: ['jsonb' => true])]
    #[Groups(['plan:lire', 'plan:ecrire'])]
    private array $contenu = [];

    public function __construct()
    {
        $this->creeLe = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }

    public function getUtilisateur(): ?Utilisateur { return $this->utilisateur; }

    public function setUtilisateur(?Utilisateur $u): self { $this->utilisateur = $u; return $this; }

    public function getLibelle(): string { return $this->libelle; }

    public function setLibelle(string $v): self { $this->libelle = \trim($v); return $this; }

    public function getCreeLe(): \DateTimeImmutable { return $this->creeLe; }

    /** @return array<string, mixed> */
    public function getContenu(): array { return $this->contenu; }

    /** @param array<string, mixed> $v */
    public function setContenu(array $v): self { $this->contenu = $v; return $this; }
}
