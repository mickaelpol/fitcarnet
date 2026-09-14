<?php

declare(strict_types=1);

namespace App\Tests\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\Metadata\Post;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\Exercice;
use App\Entity\Utilisateur;
use App\State\ExerciceProcessor;
use PHPUnit\Framework\TestCase;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\Security\Core\User\UserInterface;

/**
 * UN EXERCICE AJOUTE DEPUIS L'APPLICATION APPARTIENT A SON AUTEUR.
 *
 * CONSTAT E8 / F-04 DE L'AUDIT DU 7 SEPTEMBRE 2026, SECOND VOLET.
 *
 * `FiltreExercice` filtre sur `public` et `creePar`. Il ne sert a rien tant
 * que personne ne les renseigne — et c'etait exactement l'etat du projet :
 * `setCreePar()` n'avait pas un seul appelant, la colonne restait NULL, et
 * l'etoile « exercice personnel » de l'ecran ne reposait sur rien.
 *
 * C'est ce processeur qui rend l'etiquette vraie.
 */
final class ExerciceProcessorTest extends TestCase
{
    public function testUnExerciceCreeAppartientAuCompteConnecteEtResteConfidentiel(): void
    {
        $alice = new Utilisateur();
        $exercice = (new Exercice())->setNom('Reeducation epaule');

        $recus = [];
        self::processeur($alice, $recus)->process($exercice, self::operation());

        self::assertSame($alice, $exercice->getCreePar(),
            'l\'exercice doit revenir a qui l\'a cree');
        self::assertFalse($exercice->isPublic(),
            'un exercice ajoute depuis l\'application ne rejoint pas le catalogue commun');
        self::assertSame([$exercice], $recus,
            'le processeur doit toujours passer la main a la persistance');
    }

    /**
     * `public` est dans le groupe d'ecriture — il doit y rester pour que le
     * PATCH d'administration puisse publier un exercice. Un client ordinaire
     * pourrait donc le transmettre a la creation : on l'ecrase.
     */
    public function testUnPublicTransmisALaCreationEstIgnore(): void
    {
        $exercice = (new Exercice())->setNom('Tentative')->setPublic(true);

        $recus = [];
        self::processeur(new Utilisateur(), $recus)->process($exercice, self::operation());

        self::assertFalse($exercice->isPublic(),
            'la confidentialite ne doit pas dependre de ce que le client envoie');
    }

    /**
     * LE MECANISME DE PUBLICATION. Un PATCH recharge l'exercice depuis la base,
     * auteur compris : le processeur n'y touche plus. C'est ainsi qu'un
     * administrateur verse au catalogue commun l'exercice bien redige de
     * quelqu'un, sans en effacer la paternite.
     */
    public function testUnAdministrateurPeutPublierUnExerciceExistant(): void
    {
        $alice = new Utilisateur();
        $exercice = (new Exercice())->setNom('Souleve de terre roumain')
            ->setCreePar($alice)
            ->setPublic(true);            // ce que le PATCH vient de poser

        $recus = [];
        self::processeur(new Utilisateur(), $recus)->process($exercice, self::operation());

        self::assertTrue($exercice->isPublic(),
            'le processeur ne doit pas defaire la publication decidee par un administrateur');
        self::assertSame($alice, $exercice->getCreePar(),
            'publier un exercice ne doit pas en changer l\'auteur');
    }

    /**
     * Sans compte connecte on ne pose rien, et surtout on ne rend pas public
     * par defaut : la contrainte NOT NULL refusera l'ecriture, bruyamment.
     */
    public function testSansCompteConnecteAucunAuteurNEstInvente(): void
    {
        $exercice = (new Exercice())->setNom('Orphelin');

        $recus = [];
        self::processeur(null, $recus)->process($exercice, self::operation());

        self::assertNull($exercice->getCreePar(),
            'aucun auteur ne doit etre pose quand personne n\'est connecte');
    }

    /**
     * @param list<mixed> $recus les objets reellement transmis a la persistance
     */
    private static function processeur(?UserInterface $utilisateur, array &$recus): ExerciceProcessor
    {
        $persistance = self::createStub(ProcessorInterface::class);
        $persistance->method('process')->willReturnCallback(
            static function (mixed $donnee) use (&$recus): mixed {
                $recus[] = $donnee;

                return $donnee;
            });

        $security = self::createStub(Security::class);
        $security->method('getUser')->willReturn($utilisateur);

        return new ExerciceProcessor($persistance, $security);
    }

    private static function operation(): Operation
    {
        return new Post();
    }
}
