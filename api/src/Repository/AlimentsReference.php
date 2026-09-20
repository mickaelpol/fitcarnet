<?php

declare(strict_types=1);

namespace App\Repository;

use Doctrine\DBAL\Connection;

/**
 * Le catalogue CIQUAL : 3 484 aliments publies par l'Anses.
 *
 * IL SERT A RATTACHER, PAS A CHIFFRER. Un aliment cree par quelqu'un pointe
 * vers une ligne d'ici par son CODE — jamais par son nom, pour que renommer ou
 * corriger une faute de frappe ne casse rien. Ce lien dit ce que l'aliment EST,
 * donc a quel repas il convient et avec quoi il va.
 *
 * IL NE DIT JAMAIS CE QUE L'ALIMENT VAUT. Decide par le proprietaire du projet
 * le 20 septembre 2026 : « un riz basmati achete par l'utilisateur A peut ne
 * pas avoir les memes macros que le riz basmati de l'utilisateur B ». Les
 * valeurs restent celles lues sur le paquet. Celles du catalogue ne servent
 * qu'a AVERTIR quand une saisie s'en ecarte tres fortement — jamais a la
 * remplacer, jamais a la refuser : un produit allege ou enrichi s'ecarte
 * legitimement.
 *
 * CATALOGUE PARTAGE, donc pas de filtre par proprietaire (regle 2) : il ne
 * porte aucune donnee de personne. Meme nature que les emplacements et les
 * modes de cuisson.
 */
final readonly class AlimentsReference
{
    /**
     * EN DESSOUS DE DEUX CARACTERES, ON NE CHERCHE PAS.
     *
     * Une lettre seule rapporte des centaines de lignes sur 3 484, a chaque
     * frappe. Ce n'est pas une optimisation : une liste qu'on ne peut pas
     * parcourir ne sert a personne, et le selecteur doit repondre pendant la
     * frappe.
     */
    private const LONGUEUR_MINIMALE = 2;

    /**
     * DOUZE RESULTATS, PAS PLUS.
     *
     * « lait » en rend des dizaines. Au-dela d'une douzaine, on ne lit plus :
     * on retape sa recherche. Mieux vaut inviter a preciser que noyer.
     */
    private const MAXIMUM = 12;

    /**
     * LA SOUS-CHAINE SEULE NE RATTRAPE PAS UNE FAUTE DE FRAPPE, ET C'EST TOUT
     * L'INTERET DE CE SELECTEUR.
     *
     * Mesure du 20 septembre 2026 : le frigo de production porte un produit
     * nomme `Colomiers` — un Coulommiers auquel il manque un `u`, et que
     * personne n'avait vu depuis des mois. `LIKE '%colomiers%'` ne le trouve
     * PAS. Une premiere version de cette classe s'en contentait, et son test
     * affirmait pourtant le contraire dans son commentaire : la faute exacte
     * que ce depot appelle « le commentaire qui ment ».
     *
     * `similarity()` vient de `pg_trgm` (extension native de PostgreSQL,
     * version 1.6 ici, posee par la migration 42). Elle compare les trigrammes
     * de deux chaines. Mesure sur le cas reel :
     *
     *     similarity('colomiers', 'coulommiers') = 0,467
     *
     * LE SEUIL EST A 0,3 : au-dessus, « colomiers » trouve « Coulommiers » ;
     * en dessous de 0,25 on ramasse n'importe quoi. Il est volontairement
     * PERMISSIF — une proposition de trop se voit et s'ignore, une proposition
     * manquante fait renoncer, et un aliment non rattache disparait des repas.
     */
    private const RESSEMBLANCE_MINIMALE = '0.3';

    public function __construct(private Connection $cnx)
    {
    }

    /**
     * Les aliments de reference dont le nom contient cette recherche.
     *
     * LES PLUS COURTS D'ABORD, et c'est tout le confort du selecteur. Sur
     * « poulet », CIQUAL rend « Graisse de poulet », « Foie, poulet, cru »,
     * « Poulet, pilon cru »… Ce qu'on cherche presque toujours est l'entree la
     * plus generique — et c'est la plus courte. Trier par longueur la fait
     * remonter sans qu'on ait a inventer un score de pertinence.
     *
     * @return list<array<string, mixed>>
     */
    public function chercher(string $recherche): array
    {
        $q = self::sansAccent(\mb_strtolower(\trim($recherche)));

        if (\mb_strlen($q) < self::LONGUEUR_MINIMALE) {
            return [];
        }

        $nom = 'lower(' . self::SQL_SANS_ACCENT . ')';

        /** @var list<array<string, mixed>> */
        return $this->cnx->fetchAllAssociative(
            'SELECT code, nom, groupe, sousgroupe, sousgroupe_code,
                    kcal100, prot100, gluc100, lip100, fibres100
               FROM aliment_reference
              WHERE ' . $nom . ' LIKE :motif
                 OR similarity(' . $nom . ', :q) > ' . self::RESSEMBLANCE_MINIMALE . '
              ORDER BY
                   -- Ce qui CONTIENT la recherche passe devant ce qui lui
                   -- ressemble : on ne relegue pas une correspondance exacte
                   -- derriere une approximation.
                   (' . $nom . ' LIKE :motif) DESC,
                   similarity(' . $nom . ', :q) DESC,
                   length(nom),
                   nom
              LIMIT ' . self::MAXIMUM,
            ['motif' => '%' . $q . '%', 'q' => $q],
        );
    }

    /**
     * Ce code designe-t-il un aliment de reference qui existe ?
     *
     * Pose pour que `ReferenceCiqualConnue` puisse refuser en 422 plutot que
     * de laisser la cle etrangere rendre un 500 illisible (20 septembre 2026).
     * On lit le code et rien d'autre : la question est « existe-t-il », pas
     * « que vaut-il ».
     */
    public function existe(string $code): bool
    {
        return false !== $this->cnx->fetchOne(
            'SELECT code FROM aliment_reference WHERE code = :c', ['c' => $code]);
    }

    /**
     * LES ACCENTS PARTENT DES DEUX COTES, ET C'EST OBLIGATOIRE.
     *
     * `unaccent` est une extension PostgreSQL qui n'est pas installee ici, et
     * l'exiger compliquerait toute installation neuve. On retire donc les
     * accents a la main, des deux cotes : dans la recherche (PHP, ci-dessous)
     * et sur le nom (SQL, `SQL_SANS_ACCENT`). Un seul cote suffirait a ce que
     * « pates » ne trouve pas « Pates alimentaires ».
     *
     * Les six caracteres traites couvrent le francais alimentaire. Ce n'est pas
     * une translitteration generale : c'est la liste de ce qui apparait
     * vraiment dans les noms CIQUAL.
     */
    private const ACCENTS = ['à', 'â', 'ä', 'é', 'è', 'ê', 'ë', 'î', 'ï', 'ô', 'ö', 'û', 'ü', 'ù', 'ç'];
    private const SANS = ['a', 'a', 'a', 'e', 'e', 'e', 'e', 'i', 'i', 'o', 'o', 'u', 'u', 'u', 'c'];

    /** La meme table, en SQL — `translate` est natif, aucune extension requise. */
    private const SQL_SANS_ACCENT = "translate(nom, 'àâäéèêëîïôöûüùçÀÂÄÉÈÊËÎÏÔÖÛÜÙÇ', 'aaaeeeeiioouuucAAAEEEEIIOOUUUC')";

    private static function sansAccent(string $texte): string
    {
        return \str_replace(self::ACCENTS, self::SANS, $texte);
    }
}
