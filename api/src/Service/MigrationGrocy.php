<?php

declare(strict_types=1);

namespace App\Service;

/**
 * Quitter Grocy : amener ses aliments dans la base.
 *
 * But declare par le proprietaire du projet le 20 septembre 2026 : « mon but a
 * la finalite c'est de migrer de Grocy vers la base de donnees de l'application
 * car je ne veux plus utiliser Grocy ». La migration se fait produit par
 * produit, depuis un ecran, et elle rattache au catalogue CIQUAL au passage —
 * une pierre deux coups.
 *
 * ON NE SUPPRIME RIEN DANS GROCY. On copie, la personne verifie, elle tourne
 * sur la base le temps qu'elle veut, et c'est ELLE qui eteint Grocy. Une
 * migration qui detruit sa source n'a pas de marche arriere.
 */
final class MigrationGrocy
{
    /**
     * Les noms d'emplacements que Grocy peut porter pour un meme rangement.
     *
     * Releve sur le frigo reel : Grocy y porte « Fridge » ET « Frigo » — un
     * doublon anglais cree un jour et jamais range, qui contient le flageolet
     * rouge. On le rapproche donc explicitement, et on n'invente rien au-dela.
     */
    private const SYNONYMES = [
        'fridge' => 'frigo',
        'freezer' => 'congelateur',
        'congelo' => 'congelateur',
        'cupboard' => 'placard',
        'pantry' => 'placard',
    ];

    /**
     * L'emplacement de la base qui correspond a celui de Grocy.
     *
     * LA CASSE ET LES ACCENTS NE COMPTENT PAS : Grocy ecrit « Congelateur »
     * sans accent la ou la base ecrit « Congelateur » avec. Comparer les
     * chaines nues rangerait les surgeles dans « Autre ».
     *
     * ET ON NE DEVINE PAS AU-DELA. Un emplacement qu'on ne sait pas rapprocher
     * tombe dans le dernier de la liste — « Autre » dans la base d'origine — et
     * l'ecran le dit. Inventer un rapprochement ferait ranger des surgeles dans
     * le placard sans que personne le voie.
     *
     * @param list<string> $enBase les libelles d'emplacement de la base
     */
    public static function emplacementEquivalent(string $grocy, array $enBase): string
    {
        $cherche = self::nu($grocy);
        $cherche = self::SYNONYMES[$cherche] ?? $cherche;

        foreach ($enBase as $libelle) {
            if (self::nu($libelle) === $cherche) {
                return $libelle;
            }
        }

        /* LE REPLI SORT DE LA LISTE REELLE, il ne s'invente pas. Rendre
           « Autre » en dur echouerait a l'ecriture sur une base qui ne l'a
           pas — et on ne le decouvrirait qu'au soixante-deuxieme aliment. */
        return $enBase[\count($enBase) - 1] ?? 'Autre';
    }

    /** Sans accents ni casse : la seule comparaison qui ait du sens ici. */
    private static function nu(string $texte): string
    {
        return \str_replace(
            ['à', 'â', 'ä', 'é', 'è', 'ê', 'ë', 'î', 'ï', 'ô', 'ö', 'û', 'ü', 'ù', 'ç'],
            ['a', 'a', 'a', 'e', 'e', 'e', 'e', 'i', 'i', 'o', 'o', 'u', 'u', 'u', 'c'],
            \mb_strtolower(\trim($texte)));
    }
}
