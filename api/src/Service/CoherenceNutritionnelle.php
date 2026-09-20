<?php

declare(strict_types=1);

namespace App\Service;

/**
 * CET ALIMENT SE CONTREDIT-IL LUI-MEME ?
 *
 * Palier 1 du chantier serveur autoritaire, 20 septembre 2026. Jusqu'ici, le
 * front seul jugeait la coherence d'un aliment : `plausibilite.ts` refusait
 * 90 kcal pour un riz qui en fait 350, et l'API l'acceptait sans un mot. Un
 * appel direct, un bug d'ecran, un autre client demain — et la donnee entrait.
 * C'est la regle 7 prise au serieux : un chiffre faux est pire qu'un refus,
 * et ce qui est ecrit sera pese et mange.
 *
 * ELLE NE COMPARE L'ALIMENT QU'A LUI-MEME. Aucune table, aucun referentiel,
 * aucune moyenne : deux personnes peuvent acheter deux riz basmati aux macros
 * differentes, et les deux ont raison. Ce qu'on refuse, c'est un aliment qui
 * se contredit — pas un aliment qui s'ecarte.
 *
 * ELLE REFUSE, ELLE N'AVERTIT PAS. Les avertissements — « ce chiffre est
 * inhabituel », « verifie la ligne du paquet » — affichent un doute sans rien
 * empecher : ils vivent dans `AnomaliesAliment`, et `VerdictAliment` sert les
 * deux a l'ecran. Le serveur decide ce qui entre en base, l'ecran aide a
 * saisir ; les deux roles sont sur le serveur depuis le 20 septembre 2026.
 *
 * ELLE N'A PLUS DE JUMEAU DANS LE FRONT. Elle en a eu un, tenu d'accord par
 * `api/regles/coherence.json` lu par les deux suites. Ce dispositif est
 * abandonne — il GARDAIT la duplication au lieu de la supprimer — et le
 * fichier est supprime avec les trois autres. L'ecran appelle desormais
 * `POST /api/verification/aliment` et affiche ce qui revient, phrases et
 * couleur comprises.
 *
 * AUCUNE DEPENDANCE DE SERVICE, ET C'EST VOULU : les tests du projet
 * instancient les validateurs sans conteneur, et un validateur a dependance a
 * casse quatorze tests le 20 septembre 2026. Tout est statique.
 */
final class CoherenceNutritionnelle
{
    /**
     * Plus de nutriments que de produit : impossible.
     *
     * 100,5 et non 100 : les tables arrondissent chaque ligne separement, et
     * la somme depasse le rond d'un demi-gramme sans que rien ne soit faux.
     */
    private const MATIERE_MAXIMALE = 100.5;

    /**
     * Un grain sec fait au moins 300 kcal aux 100 g.
     *
     * C'est de la matiere seche : la borne est physique, pas statistique. En
     * dessous, ce sont des valeurs de produit CUIT — et le calcul resterait
     * juste tout en faisant peser trois fois trop.
     */
    private const GRAIN_SEC_KCAL_MINIMUM = 300;

    /** Au-dela de ce rendement, un feculent gonfle vraiment. Un pain, non. */
    private const RATIO_QUI_GONFLE = 1.3;

    /** 1 kcal = 4,184 kJ. Les etiquettes europeennes portent les deux. */
    private const FACTEUR_KILOJOULE = 4.184;

    /**
     * Marge autour du facteur.
     *
     * 0,10 et non 0,15 : c'est la valeur que `nutrition.ts` porte depuis
     * toujours, et l'avoir fixee a 0,15 ici creait un cinquieme juge du meme
     * fait a un autre seuil — le matin meme ou ce fichier naissait.
     */
    private const TOLERANCE_KILOJOULE = 0.10;

    /**
     * EN DECA DE CETTE ENERGIE CALCULEE, ON NE REFUSE RIEN.
     *
     * MESURE LE 20 SEPTEMBRE 2026 SUR LES ENTREES CIQUAL de la base : sans
     * plancher, cette regle refuse du vin doux (148 kcal pour 40,6 par
     * Atwater, rapport 3,64), du cidre traditionnel (4,34), du vinaigre (4,63)
     * et un kir royal (3,69).
     *
     * La cause est physique : L'ALCOOL FAIT 7 kcal/g ET N'ENTRE DANS AUCUNE
     * DES QUATRE MACROS. Tout produit alcoolise a donc un rapport
     * kcal/Atwater eleve, et il passe par 4,184 en chemin. Les refuser en
     * accusant quelqu'un d'avoir recopie des kilojoules serait un faux
     * reproche, sur des valeurs publiees par l'Anses.
     *
     * 50 : le plus dense des six mesures est a 40,6. Et le cas qui motive la
     * regle n'en souffre pas — un riz recopie en kilojoules a un Atwater
     * de 348.
     */
    private const ATWATER_MINIMUM_POUR_REFUSER = 50.0;

