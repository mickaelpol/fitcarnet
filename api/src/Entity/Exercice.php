<?php

declare(strict_types=1);

namespace App\Entity;

use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Validator\Constraints\UniqueEntity;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * Referentiel COMMUN d'exercices. Chacun peut en ajouter, tout le monde en profite.
 * formatPrescrit : « 4 s x 12 rep », « 100 for time », « 2 s iso max »...
 */
#[ORM\Entity]
#[ORM\Table(name: 'exercice')]
/*
 * DEUX EXERCICES NE PEUVENT PAS PORTER LE MEME NOM, ET LA BASE LE SAVAIT DEJA.
 *
 * `exercice.nom` est declare UNIQUE dans le schema. Mais rien ne le verifiait
 * AVANT l'ecriture : un POST avec un nom deja pris traversait la validation,
 * atteignait PostgreSQL, et remontait sous forme d'exception de contrainte —
 * pas de 422 lisible, pas de champ designe, juste un echec brut.
 *
 * Et `POST` est ouvert a ROLE_USER : n'importe quel utilisateur pouvait le
 * declencher en ajoutant « Developpe couche », un nom qui existe forcement
 * dans un catalogue de 1338 entrees.
 *
 * COMPARAISON EXACTE, PAS INSENSIBLE A LA CASSE — et c'est deliberatement le
 * meme choix que la contrainte SQL. Refuser ici « developpe couche » quand la
 * base accepterait donnerait deux regles differentes sur la meme question :
 * l'ecran refuserait un nom que la base tolere, et le jour ou l'un des deux
 * change, personne ne saurait lequel fait foi.
 */
