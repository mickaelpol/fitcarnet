<?php

declare(strict_types=1);

namespace App\Service;

/**
 * LE RENDEMENT VA-T-IL DANS LE BON SENS ?
 *
 * Ce fichier remplace `EtatReference`, qui repondait a une question que
 * l'application ne pose plus.
 *
 * Un aliment portait un « etat de reference » disant si ses valeurs
 * decrivaient le produit cru ou cuit. Trois champs — macros, rendement, etat —
 * pour un seul fait, donc trois facons de se contredire. Deux sources les
 * remplissaient chacune a sa maniere : Grocy deduisait l'etat de la categorie,
 * la table le lisait dans une colonne qui pouvait dire autre chose. Un compte
 * ordinaire mangeait jusqu'a trois fois trop de glucides, silencieusement, la
 * ou le meme aliment lu depuis Grocy etait juste.
 *
 * Desormais les valeurs nutritionnelles decrivent TOUJOURS le produit tel
 * qu'on le pese avant de cuisiner — riz sec, viande crue, legume cru. Il n'y a
 * plus d'etat a stocker, plus de colonne a lire, plus de regle a dupliquer :
 * la contradiction est devenue impossible a ecrire.
 *
 * Reste ce seul controle, qui ne porte que sur le rendement lui-meme et ne
 * touche aucune macro : une pesee peut avoir ete faite a l'envers, les deux
 * chiffres intervertis. Une viande ne grossit pas en cuisant, un feculent ne
 * retrecit pas. Une valeur a contresens ne se rattrape pas — elle inverse les
 * deux colonnes de l'ecran — et c'est la seule raison d'ecarter la mesure de
 * quelqu'un.
 */
final class RendementPlausible
{
    /**
     * Les categories qui PERDENT de l'eau a la cuisson.
     *
     * Les legumes en font partie : 200 g de brocoli sur la balance, a la
     * vapeur, en ressortent 150. Et cela ne fausse rien de compter sur le
     * poids cru — a la vapeur, seule l'EAU part. Les proteines, les glucides
     * et les fibres de 200 g de brocoli cru sont encore la dans les 150 g
     * cuits.
     */
    private const PERDENT = ['prot', 'leg'];

    /**
     * Ce qui cloche dans ce rendement, ou NULL s'il est plausible.
     *
     * La tolerance de 1,05 sur les categories qui perdent de l'eau laisse
     * passer une pesee a la marge sans laisser passer une inversion.
     */
    public static function sens(string $categorie, float $ratio): ?string
    {
        if ($ratio <= 0) {
            return 'un rendement nul ou negatif : impossible d\'annoncer un poids cuit.';
        }

        if (\in_array($categorie, self::PERDENT, true) && $ratio > 1.05) {
            return \sprintf(
                'rendement %.2f : %s perd de l\'eau a la cuisson, '
                . 'il ne peut pas en gagner.',
                $ratio,
                'leg' === $categorie
                    ? 'un legume'
                    : 'une viande, un poisson ou un oeuf');
        }

        if ('fec' === $categorie && $ratio < 1) {
            return \sprintf(
                'rendement %.2f : un feculent absorbe de l\'eau, son poids cuit '
                . 'ne peut pas etre inferieur a son poids sec.', $ratio);
        }

        return null;
    }
}
