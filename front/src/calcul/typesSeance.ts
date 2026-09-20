import { C } from '../theme';

/**
 * Les trois types de séance et leurs couleurs.
 *
 * RAPATRIÉS LE 20 SEPTEMBRE 2026 (palier 0). Six écritures pour deux listes,
 * toutes dans `app/`, donc aucune éprouvable :
 *
 *     app/(onglets)/modeles.tsx:7    la table des couleurs
 *     app/(onglets)/seances.tsx:9    la même
 *     app/seance/[id].tsx:24         la même
 *     app/modele/[id].tsx:20         la même
 *     app/seance/[id].tsx:23         ['Push', 'Pull', 'Legs']
 *     app/modele/[id].tsx:19         la même
 *
 * Motif 8 du projet, la liste écrite à la main. Un quatrième type devrait être
 * posé à six endroits, et la couleur oubliée retomberait **en silence** sur
 * `C.ligne` — la teinte des séparateurs. Deux écrans afficheraient alors la
 * même séance de deux couleurs différentes sans que rien ne tombe.
 *
 * Le code couleur suit celui des macros, et ce n'est pas un hasard : le Push
 * pousse (protéines), le Pull tire (féculents), les jambes portent (légumes).
 * C'est arbitraire mais constant, et c'est cette constance qui se lit.
 */

export const TYPES_SEANCE = ['Push', 'Pull', 'Legs'] as const;

export type TypeSeance = (typeof TYPES_SEANCE)[number];

export const COULEUR_TYPE: Record<string, string> = {
  Push: C.prot,
  Pull: C.fec,
  Legs: C.leg,
};

/**
 * La couleur d'un type, ou une teinte neutre.
 *
 * Une séance sans type est légitime : on n'oblige personne à ranger sa séance
 * dans une case. Elle prend la teinte des séparateurs, qui n'est celle
 * d'aucun type — ce que le test vérifie, pour qu'un « sans type » ne puisse
 * jamais se confondre avec un Push.
 */
export const couleurDuType = (type: string | null | undefined): string =>
  (type ? COULEUR_TYPE[type] ?? C.ligne : C.ligne);
