<?php

declare(strict_types=1);

namespace App\Service;

/**
 * LES DEUX GESTES QU'UN ADMINISTRATEUR NE DOIT PAS POUVOIR FAIRE.
 *
 * Bloquer et supprimer sont utiles. Ils ont chacun une facon de se retourner
 * contre celui qui les exerce, et ces deux facons sont IRREVERSIBLES DEPUIS
 * L'APPLICATION : une fois faites, il faut ouvrir un terminal sur le NAS et
 * une console SQL pour reparer.
 *
 * On les refuse donc avant de les faire, avec une phrase qui dit quoi faire a
 * la place. Pas une confirmation — une confirmation, on l'accepte.
 *
 * TOUT EST CALCULABLE ICI, ET C'EST LE BUT. Aucune base, aucune session : des
 * booleens et un compte. Les regles qui protegent quelque chose sont celles
 * qu'on doit pouvoir tester sans monter un conteneur.
 */
final class ProtectionDuCompte
{
    /**
     * Peut-on desactiver ce compte ?
     *
     * @param bool $estMoi        la cible est l'administrateur qui agit
     * @param bool $cibleEstAdmin  la cible porte ROLE_ADMIN
     * @param bool $cibleEstActive la cible est active, donc comptee dans $adminsActifs
     * @param int  $adminsActifs   nombre d'administrateurs ACTIFS, cible comprise si elle l'est
     *
     * @return string|null la raison du refus, ou null si c'est permis
     */
    public static function raisonDeRefuserBlocage(bool $estMoi, bool $cibleEstAdmin, bool $cibleEstActive, int $adminsActifs): ?string
    {
        /* SE BLOQUER SOI-MEME EST UNE PORTE QUI SE VERROUILLE DE L'INTERIEUR.
           La requete suivante serait refusee — y compris celle qui servirait a
           se debloquer. Il n'existe alors plus aucun chemin depuis
           l'application. */
        if ($estMoi) {
            return 'Tu ne peux pas désactiver ton propre compte : '
                . 'la requête suivante serait refusée, y compris celle qui te réactiverait.';
        }

        return self::dernierAdministrateur($cibleEstAdmin, $cibleEstActive, $adminsActifs)
            ? 'C’est le dernier administrateur actif. Le désactiver laisserait '
                . 'l’application sans personne pour gérer les comptes.'
            : null;
    }

    /**
     * Peut-on supprimer ce compte ?
     *
     * Memes deux regles que pour le blocage, et pour les memes raisons — en
     * pire : un compte supprime emporte ses seances, ses series, ses plans,
     * ses cibles et ses habitudes. Rien de tout cela ne se restaure sans une
     * sauvegarde.
     */
    public static function raisonDeRefuserSuppression(bool $estMoi, bool $cibleEstAdmin, bool $cibleEstActive, int $adminsActifs): ?string
    {
        if ($estMoi) {
            return 'Tu ne peux pas supprimer ton propre compte depuis l’application.';
        }

        return self::dernierAdministrateur($cibleEstAdmin, $cibleEstActive, $adminsActifs)
            ? 'C’est le dernier administrateur actif. Nomme quelqu’un d’autre avant de le supprimer.'
            : null;
    }

    /**
     * Reactiver n'a jamais besoin d'etre protege.
     *
     * Rien ne se perd, rien ne se verrouille : on rend un acces. La seule
     * facon de se tromper est de rendre l'acces a quelqu'un qui ne devrait
     * pas l'avoir — et ca, aucune regle automatique ne le sait.
     */
    public static function raisonDeRefuserReactivation(): ?string
    {
        return null;
    }

    /**
     * `<= 1` ET PAS `=== 1`.
     *
     * Un compte incoherent — zero administrateur actif, par exemple apres une
     * intervention en base — ne doit pas ouvrir la porte par accident. Avec
     * `=== 1`, un zero passerait, et on supprimerait le compte qui restait.
     *
     * UNE CIBLE DESACTIVEE N'EST LE DERNIER DE PERSONNE. Elle n'est pas comptee
     * parmi les actifs : la retirer ne prive l'application d'aucun
     * administrateur. La regle ne regardait que le role jusqu'au 17 septembre
     * 2026 (constat 04#12), et refusait la suppression d'un ancien
     * administrateur des qu'il ne restait qu'un actif — celui qui agit.
     */
    private static function dernierAdministrateur(bool $cibleEstAdmin, bool $cibleEstActive, int $adminsActifs): bool
    {
        return $cibleEstAdmin && $cibleEstActive && $adminsActifs <= 1;
    }
}
