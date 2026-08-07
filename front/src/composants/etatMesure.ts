import type { Exercice, SeanceExercice } from '@/api/types';

/**
 * La mesure d'effort en cours vit ICI, pas dans le composant qui l'affiche.
 *
 * Changer de mode (Charge / Tenue / Chrono) démonte le chronomètre : tant que
 * la mesure lui appartenait, basculer l'interrompait. On s'en protégeait en
 * INTERDISANT la bascule — ce qui déplaçait la gêne au lieu de la lever.
 *
 * Le module survit au démontage. Le décompte continue donc pendant qu'on
 * change de mode, qu'on replie l'exercice ou qu'on fait défiler la séance, et
 * un bandeau en haut de l'écran le garde sous les yeux.
 *
 * Une seule mesure à la fois : on ne tient pas deux gainages en même temps, et
 * deux décomptes concurrents rendraient le bandeau illisible. Démarrer une
 * mesure arrête proprement la précédente et met son temps de côté.
 */

export type CibleMesure = {
  /** position de l'exercice dans la séance au démarrage */
  blocOrdre: number;
  /** `null` : la mesure porte sur le temps total de l'exercice */
  serieOrdre: number | null;
  /** sert à retrouver l'exercice même s'il a changé de place entre-temps */
  exerciceIri: string;
  /** ce que le bandeau affiche */
  libelle: string;
};

export type ResultatMesure = { cible: CibleMesure; secondes: number };

let mesure: { cible: CibleMesure; depart: number } | null = null;
let attente: ResultatMesure[] = [];

const abonnes = new Set<() => void>();
const changer = () => { for (const f of abonnes) f(); };

export function abonnerMesure(f: () => void): () => void {
  abonnes.add(f);

  return () => { abonnes.delete(f); };
}

export const cibleMesuree = (): CibleMesure | null => mesure?.cible ?? null;

export const ecouleMesure = (): number =>
  mesure === null ? 0 : Math.max(0, Math.floor((Date.now() - mesure.depart) / 1000));

/** Le chronomètre de cet endroit précis est-il celui qui tourne ? */
export const mesureSur = (blocOrdre: number, serieOrdre: number | null): boolean =>
  mesure !== null
  && mesure.cible.blocOrdre === blocOrdre
  && mesure.cible.serieOrdre === serieOrdre;

/* Le temps mesuré n'est pas écrit ici : ce module ne connaît pas la séance.
   Il le met en attente, et l'écran de séance — seul détenteur de l'état — le
   récupère et l'applique. */
const deposer = () => {
  if (mesure === null) return;
  attente.push({ cible: mesure.cible, secondes: ecouleMesure() });
  mesure = null;
};

export function demarrerMesure(cible: CibleMesure): void {
  deposer();
  mesure = { cible, depart: Date.now() };
  changer();
}

export function arreterMesure(): void {
  if (mesure === null) return;
  deposer();
  changer();
}

export function prendreResultats(): ResultatMesure[] {
  const r = attente;
  attente = [];

  return r;
}

const iriDe = (v: Exercice | string): string => (typeof v === 'string' ? v : v['@id']);

/**
 * Écrit chaque temps mesuré là d'où il vient.
 *
 * L'appariement se fait sur la position ET l'exercice. Si l'on a réordonné la
 * séance pendant la mesure, les positions ont glissé : on retombe alors sur
 * l'exercice, seul repère resté fiable. Sans correspondance, on n'écrit rien
 * plutôt que d'écraser la mauvaise ligne.
 */
export function appliquerResultats(
  exercices: SeanceExercice[],
  resultats: ResultatMesure[],
): SeanceExercice[] {
  return resultats.reduce((liste, { cible, secondes }) => {
    let i = liste.findIndex(
      (b) => b.ordre === cible.blocOrdre && iriDe(b.exercice) === cible.exerciceIri);
    if (i === -1) i = liste.findIndex((b) => iriDe(b.exercice) === cible.exerciceIri);
    if (i === -1) return liste;

    const bloc = liste[i]!;
    const suite = cible.serieOrdre === null
      ? { ...bloc, secondesTotal: secondes }
      : {
          ...bloc,
          series: bloc.series.map((s) => (s.ordre === cible.serieOrdre
            ? { ...s, secondes }
            : s)),
        };

    return liste.map((b, j) => (j === i ? suite : b));
  }, exercices);
}
