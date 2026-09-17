<?php

declare(strict_types=1);

namespace App\Tests\State;

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
