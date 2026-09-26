<?php

declare(strict_types=1);

namespace App\Service;

/**
 * LE RENDEMENT CRU/CUIT, CALCULE ET DIT PAR LE SERVEUR — 26 septembre 2026.
 *
 * `ratioDepuisPesees`, `provenanceRatio` et `expliquerRatio` vivaient dans
 * `front/src/calcul/nutrition.ts`, et l'editeur d'aliment en etait le seul
 * lecteur : l'ecran calculait le rendement qu'il envoyait ensuite a l'API, qui
 * le croyait. Ils sont ici, et l'ecran n'envoie plus que les deux pesees
 * brutes (feature `macros-editeur-vide-pas-zero`, CA-7, CA-8, CA-11).
 *
 * `POIDS_INCHANGE` A UN JUMEAU DECLARE : `POIDS_INCHANGE` de `nutrition.ts`,
 * qui sert encore a `resumeRatio` — la case courte du frigo. Les deux doivent
 * basculer au meme seuil ; `front/src/calcul/ratioDit.test.ts` lit ce fichier
 * et refuse qu'ils divergent.
 */
final class RendementExplique
{
    /** En deca de 1 %, c'est la precision de la balance, pas la cuisson. */
    public const float POIDS_INCHANGE = 0.01;

    /** « J'avais 100 g secs, j'ai obtenu 230 g cuits » : 2,3, au centieme. */
    public static function depuisPesees(?float $avant, ?float $apres): ?float
    {
        if (null === $avant || null === $apres || $avant <= 0.0 || $apres <= 0.0) {
            return null;
        }

        return \round($apres / $avant, 2);
    }

    /** Formulation en clair, pour que l'utilisateur verifie la vraisemblance. */
    public static function explication(float $ratio): string
    {
        if (\abs($ratio - 1.0) < self::POIDS_INCHANGE) {
            return 'Le poids ne change pas à la cuisson.';
        }

        $cuits = (int) \round($ratio * 100);

        return $ratio > 1.0
            ? \sprintf('100 g avant cuisson donnent %d g une fois cuits.', $cuits)
            : \sprintf('100 g avant cuisson donnent %d g une fois cuits (perte d\'eau).', $cuits);
    }

    /**
     * D'ou vient le ratio ? Un chiffre mesure n'a pas le statut d'une valeur
     * courante choisie dans une liste : l'utilisateur doit pouvoir les
     * distinguer six mois plus tard. `null` sans pesees.
     */
    public static function provenance(?float $avant, ?float $apres): ?string
    {
        if (null === self::depuisPesees($avant, $apres)) {
            return null;
        }

        return \sprintf('mesuré : %s g avant cuisson → %s g après',
            self::court((float) $avant), self::court((float) $apres));
    }

    /** Entier quand il l'est presque, sinon une decimale — a la francaise. */
    private static function court(float $v): string
    {
        return \abs($v - \round($v)) < 0.05
            ? (string) (int) \round($v)
            : \str_replace('.', ',', \number_format($v, 1, '.', ''));
    }
}
