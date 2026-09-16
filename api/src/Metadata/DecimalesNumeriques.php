<?php

declare(strict_types=1);

namespace App\Metadata;

use ApiPlatform\Metadata\ApiProperty;
use ApiPlatform\Metadata\Property\Factory\PropertyMetadataFactoryInterface;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping\Column;
use Symfony\Component\TypeInfo\Type;
use Symfony\Component\TypeInfo\TypeIdentifier;

/**
 * UNE COLONNE DECIMALE S'ECRIT EN NOMBRE COMME EN CHAINE.
 *
 * LA PANNE, MESUREE LE 16 SEPTEMBRE 2026 SUR L'APPLICATION QUI TOURNE :
 * `POST /api/aliments {"kcal100": 350}` repondait 400, « The type of the
 * "kcal100" attribute must be "string", "integer" given. » Un nombre refuse
 * dans un champ de calories.
 *
 * D'OU VENAIT LE « string ». Doctrine hydrate un DECIMAL en chaine pour ne
 * jamais passer par la virgule flottante — c'est une decision du projet, et
 * elle ne bouge pas : sur des valeurs nutritionnelles, 0.1 + 0.2 ne doit pas
 * valoir 0.30000000000000004. `Symfony\Bridge\Doctrine\PropertyInfo\
 * DoctrineExtractor` (ligne 377) traduit donc `Types::DECIMAL` en
 * `TypeIdentifier::STRING`, et cet extracteur passe AVANT la reflexion dans la
 * chaine `property_info`. Les mutateurs des entites ont beau accepter
 * `float|string` depuis toujours, API Platform ne lisait que la colonne.
 *
 * CE QUI NE SUFFISAIT PAS : deplacer les groupes de serialisation sur les
 * accesseurs typés `float`, fait le 16 septembre 2026 dans `Aliment` avec un
 * commentaire qui annoncait la correction. Le groupe dit QUI est expose, pas
 * SOUS QUEL TYPE. Le 400 est reste.
 *
 * CE QUE FAIT CETTE FABRIQUE : elle repasse derriere `property_info` et
 * declare, pour toute colonne DECIMAL, le type `float|string` — exactement ce
 * que le mutateur accepte deja. Les deux formes passent donc :
 *
 *   {"kcal100": 350}    un JSON naturel, curl, un script d'import
 *   {"kcal100": "350"}  ce que le front envoie (`versDecimales`)
 *
 * ELLE S'APPLIQUE A TOUTES LES ENTITES, ET C'EST LE POINT. Le constat est ne
 * sur `Aliment`, mais `Cible`, `Serie`, `Stock`, `Complement` et `ModeleSerie`
 * portent les memes colonnes. Une correction posee entite par entite — huit
 * attributs sur `Aliment`, puis plus rien ailleurs — aurait reproduit le motif
 * de defaut dominant du projet : une decision juste appliquee a un endroit et
 * oubliee a l'autre. Ici la regle se lit sur la colonne : une entite ecrite
 * demain l'aura sans qu'on y pense.
 *
 * ON NE TOUCHE RIEN D'AUTRE. Un champ qui n'est pas DECIMAL garde son type —
 * un nom reste une chaine. Et une propriete deja declaree numerique (par un
 * `#[ApiProperty]` explicite) n'est pas reecrite.
 *
 * La lecture ne change pas : les accesseurs rendent des `float`, le front
 * continue de recevoir des nombres.
 *
 * Eprouve par `tests/Metadata/DecimalesNumeriquesTest.php`, sans noyau ni base.
 */
final readonly class DecimalesNumeriques implements PropertyMetadataFactoryInterface
{
    public function __construct(private PropertyMetadataFactoryInterface $interne)
    {
    }

    public function create(string $resourceClass, string $property, array $options = []): ApiProperty
    {
        $metadonnees = $this->interne->create($resourceClass, $property, $options);

        if (null === $colonne = self::colonneDecimale($resourceClass, $property)) {
            return $metadonnees;
        }

        $type = $metadonnees->getNativeType();

        /* On ne corrige que ce qui est annonce « chaine et rien d'autre ».
           Un type deja numerique vient d'un `#[ApiProperty]` pose a la main :
           il fait foi. */
        if (null === $type
            || !$type->isIdentifiedBy(TypeIdentifier::STRING)
            || $type->isIdentifiedBy(TypeIdentifier::FLOAT)) {
            return $metadonnees;
        }

        $nombreOuChaine = Type::union(Type::float(), Type::string());

        /* Une colonne facultative garde le droit d'etre vide : regle 6, vide
           n'est pas zero. `fibres100` absent veut dire « je ne sais pas », et
           surtout pas 0 g de fibres. */
        return $metadonnees->withNativeType(
            $colonne->nullable || $type->isNullable()
                ? Type::nullable($nombreOuChaine)
                : $nombreOuChaine,
        );
    }

    /**
     * La colonne Doctrine de cette propriete, si c'est un DECIMAL.
     *
     * Par reflexion, sans demander l'EntityManager : cette fabrique est
     * appelee pour chaque propriete de chaque ressource, y compris des classes
     * qui ne sont pas des entites.
     */
    private static function colonneDecimale(string $classe, string $propriete): ?Column
    {
        if (!class_exists($classe)) {
            return null;
        }

        $reflexion = new \ReflectionClass($classe);

        if (!$reflexion->hasProperty($propriete)) {
            return null;
        }

        foreach ($reflexion->getProperty($propriete)->getAttributes(Column::class) as $attribut) {
            $colonne = $attribut->newInstance();

            if (Types::DECIMAL === $colonne->type) {
                return $colonne;
            }
        }

        return null;
    }
}
