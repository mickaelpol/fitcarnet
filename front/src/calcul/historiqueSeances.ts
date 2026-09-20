import type { Seance } from '@/api/types';
import { idDe } from '../api/types';
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
    if (!strictementAvant(s.date, dateExclue)) continue;

    for (const bloc of s.exercices) {
      const rm = rmDesSeries(bloc.series);
      if (rm === null) continue;

      const id = idDe(bloc.exercice);
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
      const id = idDe(bloc.exercice);

      const meilleur = rmDesSeries(bloc.series);
      if (meilleur !== null) rm.set(id, [...(rm.get(id) ?? []), meilleur]);

      const total = volumeDesSeries(bloc.series);
      if (total > 0) volume.set(id, [...(volume.get(id) ?? []), total]);
    }
  }

  return { rm, volume };
}

/**
 * Cette séance est-elle antérieure au jour qu'on prépare ?
 *
 * LA MÊME BORNE POUR LES DEUX LECTEURS, depuis le 20 septembre 2026. Elle
 * était écrite deux fois, à six lignes d'écart dans deux fichiers, et dans les
 * deux sens :
 *
 *     historiqueSeances.ts:41      s.date >= dateExclue   → on saute
 *     api/hooks/seances.ts:58      s.date <  dateExclue   → on garde
 *
 * Logiquement identiques, jamais croisées par un test — et consommées CÔTE À
 * CÔTE dans `app/seance/[id].tsx`, avec la même date. Le jour où l'une passe à
 * `<=`, l'écran affiche un record et une « dernière fois » qui ne parlent pas
 * de la même période, sans qu'aucune suite ne bouge.
 *
 * On compare le JOUR et non l'instant : les dates arrivent en ISO complet, et
 * comparer les chaînes entières ferait dépendre le résultat de l'heure
 * d'enregistrement. Sans date d'exclusion, tout l'historique compte.
 */
export const strictementAvant = (date: string, dateExclue?: string): boolean =>
  (dateExclue === undefined || date.slice(0, 10) < dateExclue.slice(0, 10));

/** Une série telle qu'elle a été faite : ce qui sert à préremplir la suivante. */
interface SerieFaite {
  reps: number | null;
  poids: number | null;
  secondes: number | null;
}

/**
 * Ce qui a été fait la DERNIÈRE fois, exercice par exercice.
 *
 * DESCENDUE LE 20 SEPTEMBRE 2026 (palier 0) depuis `api/hooks/seances.ts`,
 * où elle vivait dans un `useMemo` — donc dans un fichier qui importe
 * react-query et React Native, que rien ne pouvait éprouver. C'est la
 * troisième réduction que cet en-tête annonçait, restée sur place quand ses
 * deux sœurs sont descendues le 15 septembre.
 *
 * Elle prérremplit une nouvelle séance : ce sont des charges et des
 * répétitions affichées à quelqu'un qui va soulever.
 *
 * TROIS RÈGLES, et la troisième est la moins évidente :
 *
 *   - on ne regarde que les séances strictement antérieures ;
 *   - la plus récente gagne, une seule par exercice ;
 *   - une série où RIEN n'est saisi ne compte pas — et donc une séance
 *     entièrement vide ne masque pas la précédente. C'est ce qui évite qu'une
 *     séance ouverte puis abandonnée fasse perdre les vraies charges.
 */
export function derniereFoisParExercice(
  seances: readonly Seance[],
  dateExclue?: string,
): Map<number, SerieFaite[]> {
  const parExercice = new Map<number, SerieFaite[]>();

  const triees = [...seances]
    .filter((s) => strictementAvant(s.date, dateExclue))
    .sort((a, b) => b.date.localeCompare(a.date));

  for (const s of triees) {
    for (const bloc of s.exercices) {
      const idExercice = idDe(bloc.exercice);
      if (parExercice.has(idExercice)) continue;   // la plus recente d'abord

      const series = bloc.series
        .filter((x) => x.reps !== null || x.poids !== null || x.secondes !== null)
        .map((x) => ({ reps: x.reps, poids: x.poids, secondes: x.secondes }));

      if (series.length > 0) parExercice.set(idExercice, series);
    }
  }

  return parExercice;
}
