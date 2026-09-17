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
use App\State\ExerciceProcessor;
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
        /* CREER UN EXERCICE EST UN ACTE D'ADMINISTRATION — 15 septembre 2026.
           Cette operation portait `is_granted('ROLE_USER')`, et AUCUN ecran de
           l'application ne l'appelait : zero appelant dans `front/`. Une porte
           ouverte sans usage n'est pas une fonctionnalite en attente, c'est une
           surface a defendre pour rien. Le catalogue est commun, alimente par
           l'import et par l'administrateur.

           CE QUE CE N'ETAIT PAS : une fuite. `ExerciceProcessor` posait deja
           `creePar` et `public = false`, donc un exercice cree par un compte
           ordinaire restait invisible des autres. `Aliment::Post` reste a
           ROLE_USER : la difference n'est pas de securite, elle est d'usage —
           l'ecran des aliments cree, celui des exercices non.

           EN SUSPENS, ET C'EST VOLONTAIRE : `ExerciceProcessor` continue de
           poser `public = false`. Un administrateur qui cree ici obtient donc
           un exercice PRIVE, que lui seul voit — le catalogue commun n'a
           toujours aucun moyen d'etre alimente par l'API. Publier demande
           d'exposer `public` en ecriture, ce qui n'est pas tranche. */
        new Post(security: "is_granted('ROLE_ADMIN')", processor: ExerciceProcessor::class),
        // Corriger un exercice : l'administrateur pour le catalogue commun,
        // l'auteur pour le sien (F-09, voir la clause juste en dessous).
        //
        // CE COMMENTAIRE DISAIT TROIS CHOSES FAUSSES, relevees par la revue le
        // 15 septembre 2026. Il annoncait que le Patch « releve de
        // l'administration » -- la clause l'ouvre a l'auteur depuis F-09 ; qu'un
        // exercice rejoint le catalogue « par ici, `public: true` » -- `public`
        // n'a aucun groupe de serialisation, CE MECANISME N'EXISTE PAS ; et que
        // « le processeur ne touche pas un exercice qui a deja un auteur », qui
        // est la formulation exacte du bug M-01, remplace par
        // `$operation instanceof Post`.
        //
        // Le processeur voisin a ete corrige et celui-ci oublie : le jumeau
        // oublie, applique aux commentaires.
        new Patch(
            /* L'AUTEUR PEUT CORRIGER CE QU'IL A CREE — constat F-09, 15 septembre 2026.
               E8 avait rendu les exercices personnels vraiment prives ; le Patch etant
               reserve a ROLE_ADMIN, plus personne ne pouvait les corriger : l'auteur
               n'avait pas le droit, et l'administrateur ne les voyait plus, `FiltreExercice`
               etant une extension Doctrine qui ignore les roles. */
            security: "is_granted('ROLE_ADMIN') or object.getCreePar() == user",
            processor: ExerciceProcessor::class,
        ),
    ],
    normalizationContext: ['groups' => ['exercice:lire']],
    denormalizationContext: ['groups' => ['exercice:ecrire']],
    // 'perso' passe avant 'import' en ordre décroissant : tes exercices
    // restent en tête, y compris si la collection est paginée.
    //
    // Ce commentaire a longtemps été faux : sans filtrage, `source = 'perso'`
    // remontait les exercices de TOUS les comptes (constat E8). Depuis le
    // 14 septembre 2026, `FiltreExercice` ne laisse passer que le catalogue
    // public et les siens — la phrase redevient exacte.
    order: ['source' => 'DESC', 'nom' => 'ASC'],
    paginationItemsPerPage: 1500,
    // PLUS AUCUN EN-TETE DE CACHE SUR CE CATALOGUE, ET C'EST UNE CORRECTION.
    //
    // Il portait `max_age: 3600`. Consequence : apres qu'un administrateur
    // ajoutait une video ou un nom francais, le navigateur — et OkHttp sur
    // Android — servait pendant UNE HEURE la reponse d'avant, sans jamais
    // redemander. Cote front, React Query invalidait correctement son cache
    // et relancait la requete : elle n'atteignait simplement pas le serveur.
    // La modification etait en base, la fiche l'affichait, la liste montrait
    // l'ancienne version, et rien nulle part ne le disait.
    //
    // DEUX CACHES SUR LA MEME DONNEE, DONT UN QUE PERSONNE NE PEUT VIDER.
    // React Query garde deja le catalogue trente minutes, et la mutation
    // sait le purger — c'est meme la seule raison pour laquelle un ecran se
    // met a jour apres un enregistrement. Le cache HTTP, lui, n'ecoute
    // personne : ni le serveur qui vient d'ecrire, ni l'ecran qui vient de
    // modifier. Entre deux caches, on garde celui qu'on peut invalider.
    //
    // `shared_max_age` part avec, et il ne manquera a personne :
    // `Authorization` figure dans le `vary` global, donc aucun cache partage
    // ne mutualisait quoi que ce soit entre deux porteurs de jetons
    // differents. Il ne rapportait rien — sauf a laisser croire le contraire.
    //
    // CE QUE CA COUTE : une requete de plus toutes les trente minutes par
    // appareil, la ou React Query redemande. C'est le prix d'un ecran qui
    // dit la verite.
)]
#[ApiFilter(SearchFilter::class, properties: [
    'nom' => 'ipartial', 'nomFr' => 'ipartial',
    'partieCorps' => 'exact', 'equipement' => 'exact', 'source' => 'exact',
])]
class Exercice
{
    public const MODES = ['charge', 'iso', 'chrono'];

