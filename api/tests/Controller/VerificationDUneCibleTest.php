<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Controller\VerificationController;
use PHPUnit\Framework\TestCase;
use Symfony\Component\DependencyInjection\Container;
use Symfony\Component\HttpFoundation\Request;

/**
 * LA ROUTE QUI JUGE UNE CIBLE EN COURS DE SAISIE — palier B, 21 septembre 2026.
 *
 * POURQUOI UN TEST DE CONTROLEUR ICI, alors que la regle est deja couverte par
 * `CoherenceDesCiblesTest`. Parce que ce n'est pas la regle qu'on eprouve, c'est
 * le CABLAGE — et c'est exactement ce qui est tombe le 20 septembre 2026 :
 * « l'ecran affichait Coherent en vert sur ce que le serveur allait refuser »,
 * et « le message de refus attendait les quatre macros pour apparaitre ». Aucun
 * des tests unitaires d'alors n'a vu ces deux-la : chaque moitie etait juste.
 *
 * Le controle se monte a la main, sans noyau ni base : le conteneur minimal
 * suffit a `$this->json()`, qui retombe alors sur une `JsonResponse` nue.
 */
final class VerificationDUneCibleTest extends TestCase
{
    public function testUneCibleQuiNeTombePasJusteRendLaPhraseAAfficher(): void
    {
        $rendu = self::rendu(['kcal' => 710, 'prot' => 40, 'gluc' => 100, 'lip' => 20]);

        self::assertSame(
            'Tes grammes représentent 740 calories, pas 710. '
            . "L'app respecte les grammes ; les calories suivent.",
            $rendu['avertissement'],
        );
    }

    /** Le temoin : sans lui, une route qui avertit tout le monde passerait. */
    public function testUneCibleQuiTombeJusteNeDitRien(): void
    {
        self::assertNull(
            self::rendu(['kcal' => 740, 'prot' => 40, 'gluc' => 100, 'lip' => 20])['avertissement'],
        );
    }

    /**
     * LE DRAPEAU DES GLUCIDES TOTAUX DOIT ARRIVER JUSQU'A LA REGLE. S'il se
     * perdait en route, l'ecran accuserait une cible atteignable des 7,5 g de
     * fibres — la panne M1 du 15 septembre 2026, reintroduite par le cablage.
     */
    public function testLeDrapeauDesGlucidesTotauxArriveJusquALaRegle(): void
    {
        $saisie = ['kcal' => 600, 'prot' => 40, 'gluc' => 100, 'lip' => 20];

        self::assertNotNull(self::rendu($saisie)['avertissement'],
            'en europeen, 600 kcal pour 740 de grammes se signale');
        self::assertNull(self::rendu($saisie + ['glucidesTotaux' => true])['avertissement'],
            '600 tombe dans [540 ; 740] : une part de fibres l’explique');
    }

    /**
     * UN CORPS INCOMPLET NE DOIT PAS FAIRE TOMBER LA ROUTE. L'ecran appelle des
     * la premiere frappe, comme pour l'aliment : ce qui manque vaut zero gramme,
     * jamais une erreur 500.
     */
    public function testUnCorpsVideNeFaitPasTomberLaRoute(): void
    {
        self::assertNull(self::rendu([])['avertissement']);
    }

    /** @param array<string, mixed> $corps @return array<string, mixed> */
    private static function rendu(array $corps): array
    {
        $controleur = new VerificationController();
        $controleur->setContainer(new Container());

        $requete = Request::create('/api/verification/cible', 'POST',
            content: (string) \json_encode($corps));

        /** @var array<string, mixed> $decode */
        $decode = \json_decode((string) $controleur->cible($requete)->getContent(), true);

        return $decode;
    }
}
