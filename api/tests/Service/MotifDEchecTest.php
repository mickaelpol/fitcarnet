<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Entity\Utilisateur;
use App\Service\AppliqueInventaire;
use App\Service\FrigoBase;
use App\Service\FrigoGrocy;
use App\Service\InventaireLots;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\Persistence\ManagerRegistry;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Psr\Log\NullLogger;
use Symfony\Component\HttpClient\MockHttpClient;

/**
 * CE QU'ON DIT AU CLIENT QUAND UNE LIGNE ECHOUE, ET CE QU'ON GARDE POUR SOI.
 *
 * CONSTAT M-03 DE L'AUDIT DU 7 SEPTEMBRE 2026.
 *
 * Sur les chemins ou une exception est rattrapee pour ne pas casser le
 * traitement, c'etait `$e->getMessage()` qui repartait tel quel — et pour une
 * exception DBAL, ce message porte la requete SQL complete, les noms de tables
 * et de contraintes, parfois les parametres. Aucun secret ne fuyait, mais la
 * carte interne de la base etait offerte a tout compte authentifie.
 *
 * L'echec doit rester VISIBLE — une ligne qui disparait en silence est pire
 * qu'une ligne refusee — mais le detail appartient au journal, pas a la
 * reponse HTTP. Le client apprend que la ligne n'est pas passee ; l'exploitant
 * apprend pourquoi.
 */
final class MotifDEchecTest extends TestCase
{
    private const SQL_FUITE = 'SQLSTATE[42P01]: Undefined table: 7 ERREUR: '
        . 'la relation « stock » n\'existe pas LINE 1: INSERT INTO stock (utilisateur_id, aliment_id)';

    public function testUneExceptionDeBaseNeRepartPasVersLeClient(): void
    {
        $journalises = [];
        $dits = self::appliquer($journalises);

        self::assertNotEmpty($dits, 'une ligne qui echoue doit rester visible, pas disparaitre');
        $motif = implode(' ', $dits);

        self::assertStringNotContainsString('SQLSTATE', $motif,
            'le code d\'erreur de la base n\'a rien a faire dans une reponse HTTP');
        self::assertStringNotContainsString('INSERT INTO', $motif,
            'la requete SQL dessine la carte interne de la base');
        self::assertStringNotContainsString('stock', $motif,
            'les noms de tables non plus');
    }

    /**
     * LE TEMOIN, et il compte autant que l'autre : taire le detail au client
     * ne doit pas revenir a le perdre. Sans le journal, un echec deviendrait
     * indiagnosticable — on aurait echange une fuite contre un angle mort.
     */
    public function testLeDetailCompletEstConserveDansLeJournal(): void
    {
        $journalises = [];
        self::appliquer($journalises);

        self::assertStringContainsString('SQLSTATE', implode(' ', $journalises),
            'le journal doit garder de quoi diagnostiquer la panne');
    }

    /**
     * Monte AppliqueInventaire avec ses vrais services autour d'une Connection
     * qui echoue, et rend ce qui a ete DIT — les motifs partis vers le client.
     *
     * @param list<string> $journalises ce qui a ete garde pour l'exploitant
     *
     * @return list<string>
     */
    private static function appliquer(array &$journalises): array
    {
        $dits = [];

        $journal = self::createStub(LoggerInterface::class);
        $journal->method('warning')->willReturnCallback(
            static function (string|\Stringable $m, array $ctx = []) use (&$dits): void {
                // ce warning porte le motif tel qu'il sera rendu au client
                $dits[] = (string) ($ctx['motif'] ?? $m);
            });
        $journal->method('error')->willReturnCallback(
            static function (string|\Stringable $m, array $ctx = []) use (&$journalises): void {
                $journalises[] = (string) $m . ' ' . json_encode($ctx);
            });

        // la base refuse : c'est elle qui produit le message bavard
        $cnxQuiEchoue = self::createStub(Connection::class);
        $cnxQuiEchoue->method('fetchFirstColumn')
            ->willThrowException(new \RuntimeException(self::SQL_FUITE));

        $cnxDesLots = self::createStub(Connection::class);
        $cnxDesLots->method('executeStatement')->willReturn(1);

        $registre = self::createStub(ManagerRegistry::class);
        $em = self::createStub(EntityManagerInterface::class);
        $em->method('find')->willReturn(new Utilisateur());
        $registre->method('getManager')->willReturn($em);

        $service = new AppliqueInventaire(
            new FrigoGrocy(new MockHttpClient(), new NullLogger(), 'https://grocy.test', 'cle'),
            new FrigoBase($cnxQuiEchoue),
            new InventaireLots($cnxDesLots),
            $registre,
            $journal,
        );

        $service->traiter([
            'id' => 1,
            'utilisateur_id' => '00000000-0000-4000-8000-000000000000',
            'source' => 'base',
            'lignes' => json_encode([['reference' => 'base:42', 'quantite' => 1.0]], \JSON_THROW_ON_ERROR),
            'total' => 1,
            'traites' => 0,
            'jeton' => '11111111-1111-4111-8111-111111111111',
        ]);

        return $dits;
    }
}
