<?php

declare(strict_types=1);

namespace App\Tests\Entity;

use App\Entity\Aliment;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Validator\Validation;

/**
 * UNE MACRO QU'ON N'A PAS DONNÉE N'EST PAS UNE MACRO À ZÉRO — CÔTÉ API AUSSI.
 *
 * LA PANNE, MESURÉE LE 17 SEPTEMBRE 2026 par `verification-bout-en-bout` :
 * `POST /api/aliments` sans `lip100` répondait 201, et la base enregistrait
 * `lip_100 = 0.00`. Les quatre propriétés valaient `'0'` par défaut et ne
 * portaient que `PositiveOrZero` : une clé absente devenait un zéro, sans un
 * mot (règle 6). L'écran le refusait déjà — mais un autre client, ou une
 * version de l'application restée en retard sur un téléphone, passait. Et
 * `"lip100": null` répondait 400 avec un message anglais du sérialiseur.
 */
final class AlimentMacrosObligatoiresTest extends TestCase
{
    /** @return iterable<string, array{string}> */
    public static function macros(): iterable
    {
        yield 'calories' => ['kcal100'];
        yield 'protéines' => ['prot100'];
        yield 'glucides' => ['gluc100'];
        yield 'lipides' => ['lip100'];
    }

    #[DataProvider('macros')]
    public function testUneMacroAbsenteEstRefusee(string $absente): void
    {
        $aliment = self::alimentSans($absente);

        $violations = self::champsRefuses($aliment);

        self::assertContains($absente, \array_keys($violations),
            "{$absente} absent : l'aliment passait avec 0, un chiffre que personne n'a donne");
        self::assertStringContainsString('écris 0', $violations[$absente],
            'le refus doit dire comment en sortir, en francais');
    }

    #[DataProvider('macros')]
    public function testUneMacroNulleEstRefuseeSansErreurDeType(string $nulle): void
    {
        $aliment = self::alimentSans($nulle);
        $aliment->{'set' . \ucfirst($nulle)}(null);

        self::assertArrayHasKey($nulle, self::champsRefuses($aliment));
    }

    /** LE TÉMOIN : des zéros ÉCRITS sont des valeurs, et passent. */
    public function testDesZerosEcritsSontAcceptes(): void
    {
        $huile = (new Aliment())->setNom('Huile d\'olive')->setCategorie('huile')
            ->setKcal100(900)->setProt100(0)->setGluc100(0)->setLip100(100);

        self::assertSame([], self::champsRefuses($huile));
    }

    private static function alimentSans(string $absente): Aliment
    {
        $aliment = (new Aliment())->setNom('Saumon')->setCategorie('prot');
        foreach (['kcal100' => 200, 'prot100' => 20, 'gluc100' => 0, 'lip100' => 13] as $champ => $valeur) {
            if ($champ !== $absente) {
                $aliment->{'set' . \ucfirst($champ)}($valeur);
            }
        }

        return $aliment;
    }

    /** @return array<string, string> chemin de la propriete => message */
    private static function champsRefuses(Aliment $aliment): array
    {
        $refus = [];
        foreach (Validation::createValidatorBuilder()->enableAttributeMapping()->getValidator()->validate($aliment) as $v) {
            $refus[$v->getPropertyPath()] = (string) $v->getMessage();
        }

        return $refus;
    }
}
