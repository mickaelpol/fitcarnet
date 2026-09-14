/**
 * Logique du frigo indépendante de l'affichage : regroupement par emplacement
 * et calcul des écarts d'inventaire.
 *
 * Extrait de l'écran pour que l'inventaire et la consultation partagent le
 * même ordre — sans quoi les deux vues du même frigo divergeraient.
 */

import type { AlimentDisponible } from '@/api/types';
import { sansAccent } from './texte';

/** Ordre de parcours d'un inventaire réel : on descend du frais au sec. */
export const ORDRE_EMPLACEMENTS = ['Frigo', 'Congélateur', 'Congelateur', 'Placard'];

export interface SectionFrigo {
  titre: string;
  data: AlimentDisponible[];
}

export function grouperParEmplacement(aliments: AlimentDisponible[]): SectionFrigo[] {
  const parLieu = new Map<string, AlimentDisponible[]>();
  for (const a of aliments) {
    const lieu = a.emplacement ?? 'Sans emplacement';
    parLieu.set(lieu, [...(parLieu.get(lieu) ?? []), a]);
  }

  return [...parLieu.entries()]
    .sort((a, b) => {
      const ia = ORDRE_EMPLACEMENTS.indexOf(a[0]);
      const ib = ORDRE_EMPLACEMENTS.indexOf(b[0]);

      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0], 'fr');
    })
    .map(([titre, data]) => ({
      titre,
      data: [...data].sort((x, y) => x.nom.localeCompare(y.nom, 'fr')),
    }));
}

/**
 * Recherche sur le nom et l'emplacement, insensible aux accents et à la casse.
 * « congelateur » doit trouver le congélateur, sinon la barre ne sert à rien.
 */
export function filtrerFrigo(
  aliments: AlimentDisponible[],
  recherche: string,
): AlimentDisponible[] {
  const q = sansAccent(recherche.trim());
  if (q === '') return aliments;

  return aliments.filter(
    (a) => sansAccent(a.nom).includes(q) || sansAccent(a.emplacement ?? '').includes(q));
}

export interface LigneInventaire {
  reference: string;
  quantite: number;
}

/**
 * Seuil d'écart. En deçà, la différence vient de l'arrondi d'affichage, pas
 * de la balance : l'envoyer ferait un mouvement de stock pour rien.
 */
export const SEUIL_ECART = 0.001;

/**
 * Ce qui sera réellement envoyé : uniquement les lignes saisies dont la
 * valeur diffère du stock théorique.
 *
 * Une saisie vide n'est pas un zéro — elle signifie « pas encore compté ».
 * Confondre les deux viderait le frigo de tout ce qu'on n'a pas eu le temps
 * de peser.
 */
export function ecartsInventaire(
  aliments: AlimentDisponible[],
  saisies: Record<string, string>,
): LigneInventaire[] {
  const lignes: LigneInventaire[] = [];

  for (const a of aliments) {
    const texte = (saisies[a.reference] ?? '').trim();
    if (texte === '') continue;

    const quantite = parseFloat(texte.replace(',', '.'));
    if (Number.isNaN(quantite) || quantite < 0) continue;
    if (Math.abs(quantite - a.stock) <= SEUIL_ECART) continue;

    lignes.push({ reference: a.reference, quantite });
  }

  return lignes;
}
