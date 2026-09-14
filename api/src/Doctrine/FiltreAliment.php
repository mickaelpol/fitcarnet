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

        /* Le OR est parenthese pour rester un bloc : « AND » lie plus fort que
           « OR », donc une recherche ajoutee ensuite doit contraindre les DEUX
           moities, pas seulement « le mien ».

           Ce commentaire disait ces parentheses « indispensables ». Verifie le
           14 septembre 2026 : elles ne le sont pas. Doctrine parenthese deja
           toute partie contenant « OR » au moment de combiner les conditions
           (Query\Expr\Composite, correctif DDC-1237) ; les retirer ne change
           pas une ligne du DQL produit. On les garde — elles disent l'intention
           et survivraient a un changement de construction — mais ce n'est pas
           d'elles que depend l'isolation. FiltreAlimentTest eprouve
           l'invariant lui-meme, et non la mecanique qui le realise. */
        $qb->andWhere(sprintf(
            '(%s.creePar IS NULL OR %s.creePar = :utilisateur_courant)', $alias, $alias))
           ->setParameter('utilisateur_courant', $utilisateur->getId(), 'uuid');
    }
}
