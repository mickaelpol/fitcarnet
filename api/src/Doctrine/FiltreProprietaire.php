<?php

declare(strict_types=1);

namespace App\Doctrine;

use ApiPlatform\Doctrine\Orm\Extension\QueryCollectionExtensionInterface;
use ApiPlatform\Doctrine\Orm\Extension\QueryItemExtensionInterface;
use ApiPlatform\Doctrine\Orm\Util\QueryNameGeneratorInterface;
use ApiPlatform\Metadata\Operation;
use App\Entity\ProprieteUtilisateur;
use App\Entity\Utilisateur;
use Doctrine\ORM\QueryBuilder;
use Symfony\Bundle\SecurityBundle\Security;

/**
 * Garde-fou central : toute collection d'une entite « ProprieteUtilisateur »
 * est automatiquement restreinte a l'utilisateur connecte.
 * Sans cette extension, un utilisateur verrait le stock et les seances des autres.
 */
final readonly class FiltreProprietaire implements QueryCollectionExtensionInterface, QueryItemExtensionInterface
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
        if (!is_a($resourceClass, ProprieteUtilisateur::class, true)) {
            return;
        }

        $utilisateur = $this->security->getUser();
        $alias = $qb->getRootAliases()[0];

        if (!$utilisateur instanceof Utilisateur) {
            $qb->andWhere('1 = 0');   // non authentifie : aucun resultat

            return;
        }

        $qb->andWhere(sprintf('%s.utilisateur = :utilisateur_courant', $alias))
           ->setParameter('utilisateur_courant', $utilisateur->getId(), 'uuid');
    }
}
