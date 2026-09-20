<?php

declare(strict_types=1);

namespace App\Service;

/**
 * COMBIEN DE SERIES COMPTENT, SELON LA FACON DONT ON TRAVAILLE.
 *
 * Un exercice « for time » (`chrono`) n'a qu'un temps total : ses lignes
 * supplementaires servent a noter le detail, ce ne sont pas des series a faire.
 * Un exercice a la charge ou en isometrie compte toutes les siennes.
 *
 * POURQUOI CETTE CLASSE EXISTE — 21 septembre 2026, et c'est une correction de
 * ma propre correction du matin.
 *
 * Le dernier double juge du projet — « 7 series faites sur 12 », calcule par le
 * serveur pour la liste et par l'ecran pour la seance ouverte — avait d'abord
 * ete supprime en envoyant a l'ecran un POIDS par serie : 1, ou 0 au-dela de la
 * premiere ligne d'un chrono. L'ecran n'avait plus qu'a additionner.
 *
 * CA MARCHAIT, ET C'ETAIT FAUX DES QUE L'UTILISATEUR TOUCHAIT AU BLOC. Un poids
 * par ligne est DERIVE de deux choses que l'ecran modifie sans le serveur : le
 * mode du bloc, et le rang de la ligne. Mesure sur le module compile, avant
 * correction :
 *
 *   - ajouter un exercice « for time » a une seance : l'ecran affichait 0/3,
 *     le serveur allait dire 0/1. C'est le geste le plus banal de l'ecran.
 *   - supprimer la premiere ligne d'un chrono : 0/0, et la jauge disparaissait.
 *   - basculer un bloc Chrono vers Charge : 0/1 au lieu de 0/3.
 *
 * LA LECON : ne pas transmettre une valeur derivee d'un etat que le client
 * mute. Transmettre la REGLE, indexee sur quelque chose que le client possede
 * deja — ici le mode. Un bloc fabrique a l'ecran a un mode ; une bascule de
 * mode change la cle, pas la reponse.
 *
 * ET CE N'EST PAS UN RETOUR AU FICHIER DE REGLES. `api/regles/*.json` etait lu
 * a la compilation par les deux suites de tests : il supposait qu'un futur
 * front pense a le lire, et gardait donc la duplication. Ceci est servi par
 * l'API a l'execution — un front qui ne l'appelle pas n'affiche rien, et le
 * jour ou la regle change, tous les clients suivent sans redeploiement. C'est
 * exactement ce que demandait le proprietaire : « comme ca je peux changer le
 * front quand bon me semble ».
 */
final class ModesDeTravail
{
    /**
     * Le repli quand le mode n'est dit nulle part.
     *
     * « Charge », donc le decompte complet : mieux vaut annoncer trop a faire
     * que trop peu.
     */
    public const string PAR_DEFAUT = 'charge';

    /**
     * COMBIEN DE SERIES COMPTENT, PAR MODE. `null` veut dire « toutes ».
     *
     * LA SEULE ECRITURE DE CETTE REGLE DANS TOUT LE DEPOT. `SeanceExercice`
     * la lit, `Seance::getAvancement()` la lit a travers lui, et l'ecran la
     * recoit par `GET /api/modes-de-travail`.
     *
     * Les cles doivent rester celles du CHECK de `db/01-schema.sql`
     * (`mode_defaut IN ('charge','iso','chrono')`, lignes 332, 391 et 429) —
     * c'est ce que verifie `ModesDeTravailTest`.
     */
    private const array SERIES_QUI_COMPTENT = [
        'charge' => null,
        'iso' => null,
        'chrono' => 1,
    ];

    /**
     * Combien de series comptent pour ce mode, `null` si toutes.
     *
     * UN MODE INCONNU COMPTE TOUT. Il ne devrait pas en arriver — la base a un
     * CHECK — mais si une valeur inattendue passait, annoncer trop a faire est
     * moins grave que masquer du travail restant.
     */
    public static function seriesQuiComptent(?string $mode): ?int
    {
        return self::SERIES_QUI_COMPTENT[$mode ?? self::PAR_DEFAUT] ?? null;
    }

    /** Vrai si ce mode ne compte qu'une seule serie, quel que soit le detail saisi. */
    public static function compteUneSeuleSerie(?string $mode): bool
    {
        return 1 === self::seriesQuiComptent($mode);
    }

    /**
     * Le catalogue, tel que l'ecran le recoit.
     *
     * IL NE PORTE PAS LES LIBELLES. « Charge », « Iso », « Chrono » sont de la
     * presentation, et ils vivent legitimement dans l'ecran qui les affiche.
     * Ce qui est ici, c'est la seule chose qu'un ecran ne doit pas decider.
     *
     * @return list<array{cle: string, seriesQuiComptent: int|null}>
     */
    public static function catalogue(): array
    {
        $sortie = [];
        foreach (self::SERIES_QUI_COMPTENT as $cle => $combien) {
            $sortie[] = ['cle' => $cle, 'seriesQuiComptent' => $combien];
        }

        return $sortie;
    }

    /** @return list<string> */
    public static function cles(): array
    {
        return \array_keys(self::SERIES_QUI_COMPTENT);
    }
}
