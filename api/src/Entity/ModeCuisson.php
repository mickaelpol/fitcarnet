<?php

declare(strict_types=1);

namespace App\Entity;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Annotation\Groups;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * UNE FACON DE CUIRE, PARTAGEE PAR TOUS LES COMPTES.
 *
 * Sert au batch cooking : deux aliments vont dans la meme fournee s'ils
 * pointent la meme ligne d'ici.
 *
 * POURQUOI UNE TABLE PLUTOT QU'UN CHAMP SUR L'ALIMENT
 *
 * Le frigo a DEUX sources — la table `aliment` pour les comptes ordinaires,
 * Grocy pour l'administrateur. Un mode de cuisson pose sur la fiche aurait
 * donc existe en double, avec deux vocabulaires libres de diverger. C'est
 * exactement la structure qui a produit le desastre de `etat_reference` : un
 * meme fait ecrit a deux endroits finit toujours par se contredire, et il
 * faut ensuite du code pour arbitrer. Une table centrale est la meme quelle
 * que soit la provenance de l'aliment.
 *
 * Et le mode de cuisson n'est de toute facon pas une propriete de l'aliment :
 * les memes pommes de terre passent au four un soir et a la vapeur le
 * lendemain. Il se choisit au moment de composer.
 *
 * UNE SEULE COLONNE POUR DECRIRE UNE CUISSON
 *
 * « Four 180 °C » est un libelle, pas un mode plus une temperature. Poser en
 * plus une colonne `degres` reviendrait a ecrire deux fois le meme fait. Le
 * libelle suffit a l'affichage, et l'IDENTIFIANT suffit au regroupement.
 *
 * TOUT LE MONDE LIT, SEUL L'ADMINISTRATEUR ECRIT. Un utilisateur qui veut
 * « plancha » le demande. C'est deliberement plus rigide qu'un champ libre :
 * une liste ouverte finirait avec « four », « Four », « au four » et
 * « four 180 » — quatre fournees la ou il en faut une.
 */
#[ORM\Entity]
#[ORM\Table(name: 'mode_cuisson')]
#[ApiResource(
    operations: [
        new GetCollection(),
        new Get(),
        new Post(security: "is_granted('ROLE_ADMIN')"),
        new Patch(security: "is_granted('ROLE_ADMIN')"),
        new Delete(security: "is_granted('ROLE_ADMIN')"),
    ],
    normalizationContext: ['groups' => ['cuisson:lire']],
    denormalizationContext: ['groups' => ['cuisson:ecrire']],
    security: "is_granted('ROLE_USER')",
    order: ['ordre' => 'ASC', 'libelle' => 'ASC'],
    paginationEnabled: false,
)]
class ModeCuisson
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    #[Groups(['cuisson:lire'])]
    private ?int $id = null;

    /** Ce qu'on lit dans le selecteur : « Vapeur », « Four 180 °C ». */
    #[ORM\Column(type: Types::TEXT)]
    #[Assert\NotBlank]
    #[Assert\Length(max: 40)]
    #[Groups(['cuisson:lire', 'cuisson:ecrire'])]
    private string $libelle = '';

    /**
     * L'ordre d'affichage.
     *
     * On ne trie pas par ordre alphabetique : « Air fryer » n'a aucune raison
     * de passer avant « Vapeur ». Les cuissons les plus courantes en haut.
     */
    #[ORM\Column(type: Types::SMALLINT, options: ['default' => 100])]
    #[Assert\Range(min: 0, max: 999)]
    #[Groups(['cuisson:lire', 'cuisson:ecrire'])]
    private int $ordre = 100;

    public function getId(): ?int { return $this->id; }

    public function getLibelle(): string { return $this->libelle; }

    public function setLibelle(string $v): self
    {
        $this->libelle = \trim($v);

        return $this;
    }

    public function getOrdre(): int { return $this->ordre; }

    public function setOrdre(int $v): self { $this->ordre = $v; return $this; }
}
