<?php

declare(strict_types=1);

namespace App\Tests\Metadata;

use ApiPlatform\Metadata\ApiProperty;
use ApiPlatform\Metadata\Property\Factory\PropertyMetadataFactoryInterface;
use App\Entity\Aliment;
use App\Metadata\DecimalesNumeriques;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping\Column;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\TypeInfo\Type;
use Symfony\Component\TypeInfo\Type\CompositeTypeInterface;
use Symfony\Component\TypeInfo\TypeIdentifier;

/**
 * UN NOMBRE JSON DOIT S'ECRIRE DANS UNE COLONNE DECIMALE.
 *
 * LA PANNE, MESUREE LE 16 SEPTEMBRE 2026 SUR L'APPLICATION QUI TOURNE :
 *
 *   POST /api/aliments {"nom":"Riz","categorie":"fec","kcal100":350}
 *   HTTP 400
 *   detail: The type of the "kcal100" attribute must be "string",
 *           "integer" given.
 *
 * 350 est un nombre, et l'API le refuse parce qu'elle attend « 350 ». Ce n'est
 * pas une subtilite de serialisation : c'est le contrat de l'API qui ment. Tout
 * client autre que le notre — curl, un script d'import, un second front — se
 * fait refuser le JSON le plus naturel qui soit, sans qu'aucun document ne
 * l'annonce.
 *
 * POURQUOI L'APPLICATION MARCHE QUAND MEME. `versDecimales`
 * (`front/src/api/hooks/decimales.ts`) convertit tous les champs decimaux en
 * chaines avant l'envoi. Le contournement est du cote client : il protege
 * l'application, et rien d'autre. Meme motif que le rendement a contresens
 * corrige le meme jour — le front grisait le bouton, le serveur restait nu.
 *
 * D'OU VIENT LE « string » (mesure, pas suppose) :
 * `Symfony\Bridge\Doctrine\PropertyInfo\DoctrineExtractor` ligne 377 traduit
 * `Types::DECIMAL` en `TypeIdentifier::STRING`, et cet extracteur passe AVANT
 * la reflexion dans la chaine `property_info`. Les accesseurs ont beau etre
 * typés `float` et les mutateurs `float|string`, API Platform ne voit que la
 * colonne. Deplacer les groupes de serialisation sur les accesseurs — fait le
 * 16 septembre 2026, commentaire a l'appui dans `Aliment` — n'y change donc
 * rien : ce n'est pas le groupe qui porte le type.
 *
 * CE QUE LA CORRECTION NE DOIT PAS FAIRE : passer ces colonnes en `float` tout
 * court. Les decimaux sont stockes en chaines PAR DECISION — la virgule
 * flottante n'a pas sa place sur des valeurs nutritionnelles — et le front
 * envoie des chaines. Une API qui accepterait 350 en refusant « 350 »
 * deplacerait la panne au lieu de la corriger. D'ou les deux temoins ci-dessous.
 */
final class DecimalesNumeriquesTest extends TestCase
{
    /**
     * LA REGLE EXACTE D'API PLATFORM, RECOPIEE ICI FAUTE DE POUVOIR L'APPELER.
     *
     * `AbstractItemNormalizer::createAndValidateAttributeValue` parcourt les
     * membres du type declare et s'arrete au premier qui accepte la valeur ;
     * `validateAttributeType` (api-platform/serializer 4.3,
     * `AbstractItemNormalizer.php` ligne 630) traite le flottant a part :
     *
     *     if ($type->isIdentifiedBy(TypeIdentifier::FLOAT) && str_contains($format, 'json')) {
     *         $isValid = \is_float($value) || \is_int($value);
     *     } else {
     *         $isValid = $type->accepts($value);
     *     }
     *
     * C'est cette ligne, et elle seule, qui autorise un entier JSON la ou un
     * flottant est attendu. La transcrire est le seul moyen d'eprouver la
     * correction sans lever le noyau ; si elle change chez API Platform, ce
     * test devient faux — d'ou la reference precise ci-dessus.
     */
    private static function accepteEnJson(Type $type, mixed $valeur): bool
    {
        if (null === $valeur) {
            return $type->isNullable();
        }

        $membres = $type instanceof CompositeTypeInterface ? $type->getTypes() : [$type];

        foreach ($membres as $membre) {
            if ($membre->isIdentifiedBy(TypeIdentifier::FLOAT)) {
                if (\is_float($valeur) || \is_int($valeur)) {
                    return true;
                }

                continue;
            }

            if ($membre->accepts($valeur)) {
                return true;
            }
        }

        return false;
    }

