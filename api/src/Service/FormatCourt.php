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
 *
 * ET SA PREMIERE VERSION ETAIT FAUSSE, releve par `revue-fitcarnet` le jour
 * meme. Elle employait `number_format`, que le docblock de `decimale` —
 * ecrit la VEILLE, trois fichiers plus loin — declare justement faux pour cet
 * usage : 3 410 divergences sur 100 001 valeurs au pas de 0,01, toutes
 * atteignables au clavier. Taper « 300,45 » dans les calories d'une cible
 * suffisait a lire « 300,5 » la ou l'ecran ecrivait « 300,4 ».
 *
 * `AnomaliesAliment::decimale` DELEGUE DESORMAIS ICI : il n'y a plus qu'une
 * ecriture de `toFixed` dans tout le serveur.
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

        /* `decimale` ET NON `number_format` — corrige le 21 septembre 2026,
           quelques heures apres avoir ete ecrit. `number_format` PRE-ARRONDIT :
           il rendait « 300,5 » la ou l'ecran ecrivait « 300,4 », et « 4,4 » la
           ou il ecrivait « 4,3 ». 3 410 divergences sur 100 001 valeurs au pas
           de 0,01, toutes atteignables au clavier. */
        return str_replace('.', ',', self::decimale($valeur, 1));
    }

    /**
     * `toFixed(n)` DE JAVASCRIPT, A LA LETTRE — et aucune fonction PHP ne le fait.
     *
     * ECMA-262 dit : « soit n l'entier pour lequel n / 10^f - x est aussi proche
     * de zero que possible ; s'il y en a deux, prendre le PLUS GRAND ». Donc :
     * valeur exacte du flottant, et egalites arrondies vers le haut.
     *
     * LES DEUX CANDIDATS PHP ECHOUENT, chacun d'un cote — mesure le
     * 20 septembre 2026 en comparant le portage au front sur 4 409 cas :
     *
     *   number_format PRE-ARRONDIT. 2,5 x 2,26 vaut 5,649999999999999 5 ; il le
     *   traite comme 5,65 et rend « 5,7 », la ou JavaScript rend « 5,6 ».
     *
     *   sprintf('%.1F') arrondit AU PAIR sur les egalites. 1,65 x 5 vaut 8,25
     *   exactement — un flottant representable — et il rend « 8,2 », la ou
     *   JavaScript rend « 8,3 ».
     *
     * Aucun des deux n'est faux en soi : ils appliquent une autre convention.
     * Mais l'utilisateur doit lire la MEME phrase qu'avant la refonte, au
     * caractere pres. On developpe donc la valeur exacte du flottant, puis on
     * arrondit la CHAINE, egalites vers le haut.
     */
    public static function decimale(float $v, int $n): string
    {
        if (!\is_finite($v)) {
            return (string) $v;
        }

        $signe = $v < 0 ? '-' : '';
        /* 30 decimales : assez pour developper exactement n'importe quel double
           de cet ordre de grandeur, et donc pour distinguer une vraie egalite
           d'un « presque ». */
        $exact = \sprintf('%.30F', \abs($v));
        [$entier, $decimales] = \explode('.', $exact);

        $gardees = \substr($decimales, 0, $n);
        $reste = \substr($decimales, $n);

        /* Vers le haut si le reste depasse la moitie, ET a l'egalite parfaite :
           c'est le « prendre le plus grand » de la specification. */
        $monte = \rtrim($reste, '0') !== '' && \substr($reste, 0, 1) >= '5';

        if (!$monte) {
            return $signe . $entier . ('' === $gardees ? '' : '.' . $gardees);
        }

        /* On ajoute une unite au dernier rang garde, en propageant la retenue —
           « 9,99 » a un rang doit donner « 10,0 », pas « 9,10 ». A la main, sur
           la chaine : `gmp` n'est pas installe dans le conteneur, et un `+ 1`
           sur un entier PHP perdrait les grands nombres. */
        $chiffres = $entier . $gardees;
        $rang = \strlen($chiffres) - 1;
        $retenue = true;
        while ($retenue && $rang >= 0) {
            $c = (int) $chiffres[$rang];
            $retenue = 9 === $c;
            $chiffres[$rang] = (string) ($retenue ? 0 : $c + 1);
            --$rang;
        }
        $monte = ($retenue ? '1' : '') . $chiffres;

        return $signe . ($n === 0
            ? $monte
            : \substr($monte, 0, -$n) . '.' . \substr($monte, -$n));
    }
}
