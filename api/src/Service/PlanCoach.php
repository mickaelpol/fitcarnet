<?php

declare(strict_types=1);

namespace App\Service;

/**
 * RECOPIER UN PLAN DE COACH AMERICAIN — palier B, 21 septembre 2026.
 *
 * Les plans americains — MyFitnessPal, USDA, la plupart des coachs anglophones
 * — comptent les fibres DANS les glucides. L'application compte a l'europeenne
 * (regle 4) : les fibres valent 2 kcal/g et se comptent A PART. Recopier un
 * plan sans le convertir laisse donc les glucides trop hauts.
 *
 * PORTE DEPUIS `front/src/calcul/planCoach.ts`, SUPPRIME DANS LE MEME COMMIT.
 * Ce module-la n'etait appele que par `app/objectifs.tsx` : il est parti en
 * entier, il n'en reste rien au front. Ce n'est donc pas un jumeau declare comme
 * `Atwater`, c'est un demenagement.
 *
 * ON NE DEVINE PAS LA CONVENTION, ON LA DEMANDE. Une detection automatique a
 * ete tentee au front, en comparant les calories annoncees a ce que donnent les
 * deux lectures, puis retiree : elle se trompait sur le plan reel. Les calories
 * d'un plan ne sortent pas d'un calcul 4/4/9 — elles viennent des etiquettes,
 * arrondies, parfois d'une autre base. Sur le petit-dejeuner du plan de
 * reference, l'ecart a la lecture EUROPEENNE (13,5 kcal) est plus faible qu'a
 * l'americaine (20,5), alors que le plan est americain : la comparaison ne
 * mesurait que du bruit. Une question a l'utilisateur, dont l'intention ne fait
 * aucun doute, vaut mieux qu'un devin qui se trompe une fois sur deux.
 */
final class PlanCoach
{
    /**
     * LA CIBLE EUROPEENNE QUE DECRIT CE PLAN.
     *
     * LES QUATRE GRAMMAGES D'ABORD, LES CALORIES ENSUITE — et sur ces
     * grammages-la.
     *
     * F6, 15 septembre 2026 : seul `gluc` entrait arrondi dans le total, les
     * trois autres y entraient bruts. Le nombre affiche ne decrivait donc ni les
     * grammes rendus ni ceux du plan d'origine, mais un melange des deux que
     * personne ne pouvait refaire a la main — 446 kcal pour des grammes qui en
     * font 445. Le sens du projet vaut ici : ce qui est affiche est ce qui sera
     * pese, donc les calories suivent les grammes, jamais l'inverse.
     *
     * @return array{prot: float, gluc: float, lip: float, fibres: float, kcal: float, kcalAnnoncees: float}
     */
    public static function convertir(
        float $kcal,
        float $prot,
        float $glucides,
        float $lipides,
        float $fibres,
    ): array {
        /* Des fibres superieures aux glucides totaux ne veulent rien dire : les
           fibres SONT une part des glucides dans cette convention. On prefere ne
           rien retrancher plutot que de rendre un glucide negatif. */
        $retranchees = max(0.0, min($fibres, $glucides));

        $rendus = [
            'prot' => self::auDixieme($prot),
            'gluc' => self::auDixieme($glucides - $retranchees),
            'lip' => self::auDixieme($lipides),
            'fibres' => self::auDixieme($retranchees),
        ];

        return $rendus + [
            'kcal' => round(Atwater::kcal(
                $rendus['prot'], $rendus['gluc'], $rendus['lip'], $rendus['fibres'])),
            /* Ce que le plan d'origine annoncait, garde pour comparaison : c'est
               ce qui permet a l'utilisateur de voir que sa recopie tient. */
            'kcalAnnoncees' => round($kcal),
        ];
    }

    /**
     * LES FIBRES ANNONCEES SONT-ELLES CREDIBLES, ET SINON, QUOI DIRE.
     *
     * Un plan qui declare 0 g de fibres pour 200 g de haricots verts ne se
     * trompe pas de peu : il ne les a pas renseignees. Convertir sur cette base
     * laisse les glucides trop hauts, et le defaut passe inapercu — un zero
     * ressemble a une valeur.
     *
     * La regle est un ORDRE DE GRANDEUR, pas une loi : les aliments qui portent
     * des glucides en portent aussi des fibres, grossierement un dixieme. Un
     * plan qui annonce 80 g de glucides et 2 g de fibres n'a pas compte.
     *
     * Eprouve sur un plan reel : trois repas sur quatre sont signales, et la
     * verification aliment par aliment leur donne raison — 3,5 g annonces au
     * petit-dejeuner pour environ 10 g reels.
     *
     * SANS CONSEQUENCE, ET LA PHRASE LE DIT. Rien n'est deduit des fibres que le
     * plan declare : le calculateur retranchera celles des aliments, qui sont
     * connues. L'avertissement explique un chiffre, il ne bloque rien.
     */
    public static function avertissementDesFibres(float $glucides, float $fibres): ?string
    {
        if (!($glucides >= 20.0 && $fibres < $glucides / 10.0)) {
            return null;
        }

        return \sprintf(
            '%s g de fibres pour %s g de glucides : ton plan les sous-estime. '
            . 'Sans conséquence ici — c’est justement pour ça qu’on ne s’en sert pas.',
            FormatCourt::nb($fibres), FormatCourt::nb($glucides),
        );
    }

    private static function auDixieme(float $valeur): float
    {
        return round($valeur, 1);
    }
}