    public function testUnNombreJsonEstAccepteSurUneColonneDecimale(): void
    {
        $type = self::typeExpose(Aliment::class, 'kcal100');

        self::assertTrue(self::accepteEnJson($type, 350),
            '{"kcal100": 350} rendait 400 le 16 septembre 2026 : un entier JSON '
            . 'doit s\'ecrire dans une colonne decimale');
        self::assertTrue(self::accepteEnJson($type, 350.5),
            'un decimal envoye en nombre doit passer aussi — c\'est le cas le plus courant');
    }

    /**
     * LE PREMIER TEMOIN, ET IL EST LA RAISON D'ETRE DE LA CORRECTION RETENUE.
     *
     * Le front envoie des CHAINES (`versDecimales`). Declarer ces champs
     * « flottant » tout court aurait rendu ce test rouge et casse toutes les
     * ecritures de l'application : on aurait echange une panne contre une pire,
     * en croyant corriger.
     */
    public function testUneChaineResteAccepteeSurUneColonneDecimale(): void
    {
        $type = self::typeExpose(Aliment::class, 'kcal100');

        self::assertTrue(self::accepteEnJson($type, '350'),
            'le front envoie des chaines : elles doivent continuer de passer');
        self::assertTrue(self::accepteEnJson($type, '350.50'),
            'une decimale en chaine est la forme que Doctrine relit de la base');
    }

    /**
     * REGLE 6 — VIDE N'EST PAS ZERO. `fibres100` facultatif veut dire « je ne
     * sais pas », et `null` doit traverser. Un type qui n'accepterait plus le
     * vide transformerait une inconnue en 0 g de fibres, donc en calories
     * fausses (convention europeenne, 2 kcal/g).
     */
    public function testUneDecimaleFacultativeAccepteToujoursLeVide(): void
    {
        $type = self::typeExpose(Aliment::class, 'fibres100');

        self::assertTrue($type->isNullable(),
            'fibres100 est nullable en base : « je ne sais pas » doit rester dicible');
        self::assertTrue(self::accepteEnJson($type, null));
        self::assertTrue(self::accepteEnJson($type, 2.4));
        self::assertTrue(self::accepteEnJson($type, '2.40'));
    }

    /**
     * LE SECOND TEMOIN. Sans lui, une correction qui rendrait TOUT permissif —
     * par exemple `DISABLE_TYPE_ENFORCEMENT` sur la ressource — passerait pour
     * une reussite. Or elle enverrait un entier dans `setNom(string)`, sous
     * `declare(strict_types=1)` : 500 au lieu de 400.
     */
    public function testUneColonneQuiNEstPasDecimaleGardeSonType(): void
    {
        $type = self::typeExpose(Aliment::class, 'nom');

        self::assertFalse(self::accepteEnJson($type, 350),
            'un nom reste une chaine : rien ici n\'autorise a relacher les autres champs');
        self::assertTrue(self::accepteEnJson($type, 'Riz blanc'));
    }

    /**
     * LA REGLE VAUT POUR TOUTES LES DECIMALES DU MODELE, PAS POUR `Aliment`.
     *
     * Le constat est ne sur `POST /api/aliments`, mais `Cible`, `Serie`,
     * `Stock`, `Complement` et `ModeleSerie` portent les memes colonnes et le
     * meme contournement cote front. Corriger la seule entite citee aurait
     * reproduit le motif de defaut dominant du projet : une decision juste
     * appliquee a un endroit et oubliee aux cinq autres.
     *
     * L'inventaire se lit sur les ENTITES REELLES, donc il verra celles qu'on
     * ajoutera apres avoir oublie ce fichier.
     *
     * @param class-string $classe
     */
    #[DataProvider('colonnesDecimales')]
    public function testToutesLesDecimalesDuModeleSEcriventEnNombre(string $classe, string $propriete): void
    {
        $type = self::typeExpose($classe, $propriete);

        self::assertTrue(self::accepteEnJson($type, 12),
            "{$classe}::\${$propriete} est une colonne decimale : elle doit accepter un nombre JSON");
        self::assertTrue(self::accepteEnJson($type, '12.00'),
            "{$classe}::\${$propriete} doit continuer d'accepter la chaine que le front envoie");
    }

