<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Controller\VerificationController;
use PHPUnit\Framework\TestCase;
use Symfony\Component\DependencyInjection\Container;
use Symfony\Component\HttpFoundation\Request;

/**
 * LA ROUTE QUI CONVERTIT UN PLAN DE COACH — palier B, 21 septembre 2026.
 *
 * Comme pour la cible, ce n'est pas la regle qu'on eprouve ici — `PlanCoachTest`
 * s'en charge, avec les quatre repas du plan reel — mais le CABLAGE : que les
 * cinq chiffres arrivent, que la phrase reparte, et qu'un corps incomplet ne
 * fasse pas tomber la route.
 */
final class ConversionDUnPlanCoachTest extends TestCase
{
    /** Le petit-dejeuner du plan reel : 64,7 g de glucides, 3,5 de fibres. */
    private const R1 = ['kcal' => 578.6, 'prot' => 26.8, 'gluc' => 64.7, 'lip' => 25.9, 'fibres' => 3.5];

    public function testLesCinqChiffresArriventJusquALaConversion(): void
    {
        $cible = self::rendu(self::R1)['cible'];

        self::assertSame(61.2, $cible['gluc'], '64,7 g dont 3,5 de fibres');
        self::assertSame(26.8, $cible['prot']);
        self::assertSame(25.9, $cible['lip']);
        /* `assertEquals` ET NON `assertSame` : `json_encode(579.0)` ecrit `579`,
           que `json_decode` relit en `int`. C'est sans consequence pour l'ecran
           — JavaScript n'a qu'un type de nombre — mais c'est bien ce qui part
           sur le fil, et le test doit decrire ce qui part, pas ce qu'on
           imaginait. */
        self::assertEquals(579, $cible['kcalAnnoncees'], 'ce que le plan disait');
    }

    public function testLaPhraseSurLesFibresRepartVersLEcran(): void
    {
        self::assertSame(
            '3,5 g de fibres pour 64,7 g de glucides : ton plan les sous-estime. '
            . 'Sans conséquence ici — c’est justement pour ça qu’on ne s’en sert pas.',
            self::rendu(self::R1)['avertissement'],
        );
    }

    /** Le temoin : un plan dont les fibres tiennent ne se fait rien dire. */
    public function testUnPlanDontLesFibresTiennentNeSeFaitRienDire(): void
    {
        self::assertNull(self::rendu(
            ['kcal' => 661.9, 'prot' => 42.8, 'gluc' => 61.8, 'lip' => 25.8, 'fibres' => 8.3],
        )['avertissement']);
    }

    public function testUnCorpsVideNeFaitPasTomberLaRoute(): void
    {
        $rendu = self::rendu([]);

        self::assertEquals(0, $rendu['cible']['gluc']);
        self::assertNull($rendu['avertissement']);
    }

    /** @param array<string, mixed> $corps @return array<string, mixed> */
    private static function rendu(array $corps): array
    {
        $controleur = new VerificationController();
        $controleur->setContainer(new Container());

        $requete = Request::create('/api/verification/plan-coach', 'POST',
            content: (string) \json_encode($corps));

        /** @var array<string, mixed> $decode */
        $decode = \json_decode((string) $controleur->planCoach($requete)->getContent(), true);

        return $decode;
    }
}
