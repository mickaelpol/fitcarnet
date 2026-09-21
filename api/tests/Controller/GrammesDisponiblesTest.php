<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Controller\FrigoController;
use App\Entity\Utilisateur;
use App\Repository\PlansPrevus;
use App\Service\EcartDInventaire;
use App\Service\Frigo;
use App\Service\FrigoBase;
use App\Service\FrigoGrocy;
use App\Service\InventaireLots;
use Doctrine\DBAL\Connection;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\DependencyInjection\Container;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\Security\Core\Authentication\Token\Storage\TokenStorage;
use Symfony\Component\Security\Core\Authentication\Token\UsernamePasswordToken;

/**
 * `GET /api/mon-frigo` REND CE QUI RESTE VRAIMENT — palier B, 21 septembre 2026.
 *
 * Le front calculait « stock moins promis » avec `dejaPromis` et
 * `grammesDisponibles`, a partir de deux reponses du serveur qu'il ne modifie
 * pas. C'est le cas le plus net du palier : la valeur n'est derivee d'AUCUN etat
 * que l'ecran mute, donc le serveur peut la rendre.
 *
 * LE BUG QUE LA REGLE CORRIGE est ancien et coute cher : deux batch cooking
 * d'affilee comptaient deux fois le meme frigo, chacun juste tout seul et faux
 * ensemble.
 *
 * CE QU'ON EPROUVE ICI EST LE CABLAGE, pas la regle : `StockPromisTest` couvre
 * la regle, y compris le stock inconnu que la source « base » ne peut pas
 * produire (elle compte toujours en grammes).
 */
final class GrammesDisponiblesTest extends TestCase
{
    public function testCeQuUnPlanPREVUReserveEstRetireDuDisponible(): void
    {
        $aliment = self::rendu(stockEnGrammes: 1000.0, promis: 800.0);

        self::assertEquals(1000, $aliment['stock'],
            'le stock brut ne bouge pas : c’est ce qu’il y a dans le frigo');
        self::assertEquals(200, $aliment['grammesDisponibles'],
            '1 000 g en stock, 800 promis à un plan prévu');
    }

    /** LE TEMOIN : sans plan, le disponible est le stock entier. */
    public function testSansPlanLeDisponibleEstLeStockEntier(): void
    {
        self::assertEquals(1000, self::rendu(1000.0, 0.0)['grammesDisponibles']);
    }

    /**
     * Un frigo negatif n'existe pas, et le solveur le lirait comme une dette a
     * rembourser sur les repas suivants.
     */
    public function testLeDisponibleNeDescendJamaisSousZero(): void
    {
        $aliment = self::rendu(400.0, 900.0);

        /* `assertNotNull` D'ABORD, ET CE N'EST PAS DU ZELE : `assertEquals(0, null)`
           PASSE, la comparaison etant lache. Sans cette ligne, ce cas serait vert
           alors meme que le champ n'existe pas — un test qui ne peut pas
           echouer, motif n° 4 de l'audit. Constate en l'ecrivant. */
        self::assertNotNull($aliment['grammesDisponibles'] ?? null);
        self::assertEquals(0, $aliment['grammesDisponibles']);
    }

    /**
     * UN PLAN DEJA CUISINE NE RESERVE PLUS RIEN, et c'est la requete qui s'en
     * charge : `cuisine_le IS NULL`. Si ce filtre sautait, le stock serait
     * deduit DEUX fois — une fois pour de vrai par `DeductionDuPlan`, une fois
     * ici.
     */
    public function testLaLectureDesPlansEstFiltreeSurLesPlansPrevus(): void
    {
        $sql = [];
        $controleur = self::controleur(self::connexion(1000.0, 0.0, $sql));
        $controleur->lire();

        $requetesDePlans = \array_filter($sql, static fn (string $r): bool => \str_contains($r, 'plan_repas'));

        self::assertNotEmpty($requetesDePlans, 'le frigo doit lire les plans pour savoir ce qui est promis');
        foreach ($requetesDePlans as $requete) {
            self::assertStringContainsString('cuisine_le IS NULL', $requete);
        }
    }

