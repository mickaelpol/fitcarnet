<?php

declare(strict_types=1);

namespace App\Service;

/**
 * LES CALORIES ANNONCEES COLLENT-ELLES AUX MACROS ?
 *
 * Sorti de `VerdictAliment` le 20 septembre 2026, parce que DEUX ecrans posent
 * la meme question : l'editeur pendant la saisie, et le detail d'une ligne du
 * frigo. Le second la calculait encore lui-meme
 * (`front/src/composants/ligneFrigo.tsx`) — le dernier juge du front, releve
 * par `revue-fitcarnet`.
 *
 * ON AVERTIT, ON NE REFUSE PAS, et c'est mesure : 34 des 3 006 entrees CIQUAL
 * exploitables ont un ecart legitime — les alcools, dont les 7 kcal/g
 * n'entrent dans aucune macro, et les confiseries aux polyols, comptes 2,4 et
 * non 4. Les refuser serait accuser quelqu'un d'une faute qu'il n'a pas
 * commise.
 *
 * LE VERDICT EST UNE DECISION, PAS UN STYLE. L'ecran le traduit en teinte, il
 * ne le prend plus.
 */
final class ControleDesMacros
{
    /** Ecart tolere entre les calories annoncees et ce que les macros donnent. */
    private const TOLERANCE = 0.08;

    /**
     * Sans fibres renseignees, on tolere beaucoup plus.
     *
     * Elles comptent 2 kcal/g et manquent a la somme : un aliment fibreux
     * paraitrait incoherent alors que ses valeurs sont justes.
     */
    private const TOLERANCE_SANS_FIBRES = 0.2;

    /** Au-dela, ce n'est plus un arrondi mais une valeur a reprendre. */
    private const ECART_FRANC = 0.3;

    /**
     * @return array{resume: string, avertissement: string|null, verdict: string}
     */
    public static function pour(
        ?float $kcal,
        ?float $prot,
        ?float $gluc,
        ?float $lip,
        ?float $fibres,
    ): array {
        $fibresConnues = null !== $fibres;
        $calculees = Atwater::kcal($prot ?? 0.0, $gluc ?? 0.0, $lip ?? 0.0, $fibres);

        if (null === $kcal || $kcal <= 0.0) {
            return [
                'resume' => \sprintf('Ces macros représentent %d calories.', (int) \round($calculees)),
                'avertissement' => null,
                'verdict' => 'indecidable',
            ];
        }

        /* RIEN A COMPARER TANT QUE LES TROIS MACROS NE SONT PAS LA — releve en
           eprouvant la route par HTTP le 20 septembre 2026. Avec les seules
           calories, elle repondait « le calcul donne 0 calories contre 130
           annoncees » : c'est vrai, et c'est du bruit pendant la frappe. */
        if (null === $prot || null === $gluc || null === $lip) {
            return [
                'resume' => 'Renseigne les protéines, les glucides et les lipides '
                    . 'pour que le contrôle soit possible.',
                'avertissement' => null,
                'verdict' => 'indecidable',
            ];
        }

        $ecart = ($calculees - $kcal) / $kcal;
        $seuil = $fibresConnues ? self::TOLERANCE : self::TOLERANCE_SANS_FIBRES;

        if (\abs($ecart) <= $seuil) {
            return [
                'resume' => $fibresConnues
                    ? 'Les valeurs sont cohérentes entre elles.'
                    : 'Cohérent, mais sans les fibres le contrôle reste approximatif.',
                'avertissement' => null,
                'verdict' => 'coherent',
            ];
        }

        /* Sans fibres renseignees, un ecart NEGATIF est normal sur un aliment
           qui en contient : les calories annoncees incluent leur apport, pas
           le calcul. Inutile d'alarmer sur ce cas-la. */
        if (!$fibresConnues && $ecart < 0.0) {
            $dit = \sprintf(
                'Le calcul donne %d calories contre %d annoncées. C\'est normal si '
                . 'l\'aliment contient des fibres — renseigne-les pour lever le doute.',
                (int) \round($calculees), (int) \round($kcal));

            return ['resume' => $dit, 'avertissement' => $dit, 'verdict' => 'ecart'];
        }

        $dit = \sprintf(
            'Le calcul donne %d calories contre %d annoncées, soit %s%d %%. %s',
            (int) \round($calculees),
            (int) \round($kcal),
            $ecart > 0.0 ? '+' : '',
            (int) \round($ecart * 100),
            \abs($ecart) > self::ECART_FRANC
                ? 'Vérifie tes saisies : une valeur semble erronée.'
                : 'Vérifie les glucides — les sucres en font partie, ils ne s\'ajoutent pas.',
        );

        return [
            'resume' => $dit,
            'avertissement' => $dit,
            'verdict' => \abs($ecart) > self::ECART_FRANC ? 'incoherent' : 'ecart',
        ];
    }
}
