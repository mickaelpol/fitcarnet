<?php

declare(strict_types=1);

namespace App\Service;

/**
 * TOUT CE QUI CLOCHE DANS UN ALIMENT — porte depuis le front le 20 septembre 2026.
 *
 * DECISION DU PROPRIETAIRE DU PROJET : « tout doit passer par le serveur car le
 * metier doit etre sur le serveur et puis c'est tout, comme ca je peux changer
 * le front quand bon me semble ».
 *
 * Ce fichier est la traduction fidele de `front/src/calcul/plausibilite.ts`,
 * fonction `verifierAliment`. Quatorze anomalies, trois gravites, et des
 * messages que l'utilisateur lit.
 *
 * COMMENT ON SAIT QUE LA TRADUCTION EST FIDELE : pas en se relisant. Le front a
 * tourne sur un corpus de 14 400 combinaisons — 50 aliments CIQUAL reels x
 * 8 categories x 12 rendements, plus douze cas fabriques pour les anomalies que
 * des donnees propres ne declenchent jamais — et sa reponse est figee dans
 * `tests/corpus/anomalies-reference.json.gz`. `AnomaliesPortageTest` exige le
 * MEME resultat, message par message. Porter « a l'oeil » et se relire, c'est
 * exactement la methode qui produit une divergence silencieuse.
 *
 * LES GRAVITES NE SE VALENT PAS :
 *   - `blocage`        : la donnee est fausse, on refuse de s'en servir ;
 *   - `avertissement`  : c'est inhabituel, on le DIT sans rien empecher ;
 *   - `info`           : c'est hors de la bande observee, sans consequence.
 */
final class AnomaliesAliment
{
    /** Bande dans laquelle tombe toute cereale ou legumineuse seche. */
    private const SEC_MINI = 300;
    private const SEC_MAXI = 400;

    /** Au-dela de ce rendement, un feculent gonfle vraiment. Un pain, non. */
    private const GONFLE = 1.3;

    /**
     * Ce qu'on OBSERVE, par categorie — a ne pas confondre avec l'impossible.
     *
     * Hors de ces bandes on AVERTIT ; `RendementPlausible` dit, lui, ce qu'un
     * ecran de saisie doit refuser. Confondre les deux questions a produit les
     * deux pannes du 16 septembre 2026.
     *
     * @var array<string, array{mini: float, maxi: float}>
     */
    private const RENDEMENT = [
        /* Jusqu'a 5 : un riz a 4,7 existe, il contient simplement 81 % d'eau
           au lieu des 68 a 70 % d'un riz de table. */
        'fec' => ['mini' => 1.0, 'maxi' => 5.0],
        'prot' => ['mini' => 0.6, 'maxi' => 1.05],
        /* Le plancher descend a 0,30 pour l'epinard, qui perd les deux tiers
           de sa masse : le refuser reviendrait a refuser la realite d'une
           poele. */
        'leg' => ['mini' => 0.3, 'maxi' => 1.05],
    ];


