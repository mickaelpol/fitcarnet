<?php

declare(strict_types=1);

namespace App\Doctrine;

use ApiPlatform\Doctrine\Orm\Extension\QueryCollectionExtensionInterface;
use ApiPlatform\Doctrine\Orm\Extension\QueryItemExtensionInterface;
use ApiPlatform\Doctrine\Orm\Util\QueryNameGeneratorInterface;
use ApiPlatform\Metadata\Operation;
use App\Entity\Exercice;
use App\Entity\Utilisateur;
use Doctrine\ORM\QueryBuilder;
use Symfony\Bundle\SecurityBundle\Security;

/**
 * « PUBLIC OU LE MIEN » — pendant en lecture de ExerciceProcessor.
 *
 * POURQUOI CETTE CLASSE EXISTE (constat E8 / F-04, 7 septembre 2026)
 *
 * `Exercice` portait `public` et `creePar` depuis le premier jour sans que
 * personne ne les renseigne ni ne les lise — `setCreePar()` n'avait pas un
 * seul appelant. Le catalogue etait donc entierement commun, pendant que
 * l'ecran affichait « ★ exercice personnel » sur ce qu'un compte ajoutait.
 *
 * Un nom d'exercice peut etre personnel : « Reeducation epaule Dr X ». Une
 * etiquette qui promet la confidentialite sans la fournir est pire qu'une
 * etiquette absente, parce qu'on lui fait confiance.
 *
 * POURQUOI « PUBLIC », ET NON « SANS AUTEUR » COMME POUR ALIMENT
 *
 * `FiltreAliment` dit « commun OU le mien » : un aliment est commun quand il
 * n'a pas d'auteur. Ici la regle porte sur `public`, ce qui laisse une
 * troisieme possibilite — un exercice publie MAIS attribue. Un administrateur
 * peut ainsi verser au catalogue commun l'exercice bien redige de quelqu'un
 * sans en effacer la paternite.
 *
 * Les 1338 exercices importes sont `public = true` : ils restent visibles de
 * tous, et aucune migration de donnees n'a ete necessaire.
 */
final readonly class FiltreExercice implements QueryCollectionExtensionInterface, QueryItemExtensionInterface
{
    public function __construct(private Security $security)
    {
    }

    public function applyToCollection(
        QueryBuilder $queryBuilder,
        QueryNameGeneratorInterface $queryNameGenerator,
        string $resourceClass,
        ?Operation $operation = null,
        array $context = [],
    ): void {
        $this->restreindre($queryBuilder, $resourceClass);
    }

    public function applyToItem(
        QueryBuilder $queryBuilder,
        QueryNameGeneratorInterface $queryNameGenerator,
        string $resourceClass,
        array $identifiers,
        ?Operation $operation = null,
        array $context = [],
    ): void {
        $this->restreindre($queryBuilder, $resourceClass);
    }

    private function restreindre(QueryBuilder $qb, string $resourceClass): void
    {
        if (Exercice::class !== $resourceClass) {
            return;
        }

        $utilisateur = $this->security->getUser();
        $alias = $qb->getRootAliases()[0];

        if (!$utilisateur instanceof Utilisateur) {
            $qb->andWhere('1 = 0');   // non authentifie : aucun resultat

            return;
        }

        /* Le OR est parenthese pour rester un bloc : « AND » lie plus fort que
           « OR », donc une recherche ajoutee ensuite doit contraindre les DEUX
           moities. Doctrine parenthese deja de son cote (Query\Expr\Composite,
           DDC-1237) ; ces parentheses-ci disent l'intention. */
        $qb->andWhere(sprintf(
            '(%s.public = true OR %s.creePar = :utilisateur_courant)', $alias, $alias))
           ->setParameter('utilisateur_courant', $utilisateur->getId(), 'uuid');
    }
}
