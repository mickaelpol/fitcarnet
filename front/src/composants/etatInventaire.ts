import type { AlimentDisponible } from '@/api/types';

/**
 * L'inventaire en cours vit ICI, pas dans l'onglet qui l'affiche.
 *
 * Tant que `mode`, `saisies` et `vus` étaient des `useState` de
 * `app/(onglets)/frigo.tsx`, quitter l'onglet démontait le composant et
 * emportait le comptage avec lui : un inventaire de trente articles
 * disparaissait parce qu'on était allé vérifier une quantité dans l'onglet
 * Stock. Or on quitte l'onglet pendant un inventaire — pour relire une fiche,
 * comparer une ligne, ou simplement par réflexe.
 *
 * Le contournement posé alors (« ne repréremplir que si `saisies` est vide »)
 * ne réglait rien : le démontage avait déjà eu lieu, et le garde regardait
 * l'ÉTAT au lieu de l'INTENTION — tout effacer à la main suffisait à le
 * tromper. Il est retiré le 18 septembre 2026, avec le constat M12.
 *
 * Le module, lui, survit à la navigation. L'onglet n'est plus qu'une vue : il
 * s'abonne, affiche, et écrit ici ce que l'utilisateur tape. Une seule session
 * à la fois — on ne compte pas deux frigos en parallèle —, et c'est
 * `ouvrirInventaire` qui décide si elle commence ou si elle se poursuit.
 *
 * Même patron que `etatChrono.ts` et `etatMesure.ts`, pour les mêmes raisons.
 */

export type ModeFrigo = 'stock' | 'inventaire';

let mode: ModeFrigo = 'stock';
/** Le texte tapé, tel quel : un champ effacé vaut `''`, jamais zéro. */
let saisies: Record<string, string> = {};
let vus: Record<string, boolean> = {};
/** Une session est ouverte : la rouvrir la poursuit, elle ne la recommence pas. */
let enCours = false;

const abonnes = new Set<() => void>();
const changer = () => { for (const f of abonnes) f(); };

export function abonnerInventaire(f: () => void): () => void {
  abonnes.add(f);

  return () => { abonnes.delete(f); };
}

export const modeFrigo = (): ModeFrigo => mode;
export const saisiesInventaire = (): Record<string, string> => saisies;
export const vusInventaire = (): Record<string, boolean> => vus;
export const inventaireEnCours = (): boolean => enCours;

/**
 * Champs préremplis avec le stock connu.
 *
 * La valeur exacte, pas son affichage arrondi : préremplir « 1234,6 » pour un
 * stock de 1234,56 créerait un écart de 0,04 sur une ligne que personne n'a
 * touchée, et l'enverrait.
 */
const stocksInitiaux = (aliments: AlimentDisponible[]): Record<string, string> =>
  Object.fromEntries(aliments.map((a) => [a.reference, String(a.stock)]));

export function allerAuStock(): void {
  mode = 'stock';
  changer();
}

/**
 * Entre en mode Inventaire.
 *
 * Préremplit **uniquement** au début d'une session. Revenir de l'onglet Stock
 * retrouve donc le comptage exactement où on l'a laissé — y compris les champs
 * qu'on avait volontairement effacés, qui veulent dire « pas encore compté ».
 * Repartir de zéro reste possible : c'est « Réinitialiser », un geste qu'on
 * décide.
 */
export function ouvrirInventaire(aliments: AlimentDisponible[]): void {
  if (!enCours) {
    saisies = stocksInitiaux(aliments);
    vus = {};
    enCours = true;
  }
  mode = 'inventaire';
  changer();
}

/** « Réinitialiser » : on recommence le comptage, la session reste ouverte. */
export function reinitialiserInventaire(aliments: AlimentDisponible[]): void {
  saisies = stocksInitiaux(aliments);
  vus = {};
  enCours = true;
  changer();
}

export function saisirQuantite(reference: string, texte: string): void {
  saisies = { ...saisies, [reference]: texte };
  changer();
}

export function basculerVu(reference: string): void {
  vus = { ...vus, [reference]: !(vus[reference] === true) };
  changer();
}

/**
 * Le lot est déposé : la session est close et on revient au stock.
 *
 * On vide même si le serveur n'a pas encore appliqué les corrections — c'est
 * lui qui tient la liste désormais. Garder la saisie ici ferait rouvrir
 * l'inventaire sur des chiffres déjà partis, et c'est ce renvoi-là qui a mis
 * le frigo en désordre le 14 août.
 */
export function cloreInventaire(): void {
  saisies = {};
  vus = {};
  enCours = false;
  mode = 'stock';
  changer();
}
