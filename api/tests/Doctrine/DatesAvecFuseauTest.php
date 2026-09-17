<?php

declare(strict_types=1);

namespace App\Tests\Doctrine;

use Doctrine\DBAL\Platforms\PostgreSQLPlatform;
use Doctrine\DBAL\Types\DateTimeTzImmutableType;
use Doctrine\DBAL\Types\Type;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping\Column;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Yaml\Yaml;

/**
 * UNE DATE ÉCRITE PAR L'API DOIT DÉSIGNER L'INSTANT OÙ ELLE A ÉTÉ ÉCRITE.
 *
 * LA PANNE, MESURÉE LE 17 SEPTEMBRE 2026 par `verification-bout-en-bout` : un
 * aliment créé à 09:25 UTC portait `cree_le = 11:25+00`, deux heures dans le
 * futur (une en hiver). PHP tourne en `Europe/Paris` (`TZ` des deux compose),
 * les colonnes sont en `TIMESTAMPTZ`, et les entités les déclaraient en
 * `datetime_immutable` : Doctrine écrivait « 2026-09-17 11:25:10 », SANS
 * fuseau, et PostgreSQL — session en UTC — le lisait comme 11:25 UTC.
 * `schema-base` affirmait depuis le 14 septembre que cette divergence était
 * « sans effet ». Les lignes écrites par la base (`DEFAULT now()`) étaient
 * justes, ce qui rendait le décalage intermittent à l'œil.
 *
 * LE PIÈGE DU CORRECTIF ÉVIDENT. Passer les entités en
 * `datetimetz_immutable` écrit bien le décalage, mais la lecture de DBAL 4
 * n'accepte QUE le format exact `Y-m-d H:i:sO` : une valeur posée par `now()`
 * porte des microsecondes (« 09:25:21.155309+00 ») et la lecture lève
 * `InvalidFormat` — un 500 sur toute ligne écrite par la base. D'où un type
 * du projet, déclaré dans `doctrine.yaml` à la place du type d'origine, qui
 * écrit comme lui et relit comme `datetime_immutable` (repli sur le
 * constructeur).
 */
final class DatesAvecFuseauTest extends TestCase
{
    /**
     * Colonnes qui gardent le type SANS fuseau, et pourquoi.
     *
     * `jeton_rafraichissement` est en `TIMESTAMP WITHOUT TIME ZONE` : l'heure y
     * est stockée telle que PHP l'écrit, et relue puis comparée par PHP seul
     * (`JetonRafraichissement::estExpire`, `JetonsRafraichissement::purger`).
     * Écrire un décalage dans une colonne qui n'en garde pas ne corrigerait rien.
     */
    private const SANS_FUSEAU = [
        'JetonRafraichissement::expireLe',
        'JetonRafraichissement::creeLe',
        'JetonRafraichissement::vuLe',
    ];

    public function testAucuneColonneAvecFuseauNEstDeclareeSansFuseau(): void
    {
        $fautives = [];
        $vues = 0;

        foreach (glob(__DIR__ . '/../../src/Entity/*.php') ?: [] as $fichier) {
            $classe = 'App\\Entity\\' . basename($fichier, '.php');
            if (!class_exists($classe)) {
                continue;
            }

            foreach ((new \ReflectionClass($classe))->getProperties() as $propriete) {
                foreach ($propriete->getAttributes(Column::class) as $attribut) {
                    $type = $attribut->newInstance()->type;
                    if (!\in_array($type, [Types::DATETIME_MUTABLE, Types::DATETIME_IMMUTABLE], true)) {
                        continue;
                    }

                    ++$vues;
                    $nom = basename($fichier, '.php') . '::' . $propriete->getName();
                    if (!\in_array($nom, self::SANS_FUSEAU, true)) {
                        $fautives[] = $nom;
                    }
                }
            }
        }

        self::assertSame([], $fautives,
            'Ces colonnes sont en TIMESTAMPTZ et declarees sans fuseau : PHP y ecrit '
            . "l'heure de Paris, PostgreSQL la lit en UTC. Utiliser Types::DATETIMETZ_IMMUTABLE.");
        self::assertSame(\count(self::SANS_FUSEAU), $vues,
            'une derogation ne designe plus rien : la retirer de SANS_FUSEAU');
    }

    public function testLeTypeAvecFuseauEstCeluiDuProjet(): void
    {
        self::assertTrue(is_a(self::typeConfigure(), DateTimeTzImmutableType::class, true),
            "le type du projet doit ecrire comme celui de DBAL : avec le decalage");
    }

    public function testUneHeureDeParisGardeSonInstantEnBase(): void
    {
        $ecrite = new \DateTimeImmutable('2026-09-17 11:25:10', new \DateTimeZone('Europe/Paris'));

        $sql = self::type()->convertToDatabaseValue($ecrite, new PostgreSQLPlatform());

        // Ce que fait PostgreSQL d'un texte, session en UTC : un decalage
        // present fait foi, un texte nu est pris pour de l'UTC.
        $lue = new \DateTimeImmutable((string) $sql, new \DateTimeZone('UTC'));

        self::assertSame($ecrite->getTimestamp(), $lue->getTimestamp(),
            "« {$sql} » ne designe pas l'instant ecrit");
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function valeursRenduesParPostgres(): iterable
    {
        yield 'ecrite par l\'API' => ['2026-09-17 09:25:10+00'];
        yield 'posee par now(), avec microsecondes' => ['2026-09-17 09:25:10.155309+00'];
        yield 'session a l\'heure de Paris' => ['2026-09-17 11:25:10+02'];
    }

    #[DataProvider('valeursRenduesParPostgres')]
    public function testLaLectureRendLInstantEnregistre(string $valeur): void
    {
        $lue = self::type()->convertToPHPValue($valeur, new PostgreSQLPlatform());

        self::assertInstanceOf(\DateTimeImmutable::class, $lue);
        self::assertSame(
            (new \DateTimeImmutable('2026-09-17 09:25:10', new \DateTimeZone('UTC')))->getTimestamp(),
            $lue->getTimestamp(),
        );
    }

    /** La classe que `doctrine.yaml` associe au nom `datetimetz_immutable`. */
    private static function typeConfigure(): string
    {
        $config = Yaml::parseFile(__DIR__ . '/../../config/packages/doctrine.yaml');
        $classe = $config['doctrine']['dbal']['types'][Types::DATETIMETZ_IMMUTABLE] ?? null;
        self::assertIsString($classe, 'doctrine.yaml ne declare aucun type pour datetimetz_immutable');

        return $classe;
    }

    private static function type(): Type
    {
        $classe = self::typeConfigure();
        self::assertTrue(class_exists($classe), "{$classe} n'existe pas");

        /** @var Type */
        return new $classe();
    }
}
