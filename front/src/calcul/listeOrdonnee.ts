/**
 * Administrer une liste que l'utilisateur ordonne lui-même.
 *
 * DESCENDU LE 20 SEPTEMBRE 2026 (palier 0) depuis `app/admin-cuissons.tsx`,
 * où ces trois règles vivaient en clair — lignes 65, 69 et 72 — donc dans
 * `app/`, là où `tsconfig.tests.json` ne va PAS. Aucune n'était éprouvée, et
 * rien ne le signalait.
 *
 * Elles ne sont pas décoratives : la table des modes de cuisson décide quels
 * aliments partent dans la même fournée. Deux lignes au même rang, et l'ordre
 * affiché devient celui de l'alphabet, c'est-à-dire n'importe lequel.
 *
 * Le comportement est strictement celui d'avant.
 */

/** Une ligne administrable : un identifiant et un rang. */
interface Rangee {
  id: number;
  ordre: number;
}

/**
 * DIX, ET LE PAS EST DE DIX.
 *
 * Pour laisser la place d'intercaler une ligne entre deux existantes sans
 * avoir à renuméroter toute la liste. C'est la seule raison du chiffre.
 */
export const PAS_DE_RANG = 10;

/**
 * Le rang à donner à une nouvelle ligne.
 *
 * On lit le rang le PLUS HAUT, pas le dernier de la liste : une liste rendue
 * dans un autre ordre — par l'API, par un tri d'écran — ne doit pas faire
 * réutiliser un rang déjà pris.
 */
export const prochainRang = (liste: readonly Rangee[]): number =>
  (liste.length === 0 ? PAS_DE_RANG : Math.max(...liste.map((l) => l.ordre)) + PAS_DE_RANG);

/**
 * Ce libellé existe-t-il déjà ?
 *
 * Casse et espaces du bord ignorés, ET RIEN DE PLUS. On ne touche pas aux
 * accents, volontairement : « Four 180 °C » et « Four 200 °C » doivent rester
 * deux lignes, et toute normalisation plus large finit par en confondre deux
 * que l'administrateur a voulues distinctes. C'est la même retenue que dans
 * `calcul/migrationGrocy.ts`.
 */
export const libelleDejaPris = (
  liste: readonly { libelle: string }[],
  candidat: string,
): boolean => {
  const forme = (v: string) => v.trim().toLowerCase();

  return liste.some((l) => forme(l.libelle) === forme(candidat));
};

/**
 * Monter ou descendre une ligne d'un cran.
 *
 * ON ÉCHANGE LES DEUX RANGS PLUTÔT QUE D'INCRÉMENTER : incrémenter finit par
 * produire deux lignes de même rang. L'échange, lui, conserve l'ensemble des
 * rangs utilisés.
 *
 * Rend les DEUX écritures à faire, dans l'ordre, ou un tableau vide quand il
 * n'y a rien à échanger — au bout de la liste, ou pour une ligne absente.
 * C'est ce qui rendait `decaler` muet en haut et en bas, et il faut le garder.
 */
export function echangeDeRangs(
  liste: readonly Rangee[],
  ligne: Rangee,
  sens: -1 | 1,
): { id: number; ordre: number }[] {
  const index = liste.findIndex((l) => l.id === ligne.id);
  if (index < 0) return [];

  const voisin = liste[index + sens];
  if (voisin === undefined) return [];

  return [
    { id: ligne.id, ordre: voisin.ordre },
    { id: voisin.id, ordre: ligne.ordre },
  ];
}
