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
 * ELLE NE REFUSE QUE CE QUE LE FRONT BLOQUE DEJA, et rien de plus. Le front
 * porte en plus des avertissements — « ce chiffre est inhabituel », « verifie
 * la ligne du paquet » — qui affichent un doute sans rien empecher ; ils
 * restent la-bas. Le serveur decide ce qui entre en base, l'ecran aide a
 * saisir.
 *
 * DEUXIEME ECRITURE ASSUMEE, donc verrouillee : `api/regles/coherence.json`
 * est lu par les DEUX suites de tests. Le jour ou l'un des deux juges change
 * d'avis sans l'autre, une des deux tombe en nommant le cas. C'est le meme
 * dispositif que le mot de passe, le rendement et l'avancement.
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

    /** Marge autour du facteur, pour absorber les arrondis d'etiquette. */
    private const TOLERANCE_KILOJOULE = 0.15;

    /**
     * Convention EUROPEENNE : les fibres comptent 2 kcal/g, a part des
     * glucides (regle 4). L'Atwater americain declarerait incoherents des
     * aliments riches en fibres dont les valeurs sont pourtant justes.
     */
    private const KCAL_PROT = 4.0;
    private const KCAL_GLUC = 4.0;
    private const KCAL_LIP = 9.0;
    private const KCAL_FIBRES = 2.0;

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

        $atwater = self::KCAL_PROT * $prot100 + self::KCAL_GLUC * $gluc100
            + self::KCAL_LIP * $lip100 + self::KCAL_FIBRES * $fibres;

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
     * Les kcal declarees sont-elles les kilojoules de l'etiquette ?
     *
     * ON NE REGARDE PAS LES KCAL SEULES. Une huile fait vraiment 900 kcal aux
     * 100 g : un simple plafond les refuserait toutes. C'est le DESACCORD avec
     * les macros, dans ce rapport precis, qui trahit l'unite.
     */
    private static function ressembleADesKilojoules(float $kcal100, float $atwater): bool
    {
        if ($atwater <= 0.0) {
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
