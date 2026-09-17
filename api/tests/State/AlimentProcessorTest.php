<?php

declare(strict_types=1);

namespace App\Tests\State;

use ApiPlatform\Metadata\ApiResource;
use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\Aliment;
use App\Entity\Utilisateur;
use App\State\AlimentProcessor;
use App\State\ProprietaireProcessor;
use Doctrine\DBAL\Driver\Exception as ExceptionDuPilote;
use Doctrine\DBAL\Exception\UniqueConstraintViolationException;
use PHPUnit\Framework\TestCase;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;

/**
 * Un aliment appartient au compte qui le cree, et un nom deja pris chez ce
 * compte se dit en toutes lettres.
 *
 * La pose du proprietaire est celle de toutes les entites rattachees a un
 * compte : `ProprietaireProcessor`, sur un Post, depuis le jeton et jamais
 * depuis le corps de la requete. `AlimentProcessor` n'y ajoute qu'une chose :
 * l'index `aliment_nom_unique_par_compte` ne se verifie qu'a l'insertion, et
 * son refus doit arriver a l'ecran comme une phrase, pas comme un SQLSTATE.
 */
final class AlimentProcessorTest extends TestCase
{
    public function testUnAlimentCreeAppartientAuCompteConnecte(): void
    {
        $alice = new Utilisateur();
        $aliment = (new Aliment())->setNom('Skyr maison');

        $recus = [];
        $rendu = self::processeur($alice, $recus)->process($aliment, new Post());

        self::assertSame($alice, $aliment->getUtilisateur(),
            'un aliment saisi doit revenir a son auteur');
        self::assertSame([$aliment], $recus,
            'le processeur doit toujours passer la main a la persistance');
        self::assertSame($aliment, $rendu);
    }

    public function testModifierSonAlimentNeChangePasDeProprietaire(): void
    {
        $alice = new Utilisateur();
        $sien = (new Aliment())->setNom('Skyr maison')->setUtilisateur($alice);

        $recus = [];
        self::processeur(new Utilisateur(), $recus)->process($sien, new Patch());

        self::assertSame($alice, $sien->getUtilisateur(),
            'seule la creation pose le proprietaire');
    }

    public function testUnNomDejaPrisSeDitEnToutesLettres(): void
    {
        $aliment = (new Aliment())->setNom('Riz blanc, cru');

        $recus = [];
        $refus = null;
        try {
            self::processeur(new Utilisateur(), $recus, doublon: true)->process($aliment, new Post());
        } catch (\Throwable $e) {
            $refus = $e;
        }

        self::assertInstanceOf(UnprocessableEntityHttpException::class, $refus,
            'un doublon de nom est une erreur de saisie (422), pas une panne (500)');
        self::assertStringContainsString('« Riz blanc, cru »', $refus->getMessage());
    }

    /**
     * LE CABLAGE, QUE LES TESTS CI-DESSUS NE VOIENT PAS. Ils construisent
     * eux-memes `new AlimentProcessor(new ProprietaireProcessor(...))` : si
     * l'attribut `#[Autowire]` retombait sur le processeur de persistance nu —
     * sa valeur d'avant le 17 septembre 2026 —, ils resteraient verts, et tout
     * `POST /api/aliments` partirait SANS proprietaire : violation NOT NULL,
     * un 500 pour tous les comptes. Releve par `revue-fitcarnet`. Vu tomber en
     * remettant l'ancienne valeur de l'attribut.
     */
    public function testLeConteneurLuiDonneLeProcesseurDeProprietaire(): void
    {
        $parametre = (new \ReflectionMethod(AlimentProcessor::class, '__construct'))->getParameters()[0];
        $attributs = $parametre->getAttributes(Autowire::class);

        self::assertCount(1, $attributs, 'le delegue d\'AlimentProcessor n\'est plus designe');
        self::assertSame(ProprietaireProcessor::class, (string) $attributs[0]->newInstance()->value,
            'sans ProprietaireProcessor, un aliment cree n\'a pas de proprietaire');
    }

    public function testLesEcrituresDeLAlimentPassentParCeProcesseur(): void
    {
        $processeurs = [];
        foreach ((new \ReflectionClass(Aliment::class))->getAttributes(ApiResource::class) as $ressource) {
            foreach ($ressource->newInstance()->getOperations() ?? [] as $operation) {
                if ($operation instanceof Post || $operation instanceof Patch) {
                    $processeurs[$operation::class] = $operation->getProcessor();
                }
            }
        }

        self::assertSame(
            [Post::class => AlimentProcessor::class, Patch::class => AlimentProcessor::class],
            $processeurs,
            'une creation ou une correction qui contourne AlimentProcessor perd le proprietaire ou le message du doublon',
        );
    }

    /**
     * @param list<mixed> $recus les objets reellement transmis a la persistance
     */
    private static function processeur(?Utilisateur $utilisateur, array &$recus, bool $doublon = false): AlimentProcessor
    {
        $persistance = self::createStub(ProcessorInterface::class);
        $persistance->method('process')->willReturnCallback(
            static function (mixed $donnee) use (&$recus, $doublon): mixed {
                if ($doublon) {
                    throw new UniqueConstraintViolationException(
                        self::createStub(ExceptionDuPilote::class), null);
                }
                $recus[] = $donnee;

                return $donnee;
            });

        $security = self::createStub(Security::class);
        $security->method('getUser')->willReturn($utilisateur);

        return new AlimentProcessor(new ProprietaireProcessor($persistance, $security));
    }
}
