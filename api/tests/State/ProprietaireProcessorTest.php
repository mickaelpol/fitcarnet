<?php

declare(strict_types=1);

namespace App\Tests\State;

use ApiPlatform\Metadata\Operation;
use ApiPlatform\Metadata\Post;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\Aliment;
use App\Entity\Seance;
use App\Entity\Utilisateur;
use App\State\ProprietaireProcessor;
use PHPUnit\Framework\TestCase;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\Security\Core\User\UserInterface;

/**
 * QUI DEVIENT LE PROPRIETAIRE D'UNE DONNEE QU'ON VIENT DE CREER.
 *
 * CONSTAT C3 DE L'AUDIT DU 7 SEPTEMBRE 2026, TROISIEME VOLET.
 *
 * `FiltreProprietaire` protege la LECTURE. Il ne sert a rien si la donnee est
 * ecrite sans proprietaire : elle n'appartiendrait a personne et resterait
 * invisible de tous, y compris de qui vient de la creer. C'est ce processeur
 * qui pose l'identite, et rien ne le verifiait.
 *
 * Le client ne transmet jamais son identite : elle vient du jeton. Verifie le
 * 14 septembre 2026 — la propriete `utilisateur` de `Seance` n'appartient a
 * aucun groupe de `denormalizationContext`, elle n'est donc pas ecrivable
 * depuis une requete. Si cela changeait, le second test tomberait.
 */
final class ProprietaireProcessorTest extends TestCase
{
    public function testUneDonneeCreeeAppartientAuCompteConnecte(): void
    {
        $alice = new Utilisateur();
        $seance = new Seance();

        $recus = [];
        self::processeur($alice, $recus)->process($seance, self::operation());

        self::assertSame($alice, $seance->getUtilisateur(),
            'une seance creee sans proprietaire doit revenir au compte connecte');
        self::assertSame([$seance], $recus,
            'le processeur doit toujours passer la main a la persistance');
    }

    /**
     * Un PATCH recharge l'entite depuis la base, proprietaire compris. La
     * reaffecter au compte connecte transformerait une modification en
     * changement de propriete — et le jour ou un administrateur modifierait
     * la donnee de quelqu'un d'autre, il se l'approprierait sans le savoir.
     */
    public function testUnProprietaireDejaPoseNEstJamaisEcrase(): void
    {
        $alice = new Utilisateur();
        $bob = new Utilisateur();
        $seance = (new Seance())->setUtilisateur($alice);

        $recus = [];
        self::processeur($bob, $recus)->process($seance, self::operation());

        self::assertSame($alice, $seance->getUtilisateur(),
            'modifier la seance d\'un autre ne doit pas se l\'approprier');
    }

    /**
     * Le temoin : ce processeur sert aussi des entites qui ne portent pas de
     * proprietaire. Il doit les laisser passer, pas echouer sur elles.
     */
    public function testUneEntiteSansProprietaireTraverseIntacte(): void
    {
        $aliment = new Aliment();

        $recus = [];
        self::processeur(new Utilisateur(), $recus)->process($aliment, self::operation());

        self::assertSame([$aliment], $recus,
            'un Aliment n\'est pas une ProprieteUtilisateur : il doit etre persiste tel quel');
    }

    /**
     * Sans compte connecte, on ne pose rien — et surtout on n'invente pas de
     * proprietaire. La contrainte NOT NULL de la base refusera l'ecriture,
     * ce qui est le comportement voulu : bruyant, et non silencieux.
     */
    public function testSansCompteConnecteAucunProprietaireNEstInvente(): void
    {
        $seance = new Seance();

        $recus = [];
        self::processeur(null, $recus)->process($seance, self::operation());

        self::assertNull($seance->getUtilisateur(),
            'aucun proprietaire ne doit etre pose quand personne n\'est connecte');
    }

    /**
     * @param list<mixed> $recus les objets reellement transmis a la persistance
     */
    private static function processeur(?UserInterface $utilisateur, array &$recus): ProprietaireProcessor
    {
        $persistance = self::createStub(ProcessorInterface::class);
        $persistance->method('process')->willReturnCallback(
            static function (mixed $donnee) use (&$recus): mixed {
                $recus[] = $donnee;

                return $donnee;
            });

        $security = self::createStub(Security::class);
        $security->method('getUser')->willReturn($utilisateur);

        return new ProprietaireProcessor($persistance, $security);
    }

    private static function operation(): Operation
    {
        return new Post();
    }
}
