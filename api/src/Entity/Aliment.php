<?php

declare(strict_types=1);

namespace App\Entity;

use ApiPlatform\Doctrine\Orm\Filter\SearchFilter;
use ApiPlatform\Metadata\ApiFilter;
use ApiPlatform\Metadata\ApiProperty;
use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Delete;
use ApiPlatform\Metadata\Get;
use ApiPlatform\Metadata\GetCollection;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use App\Service\CoherenceNutritionnelle;
use App\Service\RendementPlausible;
use App\State\AlimentProcessor;
use App\State\AlimentSuppressionProcessor;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Serializer\Attribute\Groups;
use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Component\Validator\Context\ExecutionContextInterface;

/**
 * Un aliment d'un compte. Valeurs pour 100 g DU PRODUIT TEL QU'ON LE PESE — riz sec,
 * viande crue, legume cru. C'est la regle 3 du projet, et il n'y a plus d'autre
 * etat : `ratio` n'annonce qu'un POIDS SERVI et n'entre dans aucune macro.
 *
 *  - riz blanc : 350 kcal/100 g au sec, ratio 2.26 (155 kcal une fois cuit)
 *  - volaille  : valeurs crues, ratio 0.75 ; poisson 0.85 — ils PERDENT de l'eau
 *
 * CE COMMENTAIRE A DIT L'INVERSE JUSQU'AU 16 SEPTEMBRE 2026 : « feculents :
 * valeurs CUITES, ratio = cuit/sec (riz 3) ». C'etait la convention abolie
 * avec la colonne `etat_reference` — trois champs pour un seul fait, donc
 * trois facons de se contredire, et un compte qui mangeait jusqu'a trois fois
 * trop de glucides. Le code avait ete refait, pas ce docblock : celui que lit en
 * premier quiconque ecrit un import. Trouve par deux agents de controle le
 * meme jour.
 *
 * Il appartient toujours a un compte, et seul ce compte le voit : ses valeurs
 * sont celles du produit que cette personne a achete.
 */