    /* PLAFONDS DE LONGUEUR — CONSTAT F-08, 15 SEPTEMBRE 2026.
       `POST /api/exercices` est ouvert a ROLE_USER et ces colonnes sont des
       `TEXT` : rien, ni ici ni en base, n'empechait un compte de deposer
       plusieurs mega-octets dans un catalogue servi en UNE page de 1500
       entrees a tout le monde. Degradation de service, pas compromission.

       LES CHIFFRES VIENNENT DES DONNEES, PAS DU POUCE. Pires cas mesures sur
       les 1338 exercices importes : nom 67, nomFr 90, instructions 975,
       musclesSecondaires 56, equipement 20, muscleCible 21, partieCorps 10,
       formatPrescrit 18. Chaque plafond garde au moins un facteur deux de
       marge — un plafond sous la longueur d'une ligne existante rendrait le
       PATCH d'administration impossible sur cette ligne, en designant un
       champ que personne n'a touche. `BornesDesChampsTexteTest` fige les
       deux bouts : le refus du demesure ET l'acceptation du mesure. */

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT)]
    #[Groups(['exercice:lire'])]
    private ?int $id = null;

    #[ORM\Column(type: Types::TEXT, unique: true)]
    #[Assert\NotBlank]
    #[Assert\Length(max: 150, maxMessage: 'Nom trop long : {{ limit }} caractères au plus.')]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private string $nom = '';

    #[ORM\Column(name: 'format_prescrit', type: Types::TEXT, nullable: true)]
    #[Assert\Length(max: 100, maxMessage: 'Format prescrit trop long : {{ limit }} caractères au plus.')]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private ?string $formatPrescrit = null;

    #[ORM\Column(name: 'mode_defaut', type: Types::TEXT, options: ['default' => 'charge'])]
    #[Assert\Choice(choices: self::MODES)]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private string $modeDefaut = 'charge';

    /** Nom francais facultatif ; a defaut, « nom » est affiche. */
    #[ORM\Column(name: 'nom_fr', type: Types::TEXT, nullable: true)]
    #[Assert\Length(max: 150, maxMessage: 'Nom français trop long : {{ limit }} caractères au plus.')]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private ?string $nomFr = null;

    /** Lien YouTube de demonstration, reserve a l'administrateur. */
    #[ORM\Column(name: 'video_url', type: Types::TEXT, nullable: true)]
    /* `requireTld: true` EST POSE EXPLICITEMENT, POUR DEUX RAISONS.
       D'abord parce que c'est la bonne regle ici : ce champ porte un lien de
       demonstration affiche a tout le monde, `https://serveur-interne/x` n'y
       a pas de sens. Ensuite parce que ne rien passer declenche depuis
       Symfony 7.1 une depreciation, et `phpunit.dist.xml` porte
       `failOnDeprecation="true"` : le simple fait de valider un AUTRE champ
       d'`Exercice` dans un test faisait sortir toute la suite en erreur, la
       metadonnee de classe instanciant chaque contrainte. Sans risque sur
       l'existant : la colonne est entierement NULL au 15 septembre 2026. */
    #[Assert\Url(message: 'Adresse de vidéo invalide.', requireTld: true)]
    #[Assert\Length(max: 500, maxMessage: 'Adresse de vidéo trop longue : {{ limit }} caractères au plus.')]
    #[Groups(['exercice:lire', 'exercice:ecrire'])]
    private ?string $videoUrl = null;

    #[ORM\Column(name: 'partie_corps', type: Types::TEXT, nullable: true)]
    #[Assert\Length(max: 100, maxMessage: 'Partie du corps trop longue : {{ limit }} caractères au plus.')]
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
    #[Assert\Length(max: 100, maxMessage: 'Équipement trop long : {{ limit }} caractères au plus.')]
    #[Groups(['exercice:detail', 'exercice:ecrire'])]
    private ?string $equipement = null;

    #[ORM\Column(name: 'muscle_cible', type: Types::TEXT, nullable: true)]
    #[Assert\Length(max: 100, maxMessage: 'Muscle ciblé trop long : {{ limit }} caractères au plus.')]
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
    #[Assert\Length(max: 255, maxMessage: 'Muscles secondaires : {{ limit }} caractères au plus.')]
    #[Groups(['exercice:detail', 'exercice:ecrire'])]
    private ?string $musclesSecondaires = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    #[Assert\Length(max: 4000, maxMessage: 'Instructions trop longues : {{ limit }} caractères au plus.')]
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
