<?php

declare(strict_types=1);

namespace App\Tests\EventListener;

use App\Entity\Modele;
use App\EventListener\RefuserLesChampsInconnus;
use App\Serializer\ChampsInconnus;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;
use Symfony\Component\HttpKernel\HttpKernelInterface;

/**
 * L'ECOUTEUR, ET PAS SEULEMENT LE CONTROLE QU'IL APPELLE.
 *
 * `ChampsInconnusTest` eprouve la question « ce champ existe-t-il ? ». Rien ne
 * verifiait qu'elle etait POSEE : supprimer cet ecouteur, ou se tromper de
 * verbe, de type de requete ou d'attribut de route, laissait les sept tests au
 * vert et rendait `"partage": true` a son 201 silencieux. Releve par la revue le
 * 15 septembre 2026.
 *
 * Sans noyau : un `RequestEvent` se construit a la main autour d'une vraie
 * `Request`, et le noyau n'y sert qu'a remplir la signature.
 */
final class RefuserLesChampsInconnusTest extends TestCase
{
    private const CORPS_FAUTIF = '{"nom":"Push A","partage":true,"exercices":[]}';

    private function declencher(
        string $methode,
        string $corps,
        ?string $classe = Modele::class,
        int $type = HttpKernelInterface::MAIN_REQUEST,
    ): void {
        $requete = Request::create('/api/modeles', $methode, [], [], [], [], $corps);

        if (null !== $classe) {
            $requete->attributes->set('_api_resource_class', $classe);
        }

        (new RefuserLesChampsInconnus(new ChampsInconnus()))(
            new RequestEvent(self::createStub(HttpKernelInterface::class), $requete, $type),
        );
    }

    public function testUnPostQuiNommeUnChampInexistantEstRefuseEnLeNommant(): void
    {
        $this->expectException(BadRequestHttpException::class);
        $this->expectExceptionMessage('partage');

        $this->declencher('POST', self::CORPS_FAUTIF);
    }

    /**
     * PATCH et PUT ecrivent aussi : un seul verbe oublie, et la porte reste ouverte.
     *
     * On RELEVE les verbes refuses puis on compare la liste entiere. La premiere
     * version posait un `assertTrue(true)` dans le `catch` — une assertion qui
     * ne prouve rien par elle-meme, relevee par PHPStan.
     */
    public function testPatchEtPutSontControlesCommePost(): void
    {
        $refuses = [];

        foreach (['PATCH', 'PUT'] as $methode) {
            try {
                $this->declencher($methode, self::CORPS_FAUTIF);
            } catch (BadRequestHttpException) {
                $refuses[] = $methode;
            }
        }

        self::assertSame(['PATCH', 'PUT'], $refuses, 'un verbe d\'ecriture laisse passer un champ inexistant');
    }

    /** Le temoin de l'inverse : sans lui, un ecouteur qui refuse tout passerait. */
    public function testUnCorpsValidePasse(): void
    {
        $this->expectNotToPerformAssertions();

        $this->declencher('POST', '{"nom":"Push A","type":"Push","exercices":[]}');
    }

    public function testUneLectureNEstPasControlee(): void
    {
        $this->expectNotToPerformAssertions();

        $this->declencher('GET', self::CORPS_FAUTIF);
    }

    /** Les controleurs maison (`/mon-frigo/...`) lisent leur corps champ par champ. */
    public function testUneRouteHorsApiPlatformNEstPasControlee(): void
    {
        $this->expectNotToPerformAssertions();

        $this->declencher('POST', self::CORPS_FAUTIF, null);
    }

    /** Une sous-requete — la page d'erreur d'API Platform en est une — n'a pas de corps a juger. */
    public function testUneSousRequeteNEstPasControlee(): void
    {
        $this->expectNotToPerformAssertions();

        $this->declencher('POST', self::CORPS_FAUTIF, Modele::class, HttpKernelInterface::SUB_REQUEST);
    }

    /** Un JSON illisible est refuse par API Platform avec un message de syntaxe : on ne double pas. */
    public function testUnCorpsIllisibleEstLaisseAApiPlatform(): void
    {
        $this->expectNotToPerformAssertions();

        $this->declencher('POST', '{"nom": pas du json');
    }
}
