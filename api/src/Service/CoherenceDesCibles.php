<?php

declare(strict_types=1);

namespace App\Service;

/**
 * DE COMBIEN LES CALORIES ANNONCEES RATENT CE QUE LES GRAMMES PEUVENT DONNER.
 *
 * POURQUOI CETTE CLASSE EXISTE — palier B, 21 septembre 2026.
 *
 * L'ecran des objectifs portait cette regle en entier : le seuil de 15 kcal,
 * les deux conventions de glucides, et la phrase affichee. Le serveur, lui, n'en
 * avait rien. Le proprietaire du projet, le 20 septembre : « le metier doit etre
 * sur le serveur et puis c'est tout, comme ca je peux changer le front quand bon
 * me semble ».
 *
 * CE N'EST PAS LE MEME JUGEMENT QUE `CoherenceNutritionnelle::motifDeRefusDUneCible`,
 * et ce n'est pas une supposition : c'est mesure. Sur 1 125 combinaisons de
 * cibles, le 21 septembre 2026 — 248 fois les deux parlent, 733 fois
 * l'avertissement parle seul, 144 fois personne ne dit rien, et ZERO fois le
 * serveur refuse sans que l'avertissement ait parle. L'un REFUSE un soupcon de
 * kilojoules, l'autre AVERTIT d'un ecart. On n'en fait pas un seul.
 *
 * LE JUMEAU DU FRONT EST `front/src/solveur/solveur.ts` — `SEUIL_COHERENCE`,
 * `ecartDeCoherence`, `bornesDeCoherence`. Il ne reste que parce que le solveur
 * calcule encore dans le navigateur et pose le meme constat dans ses
 * diagnostics ; le jour ou le solveur passe au serveur (palier 3), celle-ci sera
 * la seule. Meme situation, meme phrase, que `Atwater` et `nutrition.ts`.
 * L'ECRAN, LUI, N'EN A PLUS RIEN : il affiche la phrase que cette classe ecrit.
 */
final class CoherenceDesCibles
{
    /**
     * Au-dela, l'ecart entre les kcal annoncees et les grammes n'est plus un
     * arrondi. Il se franchit STRICTEMENT : 15 kcal pile ne se reproche pas.
     */
    public const float SEUIL = 15.0;

    /**
     * LES BORNES DE CALORIES QUE CES GRAMMES PEUVENT DECRIRE.
     *
     * `max` : aucune fibre, les glucides comptent tous 4 kcal/g.
     * `min` : tout en fibres, a 2 kcal/g (regle 4, convention EUROPEENNE).
     *
     * @return array{min: float, max: float}
     */
    public static function bornes(float $prot, float $gluc, float $lip): array
    {
        return [
            'min' => Atwater::kcal($prot, 0.0, $lip, $gluc),
            'max' => Atwater::kcal($prot, $gluc, $lip),
        ];
    }

    /**
     * L'ECART, ET `0.0` QUAND LA CIBLE EST ATTEIGNABLE — il n'y a alors rien a
     * signaler.
     *
     * En convention europeenne, les grammes de glucides EXCLUENT les fibres : la
     * cible decrit un seul nombre de calories, et l'ecart se lit directement.
     *
     * En glucides TOTAUX, les fibres sont DEDANS sans qu'on sache combien. Les
     * memes grammes couvrent alors tout un intervalle, et une cible qui tombe
     * dedans est atteignable. Les compter a 4 kcal/g accusait a tort des 7,5 g
     * de fibres — l'ecran reprochait a l'utilisateur une faute qu'il n'avait pas
     * commise (M1, 15 septembre 2026). On ne devine pas la part manquante : on
     * refuse de trancher, seule reponse honnete quand la donnee n'est pas la.
     */
    public static function ecart(
        float $kcal,
        float $prot,
        float $gluc,
        float $lip,
        bool $glucidesTotaux = false,
    ): float {
        $bornes = self::bornes($prot, $gluc, $lip);

        if (!$glucidesTotaux) {
            return $kcal - $bornes['max'];
        }

        if ($kcal > $bornes['max']) {
            return $kcal - $bornes['max'];
        }

        if ($kcal < $bornes['min']) {
            return $kcal - $bornes['min'];
        }

        return 0.0;
    }

    /**
     * LA PHRASE QUE L'ECRAN AFFICHE, ou `null` quand il n'y a rien a dire.
     *
     * Le serveur envoie la PHRASE, pas des codes a traduire : c'est la regle du
     * chantier depuis la jauge de mot de passe, et c'est ce qui a evite que
     * l'ecran d'invitation annonce une regle que le serveur n'appliquait plus.
     *
     * Elle n'interdit rien : « l'app respecte les grammes ; les calories
     * suivent ». Quelqu'un recopie un plan de coach qui ne tombe pas juste, et
     * on ne lui interdit pas de le saisir — meme decision qu'en `Cible.php`.
     */
    public static function avertissement(
        float $kcal,
        float $prot,
        float $gluc,
        float $lip,
        bool $glucidesTotaux,
    ): ?string {
        if (abs(self::ecart($kcal, $prot, $gluc, $lip, $glucidesTotaux)) <= self::SEUIL) {
            return null;
        }

        $bornes = self::bornes($prot, $gluc, $lip);

        $constat = $glucidesTotaux
            ? \sprintf(
                'Tes grammes représentent entre %s et %s calories selon la part de fibres, pas %s. ',
                FormatCourt::nb($bornes['min']), FormatCourt::nb($bornes['max']),
                FormatCourt::nb($kcal),
            )
            : \sprintf(
                'Tes grammes représentent %s calories, pas %s. ',
                FormatCourt::nb($bornes['max']), FormatCourt::nb($kcal),
            );

        return $constat."L'app respecte les grammes ; les calories suivent.";
    }
}
