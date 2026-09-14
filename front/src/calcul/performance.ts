import type { SeanceExercice, Serie } from '@/api/types';

/**
 * Mesures de progression.
 *
 * Trois indicateurs, chacun valide dans son domaine :
 *   - le 1RM, calculé UNIQUEMENT sur les séries courtes ;
 *   - le volume, valable partout ;
 *   - le temps, pour les efforts chronométrés.
 */

/**
 * Au-delà de ce nombre de répétitions, on mesure l'endurance, pas la force :
 * aucune formule de 1RM n'est fiable. Une série de 93 répétitions à 32 kg
 * donnerait, selon la formule, entre 50 et 131 kg — c'est-à-dire davantage
 * qu'une série de 7 à 35 kg, ce qui est absurde. On l'écarte donc du calcul,
 * et son effort est compté dans le volume.
 */
export const REPS_MAX_POUR_1RM = 15;

/**
 * Le coefficient d'Epley, et il n'est ecrit QU'ICI.
 *
 * Il l'etait trois fois dans ce meme fichier — la formule, son inverse, et le
 * calcul des repetitions par palier. Trois copies d'Epley aux bornes
 * divergentes avaient deja produit un « record » de 79,96 kg que la formule
 * elle-meme declare invalide (constat E1) ; les avoir toutes rapatriees ici
 * n'aurait servi a rien en laissant le nombre se repeter dans le module de
 * reference lui-meme. Releve le 15 septembre 2026.
 */
const COEF_EPLEY = 0.0333;


/** Estimation d'Epley, fiable jusqu'à une quinzaine de répétitions. */
export const epley = (poids: number, reps: number): number =>
  poids * (1 + COEF_EPLEY * reps);

/**
 * Le 1RM d'un ensemble de séries : la meilleure série courte.
 *
 * Une répétition unique est prise telle quelle, comme dans
 * `estimerDepuisEssai` : le maximum EST la charge soulevée, par définition, et
 * Epley y ajouterait 3,3 % inventés. La garde n'existait que sur l'un des deux
 * chemins — la carte d'exercice annonçait 103,3 kg là où le calculateur
 * affichait 100 kg, pour la même série.
 */
export function rmDesSeries(series: Serie[]): number | null {
  let meilleur: number | null = null;

  for (const s of series) {
    if (s.reps === null || s.poids === null) continue;
    if (s.reps < 1 || s.reps > REPS_MAX_POUR_1RM || s.poids <= 0) continue;

    const rm = s.reps === 1 ? s.poids : epley(s.poids, s.reps);
    if (meilleur === null || rm > meilleur) meilleur = rm;
  }

  return meilleur === null ? null : Math.round(meilleur * 10) / 10;
}

/** Volume : tout ce qui a été soulevé, séries longues comprises. */
export function volumeDesSeries(series: Serie[]): number {
  let total = 0;
  for (const s of series) {
    if (s.reps === null || s.poids === null) continue;
    if (s.reps > 0 && s.poids > 0) total += s.reps * s.poids;
  }

  return Math.round(total);
}

export const repsTotales = (series: Serie[]): number =>
  series.reduce((n, s) => n + (s.reps ?? 0), 0);

/** Temps total d'un effort chronométré, en secondes. */
export function tempsTotal(bloc: SeanceExercice): number | null {
  const t = bloc.secondesTotal ?? null;
  if (t !== null && t > 0) return t;

  // repli : la somme des temps de série, pour un exercice en tenue
  const somme = bloc.series.reduce((n, s) => n + (s.secondes ?? 0), 0);

  return somme > 0 ? somme : null;
}

/** Les trois indicateurs d'un exercice, selon son mode. */
export interface Performance {
  rm: number | null;
  volume: number;
  reps: number;
  secondes: number | null;
  /** séries écartées du 1RM parce que trop longues */
  seriesLongues: number;
}

export function performanceDe(bloc: SeanceExercice, mode: string): Performance {
  const series = bloc.series;

  return {
    rm: rmDesSeries(series),
    volume: volumeDesSeries(series),
    reps: repsTotales(series),
    secondes: mode === 'charge' ? null : tempsTotal(bloc),
    seriesLongues: series.filter(
      (s) => s.reps !== null && s.reps > REPS_MAX_POUR_1RM && (s.poids ?? 0) > 0,
    ).length,
  };
}

/* ---------------------------------------------------------------- 
   Calculateur de RM : trouver la charge à viser pour un objectif    */

/** Arrondi au palier réellement disponible en salle. */
export function arrondirCharge(kg: number, pas = 2.5): number {
  return Math.round(kg / pas) * pas;
}

/**
 * Estime le 1RM à partir d'un essai : « j'ai réussi 3 répétitions à 40 kg ».
 * C'est exactement ce qu'on fait en salle en montant progressivement.
 *
 * Cas particulier d'une seule répétition : le maximum EST la charge soulevée,
 * par définition. Epley y ajouterait 3,3 % — un chiffre inventé.
 */
export function estimerDepuisEssai(poids: number, reps: number): number | null {
  if (poids <= 0 || reps < 1 || reps > REPS_MAX_POUR_1RM) return null;
  if (reps === 1) return Math.round(poids * 10) / 10;

  return Math.round(epley(poids, reps) * 10) / 10;
}

/** Table des paliers, du maximum au plus léger. */
export const PALIERS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50] as const;

/**
 * Répétitions théoriquement possibles à ce pourcentage du maximum.
 * À 100 %, c'est une répétition : c'est la définition du 1RM.
 */
export const repsAu = (pourcent: number): number =>
  pourcent >= 100 ? 1 : Math.max(1, Math.round((100 / pourcent - 1) / COEF_EPLEY));
