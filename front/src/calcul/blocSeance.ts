import type { Exercice, Modele, Seance, SeanceExercice } from '@/api/types';
import { idDe, iriDe } from '../api/types';

/**
 * Ce qu'un écran de séance fabrique et compte, hors de React.
 *
 * POURQUOI CES QUATRE FONCTIONS NE VIVENT PLUS DANS `app/seance/[id].tsx`.
 *
 * Elles y étaient écrites en clair, au milieu du corps du composant, et
 * AUCUNE n'était testée. Elles ne pouvaient pas l'être : `tsconfig.tests.json`
 * n'inclut que `src/**\/*.test.ts`, donc un test posé dans `app/` n'est jamais
 * exécuté — et rien, pas un avertissement, ne le dit. Trois règles métier
 * réelles vivaient là sans filet.
 *
 * Descendues le 15 septembre 2026 (rang 12 du lot 6 de l'audit de septembre),
 * à comportement strictement identique.
 *
 * `blocDepuisExercice` reçoit le format déjà lu plutôt que d'appeler
 * `lireFormat` : celui-ci vit dans `composants/exerciceSeance.tsx`, et un
 * module de `src/` atteint par un test ne peut RIEN importer d'un `.tsx`,
 * même en `import type` — `tsconfig.tests.json` ne pose aucune option `jsx`,
 * et le compilateur doit tout de même ouvrir le fichier pour résoudre le type
 * (TS6142). Le jour où `lireFormat` descendra dans un `.ts`, ce paramètre
 * pourra redevenir un appel.
 *
 * @see blocSeance.test.ts
 */

/** Ce qu'une séance passée dit d'un exercice : une ligne par série faite. */
export interface SerieFaite {
  reps: number | null;
  poids: number | null;
  secondes: number | null;
}

/** Le format prescrit d'un exercice, tel que `lireFormat` le rend. */
export interface FormatPrescrit {
  series: number;
  reps: number;
}

/**
 * Combien de séries sont cochées, sur combien.
 *
 * Un exercice « for time » n'a qu'un temps total : ses lignes
 * supplémentaires ne comptent pas comme des séries.
 *
 * `parId` sert à retrouver le mode par défaut d'un exercice que le bloc ne
 * précise pas. Un exercice absent du catalogue — il peut ne pas avoir chargé —
 * retombe sur « charge », donc sur le décompte complet.
 */
export function avancementDe(
  exercices: readonly SeanceExercice[],
  parId: ReadonlyMap<number, Exercice>,
): { faites: number; total: number } {
  return exercices.reduce(
    (acc, b) => {
      const mode = b.mode ?? parId.get(idDe(b.exercice))?.modeDefaut ?? 'charge';
      const series = mode === 'chrono' ? b.series.slice(0, 1) : b.series;

      return {
        faites: acc.faites + series.filter((s) => s.faite).length,
        total: acc.total + series.length,
      };
    },
    { faites: 0, total: 0 },
  );
}

/**
 * Le bloc qu'on ajoute à une séance quand on choisit un exercice.
 *
 * On reprend ce qui a été FAIT la dernière fois : mêmes charges, mêmes
 * répétitions. C'est le point de départ utile — le format prescrit ne sert
 * que la première fois, faute de mieux.
 *
 * Un `derniereFois` VIDE reste une réponse : zéro série proposée, et non un
 * repli silencieux sur le format prescrit. Vide n'est pas absent.
 */
export function blocDepuisExercice(
  exercice: Exercice,
  ordre: number,
  derniereFois: readonly SerieFaite[] | undefined,
  format: FormatPrescrit | null,
): SeanceExercice {
  const series = derniereFois !== undefined
    ? derniereFois.map((x, i) => ({
        ordre: i, reps: null, poids: null, secondes: null, faite: false,
        repsCible: x.reps, poidsCible: x.poids, secondesCible: x.secondes,
      }))
    : Array.from({ length: format?.series ?? 3 }, (_, i) => ({
        ordre: i, reps: null, poids: null, secondes: null, faite: false,
        repsCible: format?.reps ?? null, poidsCible: null, secondesCible: null,
      }));

  return {
    exercice: exercice['@id'], ordre,
    mode: exercice.modeDefaut, notes: null, secondesTotal: null, series,
  };
}

/**
 * Partir d'un modèle : on copie ses exercices, ses cibles deviennent
 * les objectifs affichés en filigrane pendant la saisie.
 *
 * L'ordre vient de la POSITION dans le modèle, pas du champ `ordre` : un
 * modèle dont les ordres ont des trous ne les propage pas à la séance.
 */
export function blocsDepuisModele(modele: Modele): SeanceExercice[] {
  return modele.exercices.map((me, i) => ({
    exercice: iriDe(me.exercice),
    ordre: i,
    mode: me.mode,
    notes: null,
    secondesTotal: null,
    series: me.series.map((ms, j) => ({
      ordre: j, reps: null, poids: null, secondes: null, faite: false,
      repsCible: ms.repsCible, poidsCible: ms.poidsCible, secondesCible: ms.secondesCible,
    })),
  }));
}

/**
 * Recopie le seul identifiant qui compte : celui de la séance.
 *
 * Sans lui, l'enregistrement suivant repartirait sur un POST et créerait une
 * deuxième séance. On ne remplace pas l'état par la réponse : ce qui a été
 * tapé pendant les deux secondes et demie d'attente serait perdu.
 *
 * Les identifiants des exercices et des séries ne sont PAS recopiés, et c'est
 * volontaire. Ils ne figurent que dans le groupe `seance:lire` — le front ne
 * les renvoie jamais, l'API remplace la collection entière à chaque écriture.
 * Ils ne servaient donc qu'à fabriquer les clés de liste, où les greffer
 * faisait passer une ligne de « n0 » à « 12 » : React la remontait, et le
 * champ en cours de saisie perdait le focus au beau milieu d'une frappe.
 */
export const avecIdentifiantSeance = (locale: Seance, distante: Seance): Seance =>
  (locale.id === undefined ? { ...locale, id: distante.id } : locale);
