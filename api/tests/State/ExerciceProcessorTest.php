<?php

declare(strict_types=1);

namespace App\Tests\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\Metadata\Patch;
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
     * SUR UN PATCH, LE PROCESSEUR NE TOUCHE A RIEN.
     *
     * Ce test s'intitulait « un administrateur peut publier un exercice
     * existant » et decrivait un scenario IMPOSSIBLE. Verifie le 15 septembre
     * 2026 : `public` n'a aucun groupe de denormalisation, un administrateur ne
     * peut donc pas l'envoyer. Le mecanisme de publication n'existe pas — le
     * commentaire du processeur l'affirmait, a tort, et il a ete corrige.
     *
     * Ce que ce test garantit reellement, et qui compte : un PATCH ne
     * reattribue pas l'exercice a celui qui le modifie. Depuis que F-09 ouvre
     * le Patch a l'auteur ET a l'administrateur, c'est la seule chose qui
     * empeche une correction d'emporter la paternite avec elle.
     *
     * Il passait autrefois une operation `Post` en pretendant decrire un PATCH,
     * et passait quand meme parce que le processeur regardait l'etat du champ
     * au lieu de l'operation : c'est ce qui masquait le defaut ci-dessous. Un test qui ment sur
     * son scenario protege le defaut.
     */
    public function testUnPatchNeReattribuePasLExerciceACeluiQuiLeModifie(): void
    {
        $alice = new Utilisateur();
        $exercice = (new Exercice())->setNom('Souleve de terre roumain')
            ->setCreePar($alice)
            ->setPublic(true);            // ce que le PATCH vient de poser

        $recus = [];
        self::processeur(new Utilisateur(), $recus)->process($exercice, new Patch());

        self::assertSame($alice, $exercice->getCreePar(),
            'corriger l\'exercice d\'un autre ne doit pas se l\'approprier');
        self::assertTrue($exercice->isPublic(),
            'et ne doit pas non plus le retirer du catalogue ou il se trouve');
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
     * LE GARDE « SEULEMENT S'IL MANQUE », REPRODUIT ICI LE JOUR MEME OU IL
     * AVAIT ETE CORRIGE AILLEURS.
     *
     * Le garde `null === getCreePar()` est juste a la creation et faux partout
     * ailleurs : un exercice du CATALOGUE COMMUN a precisement `creePar = NULL`.
     * En se fiant a l'etat du champ plutot qu'a l'operation, le processeur
     * s'appropriait l'exercice qu'un administrateur venait corriger — et
     * `public = false` le faisait disparaitre du catalogue de tout le monde.
     *
     * C'est le cas d'usage PRINCIPAL du PATCH ici : renseigner une video ou un
     * nom francais. Le geste le plus normal de l'administration cassait le
     * catalogue, en silence.
     *
     * Meme defaut que celui d'`AlimentProcessor`, corrige le 14 septembre
     * 2026 (motif 2 de `revue-de-code`) : une decision juste appliquee
     * a un endroit et recopiee sans son contexte. Le remede est le meme —
     * se fier a l'operation, pas a l'etat du champ.
     */
    public function testCorrigerUnExerciceDuCatalogueCommunNeSeLApproprie(): void
    {
        $commun = (new Exercice())->setNom('Developpe couche');   // creePar NULL, public true

        $recus = [];
        self::processeur(new Utilisateur(), $recus)->process($commun, new Patch());

        self::assertNull($commun->getCreePar(),
            'un PATCH d\'administration ne doit pas s\'approprier un exercice commun');
        self::assertTrue($commun->isPublic(),
            'corriger une video ne doit pas retirer l\'exercice du catalogue de tous');
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
