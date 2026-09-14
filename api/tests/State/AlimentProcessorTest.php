<?php

declare(strict_types=1);

namespace App\Tests\State;

use ApiPlatform\Metadata\Patch;
use ApiPlatform\Metadata\Post;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\Aliment;
use App\Entity\Utilisateur;
use App\State\AlimentProcessor;
use PHPUnit\Framework\TestCase;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\Security\Core\User\UserInterface;

/**
 * CORRIGER UN ALIMENT COMMUN NE DOIT PAS SE L'APPROPRIER.
 *
 * CONSTAT M-01 DE L'AUDIT DU 7 SEPTEMBRE 2026.
 *
 * Le processeur posait le proprietaire « seulement s'il manque ». C'est juste
 * a la creation, et faux partout ailleurs : un aliment de reference a
 * precisement `creePar = NULL`. Quand l'administrateur corrigeait la valeur
 * nutritionnelle d'un des ~50 aliments communs, le processeur la lui
 * attribuait et posait `public = false` — `FiltreAliment` faisait alors
 * DISPARAITRE cet aliment du catalogue de tous les autres comptes.
 *
 * Ce n'etait pas une fuite mais une perte d'acces silencieuse a une donnee
 * partagee, declenchee par le geste le plus normal de l'administration. Aucun
 * ecran ne le disait.
 *
 * Le remede tient en un mot : l'OPERATION fait foi, pas l'etat du champ.
 */
final class AlimentProcessorTest extends TestCase
{
    public function testUnAlimentCreeAppartientAuCompteConnecteEtLuiResteConfidentiel(): void
    {
        $alice = new Utilisateur();
        $aliment = (new Aliment())->setNom('Skyr maison');

        $recus = [];
        self::processeur($alice, $recus)->process($aliment, new Post());

        self::assertSame($alice, $aliment->getCreePar(),
            'un aliment saisi doit revenir a son auteur');
        self::assertFalse($aliment->isPublic(),
            'sur des valeurs nutritionnelles, l\'erreur de l\'un ne doit pas fausser la diete des autres');
        self::assertSame([$aliment], $recus,
            'le processeur doit toujours passer la main a la persistance');
    }

    /**
     * LE CONSTAT M-01 LUI-MEME.
     */
    public function testCorrigerUnAlimentCommunNeLeRetirePasDuCatalogue(): void
    {
        $commun = (new Aliment())->setNom('Riz basmati');   // creePar NULL, public true

        $recus = [];
        self::processeur(new Utilisateur(), $recus)->process($commun, new Patch());

        self::assertNull($commun->getCreePar(),
            'corriger un aliment de reference ne doit pas se l\'approprier');
        self::assertTrue($commun->isPublic(),
            'l\'aliment doit rester dans le catalogue de tous les comptes');
    }

    /**
     * Le temoin : modifier son propre aliment ne doit rien changer non plus.
     * Sans lui, un processeur qui ne ferait plus RIEN passerait le test
     * precedent sans qu'on s'en apercoive.
     */
    public function testModifierSonPropreAlimentNeChangeNiAuteurNiConfidentialite(): void
    {
        $alice = new Utilisateur();
        $sien = (new Aliment())->setNom('Skyr maison')->setCreePar($alice)->setPublic(false);

        $recus = [];
        self::processeur($alice, $recus)->process($sien, new Patch());

        self::assertSame($alice, $sien->getCreePar());
        self::assertFalse($sien->isPublic());
    }

    public function testSansCompteConnecteAucunAuteurNEstInvente(): void
    {
        $aliment = (new Aliment())->setNom('Orphelin');

        $recus = [];
        self::processeur(null, $recus)->process($aliment, new Post());

        self::assertNull($aliment->getCreePar(),
            'aucun auteur ne doit etre pose quand personne n\'est connecte');
    }

    /**
     * @param list<mixed> $recus les objets reellement transmis a la persistance
     */
    private static function processeur(?UserInterface $utilisateur, array &$recus): AlimentProcessor
    {
        $persistance = self::createStub(ProcessorInterface::class);
        $persistance->method('process')->willReturnCallback(
            static function (mixed $donnee) use (&$recus): mixed {
                $recus[] = $donnee;

                return $donnee;
            });

        $security = self::createStub(Security::class);
        $security->method('getUser')->willReturn($utilisateur);

        return new AlimentProcessor($persistance, $security);
    }
}
