/**
 * Ce qui part en CHAÎNES vers l'API, et pourquoi.
 *
 * Doctrine mappe les colonnes monétaires et nutritionnelles en DECIMAL, que son
 * extracteur de types déclare `string` — et cet extracteur passe avant la
 * réflexion PHP dans la chaîne de `property_info`. Le dénormaliseur refuse donc
 * un nombre : « The type of the "kcal100" attribute must be "string", "double"
 * given ».
 *
 * En lecture l'API renvoie bien des nombres, puisque la normalisation appelle
 * les accesseurs typés `float`. L'asymétrie est réelle, et elle tient dans ce
 * seul module : le reste de l'application ne manipule que des nombres.
 *
 * LES TROIS CONVERSIONS SONT ENSEMBLE PARCE QUE LA RÈGLE EST UNE. Elles
 * vivaient dispersées dans `hooks.ts` — l. 320, 727 et 898 — et l'ancien
 * commentaire de la cible le disait lui-même : « la même règle, oubliée ici ».
 * Puis celui du complément : « la règle est écrite deux fois dans ce fichier
 * parce qu'elle a été oubliée deux fois ». Un quatrième DECIMAL se cherchera
 * son adaptateur ici plutôt que de le réinventer.
 */

import type { Cible, Modele, Seance, Serie } from '../types';

/** Ce qu'un aliment de la base attend en écriture. */
export interface AlimentEcriture {
  nom: string;
  categorie: string;
  kcal100: number;
  prot100: number;
  gluc100: number;
  lip100: number;
  fibres100: number | null;
  ratio: number;
  peseeAvant: number | null;
  peseeApres: number | null;
}

export const versDecimales = (v: AlimentEcriture): Record<string, unknown> => ({
  ...v,
  kcal100: String(v.kcal100),
  prot100: String(v.prot100),
  gluc100: String(v.gluc100),
  lip100: String(v.lip100),
  fibres100: v.fibres100 === null ? null : String(v.fibres100),
  ratio: String(v.ratio),
  peseeAvant: v.peseeAvant === null ? null : String(v.peseeAvant),
  peseeApres: v.peseeApres === null ? null : String(v.peseeApres),
});

/**
 * Les quatre macros d'une cible sont des DECIMAL : elles s'écrivent en
 * chaînes, comme partout ailleurs. L'API répondait « The type of the "kcal"
 * attribute must be "string", "integer" given ».
 */
export const cibleEnEcriture = (
  c: Partial<Cible> & { repas: string },
): Record<string, unknown> => {
  const sortie: Record<string, unknown> = { ...c };
  for (const macro of ['kcal', 'prot', 'gluc', 'lip'] as const) {
    const v = c[macro];
    if (typeof v === 'number') sortie[macro] = String(v);
  }

  return sortie;
};

/**
 * Même règle pour les séances : `poids` et `poidsCible` sont des DECIMAL côté
 * Doctrine, donc des `string` pour le dénormaliseur. Un nombre déclenche
 * « The type of the "poids" attribute must be "null|string", "integer" given ».
 *
 * On ne touche qu'aux séries : ni `SeanceExercice` ni `ModeleExercice` n'ont
 * de colonne décimale, et `reps` / `secondes` sont des entiers.
 */
export const nombreEnTexte = (v: number | null): string | null =>
  v === null ? null : String(v);

export const serieEnEcriture = (s: Serie): Record<string, unknown> => ({
  ...s,
  poids: nombreEnTexte(s.poids),
  poidsCible: nombreEnTexte(s.poidsCible),
});

export const seanceEnEcriture = (s: Seance): Record<string, unknown> => ({
  ...s,
  exercices: s.exercices.map((bloc) => ({
    ...bloc,
    series: bloc.series.map(serieEnEcriture),
  })),
});

export const modeleEnEcriture = (m: Modele): Record<string, unknown> => ({
  ...m,
  exercices: m.exercices.map((bloc) => ({
    ...bloc,
    series: bloc.series.map((s) => ({ ...s, poidsCible: nombreEnTexte(s.poidsCible) })),
  })),
});
