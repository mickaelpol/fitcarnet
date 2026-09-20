<?php

declare(strict_types=1);

namespace App\Service;

/**
 * LES CALORIES QUE DECRIVENT DES GRAMMES — l'unique ecriture, cote serveur.
 *
 * ELLE ETAIT ECRITE CINQ FOIS, dans trois fichiers, le 20 septembre 2026 :
 * `CoherenceNutritionnelle` deux fois, `AnomaliesAliment` une, `VerdictAliment`
 * deux. Pire : l'en-tete de `VerdictAliment` affirmait « c'est la seule somme
 * d'Atwater du projet cote serveur » — faux au moment ou c'etait ecrit.
 * Releve par `revue-pile` le jour meme.
 *
 * C'est la regle 5 du projet, et elle vient d'une panne reelle : trois copies
 * d'Epley aux bornes divergentes ont produit un « record » de 79,96 kg que la
 * formule elle-meme declare invalide.
 *
 * CONVENTION EUROPEENNE, regle 4 : les fibres comptent 2 kcal/g et se comptent
 * A PART des glucides. L'Atwater americain — `4P + 4G + 9L`, fibres ignorees —
 * declare incoherents des aliments riches en fibres dont les valeurs sont
 * pourtant justes. Le chia en est le cas type : 486 kcal annoncees, 378 par le
 * calcul americain, et un ecart de 108 kcal reproche a une donnee juste.
 *
 * LE JUMEAU DU FRONT EST `front/src/calcul/nutrition.ts`. Il ne reste que pour
 * ce que le front affiche encore ; le jour ou tout passe au serveur, celui-ci
 * sera le seul.
 */
final class Atwater
{
    public const KCAL_PROT = 4.0;
    public const KCAL_GLUC = 4.0;
    public const KCAL_LIP = 9.0;

    /** Convention EUROPEENNE : 2 kcal/g, et comptees a part (regle 4). */
    public const KCAL_FIBRES = 2.0;

    /** Les calories que ces grammes decrivent. */
    public static function kcal(
        float $prot,
        float $gluc,
        float $lip,
        ?float $fibres = null,
    ): float {
        return self::KCAL_PROT * $prot
            + self::KCAL_GLUC * $gluc
            + self::KCAL_LIP * $lip
            + self::KCAL_FIBRES * ($fibres ?? 0.0);
    }
}
