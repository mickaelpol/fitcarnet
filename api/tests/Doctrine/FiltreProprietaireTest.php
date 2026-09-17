<?php

declare(strict_types=1);

namespace App\Tests\Doctrine;

use App\Doctrine\FiltreProprietaire;
use App\Entity\Aliment;
use App\Entity\Exercice;
use App\Entity\Seance;
use App\Entity\Utilisateur;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\QueryBuilder;
use PHPUnit\Framework\TestCase;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\Security\Core\User\UserInterface;

/**
 * LE FILET QUI MANQUAIT SOUS L'ISOLATION DES COMPTES.
 *
 * CONSTAT C3 DE L'AUDIT DU 7 SEPTEMBRE 2026.
 *
 * Aucun test ne verifiait ce filtre. Le code, lui, etait bon — relu ligne a
 * ligne pendant l'audit. Mais toute la garantie d'isolation de l'application
 * tenait a DEUX `tags:` dans `services.yaml` et a un `is_a()` : une regression
 * ici n'aurait rien casse de visible, aucun test ne serait tombe, et chaque
 * compte aurait vu les seances, le stock et les plans de tous les autres.
 *
 * Un defaut qui ne fait pas de bruit est celui qu'on decouvre le plus tard.
 * D'ou ces cinq temoins, un par facon dont le filtre peut cesser de proteger.
 */
final class FiltreProprietaireTest extends TestCase
{
    /**
     * Le cas nominal : une entite marquee, un compte connecte.
     */
    public function testUneEntiteMarqueeEstRestreinteAuCompteConnecte(): void
    {
        $alice = new Utilisateur();
        $qb = self::requete(Seance::class);

        self::filtre($alice)->applyToCollection($qb, self::generateur(), Seance::class);

        self::assertStringContainsString('o.utilisateur = :utilisateur_courant', $qb->getDQL(),
            'sans ce WHERE, une collection rend les seances de tous les comptes');
        self::assertSame($alice->getId(), $qb->getParameter('utilisateur_courant')?->getValue(),
            'le filtre doit porter sur l\'identifiant du compte connecte, et pas un autre');
    }

    /**
     * LE PIEGE PRINCIPAL. Une extension posee en collection et oubliee en item
     * laisse fuir par `GET /api/seances/{id}` : la liste est propre, mais
     * l'identifiant d'un autre compte, devine ou recupere, rend sa seance.
     * C'est la moitie de l'isolation qui disparait sans que rien ne le montre.
     */
    public function testLaRestrictionVautAUSSIPourUnElementSeul(): void
    {
        $alice = new Utilisateur();
        $qb = self::requete(Seance::class);

        self::filtre($alice)->applyToItem($qb, self::generateur(), Seance::class, ['id' => 1]);

        self::assertStringContainsString('o.utilisateur = :utilisateur_courant', $qb->getDQL(),
            'GET /api/seances/{id} doit etre filtre comme la collection');
    }

    /**
     * Sans compte connecte, on ne rend RIEN — surtout pas tout. Un filtre qui
     * se contenterait de ne pas s'appliquer ouvrirait la base entiere.
     */
    public function testSansCompteConnecteAucuneLigneNEstRendue(): void
    {
        $qb = self::requete(Seance::class);

        self::filtre(null)->applyToCollection($qb, self::generateur(), Seance::class);

        self::assertStringContainsString('1 = 0', $qb->getDQL(),
            'un appel non authentifie doit rendre une collection vide, pas la base entiere');
        self::assertStringNotContainsString('utilisateur_courant', $qb->getDQL(),
            'aucun parametre de compte ne doit etre pose quand personne n\'est connecte');
    }

    /**
     * Le pare-feu `session` vit hors du pare-feu JWT et porte un autre type
     * d'utilisateur. Si un tel jeton atteignait une ressource filtree, le
     * `instanceof Utilisateur` est la derniere barriere.
     */
    public function testUnUtilisateurDUnAutreTypeNObtientRienNonPlus(): void
    {
        $qb = self::requete(Seance::class);
        $autreType = self::createStub(UserInterface::class);

        self::filtre($autreType)->applyToCollection($qb, self::generateur(), Seance::class);

        self::assertStringContainsString('1 = 0', $qb->getDQL(),
            'un utilisateur qui n\'est pas une entite Utilisateur ne doit rien obtenir');
    }

    /**
     * Un aliment porte les valeurs du produit que SON proprietaire a achete :
     * aucun autre compte ne le lit, ni en liste ni par son identifiant.
     */
    public function testUnAlimentNEstLuQueParSonProprietaire(): void
    {
        $alice = new Utilisateur();

        foreach (['collection', 'item'] as $portee) {
            $qb = self::requete(Aliment::class);
            'collection' === $portee
                ? self::filtre($alice)->applyToCollection($qb, self::generateur(), Aliment::class)
                : self::filtre($alice)->applyToItem($qb, self::generateur(), Aliment::class, ['id' => 1]);

            self::assertStringContainsString('o.utilisateur = :utilisateur_courant', $qb->getDQL(),
                "{$portee} : les aliments d'un compte ne doivent etre lus que par lui");
        }
    }

    /**
     * Le temoin. Sans lui, un filtre qui restreindrait TOUT ressemblerait a une
     * protection correcte : `Exercice` a son propre filtre, « public OU le mien »
     * (voir FiltreExerciceTest), et celui-ci ne doit pas s'en meler.
     */
    public function testUneEntiteNonMarqueeNEstPasTouchee(): void
    {
        $qb = self::requete(Exercice::class);
        $avant = $qb->getDQL();

        self::filtre(new Utilisateur())->applyToCollection($qb, self::generateur(), Exercice::class);

        self::assertSame($avant, $qb->getDQL(),
            'Exercice n\'est pas une ProprieteUtilisateur : ce filtre doit le laisser passer');
    }

    private static function filtre(?UserInterface $utilisateur): FiltreProprietaire
    {
        $security = self::createStub(Security::class);
        $security->method('getUser')->willReturn($utilisateur);

        return new FiltreProprietaire($security);
    }

    /**
     * Un vrai QueryBuilder, monte sans base : il assemble son DQL en memoire,
     * l'EntityManager n'est sollicite qu'a l'execution — qui n'a pas lieu ici.
     *
     * @param class-string $classe
     */
    private static function requete(string $classe): QueryBuilder
    {
        return (new QueryBuilder(self::createStub(EntityManagerInterface::class)))
            ->select('o')
            ->from($classe, 'o');
    }

    private static function generateur(): \ApiPlatform\Doctrine\Orm\Util\QueryNameGeneratorInterface
    {
        return self::createStub(\ApiPlatform\Doctrine\Orm\Util\QueryNameGeneratorInterface::class);
    }
}
