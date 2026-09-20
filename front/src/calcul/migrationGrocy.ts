/**
 * Ce qu'il reste à faire passer de Grocy vers la base.
 *
 * DEUX LISTES DE NOMS QUI VIENNENT DE DEUX ENDROITS, et c'est tout le piège :
 * l'une est écrite dans Grocy par la personne, l'autre relue dans la base après
 * enregistrement. Le serveur fait `trim()` à l'écriture (`MigrationGrocyController`),
 * donc les deux ne sont PAS comparables telles quelles.
 *
 * VÉCU LE 20 SEPTEMBRE 2026, en pleine migration réelle : l'écran affichait
 * « 62 sur 62 aliments sont passés dans la base » ET gardait « Oasis sorbet »
 * dans la liste à traiter. Mesuré :
 *
 *     nom dans Grocy : 'Oasis sorbet '   (13 caractères)
 *     nom en base    : 'Oasis sorbet'    (12 — le serveur a coupé)
 *
 * Une espace finale invisible, tapée un jour dans Grocy. La personne a rempli
 * ce produit, l'a vu réapparaître, l'a refait — et il serait revenu à chaque
 * fois. Comparer des noms saisis à la main sans les normaliser, c'est
 * promettre qu'ils seront tapés deux fois pareil.
 *
 * ON NORMALISE COMME LE SERVEUR, ET PAS PLUS. `trim()` et rien d'autre : c'est
 * exactement ce que fait l'écriture. Ajouter la casse ou les accents ferait se
 * confondre deux produits Grocy réellement distincts — « Sel » et « sel » sont
 * deux lignes chez quelqu'un qui les a créées ainsi.
 */

/** La forme d'un nom, pour le comparer d'un côté à l'autre. */
const compare = (nom: string): string => nom.trim();

/**
 * Les produits Grocy qui n'ont pas encore de jumeau dans la base.
 *
 * L'ordre d'origine est conservé : la liste se lit du haut vers le bas pendant
 * une soirée, et la voir se réordonner à chaque enregistrement ferait perdre
 * sa place.
 */
export function restantsAMigrer<A extends { nom: string }>(
  tous: readonly A[],
  dejaEnBase: readonly string[],
): A[] {
  const faits = new Set(dejaEnBase.map(compare));

  return tous.filter((a) => !faits.has(compare(a.nom)));
}

/**
 * Combien sont passés, sur combien.
 *
 * LE PREMIER CHIFFRE COMPTE LES CORRESPONDANCES, PAS LES LIGNES DE LA BASE.
 * L'écran affichait `dejaEnBase.length` — c'est-à-dire tout le catalogue du
 * compte, y compris des aliments créés à la main qui n'ont jamais été dans
 * Grocy. D'où le « 62 sur 62 » affiché alors qu'il restait un produit : les
 * deux nombres étaient justes séparément, et leur rapprochement était faux.
 */
export const avancementMigration = (
  tous: readonly { nom: string }[],
  dejaEnBase: readonly string[],
): { faits: number; total: number } => ({
  faits: tous.length - restantsAMigrer(tous, dejaEnBase).length,
  total: tous.length,
});
