<?php

declare(strict_types=1);

namespace App\Tests\Doctrine;

use ApiPlatform\Doctrine\Orm\Util\QueryNameGeneratorInterface;
use App\Doctrine\FiltreAliment;
use App\Entity\Aliment;
use App\Entity\Seance;
use App\Entity\Utilisateur;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\QueryBuilder;
use PHPUnit\Framework\TestCase;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\Security\Core\User\UserInterface;

/**
 * L'EXCEPTION DOCUMENTEE DE LA REGLE 2, ET SON PIEGE.
 *
 * CONSTAT C3 DE L'AUDIT DU 7 SEPTEMBRE 2026, SECOND VOLET.
 *
 * Un aliment n'est pas une « ProprieteUtilisateur » : son proprietaire est
 * facultatif, un aliment sans `cree_par` appartient a tout le monde. La regle
 * n'est donc pas « le mien » mais « commun OU le mien », et c'est ce OR qui
 * rend ce filtre plus fragile que son voisin.
 *
 * Le code porte depuis l'origine un commentaire disant les parentheses
 * « indispensables ». Il avait raison, et rien ne le verifiait : c'est
 * l'objet du deuxieme test.
 */
final class FiltreAlimentTest extends TestCase
{
    public function testOnVoitLesAlimentsCommunsEtLesSiens(): void
    {
        $alice = new Utilisateur();
        $qb = self::requete(Aliment::class);

        self::filtre($alice)->applyToCollection($qb, self::generateur(), Aliment::class);

        self::assertStringContainsString('o.creePar IS NULL OR o.creePar = :utilisateur_courant', $qb->getDQL(),
            'le catalogue doit rendre les aliments communs ET ceux du compte connecte');
        self::assertSame($alice->getId(), $qb->getParameter('utilisateur_courant')?->getValue(),
            'la moitie « le mien » doit porter sur le compte connecte');
    }

    /**
     * LE PIEGE, ET LA RAISON D'ETRE DE CE FICHIER.
     *
     * « AND » lie plus fort que « OR ». Si le OR de ce filtre n'etait pas
     * enferme, une recherche ajoutee ensuite se lirait :
     *
     *   creePar IS NULL  OU  (creePar = :moi  ET  nom LIKE :q)
     *
     * — le catalogue commun ENTIER remonterait, quoi qu'on cherche.
     *
     * Ce test fige l'INVARIANT, pas la mecanique qui le realise. La nuance a
     * son importance : verifie le 14 septembre 2026, ce ne sont pas les
     * parentheses du code source qui protegent — Doctrine parenthese deja
     * toute partie contenant « OR » (Query\Expr\Composite, correctif DDC-1237),
     * et les retirer ne change pas un caractere du DQL. Un test qui aurait
     * exige une paire exacte aurait donc jure proteger quelque chose qu'il ne
     * regardait pas. On verifie ici ce qui compte vraiment : que le OR reste
     * un bloc, par quelque moyen que ce soit, et que rien ne puisse le
     * disjoindre.
     *
     * Honnetete sur sa portee : ce temoin n'a PAS pu etre mis en echec en
     * reecrivant le filtre — ni en posant le OR par `orWhere`, ni en retirant
     * les parentheses. Doctrine protege dans tous les cas. Il tombe en
     * revanche des que la condition elle-meme change. C'est donc un canari
     * contre une reecriture en SQL natif ou un changement de comportement de
     * l'ORM, pas une garantie sur le code d'aujourd'hui — lequel n'a, sur ce
     * point precis, aucun moyen connu de mal se comporter.
     */
    public function testLeORResteUnBlocFaceAUneRechercheAjouteeEnsuite(): void
    {
        $qb = self::requete(Aliment::class);

        // le filtre d'abord — il est prioritaire, c'est l'ordre reel
        self::filtre(new Utilisateur())->applyToCollection($qb, self::generateur(), Aliment::class);

        // puis la recherche, posee par-dessus
        $qb->andWhere('o.nom LIKE :recherche')->setParameter('recherche', '%riz%');

        self::assertMatchesRegularExpression(
            '/\(+o\.creePar IS NULL OR o\.creePar = :utilisateur_courant\)+ AND o\.nom LIKE :recherche/',
            $qb->getDQL(),
            'le OR doit rester enferme, sinon la recherche ne contraint plus le catalogue commun');
    }

    /**
     * Meme piege que pour FiltreProprietaire : un filtre pose en collection et
     * oublie en item laisse fuir par `GET /api/aliments/{id}`.
     */
    public function testLaRestrictionVautAUSSIPourUnElementSeul(): void
    {
        $qb = self::requete(Aliment::class);

        self::filtre(new Utilisateur())->applyToItem($qb, self::generateur(), Aliment::class, ['id' => 1]);

        self::assertStringContainsString('o.creePar IS NULL OR o.creePar = :utilisateur_courant', $qb->getDQL(),
            'GET /api/aliments/{id} doit etre filtre comme la collection');
    }

    public function testSansCompteConnecteAucunAlimentNEstRendu(): void
    {
        $qb = self::requete(Aliment::class);

        self::filtre(null)->applyToCollection($qb, self::generateur(), Aliment::class);

        self::assertStringContainsString('1 = 0', $qb->getDQL(),
            'un appel non authentifie ne doit meme pas voir le catalogue commun');
    }

    /**
     * Le temoin : ce filtre ne connait que les aliments. Les seances relevent
     * de FiltreProprietaire, et deux filtres qui se marchent dessus poseraient
     * un `creePar` sur une entite qui n'en a pas — erreur DQL a l'execution.
     */
    public function testUneAutreEntiteNEstPasTouchee(): void
    {
        $qb = self::requete(Seance::class);
        $avant = $qb->getDQL();

        self::filtre(new Utilisateur())->applyToCollection($qb, self::generateur(), Seance::class);

        self::assertSame($avant, $qb->getDQL(),
            'ce filtre ne doit toucher que Aliment : Seance releve de FiltreProprietaire');
    }

    private static function filtre(?UserInterface $utilisateur): FiltreAliment
    {
        $security = self::createStub(Security::class);
        $security->method('getUser')->willReturn($utilisateur);

        return new FiltreAliment($security);
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