    /**
     * LE SEUIL D'ECART PART AVEC LE FRIGO — palier B, 21 septembre 2026.
     *
     * `SEUIL_ECART = 0.001` etait ecrit dans `front/src/calcul/frigo.ts`. Il
     * decide de ce qui part vers Grocy : c'est une regle, pas un detail
     * d'affichage. Le serveur l'envoie, l'ecran l'applique — motif de
     * `GET /api/modes-de-travail`, parce qu'un verdict par frappe sur cinq
     * cents lignes serait la regression que le plan interdit.
     */
    public function testLeSeuilDEcartPartAvecLeFrigo(): void
    {
        $vues = [];
        $controleur = self::controleur(self::connexion(1000.0, 0.0, $vues));

        /** @var array<string, mixed> $corps */
        $corps = \json_decode((string) $controleur->lire()->getContent(), true);

        self::assertSame(EcartDInventaire::SEUIL, $corps['seuilEcartInventaire'] ?? null,
            'sans ce champ, l’écran n’a aucun moyen de savoir ce qu’il doit ignorer');
    }

    // ----------------------------------------------------------------- outils

    /**
     * Le frigo tel que la route le rend, pour UN aliment `base:7`.
     *
     * @return array<string, mixed>
     */
    private static function rendu(float $stockEnGrammes, float $promis): array
    {
        $vues = [];
        $controleur = self::controleur(self::connexion($stockEnGrammes, $promis, $vues));

        /** @var array{aliments: list<array<string, mixed>>} $corps */
        $corps = \json_decode((string) $controleur->lire()->getContent(), true);

        return $corps['aliments'][0];
    }

    /** @param list<string> $sqlVus */
    private static function connexion(float $stockEnGrammes, float $promis, array &$sqlVus): Connection
    {
        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchAllAssociative')->willReturnCallback(
            static function (string $sql) use ($stockEnGrammes, $promis, &$sqlVus): array {
                $sqlVus[] = $sql;

                if (\str_contains($sql, 'plan_repas')) {
                    return 0.0 === $promis ? [] : [['contenu' => (string) \json_encode(
                        ['version' => 2, 'consomme' => [
                            ['reference' => 'base:7', 'nom' => 'Poulet', 'grammes' => $promis]]])]];
                }

                /* Les colonnes de `FrigoBase::lire`, telles qu'elle les nomme.
                   La source « base » compte toujours en grammes : `unite` vaut
                   `g` et `grammesParUnite` vaut 1. */
                return [[
                    'id' => 7, 'nom' => 'Poulet', 'categorie' => 'pro',
                    'kcal_100' => 120.0, 'prot_100' => 23.0, 'gluc_100' => 0.0,
                    'lip_100' => 2.6, 'fibres_100' => null, 'ratio' => 1.0,
                    'pesee_avant' => null, 'pesee_apres' => null, 'reference_ciqual' => null,
                    'quantite' => $stockEnGrammes, 'emplacement' => 'Frigo',
                ]];
            });

        return $cnx;
    }

    private static function controleur(Connection $cnx): FrigoController
    {
        $grocy = new FrigoGrocy(new MockHttpClient(), new NullLogger(), 'https://grocy.test', 'cle');
        $base = new FrigoBase($cnx);
        $controleur = new FrigoController(
            new Frigo($grocy, $base), $base, $grocy, new InventaireLots($cnx), new PlansPrevus($cnx));

        $utilisateur = (new Utilisateur())->setEmail('bob@exemple.test')->setSourceFrigo('base');
        $stockage = new TokenStorage();
        $stockage->setToken(new UsernamePasswordToken($utilisateur, 'principal', $utilisateur->getRoles()));
        $conteneur = new Container();
        $conteneur->set('security.token_storage', $stockage);
        $controleur->setContainer($conteneur);

        return $controleur;
    }
}
