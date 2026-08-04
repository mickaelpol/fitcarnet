<?php

declare(strict_types=1);

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;

/** Frigo, congelateur, placard : referentiel fixe, lecture seule via l'API. */
#[ORM\Entity]
#[ORM\Table(name: 'emplacement')]
#[ApiResource(
    operations: [new GetCollection(), new Get()],
    normalizationContext: ['groups' => ['emplacement:lire']],
    order: ['ordre' => 'ASC'],
    paginationEnabled: false,
)]
class Emplacement
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::SMALLINT)]
    #[Groups(['emplacement:lire', 'stock:lire'])]
    private ?int $id = null;

    #[ORM\Column(type: Types::TEXT, unique: true)]
    #[Groups(['emplacement:lire', 'stock:lire'])]
    private string $code = '';

    #[ORM\Column(type: Types::TEXT)]
    #[Groups(['emplacement:lire', 'stock:lire'])]
    private string $libelle = '';

    #[ORM\Column(type: Types::SMALLINT, options: ['default' => 0])]
    #[Groups(['emplacement:lire'])]
    private int $ordre = 0;

    public function getId(): ?int { return $this->id; }
    public function getCode(): string { return $this->code; }
    public function setCode(string $v): self { $this->code = $v; return $this; }
    public function getLibelle(): string { return $this->libelle; }
    public function setLibelle(string $v): self { $this->libelle = $v; return $this; }
    public function getOrdre(): int { return $this->ordre; }
    public function setOrdre(int $v): self { $this->ordre = $v; return $this; }
}