    /**
     * @return list<array{gravite: string, code: string, message: string}>
     */
    public static function pour(
        string $nom,
        string $categorie,
        float $kcal100,
        float $prot100,
        float $gluc100,
        float $lip100,
        ?float $fibres100,
        float $ratio,
    ): array {
        $out = [];
        $dire = static function (string $gravite, string $code, string $message) use (&$out, $nom): void {
            $out[] = ['gravite' => $gravite, 'code' => $code, 'message' => $nom . ' : ' . $message];
        };

        // --------------------------------------------------------- arithmetique

        $chiffres = [
            ['calories', $kcal100], ['protéines', $prot100],
            ['glucides', $gluc100], ['lipides', $lip100],
            ['fibres', $fibres100 ?? 0.0], ['rendement', $ratio],
        ];
        foreach ($chiffres as [$libelle, $v]) {
            if (!\is_finite($v)) {
                $dire('blocage', 'valeur_illisible',
                    \sprintf('la valeur « %s » n\'est pas un nombre.', $libelle));
            } elseif ($v < 0) {
                $dire('blocage', 'valeur_negative',
                    \sprintf('%s négatif (%s).', $libelle, self::nombre($v)));
            }
        }
        if ([] !== $out) {
            return $out;
        }

        if ($ratio <= 0) {
            $dire('blocage', 'rendement_nul',
                'rendement de cuisson à zéro : impossible d\'annoncer un poids cuit.');

            return $out;
        }

        $matiere = $prot100 + $gluc100 + $lip100 + ($fibres100 ?? 0.0);
        if ($matiere > 100.5) {
            $dire('blocage', 'plus_de_cent',
                \sprintf('%s g de nutriments dans 100 g de produit.', self::decimale($matiere, 1)));
        }

        // ---------------------------------------------------------- energetique

        $atwater = Atwater::kcal($prot100, $gluc100, $lip100, $fibres100);

        if (CoherenceNutritionnelle::ressembleVraimentADesKilojoules($kcal100, $atwater)) {
            $dire('blocage', 'kilojoules_recopies', \sprintf(
                '%s pour 100 g ressemble à des kilojoules : ses macros en font %s kcal. '
                . 'L\'étiquette porte les deux unités côte à côte — la ligne à recopier '
                . 'est celle en kcal, soit environ %s.',
                self::decimale($kcal100, 0), self::decimale($atwater, 0),
                self::decimale($kcal100 / 4.184, 0)));

            return $out;
        }

        $ecart = $kcal100 - $atwater;
        /* 20 % de marge : les fibres, les polyols et les arrondis de table
           justifient un ecart, pas un facteur deux. */
        if (\abs($ecart) > \max(25.0, 0.2 * \max($atwater, $kcal100))) {
            $dire('avertissement', 'calories_incoherentes', \sprintf(
                '%s kcal déclarées pour 100 g, mais ses macros en font %s. '
                . 'Une des deux valeurs est fausse.',
                self::nombre($kcal100), self::decimale($atwater, 0)));
        }

        // ------------------------------------------------------------ grain sec

        if ('fec' === $categorie && $ratio > self::GONFLE && $kcal100 > 0
            && $kcal100 < self::SEC_MINI) {
            $r = $ratio > 0 ? $ratio : 1.0;
            $sienKcal = $kcal100 * $r;

            if ($sienKcal >= self::SEC_MINI && $sienKcal <= self::SEC_MAXI) {
                $dire('blocage', 'valeurs_deja_cuites', \sprintf(
                    'ses valeurs sont celles du produit CUIT. Un féculent qui gonfle se '
                    . 'pèse SEC, et 100 g de grain sec font %d à %d kcal — ici %s. '
                    . 'Multiplie tout par le rendement (%s) : %s kcal, %s g de glucides, '
                    . '%s g de protéines et %s g de lipides pour 100 g.',
                    self::SEC_MINI, self::SEC_MAXI, self::decimale($kcal100, 0),
                    self::deuxDecimales($ratio), self::decimale($sienKcal, 0),
                    self::decimale($gluc100 * $r, 1), self::decimale($prot100 * $r, 1),
                    self::decimale($lip100 * $r, 1)));
            } else {
                $dire('blocage', 'grain_sec_invraisemblable', \sprintf(
                    '%s kcal pour 100 g de grain sec, alors qu\'un grain sec en fait '
                    . '%d à %d — c\'est une borne physique, pas une moyenne. Ressaisis '
                    . 'les valeurs du produit tel que tu le pèses, sec, paquet en main.',
                    self::decimale($kcal100, 0), self::SEC_MINI, self::SEC_MAXI));
            }
        }

        if ('fec' === $categorie && $ratio > self::GONFLE && $kcal100 > self::SEC_MAXI) {
            $dire('avertissement', 'grain_sec_trop_dense', \sprintf(
                '%s kcal pour 100 g de grain sec : c\'est au-dessus des %d kcal '
                . 'qu\'atteint la matière sèche la plus grasse. Vérifie la ligne du paquet.',
                self::decimale($kcal100, 0), self::SEC_MAXI));
        }

        // ----------------------------------------------------------- rendements

        /* Aucun de ces controles ne bloque — sauf un, et il est explique la ou
           il est. Le rendement n'entre dans aucune macro : il n'affiche que le
           poids servi, et se tromper sur le poids servi ne fait pas manger de
           travers. */

        if ('prot' === $categorie) {
            $r = self::RENDEMENT['prot'];
            if ($ratio > $r['maxi']) {
                $dire('avertissement', 'proteine_qui_gonfle', \sprintf(
                    'un rendement de %s : une viande ou un poisson PERD de l\'eau à la '
                    . 'cuisson, il n\'en gagne pas. Les deux pesées ont probablement été '
                    . 'interverties — ou elles ne portaient pas sur la même chose.',
                    self::deuxDecimales($ratio)));
            } elseif ($ratio < $r['mini']) {
                $dire('info', 'rendement_hors_norme', \sprintf(
                    'un rendement de %s : c\'est une cuisson plus poussée que la moyenne '
                    . '(on attend %s à %s %%). Sans conséquence sur tes macros — elles se '
                    . 'comptent sur le poids que tu pèses — mais la colonne « cuit » sera '
                    . 'basse. Vérifie seulement que les deux pesées portaient bien sur la '
                    . 'même chose.',
                    self::deuxDecimales($ratio), self::nombre($r['mini'] * 100),
                    self::nombre($r['maxi'] * 100)));
            }
        }

        if ('leg' === $categorie) {
            $r = self::RENDEMENT['leg'];
            if ($ratio > $r['maxi']) {
                $dire('avertissement', 'legume_qui_gonfle', \sprintf(
                    'un rendement de %s : un légume rend son eau, il n\'en gagne pas.',
                    self::deuxDecimales($ratio)));
            } elseif ($ratio < $r['mini']) {
                $dire('avertissement', 'rendement_hors_norme', \sprintf(
                    'un rendement de %s : ce légume aurait perdu plus des deux tiers de sa '
                    . 'masse (on attend %s à %s %%). C\'est beaucoup, même pour un épinard. '
                    . 'Sans conséquence sur tes macros — elles se comptent sur le poids que '
                    . 'tu pèses — mais vérifie que les deux pesées portaient bien sur la '
                    . 'même chose.',
                    self::deuxDecimales($ratio), self::nombre($r['mini'] * 100),
                    self::nombre($r['maxi'] * 100)));
            }
        }

        if ('fec' === $categorie) {
            $r = self::RENDEMENT['fec'];

            /* UN FECULENT QUI RETRECIT EST UN BLOCAGE, exception assumee a la
               regle « le rendement ne bloque jamais ». Un feculent ABSORBE de
               l'eau : sous 1, ce n'est pas une cuisson inhabituelle, c'est une
               impossibilite — donc la fiche entiere decrit autre chose. */
            if ($ratio < $r['mini']) {
                $dire('blocage', 'feculent_qui_retrecit', \sprintf(
                    'un rendement de %s : un féculent absorbe de l\'eau, il ne peut pas '
                    . 'peser moins cuit que sec. Ce n\'est pas une cuisson inhabituelle, '
                    . 'c\'est impossible — donc ses autres valeurs décrivent probablement '
                    . 'le produit CUIT, elles aussi. Ressaisis la ligne du paquet, pour '
                    . '100 g de produit sec.',
                    self::deuxDecimales($ratio)));
            } elseif ($ratio > $r['maxi']) {
                $dire('avertissement', 'rendement_hors_norme', \sprintf(
                    'un rendement de %s : le bilan de matière ne l\'autorise pas. 100 g de '
                    . 'grain sec ne portent que 88 g de matière sèche, et il n\'en resterait '
                    . 'que %s g pour 100 g de produit cuit — moins que n\'en contient un '
                    . 'féculent égoutté. Repèse en égouttant, et laisse tiédir avant de '
                    . 'poser sur la balance.',
                    self::deuxDecimales($ratio), self::decimale(88 / $ratio, 0)));
            }
        }

        if (\in_array($categorie, ['fruit', 'lait', 'huile', 'ole'], true) && 1.0 !== $ratio) {
            $dire('avertissement', 'rendement_inattendu', \sprintf(
                'un rendement de %s sur un aliment qu\'on ne fait pas gonfler. Il ne '
                . 'changera que le poids annoncé dans l\'assiette, mais autant qu\'il '
                . 'soit juste.',
                self::deuxDecimales($ratio)));
        }

        return $out;
    }

