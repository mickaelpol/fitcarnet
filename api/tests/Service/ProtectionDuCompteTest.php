<?php

declare(strict_types=1);

namespace App\Tests\Service;

use App\Service\ProtectionDuCompte;
use PHPUnit\Framework\TestCase;

/**
 * Les deux facons de se fermer la porte au nez.
 *
 * Chacune est irreversible DEPUIS L'APPLICATION : il faut ensuite un terminal
 * sur le NAS et une console SQL. C'est pour ca qu'on refuse au lieu de
 * demander confirmation — une confirmation, on l'accepte.
 */
final class ProtectionDuCompteTest extends TestCase
{
    public function testOnNeSeBloquePasSoiMeme(): void
    {
        $raison = ProtectionDuCompte::raisonDeRefuserBlocage(
            estMoi: true, cibleEstAdmin: true, cibleEstActive: true, adminsActifs: 5,
        );

        self::assertNotNull($raison);
        self::assertStringContainsString('ton propre compte', $raison);
    }

    public function testOnNeSeSupprimePasSoiMeme(): void
    {
        self::assertNotNull(ProtectionDuCompte::raisonDeRefuserSuppression(
            estMoi: true, cibleEstAdmin: false, cibleEstActive: true, adminsActifs: 3,
        ));
    }

    public function testMemeUnAdministrateurOrdinaireNePeutPasSeSupprimer(): void
    {
        /* La regle ne depend pas des roles : elle depend de l'irreversibilite.
           Un administrateur qui n'est pas le dernier peut quand meme se
           retirer l'acces qu'il utilise pour tout le reste. */
        self::assertNotNull(ProtectionDuCompte::raisonDeRefuserBlocage(
            estMoi: true, cibleEstAdmin: false, cibleEstActive: true, adminsActifs: 9,
        ));
    }

    public function testLeDernierAdministrateurActifEstIntouchable(): void
    {
        $blocage = ProtectionDuCompte::raisonDeRefuserBlocage(
            estMoi: false, cibleEstAdmin: true, cibleEstActive: true, adminsActifs: 1,
        );
        $suppression = ProtectionDuCompte::raisonDeRefuserSuppression(
            estMoi: false, cibleEstAdmin: true, cibleEstActive: true, adminsActifs: 1,
        );

        self::assertNotNull($blocage);
        self::assertNotNull($suppression);
        self::assertStringContainsString('dernier administrateur', $blocage);
    }

    public function testUnAdministrateurParmiPlusieursSeBloque(): void
    {
        self::assertNull(ProtectionDuCompte::raisonDeRefuserBlocage(
            estMoi: false, cibleEstAdmin: true, cibleEstActive: true, adminsActifs: 2,
        ));
        self::assertNull(ProtectionDuCompte::raisonDeRefuserSuppression(
            estMoi: false, cibleEstAdmin: true, cibleEstActive: true, adminsActifs: 2,
        ));
    }

    public function testUnCompteOrdinaireNEstProtegeParRien(): void
    {
        self::assertNull(ProtectionDuCompte::raisonDeRefuserBlocage(
            estMoi: false, cibleEstAdmin: false, cibleEstActive: true, adminsActifs: 1,
        ));
        self::assertNull(ProtectionDuCompte::raisonDeRefuserSuppression(
            estMoi: false, cibleEstAdmin: false, cibleEstActive: true, adminsActifs: 1,
        ));
    }

    public function testZeroAdministrateurActifNOuvrePasLaPorte(): void
    {
        /* Etat incoherent — apres une intervention en base, par exemple. Avec
           un `=== 1` au lieu d'un `<= 1`, ce cas passerait, et on supprimerait
           le compte administrateur qui restait. */
        self::assertNotNull(ProtectionDuCompte::raisonDeRefuserSuppression(
            estMoi: false, cibleEstAdmin: true, cibleEstActive: true, adminsActifs: 0,
        ));
    }

    /**
     * CONSTAT 04#12 DE L'AUDIT, CORRIGÉ LE 17 SEPTEMBRE 2026.
     *
     * Un administrateur DÉSACTIVÉ ne compte pas parmi les actifs : le
     * supprimer ne retire à personne la main sur l'application. La règle ne
     * regardait que son rôle, si bien qu'avec un seul administrateur actif —
     * celui qui agit — la suppression d'un ancien administrateur désactivé
     * était refusée comme s'il s'agissait du dernier.
     */
    public function testUnAdministrateurDesactiveSeSupprimeQuandIlNeResteQuUnActif(): void
    {
        self::assertNull(ProtectionDuCompte::raisonDeRefuserSuppression(
            estMoi: false, cibleEstAdmin: true, cibleEstActive: false, adminsActifs: 1,
        ));
    }

    public function testReactiverNeSeRefuseJamais(): void
    {
        /* Rien ne se perd et rien ne se verrouille : on rend un acces. La
           seule facon de se tromper — le rendre a quelqu'un qui ne devrait
           pas l'avoir — est un jugement, pas une regle. */
        self::assertNull(ProtectionDuCompte::raisonDeRefuserReactivation());
    }
}