#[UniqueEntity(
    fields: ['nom'],
    message: 'Un exercice porte déjà ce nom.',
)]
#[ApiResource(
    operations: [
        new GetCollection(),
        // LA FICHE RENVOIE PLUS QUE LA LISTE, ET C'EST TOUT L'INTERET.
        //
        // `exercice:detail` ajoute les textes longs — instructions, muscles,
        // materiel — a ce que la collection expose deja. Ils ne servent que
        // dans la fiche, ouverte pour UN exercice a la fois ; les livrer avec
        // les 1338 entrees du catalogue revenait a transporter des centaines
        // de kilooctets que personne n'affiche, a chaque chargement.
        new Get(normalizationContext: ['groups' => ['exercice:lire', 'exercice:detail']]),
        new Post(security: "is_granted('ROLE_USER')"),
        // renseigner une vidéo ou un nom français relève de l'administration :
        // le catalogue est commun, une erreur s'afficherait pour tout le monde
        new Patch(security: "is_granted('ROLE_ADMIN')"),
    ],
    normalizationContext: ['groups' => ['exercice:lire']],
    denormalizationContext: ['groups' => ['exercice:ecrire']],
    // 'perso' passe avant 'import' en ordre décroissant : tes exercices
    // restent en tête, y compris si la collection est paginée.
    order: ['source' => 'DESC', 'nom' => 'ASC'],
    paginationItemsPerPage: 1500,
    // UN CATALOGUE QUI CHANGE QUELQUES FOIS PAR AN N'A PAS A ETRE REFABRIQUE
    // A CHAQUE APPEL.
    //
    // Il n'y avait aucun en-tete de cache : chaque requete rehydratait 1338
    // entites et les reserialisait entierement, pour un contenu identique a
    // celui de la veille.
    //
    // `shared_max_age` ne servira toutefois PAS a grand-chose ici tant que
    // `Authorization` figure dans le `vary` global : un cache partage ne
    // mutualise rien entre deux utilisateurs porteurs de jetons differents.
    // Le gain reel est cote client et navigateur — c'est deja l'essentiel,
    // mais autant le savoir plutot que d'attendre un miracle cote serveur.
    cacheHeaders: ['max_age' => 3600, 'shared_max_age' => 86400],
)]
#[ApiFilter(SearchFilter::class, properties: [
    'nom' => 'ipartial', 'nomFr' => 'ipartial',
    'partieCorps' => 'exact', 'equipement' => 'exact', 'source' => 'exact',
])]
class Exercice
{
    public const MODES = ['charge', 'iso', 'chrono'];

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT)]
    #[Groups(['exercice:lire'])]
    private ?int $id = null;

    #[ORM\Column(type: Types::TEXT, unique: true)]
    #[Assert\NotBlank]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private string $nom = '';

    #[ORM\Column(name: 'format_prescrit', type: Types::TEXT, nullable: true)]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private ?string $formatPrescrit = null;

    #[ORM\Column(name: 'mode_defaut', type: Types::TEXT, options: ['default' => 'charge'])]
    #[Assert\Choice(choices: self::MODES)]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private string $modeDefaut = 'charge';

    /** Nom francais facultatif ; a defaut, « nom » est affiche. */
    #[ORM\Column(name: 'nom_fr', type: Types::TEXT, nullable: true)]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private ?string $nomFr = null;

    /** Lien YouTube de demonstration, reserve a l'administrateur. */
    #[ORM\Column(name: 'video_url', type: Types::TEXT, nullable: true)]
    #[Assert\Url(message: 'Adresse de vidéo invalide.')]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private ?string $videoUrl = null;

    #[ORM\Column(name: 'partie_corps', type: Types::TEXT, nullable: true)]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private ?string $partieCorps = null;

    /* LES QUATRE CHAMPS QUI SUIVENT NE PARTENT PLUS AVEC LA COLLECTION.
       Ils passent de `exercice:lire` a `exercice:detail`, servi par la seule
       operation `Get`. Ils ne sont lus que dans la fiche d'un exercice —
       `front/src/composants/modaleExercice.tsx` — ouverte pour un exercice a
       la fois, et `instructions` pese a lui seul plusieurs centaines de
       caracteres multiplies par 1338.

       `exercice:ecrire` est conserve la ou il etait : l'administrateur doit
       toujours pouvoir corriger ces champs. */

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Groups(['exercice:detail', 'exercice:ecrire'])]
    private ?string $equipement = null;

    #[ORM\Column(name: 'muscle_cible', type: Types::TEXT, nullable: true)]
    /**
     * DANS LA LISTE, ET PAS SEULEMENT DANS LA FICHE.
     *
     * Il etait passe en `exercice:detail` avec `instructions` et les textes
     * longs, pour alleger le catalogue de 640 Ko. Le filtre par groupe
     * musculaire l'a fait revenir, et la mesure justifie l'exception :
     * 1338 exercices x une quinzaine de caracteres = 33 Ko, soit 5 % de ce
     * qu'on avait retire.
     *
     * CE QUE CES 33 Ko ACHETENT. L'application charge deja tout le catalogue
     * d'un coup et le garde une demi-heure. Avec ce champ, choisir un muscle
     * filtre INSTANTANEMENT, sans reseau, y compris dans une salle sans
     * couverture. Sans lui, il faudrait un aller-retour a chaque appui sur une
     * vignette — pour une reponse que le telephone avait deja.
     *
     * `musclesSecondaires` RESTE DANS LA FICHE, lui. Filtrer sur le muscle
     * secondaire noierait « Triceps » sous tous les developpes couches, ou
     * ils ne sont que sollicites. On filtre sur ce que l'exercice VISE.
     */
    #[Groups(['exercice:lire', 'exercice:detail', 'exercice:ecrire'])]
    private ?string $muscleCible = null;

    /* MODIFIABLES DEPUIS L'ECRAN D'ADMINISTRATION, comme les quatre autres.
       Ces deux-la etaient en lecture seule : le catalogue importe arrivait en
       anglais et rien ne permettait de le corriger — ni de renseigner un
       exercice ajoute a la main, qui naissait sans aucune de ces donnees. */
    #[ORM\Column(name: 'muscles_secondaires', type: Types::TEXT, nullable: true)]
    #[Groups(['exercice:detail', 'exercice:ecrire'])]
    private ?string $musclesSecondaires = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Groups(['exercice:detail', 'exercice:ecrire'])]
    private ?string $instructions = null;

    /** 'perso' = tes exercices · 'import' = catalogue commun */
    #[ORM\Column(type: Types::TEXT, options: ['default' => 'perso'])]
    #[Groups(['exercice:lire'])]
    private string $source = 'perso';

    #[ORM\Column(name: 'reference_source', type: Types::TEXT, nullable: true)]
    private ?string $referenceSource = null;

    /** @var string[] */
    #[ORM\Column(type: Types::SIMPLE_ARRAY, options: ['default' => ''])]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private array $groupes = [];

    #[ORM\Column(type: Types::BOOLEAN, options: ['default' => true])]
    private bool $public = true;

    #[ORM\ManyToOne(targetEntity: Utilisateur::class)]
    #[ORM\JoinColumn(name: 'cree_par', nullable: true, onDelete: 'SET NULL')]
    private ?Utilisateur $creePar = null;

    #[ORM\Column(name: 'cree_le', type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $creeLe;

    public function __construct() { $this->creeLe = new \DateTimeImmutable(); }

    public function getId(): ?int { return $this->id; }
    public function getNom(): string { return $this->nom; }
    public function setNom(string $v): self { $this->nom = $v; return $this; }
    public function getFormatPrescrit(): ?string { return $this->formatPrescrit; }
    public function setFormatPrescrit(?string $v): self { $this->formatPrescrit = $v; return $this; }
    public function getModeDefaut(): string { return $this->modeDefaut; }
    public function setModeDefaut(string $v): self { $this->modeDefaut = $v; return $this; }
    public function getGroupes(): array { return $this->groupes; }
    public function setGroupes(array $v): self { $this->groupes = $v; return $this; }
    public function isPublic(): bool { return $this->public; }
    public function setPublic(bool $v): self { $this->public = $v; return $this; }
    public function getCreePar(): ?Utilisateur { return $this->creePar; }
    public function setCreePar(?Utilisateur $u): self { $this->creePar = $u; return $this; }
    public function getCreeLe(): \DateTimeImmutable { return $this->creeLe; }

    public function getNomFr(): ?string { return $this->nomFr; }
    public function setNomFr(?string $v): self { $this->nomFr = $v; return $this; }
    public function getVideoUrl(): ?string { return $this->videoUrl; }
    public function setVideoUrl(?string $v): self { $this->videoUrl = $v; return $this; }
    public function getPartieCorps(): ?string { return $this->partieCorps; }
    public function setPartieCorps(?string $v): self { $this->partieCorps = $v; return $this; }
    public function getEquipement(): ?string { return $this->equipement; }
    public function setEquipement(?string $v): self { $this->equipement = $v; return $this; }
    public function getMuscleCible(): ?string { return $this->muscleCible; }
    public function setMuscleCible(?string $v): self { $this->muscleCible = $v; return $this; }
    public function getMusclesSecondaires(): ?string { return $this->musclesSecondaires; }
    public function setMusclesSecondaires(?string $v): self { $this->musclesSecondaires = $v; return $this; }
    public function getInstructions(): ?string { return $this->instructions; }
    public function setInstructions(?string $v): self { $this->instructions = $v; return $this; }
    public function getSource(): string { return $this->source; }
    public function setSource(string $v): self { $this->source = $v; return $this; }
    public function getReferenceSource(): ?string { return $this->referenceSource; }

    /** Le nom a afficher : le francais s'il existe, sinon l'original. */
    #[Groups(['exercice:lire'])]
    public function getNomAffiche(): string
    {
        return $this->nomFr ?? $this->nom;
    }
}
