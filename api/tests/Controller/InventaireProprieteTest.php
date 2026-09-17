<?php

declare(strict_types=1);

namespace App\Tests\Controller;

use App\Controller\FrigoController;
use App\Entity\Utilisateur;
use App\Service\Frigo;
use App\Service\FrigoBase;
use App\Service\FrigoGrocy;
use App\Service\InventaireLots;
use Doctrine\DBAL\Connection;
use PHPUnit\Framework\TestCase;
use Psr\Log\NullLogger;
use Symfony\Component\DependencyInjection\Container;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Security\Core\Authentication\Token\Storage\TokenStorage;
use Symfony\Component\Security\Core\Authentication\Token\UsernamePasswordToken;

/**
 * L'INVENTAIRE DIFFERE N'A PAS LE DROIT D'ECRIRE SUR L'ALIMENT D'UN AUTRE.
 *
 * CONSTAT E-01 DE L'AUDIT DU 7 SEPTEMBRE 2026.
 *
 * `POST /mon-frigo/stock` verifie que l'aliment vise est celui du
 * demandeur — `alimentAccessible()`, ajoute expres pour fermer cette faille.
 * Son jumeau `POST /mon-frigo/inventaire` fait le meme travail par un autre
 * chemin et n'a jamais recu le meme controle : il ne valide que le prefixe
 * `base:` et la positivite de l'identifiant, puis depose le lot. Le travailleur
 * de fond appelle ensuite `FrigoBase::definirStock` sans jamais demander a qui
 * appartient cet aliment.
 *
 * Ce n'est pas une fuite — la victime ne voit jamais la ligne posee chez elle.
 * C'est pire a sa facon : Bob pose 1 g sur l'aliment d'Alice, et Alice ne
 * peut plus supprimer son aliment. `AlimentSuppressionProcessor` compte les
 * lignes de stock TOUS COMPTES CONFONDUS ; l'application ne lui offre aucun
 * moyen de defaire ce blocage.
 *
 * LE CONTROLEUR EST MONTE AVEC SES VRAIS SERVICES. Seule la connexion est
 * doublee : `Frigo`, `FrigoBase` et `InventaireLots` sont `final readonly`,
 * donc impossibles a doubler — mais ils ne dependent que de cette connexion,
 * et `FrigoGrocy` accepte un `MockHttpClient` comme dans les tests voisins. Ce
 * qui est teste ici est donc le CABLAGE reel, et c'est bien lui qui manquait :
 * la regle existait, la route ne l'appelait pas.
 */
final class InventaireProprieteTest extends TestCase
{
    public function testUnInventaireSurLAlimentPriveDUnAutreEstRefuse(): void
    {
        $requetes = [];
        $controleur = self::controleur($requetes, alimentAccessible: false);

        $reponse = $controleur->inventorier(self::envoi('base:42', 1.0));

        self::assertSame(404, $reponse->getStatusCode(),
            'un aliment qui n\'est pas le mien doit etre refuse, comme sur /mon-frigo/stock');

        $deposes = \array_filter($requetes,
            static fn (string $sql): bool => \str_contains($sql, 'INSERT INTO inventaire_lot'));
        self::assertSame([], $deposes,
            'le lot ne doit pas etre depose : le travailleur de fond ecrirait le stock sans rien verifier');
    }

    public function testUnInventaireSurSonPropreAlimentPasse(): void
    {
        /* LE PENDANT DU PRECEDENT, ET IL N'EST PAS DECORATIF. Un controle trop
           large refuserait tout le monde, y compris le proprietaire — et le
           premier test resterait vert. */
        $requetes = [];
        $controleur = self::controleur($requetes, alimentAccessible: true);

        $reponse = $controleur->inventorier(self::envoi('base:42', 1.0));

        self::assertSame(202, $reponse->getStatusCode(),
            'mon propre aliment doit continuer a partir en tache de fond');
    }

    private static function envoi(string $reference, float $quantite): Request
    {
        return Request::create('/api/mon-frigo/inventaire', 'POST', content: (string) \json_encode([
            'lignes' => [['reference' => $reference, 'quantite' => $quantite]],
        ]));
    }

    /**
     * @param array<int, string> $requetes SQL vu passer par la connexion
     */
    private function controleur(array &$requetes, bool $alimentAccessible): FrigoController
    {
        $requetes = [];

        /* UN STUB, PAS UN MOCK : on n'attend pas tel appel a telle requete —
           on regarde ce qui est reellement parti, dans `$requetes`. PHPUnit 12
           le dit lui-meme d'un mock sans attente, et `failOnNotice` en fait un
           echec. */
        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchOne')->willReturnCallback(
            static function (string $sql) use (&$requetes, $alimentAccessible): mixed {
                $requetes[] = $sql;

                if (\str_contains($sql, 'INSERT INTO inventaire_lot')) {
                    return 7;   // l'identifiant du lot depose
                }

                // « cet aliment est-il le mien ? »
                return $alimentAccessible ? 1 : false;
            });
        $cnx->method('fetchFirstColumn')->willReturnCallback(
            static function (string $sql, array $params = []) use (&$requetes, $alimentAccessible): array {
                $requetes[] = $sql;

                /* La variante EN LOT du meme controle : elle rend les
                   identifiants accessibles parmi ceux demandes. */
                return $alimentAccessible ? \array_values((array) ($params['a'] ?? [])) : [];
            });

        $grocy = new FrigoGrocy(new MockHttpClient(), new NullLogger(), 'https://grocy.test', 'cle');
        $base = new FrigoBase($cnx);
        $controleur = new FrigoController($frigo = new Frigo($grocy, $base), $base, $grocy,
            new InventaireLots($cnx));

        $utilisateur = (new Utilisateur())->setEmail('bob@exemple.test')->setSourceFrigo('base');
        \assert('base' === $frigo->source($utilisateur));

        $stockage = new TokenStorage();
        $stockage->setToken(new UsernamePasswordToken($utilisateur, 'principal', $utilisateur->getRoles()));

        $conteneur = new Container();
        $conteneur->set('security.token_storage', $stockage);
        $controleur->setContainer($conteneur);

        return $controleur;
    }
}
