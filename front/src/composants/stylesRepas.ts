import { StyleSheet } from 'react-native';
import { C, E, P, T, TOUCHE } from '@/theme';

/**
 * LES STYLES QUE PLUSIEURS ÉCRANS DU CALCULATEUR PARTAGENT.
 *
 * `app/(onglets)/repas.tsx` portait une seule `StyleSheet` de 33 entrées pour
 * ses quatre écrans et ses deux composants. En sortant les écrans un par un
 * (rangs 7 et 11 du lot 6 de l'audit), il fallait choisir : recopier les
 * styles communs dans chaque fichier, ou les poser une fois ici.
 *
 * Recopier aurait été le geste exact qui a produit D9 — les trois mêmes
 * tables « courses / fournées / boîtes » écrites deux fois, écran A contre
 * écran C, libres de diverger sans que rien ne le signale. Une pastille de
 * 8 px d'un côté et de 10 de l'autre ne casse aucun test.
 *
 * Ne vit ici que ce qui sert à AU MOINS DEUX fichiers. Ce qui n'appartient
 * qu'à un écran reste chez lui.
 *
 * Posé le 15 septembre 2026.
 */
export const SR = StyleSheet.create({
  page: { padding: E.m, gap: E.s, paddingBottom: E.l },

  /* Barre d'action collée en bas, hors du défilement. Le retrait vient de
     useSafeAreaInsets : sans lui, le bouton passe sous la barre de gestes
     d'un téléphone sans bouton physique, et devient intouchable. */
  pied: {
    padding: E.m,
    borderTopWidth: 1, borderTopColor: C.ligne, backgroundColor: C.fond,
  },
  aide: { fontSize: T.petit, lineHeight: T.moyen },
  titreEtape: { fontFamily: P.fort, fontSize: T.moyen, marginTop: E.s },
  colTitre: { fontSize: T.minuscule, textTransform: 'uppercase' },
  /* Un seul jour : pas d'encart pliant, juste la pile de repas. */
  jourSeul: { gap: E.xs },

  ligneCourse: {
    flexDirection: 'row', alignItems: 'center', gap: E.s, minHeight: TOUCHE - 12,
  },
  pastille: { width: 8, height: 8, borderRadius: 4 },

  entete: {
    flexDirection: 'row', gap: 4,
    borderBottomWidth: 1, borderBottomColor: C.ligne, paddingBottom: 4,
  },
  col: { flex: 1, fontSize: T.minuscule, textTransform: 'uppercase', textAlign: 'right' },
});