#[ORM\Entity]
#[ORM\HasLifecycleCallbacks]
#[ORM\Table(name: 'aliment')]
#[ApiResource(
    /* LE SEUL `#[ApiResource]` QUI N'AVAIT PAS DE `security:` DE CLASSE —
       releve le 18 septembre 2026 en confrontant l'API a la documentation
       d'API Platform 4. `Stock`, `Cible`, `Modele`, `PlanRepas` et `Seance`
       l'ont tous ; celui-ci l'avait sur son `Post` seulement.
       RIEN NE FUYAIT : `access_control` ferme `^/api` a
       `IS_AUTHENTICATED_FULLY`, et `FiltreProprietaire` pose son `WHERE` y
       compris sur les operations d'item — un `Get` sur l'aliment d'autrui rend
       404 avant toute evaluation. C'est le motif du jumeau oublie applique a
       la configuration : une regle vraie partout, absente a un endroit, qui
       n'attend qu'un deplacement du filtre pour devenir un trou. */
    security: "is_granted('ROLE_USER')",
    operations: [
        new GetCollection(),
        new Get(),
        new Post(security: "is_granted('ROLE_USER')", processor: AlimentProcessor::class),
        // Chacun corrige et supprime ses propres aliments. `FiltreProprietaire`
        // ne laisse de toute facon charger que les siens : l'expression le
        // redit, pour qu'une regression du filtre ne suffise pas a ouvrir.
        new Patch(
            security: "is_granted('MIEN', object)",
            processor: AlimentProcessor::class,
        ),
        // La suppression est refusee s'il en reste en stock : voir le
        // processeur. Un compte lisant Grocy n'a rien ici — tout s'y passe
        // dans Grocy.
        new Delete(
            security: "is_granted('MIEN', object)",
            processor: AlimentSuppressionProcessor::class,
        ),
    ],
    normalizationContext: ['groups' => ['aliment:lire']],
    denormalizationContext: ['groups' => ['aliment:ecrire']],
    order: ['nom' => 'ASC'],
    paginationItemsPerPage: 200,
)]
#[ApiFilter(SearchFilter::class, properties: ['nom' => 'ipartial', 'categorie' => 'exact', 'codeBarres' => 'exact'])]
class Aliment implements ProprieteUtilisateur
{
    public const CATEGORIES = ['prot', 'fec', 'leg', 'ole', 'huile', 'lait', 'fruit', 'autre'];


    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT)]
    #[Groups(['aliment:lire'])]
    private ?int $id = null;

    /**
     * Pas de « unique: true » ici : l'unicite est PAR COMPTE, portee par
     * l'index fonctionnel `aliment_nom_unique_par_compte` (utilisateur_id,
     * lower(nom)), que Doctrine ne sait pas exprimer. Deux comptes peuvent
     * nommer pareil ; un compte ne le peut pas deux fois.
     *
     * LA `description:` CI-DESSOUS EXISTE POUR NE PAS PUBLIER CE PARAGRAPHE.
     * API Platform prend la premiere ligne du PHPDoc comme description de la
     * propriete dans `/api/docs` : sans elle, le contrat public annoncait
     * « Pas de "unique: true" ici… » et le nom d'un index de la base. Deux
     * publics, deux textes — le PHPDoc pour qui lit le code, `description:`
     * pour qui lit le contrat. Releve par `revue-pile` le 21 septembre 2026.
     */
    #[ApiProperty(description: 'Le nom de l\'aliment. Unique au sein d\'un compte, insensible a la casse.')]
    #[ORM\Column(type: Types::TEXT)]
    #[Assert\NotBlank]
    /* PLAFONDS DE LONGUEUR — CONSTAT F-08, 15 SEPTEMBRE 2026.
       `POST /api/aliments` est ouvert a ROLE_USER, `nom` et `codeBarres` sont
       des `TEXT` : aucune borne, ni ici ni en base. 150 laisse un facteur
       cinq au plus long nom connu, « Skyr d'essai (compte ordinaire) »
       (31 caracteres, `jeu-essai.sql`). Un code-barres EAN-13 en fait 13, un
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

    /**
     * CE QUE CET ALIMENT EST, au sens du catalogue CIQUAL — 20 septembre 2026.
     *
     * Le code Anses, jamais le nom : renommer « Poulet » en « poulets », ou
     * corriger une faute de frappe, ne casse pas le lien. C'est ce qui
     * distingue un rattachement CHOISI d'une correspondance devinee, laquelle
     * rapprocherait un jour « pate » de « pates » sans que personne le voie.
     *
     * IL NE DIT RIEN DES VALEURS CI-DESSOUS. Les macros restent celles lues
     * sur le paquet : « un riz basmati achete par l'utilisateur A peut ne pas
     * avoir les memes macros que celui de l'utilisateur B » (proprietaire du
     * projet, 20 septembre 2026). Ce lien sert a savoir a quel repas l'aliment
     * convient et avec quoi il va — et a AVERTIR quand une saisie s'ecarte
     * tres fortement de la moyenne de son type, jamais a la remplacer.
     *
     * NULLABLE, et ca compte : les aliments d'avant cette date n'en ont pas, et
     * un produit du commerce peut n'avoir aucun equivalent generique — mesure
     * le jour meme, « Orangina » ne trouve rien dans CIQUAL, qui ne porte que
     * des aliments generiques. Un aliment non rattache reste pesable et
     * mangeable ; il n'est simplement pas propose dans un repas.
     *
     * PAS DE RELATION DOCTRINE VERS `aliment_reference` : c'est une colonne
     * TEXTE, et la cle etrangere vit en base (migration 41). `aliment_reference`
     * n'a pas d'entite — comme `invitation` et `inventaire_lot`, elle se lit en
     * SQL par `App\Repository\AlimentsReference`. Lui en donner une obligerait
     * a la charger pour rien a chaque lecture d'aliment.
     */
    #[ORM\Column(name: 'reference_ciqual', type: Types::TEXT, nullable: true)]
    #[Assert\Length(max: 20)]
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    private ?string $referenceCiqual = null;

    /* LES QUATRE MACROS SONT OBLIGATOIRES, ET UN ZÉRO SE DIT — 17 SEPTEMBRE 2026.
       Elles valaient `'0'` par défaut : une clé absente du corps de
       `POST /api/aliments` devenait un zéro enregistré, sans un mot (règle 6).
       Elles partent désormais de `null`, et `NotNull` refuse l'absence en 422,
       avec le même conseil que l'écran. Voir `AlimentMacrosObligatoiresTest`. */
    #[ORM\Column(name: 'kcal_100', type: Types::DECIMAL, precision: 7, scale: 2)]
    #[Assert\NotNull(message: self::MACRO_ABSENTE)]
    #[Assert\PositiveOrZero]
    private ?string $kcal100 = null;

    #[ORM\Column(name: 'prot_100', type: Types::DECIMAL, precision: 6, scale: 2)]
    #[Assert\NotNull(message: self::MACRO_ABSENTE)]
    #[Assert\PositiveOrZero]
    private ?string $prot100 = null;

    #[ORM\Column(name: 'gluc_100', type: Types::DECIMAL, precision: 6, scale: 2)]
    #[Assert\NotNull(message: self::MACRO_ABSENTE)]
    #[Assert\PositiveOrZero]
    private ?string $gluc100 = null;

    #[ORM\Column(name: 'lip_100', type: Types::DECIMAL, precision: 6, scale: 2)]
    #[Assert\NotNull(message: self::MACRO_ABSENTE)]
    #[Assert\PositiveOrZero]
    private ?string $lip100 = null;

    public const MACRO_ABSENTE = 'Valeur manquante : écris 0 si l’aliment n’en contient pas.';

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
    #[Assert\Choice(choices: ['manuel', 'openfoodfacts'])]
    #[Groups(['aliment:lire'])]
    private string $source = 'manuel';

    #[ORM\ManyToOne(targetEntity: Utilisateur::class)]
    #[ORM\JoinColumn(name: 'utilisateur_id', nullable: false, onDelete: 'CASCADE')]
    private ?Utilisateur $utilisateur = null;

    #[ORM\Column(name: 'cree_le', type: Types::DATETIMETZ_IMMUTABLE)]
    private \DateTimeImmutable $creeLe;

    public function __construct() { $this->creeLe = new \DateTimeImmutable(); }

    /*
     * Les groupes des champs decimaux vivent sur les ACCESSEURS, pas sur les
     * proprietes. Doctrine hydrate un DECIMAL en chaine : la propriete est
     * donc typee string, et l'API rendait des chaines la ou le front attend
     * des nombres. Les accesseurs, eux, sont typés float : la LECTURE redevient
     * numerique.
     *
     * LA LECTURE SEULEMENT. Ce commentaire disait « dans les deux sens »
     * jusqu'au 17 septembre 2026, et c'etait faux : `POST /api/aliments`
     * {"kcal100": 350} repondait toujours 400, « must be "string", "integer"
     * given ». Un groupe de serialisation dit QUI est expose, pas SOUS QUEL
     * TYPE — le type vient de `property_info`, ou l'extracteur Doctrine traduit
     * DECIMAL en `string` avant que la reflexion n'ait son mot a dire. Ce qui
     * corrige l'ECRITURE est `App\Metadata\DecimalesNumeriques`, qui declare
     * `float|string` pour toute colonne decimale du modele.
     */
    public function getId(): ?int { return $this->id; }
    public function getNom(): string { return $this->nom; }
    public function setNom(string $v): self { $this->nom = $v; return $this; }
    public function getReferenceCiqual(): ?string { return $this->referenceCiqual; }

    public function setReferenceCiqual(?string $v): self
    {
        /* Une chaine vide n'est pas un rattachement : c'est une absence.
           Regle 6, et sans cela un formulaire vide poserait `''`, que la cle
           etrangere refuserait en parlant de contrainte plutot que de sens. */
        $this->referenceCiqual = '' === $v ? null : $v;

        return $this;
    }

    public function getCategorie(): string { return $this->categorie; }
    public function setCategorie(string $v): self { $this->categorie = $v; return $this; }
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    public function getKcal100(): ?float { return null !== $this->kcal100 ? (float) $this->kcal100 : null; }
    public function setKcal100(float|string|null $v): self { $this->kcal100 = null !== $v ? (string) $v : null; return $this; }
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    public function getProt100(): ?float { return null !== $this->prot100 ? (float) $this->prot100 : null; }
    public function setProt100(float|string|null $v): self { $this->prot100 = null !== $v ? (string) $v : null; return $this; }
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    public function getGluc100(): ?float { return null !== $this->gluc100 ? (float) $this->gluc100 : null; }
    public function setGluc100(float|string|null $v): self { $this->gluc100 = null !== $v ? (string) $v : null; return $this; }
    #[Groups(['aliment:lire', 'aliment:ecrire'])]
    public function getLip100(): ?float { return null !== $this->lip100 ? (float) $this->lip100 : null; }
    public function setLip100(float|string|null $v): self { $this->lip100 = null !== $v ? (string) $v : null; return $this; }
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
    public function getUtilisateur(): ?Utilisateur { return $this->utilisateur; }
    public function setUtilisateur(?Utilisateur $utilisateur): self { $this->utilisateur = $utilisateur; return $this; }
    public function getCreeLe(): \DateTimeImmutable { return $this->creeLe; }

    /**
     * LE RENDEMENT VA-T-IL DANS LE BON SENS ? — pose sur l'ENTITE depuis le
     * 16 septembre 2026, et plus seulement sur l'ecran.
     *
     * `POST /api/aliments` avec un feculent a 0,8 rendait un HTTP 500 portant
     * la requete SQL et la ligne entiere, UUID du proprietaire compris : la
     * contrainte `aliment_ratio_sens` faisait son travail, mais en derniere
     * ligne et sans un mot pour l'appelant. Le correctif pose le matin meme
     * avait grise le bouton cote front — ce qui protege l'application, et rien
     * d'autre : curl, un autre client ou une version en retard le
     * declenchaient encore. Mesure sur l'application qui tourne par l'agent de
     * verification bout en bout, qui a repondu franchement a la question.
     *
     * LA REGLE N'EST PAS REECRITE ICI, ELLE EST APPELEE. `RendementPlausible`
     * la porte depuis le 14 septembre, et `AlimentDisponible` en etait le seul
     * appelant — c'est-a-dire la LECTURE du frigo. Quatre endroits la
     * connaissaient ; le seul branche sur l'ecriture ne la consultait pas.
     * C'est le motif dominant du projet : une decision juste appliquee a un
     * endroit et oubliee a l'autre.
     *
     * `atPath('ratio')` designe le champ fautif et non l'objet entier, pour que
     * le front sache quoi souligner.
     */
    #[Assert\Callback]
    public function verifierLeSensDuRendement(ExecutionContextInterface $contexte): void
    {
        $motif = RendementPlausible::sens($this->categorie, (float) $this->ratio);

        if (null !== $motif) {
            $contexte->buildViolation($motif)->atPath('ratio')->addViolation();
        }
    }

    /**
     * CET ALIMENT SE CONTREDIT-IL LUI-MEME ?
     *
     * Palier 1 du chantier serveur autoritaire, 20 septembre 2026. Jusqu'ici
     * le front seul jugeait : il refusait 90 kcal pour un riz qui en fait 350,
     * et cette entite l'acceptait sans un mot. Un appel direct a l'API, un bug
     * d'ecran, un autre client demain — et la donnee entrait.
     *
     * LA REGLE N'EST PAS REECRITE ICI, ELLE EST APPELEE — comme celle du
     * rendement juste au-dessus. `CoherenceNutritionnelle` la porte, et elle
     * n'a plus de jumeau : l'ecran ne juge plus, il demande son verdict a
     * `POST /api/verification/aliment`. Le `api/regles/coherence.json` qui
     * tenait les deux d'accord est supprime depuis le 20 septembre 2026.
     *
     * ON NE VALIDE QUE SI LES MACROS SONT LA. Un `PATCH` partiel qui ne porte
     * que le nom charge l'entite complete, donc les macros sont renseignees de
     * toute facon ; mais un aliment en cours de construction, macros a `null`,
     * releve d'`Assert\NotNull` et non d'ici. Repondre « incoherent » a une
     * absence serait confondre « je ne sais pas » et « c'est faux » (regle 6).
     *
     * `atPath('kcal100')` designe le champ le plus souvent fautif : c'est
     * celui qu'on recopie de travers sur une etiquette.
     */
    #[Assert\Callback]
    public function verifierLaCoherenceNutritionnelle(ExecutionContextInterface $contexte): void
    {
        if (null === $this->kcal100 || null === $this->prot100
            || null === $this->gluc100 || null === $this->lip100) {
            return;
        }

        $motif = CoherenceNutritionnelle::motifDeRefus(
            $this->categorie,
            (float) $this->kcal100,
            (float) $this->prot100,
            (float) $this->gluc100,
            (float) $this->lip100,
            null === $this->fibres100 ? null : (float) $this->fibres100,
            (float) $this->ratio,
        );

        if (null === $motif || $motif === $this->motifDejaLa) {
            return;
        }

        $contexte->buildViolation($motif)->atPath('kcal100')->addViolation();
    }

    /**
     * CE QUE CETTE LIGNE DISAIT DEJA EN ARRIVANT.
     *
     * RELEVE PAR LE PROPRIETAIRE DU PROJET le 20 septembre 2026, et c'est le
     * faux refus qu'il redoutait. Un `PATCH` revalide l'objet ENTIER : un
     * aliment incoherent deja en base — migre avant que la regle existe —
     * devenait impossible a RENOMMER, refuse sur un champ que personne n'avait
     * touche. Il ne pouvait ni le corriger par petits pas, ni meme le
     * rebaptiser.
     *
     * LA REGLE PORTE SUR CE QU'ON INTRODUIT, PAS SUR CE QU'ON TROUVE. On garde
     * le motif tel qu'il etait AU CHARGEMENT : si le meme motif ressort
     * inchange, c'est qu'on n'a rien aggrave — on laisse passer. Un motif
     * DIFFERENT, lui, est nouveau : une ligne abimee n'est pas un permis de
     * tout ecrire.
     *
     * `PostLoad` et non un service : un validateur a dependance casse les
     * quatorze tests qui montent l'entite sans conteneur. Sur une creation, ce
     * champ reste `null` et tout est nouveau — ce qui est exactement juste.
     */
    #[ORM\PostLoad]
    public function memoriserLesValeursChargees(): void
    {
        if (null === $this->kcal100 || null === $this->prot100
            || null === $this->gluc100 || null === $this->lip100) {
            return;
        }

        $this->motifDejaLa = CoherenceNutritionnelle::motifDeRefus(
            $this->categorie,
            (float) $this->kcal100,
            (float) $this->prot100,
            (float) $this->gluc100,
            (float) $this->lip100,
            null === $this->fibres100 ? null : (float) $this->fibres100,
            (float) $this->ratio,
        );
    }

    /**
     * Le motif que cette ligne portait DEJA, ou `null`.
     *
     * Hors colonne, donc jamais persiste : il ne decrit pas l'aliment mais
     * l'etat dans lequel on l'a trouve.
     */
    private ?string $motifDejaLa = null;
}
