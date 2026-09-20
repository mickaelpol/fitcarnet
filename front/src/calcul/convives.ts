/**
 * Combien de personnes mangent un repas.
 *
 * RAPATRIÉ LE 20 SEPTEMBRE 2026 (palier 0). Quatre écritures de la même idée,
 * dont deux bornes posées en clair dans un écran :
 *
 *     composants/etapeReglage.tsx:361   Math.max(1, …)    ← le bouton « − »
 *     composants/etapeReglage.tsx:372   Math.min(12, …)   ← le bouton « + »
 *     calcul/fournees.ts:258            Math.max(1, r.convives)
 *     calcul/poidsServi.ts:69           Math.max(1, r.convives)
 *
 * Les deux premières vivaient dans `composants/`, donc hors de portée des
 * tests, et rien n'écrivait POURQUOI douze. Les deux dernières sont un aveu de
 * jumeau : le commentaire de `poidsServi` dit en toutes lettres qu'il copie
 * `fournees`. Elles gardent du réel — à zéro convive, `servi / 0` rend
 * `Infinity`, et la carte du repas affichait « Infinity g par personne ».
 *
 * DEUX RÔLES, ET ILS NE SE CONFONDENT PAS. `deplacerConvives` sert au GESTE :
 * l'utilisateur appuie, la valeur bouge et bute. `convivesRetenus` sert à la
 * LECTURE d'une donnée déjà enregistrée, qui peut venir d'une version
 * précédente ou d'un plan abîmé : on ne la corrige pas, on refuse seulement de
 * diviser par elle.
 */

/** Un repas se mange au moins à une personne : zéro serait une division par zéro. */
export const CONVIVES_MIN = 1;

/**
 * Douze : une tablée, pas un service de restauration.
 *
 * Le plafond n'est pas une vérité de la nature, c'est le point au-delà duquel
 * le solveur compose des quantités qu'aucune poêle ne tient. Le déplacer est
 * un choix légitime — mais un seul déplacement, ici.
 */
export const CONVIVES_MAX = 12;

/** Ce que donne un appui sur « + » ou sur « − », bornes comprises. */
export const deplacerConvives = (actuel: number, pas: number): number =>
  Math.min(CONVIVES_MAX, Math.max(CONVIVES_MIN, actuel + pas));

/**
 * Le nombre par lequel on accepte de diviser.
 *
 * Ce n'est PAS une correction de la donnée : le plan garde ce qu'il porte. On
 * refuse seulement de rendre `Infinity` à l'écran, ce qui serait un chiffre
 * faux affiché avec aplomb (règle 7).
 */
export const convivesRetenus = (convives: number | null | undefined): number =>
  (typeof convives === 'number' && convives >= CONVIVES_MIN ? convives : CONVIVES_MIN);
