<?php

declare(strict_types=1);

namespace App\Doctrine;

use ApiPlatform\Doctrine\Orm\Extension\QueryCollectionExtensionInterface;
use ApiPlatform\Doctrine\Orm\Extension\QueryItemExtensionInterface;
use ApiPlatform\Doctrine\Orm\Util\QueryNameGeneratorInterface;
use ApiPlatform\Metadata\Operation;
use App\Entity\Aliment;
use App\Entity\Utilisateur;
use Doctrine\ORM\QueryBuilder;
use Symfony\Bundle\SecurityBundle\Security;

/**
 * Pendant en lecture de AlimentProcessor : on ne voit que les aliments communs
 * et les siens.
 *
 * FiltreProprietaire ne peut pas s'en charger : un aliment n'est pas une
 * « ProprieteUtilisateur », son proprietaire est facultatif. La regle n'est pas
 * « le mien » mais « commun OU le mien ».
 *
 * FrigoBase applique deja cette restriction en SQL. Sans cette extension,
 * la meme donnee resterait accessible par /api/aliments.
 */
final readonly class FiltreAliment implements QueryCollectionExtensionInterface, QueryItemExtensionInterface
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
        if (Aliment::class !== $resourceClass) {
            return;
        }

        $utilisateur = $this->security->getUser();
        $alias = $qb->getRootAliases()[0];

        if (!$utilisateur instanceof Utilisateur) {
            $qb->andWhere('1 = 0');   // non authentifie : aucun resultat

            return;
        }

        // parentheses indispensables : sans elles, le OR desactiverait les
        // autres conditions de la requete, filtres de recherche compris
        $qb->andWhere(sprintf(
            '(%s.creePar IS NULL OR %s.creePar = :utilisateur_courant)', $alias, $alias))
           ->setParameter('utilisateur_courant', $utilisateur->getId(), 'uuid');
    }
}
