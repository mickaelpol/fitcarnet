<?php

declare(strict_types=1);

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Uid\Uuid;

/**
 * Ce qui garde une session ouverte entre deux jetons d'acces.
 *
 * Le jeton JWT dure une heure : c'est court expres, il n'est ni stockable
 * en base ni revocable, et un jeton vole doit cesser de nuire vite. Le jeton
 * de rafraichissement, lui, vit ici : il est revocable, et c'est ce qui
 * permet a une session de ne se terminer QUE sur un clic « Se deconnecter ».
 *
 * Ce n'est PAS une ressource API Platform : aucune operation ne doit
 * l'exposer, meme en lecture, meme a l'administrateur.
 */
#[ORM\Entity]
#[ORM\Table(name: 'jeton_rafraichissement')]
#[ORM\Index(name: 'idx_jeton_rafraichissement_utilisateur', columns: ['utilisateur_id'])]
class JetonRafraichissement
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    private Uuid $id;

    /**
     * L'EMPREINTE du jeton, jamais le jeton lui-meme.
     *
     * Une fuite de la base ne doit pas livrer des sessions utilisables. Le
     * jeton en clair n'existe donc que dans la reponse HTTP qui le cree et
     * dans le coffre du telephone ; ici on ne garde que son SHA-256, ce qui
     * suffit a le reconnaitre et ne permet pas de le reconstituer.
     */
    #[ORM\Column(type: Types::STRING, length: 64, unique: true)]
    private string $empreinte;

    #[ORM\ManyToOne(targetEntity: Utilisateur::class)]
    #[ORM\JoinColumn(name: 'utilisateur_id', nullable: false, onDelete: 'CASCADE')]
    private Utilisateur $utilisateur;

    #[ORM\Column(name: 'expire_le', type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $expireLe;

    #[ORM\Column(name: 'cree_le', type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $creeLe;

    /**
     * La derniere utilisation — « vu le » du constat M-02.
     *
     * L'ECHEANCE NE LA REMPLACE PAS, contrairement a ce qu'on pourrait croire :
     * `expireLe` est repoussee de 90 jours a chaque usage, donc deux sessions
     * utilisees a un mois d'intervalle affichent la meme chose a un mois pres.
     * Ce qui permet de reconnaitre l'appareil qu'on ne reconnait pas, c'est la
     * date brute du dernier usage.
     *
     * NULLABLE, ET C'EST LE SEUL CAS OU ELLE L'EST : les sessions ouvertes
     * avant la migration 32 n'ont pas de derniere utilisation connue, et « je
     * ne sais pas » ne se remplace pas par une valeur plausible (regle 6). Une
     * session nee apres, elle, porte toujours une date — naitre est un usage.
     */
    #[ORM\Column(name: 'vu_le', type: Types::DATETIME_IMMUTABLE, nullable: true)]
    private ?\DateTimeImmutable $vuLe;

    public function __construct(
        Utilisateur $utilisateur,
        string $empreinte,
        \DateTimeImmutable $expireLe,
    ) {
        $this->id = Uuid::v7();
        $this->utilisateur = $utilisateur;
        $this->empreinte = $empreinte;
        $this->expireLe = $expireLe;
        $this->creeLe = new \DateTimeImmutable();
        // Une session vient d'etre ouverte par une connexion : elle a servi a
        // l'instant meme. Le meme objet que `creeLe`, et non un second appel a
        // l'horloge, pour que les deux dates ne divergent pas d'une microseconde.
        $this->vuLe = $this->creeLe;
    }

    public function getId(): Uuid
    {
        return $this->id;
    }

    public function getUtilisateur(): Utilisateur
    {
        return $this->utilisateur;
    }

    public function getExpireLe(): \DateTimeImmutable
    {
        return $this->expireLe;
    }

    public function getCreeLe(): \DateTimeImmutable
    {
        return $this->creeLe;
    }

    public function getVuLe(): ?\DateTimeImmutable
    {
        return $this->vuLe;
    }

    public function estExpire(): bool
    {
        return $this->expireLe <= new \DateTimeImmutable();
    }

    /**
     * Repousse l'echeance a chaque utilisation, et inscrit cette utilisation.
     *
     * Sans la prolongation, une session finirait par tomber au bout de 90 jours
     * meme sur une application ouverte tous les jours — exactement ce qu'on
     * cherche a eviter. Une application abandonnee, elle, finit bien par expirer.
     *
     * `$maintenant` EST UN PARAMETRE, ET NON `new \DateTimeImmutable()` POSE
     * ICI. Deux raisons, dans cet ordre : l'appelant derive l'echeance du meme
     * instant, donc les deux dates ne peuvent pas se decaler ; et un temoin qui
     * ne peut pas choisir l'instant ne peut pas distinguer « prolonger a ecrit
     * la date » de « le constructeur venait de la poser » — il passerait au vert
     * sur un `prolonger()` qui n'ecrirait rien.
     */
    public function prolonger(\DateTimeImmutable $nouvelle, \DateTimeImmutable $maintenant): void
    {
        $this->expireLe = $nouvelle;
        $this->vuLe = $maintenant;
    }
}
