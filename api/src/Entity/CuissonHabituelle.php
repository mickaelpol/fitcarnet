<?php

declare(strict_types=1);

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

/**
 * COMMENT CE COMPTE CUIT CET ALIMENT, D'HABITUDE.
 *
 * Un defaut, rien de plus. A la composition d'un repas, l'ecran pre-remplit
 * les cuissons a partir d'ici ; l'utilisateur change ce qu'il veut, et sa
 * correction du jour ne devient une habitude que s'il la garde. Sans cela il
 * redit chaque semaine que le riz passe a l'eau — une trentaine de choix a
 * refaire, et les memes que la semaine derniere.
 *
 * PAS D'API PLATFORM SUR CETTE ENTITE, VOLONTAIREMENT.
 *
 * La seule ecriture qui ait un sens ici est un REMPLACEMENT par cle naturelle
 * (compte + aliment) : « desormais, mon riz passe a l'eau ». Ce n'est ni un
 * POST — qui empilerait, ou echouerait sur l'index unique des la deuxieme
 * fois — ni un PATCH, qui supposerait qu'on connaisse deja l'identifiant de
 * la ligne alors qu'on ne connait que le nom de l'aliment. Faire semblant de
 * REST couterait a l'ecran un aller-retour de lecture avant chaque ecriture,
 * et une gestion de conflit pour un cas qui n'en est pas un.
 *
 * `CuissonsController` expose donc un `PUT /api/mes-cuissons` qui dit ce
 * qu'il fait : voila l'etat, ecris-le.
 *
 * Cette classe reste mappee pour une seule raison, mais elle est bonne :
 * Doctrine doit SAVOIR que cette table existe. Une table qu'il ne connait pas
 * est une table qu'un `schema:update --complete` propose de supprimer, et
 * quelqu'un finit toujours par appliquer la suggestion.
 */
#[ORM\Entity]
#[ORM\Table(name: 'cuisson_habituelle')]
#[ORM\UniqueConstraint(name: 'cuisson_habituelle_unique', columns: ['utilisateur_id', 'aliment'])]
class CuissonHabituelle
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT)]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Utilisateur::class)]
    #[ORM\JoinColumn(name: 'utilisateur_id', nullable: false, onDelete: 'CASCADE')]
    private ?Utilisateur $utilisateur = null;

    /**
     * Le nom de l'aliment, NORMALISE PAR L'ECRAN.
     *
     * C'est la seule cle que les deux frigos aient en commun : un aliment
     * Grocy porte « grocy:12 », un aliment de la base porte un entier, et ces
     * deux mondes n'ont aucun identifiant partage. Le nom, lui, en est un.
     *
     * Ici, c'est une chaine OPAQUE. L'API ne la lit pas, ne la compare pas,
     * ne la normalise pas : elle la transporte. La regle de normalisation
     * doit etre la meme a l'ecriture et a la lecture, donc elle est ecrite
     * UNE FOIS, la ou les deux se font — dans l'ecran. L'ecrire aussi ici,
     * c'est se donner deux regles libres de diverger, et le jour ou elles
     * divergent l'habitude s'ecrit sous une cle et se cherche sous une autre.
     * Meme raisonnement que le `contenu` des plans enregistres.
     */
    #[ORM\Column(type: Types::TEXT)]
    private string $aliment = '';

    /**
     * NULL veut dire « se mange sans cuisson », et c'est une reponse.
     *
     * `onDelete: CASCADE` et non `SET NULL` : si l'administrateur supprime
     * « Eau bouillante », le riz qui la visait ne doit PAS se retrouver a
     * NULL — il serait pre-rempli « sans cuisson », c'est-a-dire une reponse
     * fausse et muette, decouverte devant la boite. La ligne s'en va, l'ecran
     * repose la question. Une question de trop coute un geste ; une reponse
     * fausse coute un repas.
     */
    #[ORM\ManyToOne(targetEntity: ModeCuisson::class)]
    #[ORM\JoinColumn(name: 'mode_cuisson_id', nullable: true, onDelete: 'CASCADE')]
    private ?ModeCuisson $modeCuisson = null;

    #[ORM\Column(name: 'maj_le', type: Types::DATETIMETZ_IMMUTABLE)]
    private \DateTimeImmutable $majLe;

    public function __construct()
    {
        $this->majLe = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }

    public function getUtilisateur(): ?Utilisateur { return $this->utilisateur; }

    public function getAliment(): string { return $this->aliment; }

    public function getModeCuisson(): ?ModeCuisson { return $this->modeCuisson; }

    public function getMajLe(): \DateTimeImmutable { return $this->majLe; }
}