    /**
     * Le motif du refus, ou `null` si l'aliment se tient.
     *
     * Un seul motif est rendu, le premier trouve : on ne noie pas quelqu'un
     * sous trois reproches quand une seule valeur est a corriger.
     */
    public static function motifDeRefus(
        string $categorie,
        float $kcal100,
        float $prot100,
        float $gluc100,
        float $lip100,
        ?float $fibres100,
        float $ratio,
    ): ?string {
        $fibres = $fibres100 ?? 0.0;
        $matiere = $prot100 + $gluc100 + $lip100 + $fibres;

        if ($matiere > self::MATIERE_MAXIMALE) {
            return \sprintf(
                '%s g de nutriments dans 100 g de produit : la somme des '
                . 'proteines, glucides, lipides et fibres ne peut pas depasser 100 g.',
                \number_format($matiere, 1, ',', ' '),
            );
        }

        $atwater = Atwater::kcal($prot100, $gluc100, $lip100, $fibres);

        if (self::ressembleADesKilojoules($kcal100, $atwater)) {
            return \sprintf(
                '%s pour 100 g ressemble a des kilojoules : ses macros en font '
                . '%s kcal. L\'etiquette porte les deux unites cote a cote — '
                . 'la ligne a recopier est celle en kcal.',
                \number_format($kcal100, 0, ',', ' '),
                \number_format($atwater, 0, ',', ' '),
            );
        }

        if (self::estUnGrainSecTropPauvre($categorie, $kcal100, $ratio)) {
            return \sprintf(
                '%s kcal pour 100 g d\'un feculent qui gonfle : un grain sec en '
                . 'fait au moins %d. Ce sont des valeurs de produit CUIT — les '
                . 'valeurs decrivent le produit tel qu\'on le PESE, sec, paquet '
                . 'en main.',
                \number_format($kcal100, 0, ',', ' '),
                self::GRAIN_SEC_KCAL_MINIMUM,
            );
        }

        return null;
    }

    /**
     * UNE CIBLE NUTRITIONNELLE SE CONTREDIT-ELLE ?
     *
     * ON NE REFUSE PAS UNE CIBLE SEULEMENT INCOHERENTE, ET C'EST DELIBERE.
     * L'ecran des objectifs affiche « tes grammes representent 1850 calories,
     * pas 2100 » puis, en toutes lettres, « l'app respecte les grammes ; les
     * calories suivent » — et laisse enregistrer. C'est une tolerance ecrite,
     * pas un oubli : quelqu'un recopie un plan de coach qui ne tombe pas
     * juste, et on ne lui interdit pas de le saisir. La refuser ici casserait
     * un parcours qui marche.
     *
     * Le palier 1 dit « le serveur refuse les chiffres FAUX », pas « le
     * serveur impose l'arithmetique ».
     *
     * CE QUI EST REFUSE : les kilojoules recopies a la place des kcal. Ce
     * n'est pas une tolerance mais une erreur d'unite — la cible devient
     * quatre fois trop haute et le calculateur vise une journee a
     * 8 000 calories. Le rapport de 4,184 ne se produit pas par hasard.
     */
    public static function motifDeRefusDUneCible(
        float $kcal,
        float $prot,
        float $gluc,
        float $lip,
    ): ?string {
        $atwater = Atwater::kcal($prot, $gluc, $lip);

        if (!self::ressembleADesKilojoules($kcal, $atwater)) {
            return null;
        }

        return \sprintf(
            '%s pour cette cible ressemble a des kilojoules : tes grammes en '
            . 'font %s kcal. La ligne a saisir est celle en kcal, soit environ %s.',
            \number_format($kcal, 0, ',', ' '),
            \number_format($atwater, 0, ',', ' '),
            \number_format($kcal / self::FACTEUR_KILOJOULE, 0, ',', ' '),
        );
    }

    /**
     * Les kcal declarees sont-elles les kilojoules de l'etiquette ?
     *
     * ON NE REGARDE PAS LES KCAL SEULES. Une huile fait vraiment 900 kcal aux
     * 100 g : un simple plafond les refuserait toutes. C'est le DESACCORD avec
     * les macros, dans ce rapport precis, qui trahit l'unite.
     */
    public static function ressembleVraimentADesKilojoules(float $kcal100, float $atwater): bool
    {
        return self::ressembleADesKilojoules($kcal100, $atwater);
    }

    private static function ressembleADesKilojoules(float $kcal100, float $atwater): bool
    {
        if ($atwater < self::ATWATER_MINIMUM_POUR_REFUSER) {
            return false;
        }

        $rapport = $kcal100 / $atwater;
        $ecart = \abs($rapport - self::FACTEUR_KILOJOULE) / self::FACTEUR_KILOJOULE;

        return $ecart <= self::TOLERANCE_KILOJOULE;
    }

    /**
     * Un feculent qui gonfle, sous la borne du grain sec.
     *
     * `$kcal100 > 0` exclut l'aliment dont les kcal ne sont pas encore
     * saisies : c'est une absence, pas une valeur fausse (regle 6), et
     * `Assert\NotNull` s'en occupe ailleurs.
     */
    private static function estUnGrainSecTropPauvre(
        string $categorie,
        float $kcal100,
        float $ratio,
    ): bool {
        return 'fec' === $categorie
            && $ratio > self::RATIO_QUI_GONFLE
            && $kcal100 > 0.0
            && $kcal100 < self::GRAIN_SEC_KCAL_MINIMUM;
    }
}
