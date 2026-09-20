<?php

declare(strict_types=1);

namespace App\Tests\State;

use ApiPlatform\Metadata\Post;
use ApiPlatform\State\ProcessorInterface;
use App\Entity\Aliment;
use App\State\AlimentProcessor;
use Doctrine\DBAL\Driver\Exception as ExceptionDuPilote;
use Doctrine\DBAL\Exception\ForeignKeyConstraintViolationException;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;

/**
 * UN RATTACHEMENT CIQUAL INCONNU SE REFUSE EN 422, PAS EN 500.
 *
 * Mesure le 20 septembre 2026, juste apres avoir pose la colonne :
 *
 *     POST /api/aliments  {"referenceCiqual": "99999999", …}  ->  HTTP 500
 *
 * La cle etrangere `aliment_reference_ciqual_fkey` faisait son travail, mais
 * son echec remontait tel quel. Une violation de contrainte SQL n'est pas un
 * message : la personne lit « erreur serveur » pour une valeur qu'elle a
 * pourtant choisie dans une liste.
 *
 * DEUX FAUSSES PISTES ESSAYEES AVANT CELLE-CI, et la seconde a coute 14 tests :
 *
 *  1. Laisser la base trancher. Elle tranche juste, mais TROP TARD pour qu'on
 *     puisse expliquer — meme motif que la course a l'invitation, la veille.
 *  2. Une contrainte d'entite avec un validateur qui interroge le catalogue.
 *     Elle a casse TOUS les tests de validation d'`Aliment` : ils tournent
 *     sans noyau (skill `tests-api`), donc sans conteneur pour construire un
 *     validateur qui a des dependances. `MotDePasseSolideValidator` n'en a
 *     aucune, et ce n'est pas un hasard.
 *
 * La base sait deja. Il suffit de TRADUIRE ce qu'elle dit, au meme endroit et
 * de la meme facon que pour le nom deja pris.
 */
final class AlimentRattachementTest extends TestCase
{
    public function testUnRattachementInconnuDevientUn422Lisible(): void
    {
        $processeur = new AlimentProcessor(self::interneQuiLeve());

        try {
            $processeur->process(new Aliment(), new Post());
            self::fail('un rattachement inconnu doit etre refuse.');
        } catch (UnprocessableEntityHttpException $e) {
            self::assertStringContainsString('ne correspond à aucun aliment de référence', $e->getMessage());
            self::assertStringContainsString('laisse le champ vide', $e->getMessage(),
                'on dit quoi faire : choisir, ou ne rien rattacher');
        }
    }

    /**
     * LE TEMOIN : sans echec, rien ne doit etre refuse.
     *
     * Sans ce cas, un processeur qui leverait TOUJOURS passerait le test
     * ci-dessus tout en rendant impossible la creation du moindre aliment.
     */
    public function testUnAlimentSansRattachementPasse(): void
    {
        $vus = [];
        $interne = self::createStub(ProcessorInterface::class);
        $interne->method('process')->willReturnCallback(
            function (mixed $donnee) use (&$vus): mixed {
                $vus[] = $donnee;

                return $donnee;
            });

        $aliment = (new Aliment())->setNom('Orangina');
        self::assertSame($aliment, (new AlimentProcessor($interne))->process($aliment, new Post()));
        self::assertSame([$aliment], $vus, 'il doit atteindre la persistance');
    }

    // ---------------------------------------------------------------- outils

    private static function interneQuiLeve(): ProcessorInterface
    {
        $interne = self::createStub(ProcessorInterface::class);
        $interne->method('process')->willThrowException(
            new ForeignKeyConstraintViolationException(
                self::createStub(ExceptionDuPilote::class), null));

        return $interne;
    }
}
