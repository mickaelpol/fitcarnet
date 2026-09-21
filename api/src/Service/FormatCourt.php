<?php

declare(strict_types=1);

namespace App\Service;

/**
 * LE FORMAT COURT DES NOMBRES DE L'APPLICATION — jumeau de `nb`,
 * `front/src/theme/index.ts:174`.
 *
 * POURQUOI LE SERVEUR FORMATE, ALORS QUE LA MISE EN FORME EST UN TRAVAIL
 * D'ECRAN. Parce que depuis la refonte du 20 septembre 2026, le serveur
 * n'envoie pas des codes a traduire : il envoie LA PHRASE, deja redigee — et
 * une phrase contient des nombres. « Tes grammes representent 740,5 calories,
 * pas 700 » ne se decoupe pas en morceaux que l'ecran recollerait ; c'est ce
 * recollage qui avait laisse l'ecran d'invitation annoncer une regle que le
 * serveur n'appliquait plus.
 *
 * IL A ETE ECRIT DEUX FOIS AVANT D'ETRE ICI, le 21 septembre 2026 :
 * `CoherenceDesCibles` puis `PlanCoach`, a une heure d'intervalle. Deux copies
 * d'une regle d'arrondi divergent aussi surement que deux copies d'Epley — et
 * celle-ci decide de ce que l'utilisateur LIT.
 */
final class FormatCourt
{
    /**
     * Entier tant qu'on en est a moins de 0,05, sinon UNE decimale et une
     * VIRGULE.
     *
     * Ce n'est pas une preference de style : c'est ce que l'ecran affichait
     * avant que ces phrases viennent du serveur, et la consigne du chantier est
     * que l'application se comporte exactement comme avant.
     */
    public static function nb(float $valeur): string
    {
        if (abs($valeur - round($valeur)) < 0.05) {
            return (string) (int) round($valeur);
        }

        return str_replace('.', ',', number_format($valeur, 1, '.', ''));
    }
}
