<?php

declare(strict_types=1);

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use App\State\UtilisateurProcessor;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Uid\Uuid;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * Un compte. La creation est reservee a l'administrateur.
 * sourceFrigo aiguille le calculateur : 'grocy' pour l'admin, 'base' pour les autres.
 */
#[ORM\Entity]
#[ORM\Table(name: 'utilisateur')]
#[ApiResource(
    operations: [
        new Get(security: "is_granted('ROLE_ADMIN') or object == user"),
        new GetCollection(security: "is_granted('ROLE_ADMIN')"),
        new Post(security: "is_granted('ROLE_ADMIN')", processor: UtilisateurProcessor::class),
        new Patch(
            security: "is_granted('ROLE_ADMIN') or object == user",
            processor: UtilisateurProcessor::class
        ),
    ],
    normalizationContext: ['groups' => ['utilisateur:lire']],
    denormalizationContext: ['groups' => ['utilisateur:ecrire']],
)]
class Utilisateur implements UserInterface, PasswordAuthenticatedUserInterface
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    #[Groups(['utilisateur:lire'])]
    private Uuid $id;

    #[ORM\Column(type: Types::STRING, length: 180, unique: true)]
    #[Assert\NotBlank]
    #[Assert\Email]
    #[Groups(['utilisateur:lire', 'utilisateur:ecrire'])]
    private string $email = '';

    #[ORM\Column(name: 'mot_de_passe', type: Types::TEXT)]
    private string $motDePasse = '';

    /** Mot de passe en clair : jamais persiste, uniquement a la creation ou au changement. */
    #[Assert\Length(min: 10, minMessage: 'Au moins {{ limit }} caracteres.')]
    #[Groups(['utilisateur:ecrire'])]
    private ?string $motDePasseClair = null;

    #[ORM\Column(type: Types::TEXT)]
    #[Assert\NotBlank]
    #[Groups(['utilisateur:lire', 'utilisateur:ecrire'])]
    private string $nom = '';

    #[ORM\Column(type: Types::SIMPLE_ARRAY)]
    #[Groups(['utilisateur:lire'])]
    private array $roles = ['ROLE_USER'];

    #[ORM\Column(name: 'source_frigo', type: Types::TEXT, options: ['default' => 'base'])]
    #[Assert\Choice(choices: ['base', 'grocy'])]
    #[Groups(['utilisateur:lire'])]
    private string $sourceFrigo = 'base';

    #[ORM\Column(type: Types::BOOLEAN, options: ['default' => true])]
    #[Groups(['utilisateur:lire', 'utilisateur:ecrire'])]
    private bool $actif = true;

    #[ORM\Column(name: 'cree_le', type: Types::DATETIME_IMMUTABLE)]
    #[Groups(['utilisateur:lire'])]
    private \DateTimeImmutable $creeLe;

    public function __construct()
    {
        $this->id = Uuid::v4();
        $this->creeLe = new \DateTimeImmutable();
    }

    public function getId(): Uuid { return $this->id; }

    public function getEmail(): string { return $this->email; }
    public function setEmail(string $email): self { $this->email = $email; return $this; }

    public function getPassword(): string { return $this->motDePasse; }
    public function setPassword(string $hash): self { $this->motDePasse = $hash; return $this; }

    public function getMotDePasseClair(): ?string { return $this->motDePasseClair; }
    public function setMotDePasseClair(?string $c): self { $this->motDePasseClair = $c; return $this; }

    public function getNom(): string { return $this->nom; }
    public function setNom(string $nom): self { $this->nom = $nom; return $this; }

    public function getRoles(): array
    {
        $roles = $this->roles;
        $roles[] = 'ROLE_USER';

        return array_values(array_unique($roles));
    }
    public function setRoles(array $roles): self { $this->roles = $roles; return $this; }

    public function getSourceFrigo(): string { return $this->sourceFrigo; }
    public function setSourceFrigo(string $s): self { $this->sourceFrigo = $s; return $this; }

    public function isActif(): bool { return $this->actif; }
    public function setActif(bool $a): self { $this->actif = $a; return $this; }

    public function getCreeLe(): \DateTimeImmutable { return $this->creeLe; }

    public function getUserIdentifier(): string { return $this->email; }
    public function eraseCredentials(): void { $this->motDePasseClair = null; }
}