    /**
     * Tout ce qui cloche dans un frigo, du plus grave au moins grave.
     *
     * @param list<array{nom: string, categorie: string, kcal100: float, prot100: float,
     *                   gluc100: float, lip100: float, fibres100: float|null, ratio: float}> $aliments
     *
     * @return list<array{gravite: string, code: string, message: string}>
     */
    public static function pourLeCatalogue(array $aliments): array
    {
        $ordre = ['blocage' => 0, 'avertissement' => 1, 'info' => 2];
        $toutes = [];

        foreach ($aliments as $a) {
            foreach (self::pour($a['nom'], $a['categorie'], $a['kcal100'], $a['prot100'],
                $a['gluc100'], $a['lip100'], $a['fibres100'], $a['ratio']) as $anomalie) {
                $toutes[] = $anomalie;
            }
        }

        /* TRI STABLE, comme `Array.prototype.sort` de JavaScript depuis ES2019 :
           a gravite egale, l'ordre d'arrivee est conserve. `usort` de PHP est
           stable depuis 8.0, donc les deux coincident. */
        \usort($toutes, static fn (array $x, array $y): int => $ordre[$x['gravite']] <=> $ordre[$y['gravite']]);

        return $toutes;
    }

    // ----------------------------------------------------------------- formats

    /**
     * Un nombre comme JavaScript l'ecrit : sans decimale inutile.
     *
     * `String(2.5)` rend « 2.5 », `String(2)` rend « 2 » — pas « 2.0 ». C'est
     * ce que les messages du front contiennent, et ils doivent etre identiques
     * au caractere pres.
     */
    private static function nombre(float $v): string
    {
        if ($v === \floor($v) && \is_finite($v)) {
            return (string) (int) $v;
        }

        return \rtrim(\rtrim(\sprintf('%.10F', $v), '0'), '.');
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
    private static function decimale(float $v, int $n): string
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

    /** `toFixed(2)` — un rendement s'ecrit avec deux decimales, pas seize. */
    private static function deuxDecimales(float $v): string
    {
        return self::decimale($v, 2);
    }
}
