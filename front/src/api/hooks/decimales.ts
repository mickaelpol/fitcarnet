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

/**
 * Ce qu'un aliment de la base attend en écriture : LA SAISIE TELLE QUE TAPÉE.
 *
 * `versDecimales` convertissait ici des nombres en chaînes pour Doctrine. Il
 * est parti le 26 septembre 2026 : l'écran n'envoie plus de nombres du tout,
 * il envoie les textes tapés, et `App\Serializer\AlimentDenormalizer` les lit
 * avec le même lecteur que le verdict (`NombreSaisi`). Deux lecteurs — l'écran
 * qui convertit, le serveur qui juge — c'était deux réponses possibles.
 */
export interface AlimentEcriture {
  nom: string;
  categorie: string;
  kcal100: string;
  prot100: string;
  gluc100: string;
  lip100: string;
  fibres100: string;
  ratio: string;
  peseeAvant: string;
  peseeApres: string;
  referenceCiqual?: string | null;
}

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