    /**
     * ET LE MUTATEUR DOIT SUIVRE, SANS QUOI ON ECHANGE UN 400 CONTRE UN 500.
     *
     * Laisser passer un nombre jusqu'a un `setKcal100(string $v)` sous
     * `declare(strict_types=1)` donnerait un `TypeError` — une erreur 500 avec
     * une trace, la ou le client recevait au moins une phrase. Les onze
     * mutateurs decimaux acceptent `float|string` aujourd'hui ; ce test fige
     * cette condition pour les colonnes a venir.
     *
     * @param class-string $classe
     */
    #[DataProvider('colonnesDecimales')]
    public function testChaqueDecimaleAUnMutateurQuiAccepteUnNombre(string $classe, string $propriete): void
    {
        $mutateur = 'set' . \ucfirst($propriete);

        self::assertTrue(\method_exists($classe, $mutateur),
            "{$classe}::\${$propriete} est une colonne decimale sans mutateur : si c'est "
            . 'voulu — une valeur qui ne s\'ecrit pas depuis l\'API — il faut le dire ici.');

        $parametre = (new \ReflectionMethod($classe, $mutateur))->getParameters()[0] ?? null;
        self::assertNotNull($parametre);

        self::assertStringContainsString('float', (string) $parametre->getType(),
            "{$mutateur}() doit accepter un nombre, sinon un JSON valide finit en 500");
    }

    /**
     * Toutes les proprietes portant une colonne DECIMAL, entite par entite.
     *
     * @return iterable<string, array{class-string, string}>
     */
    public static function colonnesDecimales(): iterable
    {
        foreach (\glob(__DIR__ . '/../../src/Entity/*.php') ?: [] as $fichier) {
            /** @var class-string $classe */
            $classe = 'App\\Entity\\' . \basename($fichier, '.php');

            if (!\class_exists($classe)) {
                continue;   // interfaces et traits du dossier
            }

            foreach ((new \ReflectionClass($classe))->getProperties() as $propriete) {
                if (self::colonneDecimale($propriete) !== null) {
                    yield (new \ReflectionClass($classe))->getShortName() . '::' . $propriete->getName()
                        => [$classe, $propriete->getName()];
                }
            }
        }
    }

    // ------------------------------------------------------------------ outils

    /**
     * Le type qu'API Platform expose pour cette propriete, une fois la regle
     * appliquee.
     *
     * La fabrique interne rend ce que `property_info` deduit AUJOURD'HUI de la
     * colonne Doctrine — une chaine, nullable si la colonne l'est. C'est la
     * mesure du 16 septembre 2026, pas une hypothese : `DoctrineExtractor`
     * ligne 377, `Types::DECIMAL => TypeIdentifier::STRING`.
     *
     * @param class-string $classe
     */
    private static function typeExpose(string $classe, string $propriete): Type
    {
        $type = (new DecimalesNumeriques(self::fabriqueInterne()))
            ->create($classe, $propriete)
            ->getNativeType();

        self::assertNotNull($type, "aucun type expose pour {$classe}::\${$propriete}");

        return $type;
    }

    private static function fabriqueInterne(): PropertyMetadataFactoryInterface
    {
        $interne = self::createStub(PropertyMetadataFactoryInterface::class);
        $interne->method('create')->willReturnCallback(
            static function (string $classe, string $propriete): ApiProperty {
                $reflexion = new \ReflectionProperty($classe, $propriete);
                $colonne = self::colonneDecimale($reflexion);

                // Une colonne non decimale : le type de la propriete suffit.
                $facultatif = null !== $colonne
                    ? $colonne->nullable
                    : ($reflexion->getType()?->allowsNull() ?? false);

                return (new ApiProperty())->withNativeType(
                    $facultatif ? Type::nullable(Type::string()) : Type::string(),
                );
            });

        return $interne;
    }

    private static function colonneDecimale(\ReflectionProperty $propriete): ?Column
    {
        foreach ($propriete->getAttributes(Column::class) as $attribut) {
            $colonne = $attribut->newInstance();

            if (Types::DECIMAL === $colonne->type) {
                return $colonne;
            }
        }

        return null;
    }
}
