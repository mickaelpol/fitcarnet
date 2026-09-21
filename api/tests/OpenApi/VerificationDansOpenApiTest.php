<?php

declare(strict_types=1);

namespace App\Tests\OpenApi;

use ApiPlatform\OpenApi\Factory\OpenApiFactoryInterface;
use ApiPlatform\OpenApi\Model\Info;
use ApiPlatform\OpenApi\Model\Operation;
use ApiPlatform\OpenApi\Model\PathItem;
use ApiPlatform\OpenApi\Model\Paths;
use ApiPlatform\OpenApi\OpenApi;
use App\OpenApi\VerificationDansOpenApi;
use PHPUnit\Framework\TestCase;

/**
 * LE CONTRAT DE L'API DECRIT-IL LE METIER QUI A QUITTE LE FRONT ?
 *
 * La refonte des 20 et 21 septembre 2026 a deplace le metier vers le serveur
 * pour que le front soit remplacable : « comme ca je peux changer le front
 * quand bon me semble ». Si les routes qui portent ce metier ne figurent pas
 * dans `/api/docs`, la promesse ne tient pas — le metier a bien demenage, mais
 * son mode d'emploi n'existe nulle part.
 *
 * SANS NOYAU NI BASE, comme le reste des suites de ce projet : le decorateur
 * est eprouve seul, avec une doublure a la place de la fabrique qu'il decore.
 */
final class VerificationDansOpenApiTest extends TestCase
{
    public function testLES_QUATRE_ROUTES_DU_METIER_SONT_DOCUMENTEES(): void
    {
        $paths = $this->decore()->getPaths();

        foreach ([
            '/api/verification/aliment',
            '/api/verification/mot-de-passe',
            /* LA QUATRIEME est arrivee avec le palier B, le 21 septembre 2026 :
               l'ecran des objectifs ne juge plus la coherence d'une cible, il
               demande. Elle est inscrite ici AVANT d'exister, pour que le test
               tombe si le decorateur l'oublie comme il a oublie la troisieme. */
            '/api/verification/cible',
            /* LA TROISIEME A ETE OUBLIEE LE JOUR DE SA CREATION — releve par
               `revue-pile` le 21 septembre 2026. L'en-tete du decorateur
               annoncait « LES DEUX ROUTES DE VERIFICATION » et cette liste en
               portait deux : le jumeau oublie, applique au contrat.

               C'est la pire des trois a manquer. Un front ecrit demain
               decouvrait comment juger un aliment et un mot de passe, mais PAS
               la regle du chrono — la seule sans laquelle son compteur
               « 7 sur 12 » est faux. */
            '/api/modes-de-travail',
        ] as $chemin) {
            $item = $paths->getPath($chemin);

            self::assertInstanceOf(PathItem::class, $item,
                $chemin . ' manque au contrat : un autre front ne peut pas le deviner');
            self::assertNotNull($item->getPost() ?? $item->getGet(),
                $chemin . ' est declare sans operation : il ne dit rien');
        }
    }

    public function testCE_QUI_ETAIT_DEJA_DOCUMENTE_LE_RESTE(): void
    {
        /* LE TEMOIN, et il n'est pas theorique : `api_platform.openapi.factory`
           est DEJA decoree par le bundle JWT, qui y ajoute `/api/connexion`.
           Un decorateur qui rendrait un contrat neuf au lieu d'enrichir celui
           qu'on lui passe effacerait tout le reste — les 25 chemins des
           ressources comprises — sans qu'aucune autre assertion ne tombe. */
        $paths = $this->decore()->getPaths();

        self::assertInstanceOf(PathItem::class, $paths->getPath('/api/connexion'),
            'le decorateur doit ENRICHIR le contrat recu, pas le remplacer');
        self::assertInstanceOf(PathItem::class, $paths->getPath('/api/aliments'));
    }

    public function testLA_ROUTE_PUBLIQUE_ANNONCE_SA_LIMITE(): void
    {
        /* Un client qui ne sait pas qu'il peut recevoir 429 le traitera comme
           une panne. La reponse doit donc figurer au contrat, pas seulement
           dans le code du controleur. */
        $post = $this->decore()->getPaths()
            ->getPath('/api/verification/mot-de-passe')?->getPost();

        self::assertNotNull($post);
        self::assertArrayHasKey('429', $post->getResponses() ?? [],
            'la route est bornee a 120 appels par minute : le dire fait partie du contrat');
    }

    // ----------------------------------------------------------------- outils

    /** Le contrat tel que le decorateur le rend, a partir d'un contrat deja rempli. */
    private function decore(): OpenApi
    {
        $paths = new Paths();
        /* Ce que les autres producteurs ont deja pose : le bundle JWT et
           API Platform lui-meme. */
        $paths->addPath('/api/connexion', new PathItem(post: new Operation(operationId: 'connexion')));
        $paths->addPath('/api/aliments', new PathItem(get: new Operation(operationId: 'aliments')));

        $interne = self::createStub(OpenApiFactoryInterface::class);
        $interne->method('__invoke')->willReturn(
            new OpenApi(new Info('fitcarnet', '1.0'), [], $paths));

        return (new VerificationDansOpenApi($interne))();
    }
}
