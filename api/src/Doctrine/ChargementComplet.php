<?php

declare(strict_types=1);

namespace App\Doctrine;

use ApiPlatform\Doctrine\Orm\Extension\QueryCollectionExtensionInterface;
use ApiPlatform\Doctrine\Orm\Extension\QueryItemExtensionInterface;
use ApiPlatform\Doctrine\Orm\Util\QueryNameGeneratorInterface;
use ApiPlatform\Metadata\Operation;
use App\Entity\Modele;
use App\Entity\Seance;
use Doctrine\ORM\QueryBuilder;

/**
 * UNE SEANCE EST LUE EN UN SEUL OBJET. ELLE DOIT ETRE CHARGEE EN UN SEUL COUP.
 *
 * `Seance` expose ses exercices, et chaque exercice ses series, dans le meme
 * document JSON — c'est un choix assume, ecrit en tete de l'entite : « lue et
 * ecrite en UN SEUL objet complet, pour eviter la dizaine d'appels
 * qu'imposeraient des ressources imbriquees ».
 *
 * Mais ces collections sont PARESSEUSES. Et serialiser une collection
 * paresseuse, c'est la charger. Une page de 30 seances donnait donc :
 *
 *   1 requete pour les seances,
 *   + 1 par seance pour ses blocs d'exercice,
 *   + 1 par bloc pour ses series,
 *   + 1 par bloc pour l'exercice du referentiel — via `getAvancement()`, qui
 *     lit `getExercice()?->getModeDefaut()` quand le bloc n'a pas de mode.
 *
 * Soit, pour cinq exercices par seance, de l'ordre de DEUX CENTS requetes SQL
 * pour afficher un ecran. Aucune n'est lente. C'est leur somme qu'on ressent,
 * et on la ressent comme « l'application rame », jamais comme « la base est
 * sollicitee deux cents fois » — ce qui est exactement pourquoi ce defaut
 * survit longtemps.
 *
 * ON JOINT, DONC. Une seule requete rapporte l'arbre entier.
 *
 * POURQUOI PAS `exercices.exercice` PAR SIMPLE PRUDENCE : parce que ce n'est
 * PAS gratuit. La jointure duplique les colonnes de l'exercice — dont
 * `instructions`, plusieurs centaines de caracteres — sur chaque ligne du
 * resultat. On l'accepte ici parce que `getAvancement()` va de toute facon
 * chercher chaque exercice un par un ; une requete plus grosse vaut mieux que
 * cent cinquante allers-retours. Si `getAvancement()` cessait d'en avoir
 * besoin, cette jointure-la deviendrait une perte seche : la relation est
 * serialisee en simple IRI, ce qui ne demande que l'identifiant, et Doctrine
 * n'initialise alors jamais le mandataire.
 *
 * A SURVEILLER : la pagination. API Platform passe par le `Paginator` de
 * Doctrine, qui sait traiter les collections jointes — il fait d'abord une
 * requete d'identifiants avec la limite, puis une seconde qui rapporte tout.
 * C'est le seul point de ce fichier qui puisse casser quelque chose de
 * visible : un total de pagination faux. A verifier une fois sur des donnees
 * reelles, pas a supposer.
 */
final readonly class ChargementComplet implements QueryCollectionExtensionInterface, QueryItemExtensionInterface
{
    /**
     * Les chemins a joindre, dans l'ordre : un parent avant ses enfants.
     *
     * @var array<class-string, list<string>>
     */
    private const CHEMINS = [
        Seance::class => ['exercices', 'exercices.series', 'exercices.exercice'],
        Modele::class => ['exercices', 'exercices.series', 'exercices.exercice'],
    ];

    public function applyToCollection(
        QueryBuilder $queryBuilder,
        QueryNameGeneratorInterface $queryNameGenerator,
        string $resourceClass,
        ?Operation $operation = null,
        array $context = [],
    ): void {
        $this->joindre($queryBuilder, $queryNameGenerator, $resourceClass);
    }

    public function applyToItem(
        QueryBuilder $queryBuilder,
        QueryNameGeneratorInterface $queryNameGenerator,
        string $resourceClass,
        array $identifiers,
        ?Operation $operation = null,
        array $context = [],
    ): void {
        $this->joindre($queryBuilder, $queryNameGenerator, $resourceClass);
    }

    private function joindre(
        QueryBuilder $qb,
        QueryNameGeneratorInterface $generateur,
        string $resourceClass,
    ): void {
        $chemins = self::CHEMINS[$resourceClass] ?? null;
        if (null === $chemins) {
            return;
        }

        $racine = $qb->getRootAliases()[0];

        /* Les alias sont demandes au generateur d'API Platform et jamais
           inventes : un filtre de recherche ou de tri peut deja avoir joint la
           meme relation sous un autre nom, et deux alias identiques dans une
           requete DQL produisent une erreur que rien ne rattrape. */
        $aliasDuChemin = [];

        foreach ($chemins as $chemin) {
            $morceaux = \explode('.', $chemin);
            $relation = \array_pop($morceaux);
            $parent = [] === $morceaux ? $racine : ($aliasDuChemin[\implode('.', $morceaux)] ?? null);

            // Un chemin dont le parent n'a pas ete joint est une erreur de
            // declaration, pas une situation d'execution : on s'arrete la
            // plutot que de fabriquer une requete a moitie juste.
            if (null === $parent) {
                continue;
            }

            $alias = $generateur->generateJoinAlias($relation);
            $qb->leftJoin(\sprintf('%s.%s', $parent, $relation), $alias)
               ->addSelect($alias);

            $aliasDuChemin[$chemin] = $alias;
        }
    }
}
