<?php

declare(strict_types=1);

namespace App\Tests\Doctrine;

use ApiPlatform\Doctrine\Orm\Util\QueryNameGeneratorInterface;
use App\Doctrine\FiltreExercice;
use App\Entity\Aliment;
use App\Entity\Exercice;
use App\Entity\Utilisateur;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\QueryBuilder;
use PHPUnit\Framework\TestCase;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\Security\Core\User\UserInterface;

/**
 * « ETOILE EXERCICE PERSONNEL » : L'ETIQUETTE DISAIT VRAI, LE CODE NON.
 *
 * CONSTAT E8 / F-04 DE L'AUDIT DU 7 SEPTEMBRE 2026.
 *
 * `Exercice` portait `public` et `creePar` depuis l'origine. Aucun des deux
 * n'etait jamais renseigne ni lu : `setCreePar()` n'avait pas un seul appelant
 * dans tout le projet. Pendant ce temps l'ecran affichait « ★ exercice
 * personnel » sur les exercices ajoutes depuis l'application — et ils etaient
 * visibles de tous les comptes.
 *
 * Ce n'etait pas une fuite au sens strict : rien n'etait marque comme
 * appartenant a quelqu'un, le catalogue etait commun et la classe l'assumait.
 * Mais un nom d'exercice peut etre personnel — « Reeducation epaule Dr X » —
 * et une etiquette qui promet la confidentialite sans la fournir est pire
 * qu'une etiquette absente : on lui fait confiance.
 *
 * Decision du 14 septembre 2026 : les exercices personnels le deviennent
 * vraiment. La regle est « PUBLIC ou LE MIEN », et non « commun ou le mien »
 * comme pour Aliment — la nuance permet a un administrateur de publier un
 * exercice sans en effacer l'auteur.
 *
 * Les 1338 exercices du catalogue importe sont `public = true` : ils restent
 * visibles de tous, sans migration de donnees.
 */
final class FiltreExerciceTest extends TestCase
{
    public function testOnVoitLeCataloguePublicEtSesPropresExercices(): void
    {
        $alice = new Utilisateur();
        $qb = self::requete(Exercice::class);

        self::filtre($alice)->applyToCollection($qb, self::generateur(), Exercice::class);

        self::assertStringContainsString('o.public = true OR o.creePar = :utilisateur_courant', $qb->getDQL(),
            'le catalogue public ET les exercices du compte connecte doivent remonter');
        self::assertSame($alice->getId(), $qb->getParameter('utilisateur_courant')?->getValue(),
            'la moitie « le mien » doit porter sur le compte connecte');
    }

    /**
     * Le coeur du constat : l'exercice prive d'un autre compte ne doit pas
     * remonter. On le verifie par ce que la requete EXIGE — un exercice qui
     * n'est ni public ni le mien ne satisfait aucune des deux moities.
     */
    public function testUnExercicePriveDUnAutreCompteNeRemontePas(): void
    {
        $qb = self::requete(Exercice::class);

        self::filtre(new Utilisateur())->applyToCollection($qb, self::generateur(), Exercice::class);

        self::assertStringNotContainsString('o.creePar IS NULL', $qb->getDQL(),
            'la regle est « public OU le mien » : un exercice sans auteur mais non public reste cache');
    }

    public function testLaRestrictionVautAUSSIPourUnElementSeul(): void
    {
        $qb = self::requete(Exercice::class);

        self::filtre(new Utilisateur())->applyToItem($qb, self::generateur(), Exercice::class, ['id' => 1]);

        self::assertStringContainsString('o.public = true OR o.creePar = :utilisateur_courant', $qb->getDQL(),
            'GET /api/exercices/{id} doit etre filtre comme la collection');
    }

    /**
     * « AND » lie plus fort que « OR » : le bloc doit rester entier face a une
     * recherche ajoutee ensuite, sans quoi tout le catalogue public echapperait
     * au filtre de recherche. Meme invariant que FiltreAliment.
     */
    public function testLeORResteUnBlocFaceAUneRechercheAjouteeEnsuite(): void
    {
        $qb = self::requete(Exercice::class);

        self::filtre(new Utilisateur())->applyToCollection($qb, self::generateur(), Exercice::class);
        $qb->andWhere('o.nom LIKE :recherche')->setParameter('recherche', '%developpe%');

        self::assertMatchesRegularExpression(
            '/\(+o\.public = true OR o\.creePar = :utilisateur_courant\)+ AND o\.nom LIKE :recherche/',
            $qb->getDQL(),
            'le OR doit rester enferme, sinon la recherche ne contraint plus le catalogue public');
    }

    public function testSansCompteConnecteAucunExerciceNEstRendu(): void
    {
        $qb = self::requete(Exercice::class);

        self::filtre(null)->applyToCollection($qb, self::generateur(), Exercice::class);

        self::assertStringContainsString('1 = 0', $qb->getDQL(),
            'un appel non authentifie ne doit meme pas voir le catalogue public');
    }

    /**
     * Le temoin : ce filtre ne connait que les exercices. Applique a Aliment,
     * il poserait un `public` sur une entite qui n'a pas la meme regle.
     */
    public function testUneAutreEntiteNEstPasTouchee(): void
    {
        $qb = self::requete(Aliment::class);
        $avant = $qb->getDQL();

        self::filtre(new Utilisateur())->applyToCollection($qb, self::generateur(), Aliment::class);

        self::assertSame($avant, $qb->getDQL(),
            'ce filtre ne doit toucher que Exercice : Aliment releve de FiltreAliment');
    }

    private static function filtre(?UserInterface $utilisateur): FiltreExercice
    {
        $security = self::createStub(Security::class);
        $security->method('getUser')->willReturn($utilisateur);

        return new FiltreExercice($security);
    }

    /**
     * @param class-string $classe
     */
    private static function requete(string $classe): QueryBuilder
    {
        return (new QueryBuilder(self::createStub(EntityManagerInterface::class)))
            ->select('o')
            ->from($classe, 'o');
    }

    private static function generateur(): QueryNameGeneratorInterface
    {
        return self::createStub(QueryNameGeneratorInterface::class);
    }
}
