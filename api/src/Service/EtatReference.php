<?php

declare(strict_types=1);

namespace App\Service;

/**
 * A QUEL ETAT SE RAPPORTENT LES VALEURS D'UN ALIMENT — UNE SEULE REGLE.
 *
 * Il y a eu deux regles, et c'est ainsi qu'on se trompe :
 *
 *   - FrigoGrocy la DEDUISAIT de la categorie ;
 *   - FrigoBase la LISAIT dans une colonne, qui pouvait dire autre chose.
 *
 * Les deux services rendaient pourtant le meme AlimentDisponible. Un compte
 * ordinaire dont la colonne portait « cru » sur un feculent mangeait donc
 * jusqu'a trois fois trop de glucides, silencieusement, la ou le meme aliment
 * lu depuis Grocy etait juste. Rien dans le code ne pouvait le signaler : les
 * deux valeurs etaient « valides », elles n'etaient simplement pas la meme.
 *
 * La regle est deterministe, il n'y a donc rien a stocker :
 *
 *   - une VIANDE, un POISSON, un OEUF se pesent CRUS. La cuisson leur retire
 *     de l'eau ; leurs valeurs sont celles du cru et le rendement est < 1.
 *   - TOUT LE RESTE se rapporte a ce qu'on pose dans l'assiette. Un feculent
 *     gonfle (rendement > 1), un legume rend son eau (rendement < 1), un
 *     laitage ne change pas (rendement 1) — mais dans les trois cas la valeur
 *     de reference est celle du produit SERVI.
 *
 * Le champ `etat_reference` de la table reste, pour ne rien casser en lecture,
 * mais plus personne ne s'en sert pour calculer : voir la migration
 * 14-etat-reference-coherent.sql, qui aligne l'existant et pose une contrainte
 * pour que la base ne puisse plus contenir l'incoherence.
 */
final class EtatReference
{
    public const CRU = 'cru';
    public const CUIT = 'cuit';

    /**
     * Les categories dont les valeurs se rapportent au produit CRU.
     *
     * Les LEGUMES en font partie depuis qu'on a regarde comment ils sont
     * reellement peses : 200 g de brocoli sur la balance, a la vapeur, en
     * ressortent 150. Personne ne pese un legume apres cuisson — on pese ce
     * qu'on sort du frigo, et c'est ce geste-la que l'application doit
     * chiffrer.
     *
     * Cela ne fausse rien, au contraire : a la vapeur, seule l'EAU part. Les
     * proteines, les glucides et les fibres de 200 g de brocoli cru sont
     * encore la dans les 150 g cuits. Les compter sur le poids cru est donc
     * exact, et c'est la seule facon d'avoir une colonne « a cuire » vraie
     * sur TOUTES les lignes.
     *
     * Tant qu'ils etaient references « cuits », leur rendement devait etre
     * connu pour savoir quoi peser — et il ne peut pas l'etre : l'energie ne
     * se conserve pas a l'eau bouillante, la deduire de Ciqual donnait un
     * epinard a 1,70, soit cinq fois trop peu. Reference au cru, le rendement
     * ne sert plus qu'a afficher ce qu'on aura dans l'assiette : il peut etre
     * approximatif sans qu'une seule macro bouge.
     */
    private const CRUES = ['prot', 'leg'];

    /** L'etat de reference des valeurs d'un aliment de cette categorie. */
    public static function pour(string $categorie): string
    {
        return \in_array($categorie, self::CRUES, true) ? self::CRU : self::CUIT;
    }

    /** La valeur stockee dit-elle la meme chose que la regle ? */
    public static function coherent(string $categorie, ?string $stocke): bool
    {
        return null === $stocke || $stocke === self::pour($categorie);
    }

    /**
     * Le rendement attendu va-t-il dans le bon sens ?
     *
     * Ce n'est pas une plage de tolerance mais un SENS : une protéine ne peut
     * pas gagner du poids en cuisant, un feculent ne peut pas en perdre. Une
     * valeur a contresens ne se rattrape pas — elle inverse les deux colonnes
     * de l'ecran.
     */
    public static function sensDuRendement(string $categorie, float $ratio): ?string
    {
        if ($ratio <= 0) {
            return 'un rendement nul ou negatif : impossible de passer du cru au cuit.';
        }

        if (self::CRU === self::pour($categorie) && $ratio > 1.05) {
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
