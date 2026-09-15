/**
 * Le texte, réduit à ce qui se compare.
 *
 * Module de référence pour la suppression des accents. Il n'a pas toujours
 * existé : jusqu'au 15 septembre 2026 la fonction était recopiée QUATRE fois —
 * `solveur/composer.ts:182`, `calcul/frigo.ts:39`,
 * `composants/choixAliment.tsx:49`, `app/admin-exercices.tsx:117` — c'est le
 * constat D4 de l'audit de septembre 2026. `CLAUDE.md` annonçait ce fichier
 * dans son tableau des modules de référence alors qu'il n'existait pas.
 */

/*
 * LES ACCENTS SE FONT À LA MAIN, ET CE N'EST PAS UNE COQUETTERIE.
 *
 * Les quatre copies écrivaient `v.normalize('NFD').replace(/[̀-ͯ]/g, '')`.
 * Hermes — le moteur JavaScript de React Native — n'implémente pas toujours
 * `String.prototype.normalize` : selon la version et selon que l'Intl complet
 * est embarqué ou non, il est là ou il n'y est pas. Les quatre barres de
 * recherche du projet étaient donc un `TypeError` en puissance sur Android :
 * c'est le constat F4, jumeau de D4.
 *
 * `cleDHabitude`, dans `cuisson.ts`, avait déjà tranché en faveur d'une table
 * de quinze lettres qui ne dépend d'aucun moteur. La fusion s'aligne sur elle,
 * pas sur `normalize`.
 *
 * UNE SEULE TABLE, ET C'EST ACQUIS. `cuisson.ts` avait la sienne, identique ;
 * elle a ete fusionnee le 15 septembre 2026 apres verification que les 29
 * entrees concordaient. `habitudesCuisson.ts` importe `SANS_ACCENT` d'ici.
 *
 * Ce bandeau annoncait « DEUX TABLES IDENTIQUES POUR L'INSTANT » et demandait
 * de reporter toute lettre ajoutee des deux cotes. C'etait vrai une heure.
 */
export const SANS_ACCENT: Record<string, string> = {
  à: 'a', â: 'a', ä: 'a', á: 'a', ã: 'a', å: 'a',
  ç: 'c',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ñ: 'n',
  ò: 'o', ó: 'o', ô: 'o', ö: 'o', õ: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ý: 'y', ÿ: 'y',
  œ: 'oe', æ: 'ae',
};

/**
 * Un texte en minuscules et sans accent, pour le comparer ou le chercher.
 *
 * Ce que la fonction NE fait PAS : elle ne touche ni aux espaces ni à la
 * ponctuation. Les appelants cherchent une sous-chaîne dans un nom entier
 * (« congelateur » doit trouver « Congélateur »), et couper sur la ponctuation
 * casserait cette recherche. C'est `cleDHabitude` qui fait ce travail en plus,
 * parce qu'elle fabrique une clé et non un texte à parcourir.
 *
 * `toLowerCase` passe AVANT la table : sans lui, « Ÿ » (U+0178) et « Œ »
 * (U+0152) échapperaient à la plage `À-ÿ` et ressortiraient tels quels.
 */
export const sansAccent = (v: string): string =>
  v.toLowerCase().replace(/[À-ÿœæ]/g, (c) => SANS_ACCENT[c] ?? c);
