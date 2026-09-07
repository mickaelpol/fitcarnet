import type { Seance } from '@/api/types';
import { rmDesSeries, volumeDesSeries } from './performance';

/**
 * Ce que l'historique des séances dit d'un exercice.
 *
 * POURQUOI CES RÉDUCTIONS NE VIVENT PLUS DANS `hooks.ts`.
 *
 * Elles y étaient enfermées dans des `useMemo`, au milieu d'un fichier qui
 * importe react-query et React Native : rien ne pouvait les éprouver. La
 * formule d'Epley s'y trouvait recopiée DEUX fois — une avec le plafond de
 * `performance.ts` écrit en dur, une SANS plafond du tout — et l'écran de
 * séance consommait les deux à la fois.
 *
 * Une série d'endurance de 30 répétitions à 40 kg posait alors un « record »
 * de 79,96 kg. Les séances suivantes s'affichaient en recul face à ce fantôme,
 * et la courbe de progression racontait le contraire de ce qui se passait.
 *
 * Une seule règle, donc, celle de `performance.ts` : le 1RM ne se calcule que
 * sur les séries courtes, et l'endurance est comptée dans le volume.
 *
 * @see historiqueSeances.test.ts
 */

/** L'identifiant d'exercice, qu'il arrive en IRI (`/api/exercices/7`) ou en objet. */
function idDeLExercice(exercice: unknown): number {
  if (typeof exercice === 'string') return Number(exercice.split('/').pop());

  return (exercice as { id: number }).id;
}

/**
 * Meilleur 1RM atteint AVANT `dateExclue`, par exercice.
 *
 * Sert à colorer le disque : progression, stagnation ou recul. Sans date, tout
 * l'historique compte.
 */
export function recordsAnterieurs(
  seances: readonly Seance[],
  dateExclue?: string,
): Map<number, number> {
  const records = new Map<number, number>();

  for (const s of seances) {
    if (dateExclue !== undefined && s.date.slice(0, 10) >= dateExclue.slice(0, 10)) continue;

    for (const bloc of s.exercices) {
      const rm = rmDesSeries(bloc.series);
      if (rm === null) continue;

      const id = idDeLExercice(bloc.exercice);
      const actuel = records.get(id);
      if (actuel === undefined || rm > actuel) records.set(id, rm);
    }
  }

  return records;
}

/**
 * La suite chronologique du 1RM et du volume, par exercice.
 *
 * Une entrée par séance où l'exercice apparaît, dans l'ordre des dates : c'est
 * ce que trace la courbe de progression. Une séance sans 1RM exploitable
 * n'ajoute rien à `rm` mais compte dans `volume` — l'endurance n'est pas niée,
 * elle est comptée là où elle veut dire quelque chose.
 */
export function historiqueParExercice(seances: readonly Seance[]): {
  rm: Map<number, number[]>;
  volume: Map<number, number[]>;
} {
  const rm = new Map<number, number[]>();
  const volume = new Map<number, number[]>();

  const triees = [...seances].sort((a, b) => a.date.localeCompare(b.date));

  for (const s of triees) {
    for (const bloc of s.exercices) {
      const id = idDeLExercice(bloc.exercice);

      const meilleur = rmDesSeries(bloc.series);
      if (meilleur !== null) rm.set(id, [...(rm.get(id) ?? []), meilleur]);

      const total = volumeDesSeries(bloc.series);
      if (total > 0) volume.set(id, [...(volume.get(id) ?? []), total]);
    }
  }

  return { rm, volume };
}
