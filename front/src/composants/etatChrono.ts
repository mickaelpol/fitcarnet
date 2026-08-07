import { annulerAlarme, programmerAlarme } from './alarmeRepos';

/**
 * L'état du chrono de repos vit ICI, pas dans le composant.
 *
 * Tant qu'il vivait dans `ChronoRepos`, quitter l'écran de séance démontait le
 * composant et emportait le décompte avec lui : on revenait, le repos était
 * perdu. Or on quitte l'écran pendant un repos — pour regarder le frigo, une
 * vidéo d'exercice, ou simplement par réflexe.
 *
 * Le module, lui, survit à la navigation. Le composant n'est plus qu'une vue :
 * il s'abonne, affiche, et bat la seconde tant qu'il est à l'écran. Quand il
 * n'y est pas, personne n'a besoin de compter — c'est l'alarme système qui
 * sonne, et l'heure de fin suffit à retrouver le reste au retour.
 */

let duree = 90;
/** Heure de fin en millisecondes epoch. N'a de sens que si `court`. */
let fin = 0;
let court = false;
/** Reste affiché quand le décompte est à l'arrêt : « Go » reprend là. */
let resteFige = 90;

let alarme: string | null = null;
let alarmePosee = false;

const abonnes = new Set<() => void>();
const changer = () => { for (const f of abonnes) f(); };

export function abonnerChrono(f: () => void): () => void {
  abonnes.add(f);

  return () => { abonnes.delete(f); };
}

/* Les alarmes s'enchaînent au lieu de se croiser : deux « poser » simultanés
   laisseraient une notification orpheline impossible à annuler. */
let file: Promise<void> = Promise.resolve();
const enchainer = (t: () => Promise<void>) => { file = file.then(t, t); };

const retirer = async () => {
  const id = alarme;
  alarme = null;
  alarmePosee = false;
  await annulerAlarme(id);
};

const poser = async (secondes: number) => {
  await retirer();
  const id = await programmerAlarme(secondes);
  alarme = id;
  alarmePosee = id !== null;
};

export const dureeChrono = (): number => duree;
export const chronoCourt = (): boolean => court;
/** Vrai si le système sonnera tout seul : sinon le composant doit sonner. */
export const alarmeChronoPosee = (): boolean => alarmePosee;

export const resteChrono = (): number =>
  court ? Math.max(0, Math.round((fin - Date.now()) / 1000)) : resteFige;

export function demarrerChrono(): void {
  const depart = resteFige === 0 ? duree : resteFige;
  fin = Date.now() + depart * 1000;
  court = true;
  enchainer(() => poser(depart));
  changer();
}

export function arreterChrono(): void {
  resteFige = resteChrono();
  court = false;
  enchainer(retirer);
  changer();
}

export function remettreChrono(): void {
  resteFige = duree;
  court = false;
  enchainer(retirer);
  changer();
}

export function choisirDureeChrono(secondes: number): void {
  duree = secondes;
  resteFige = secondes;
  court = false;
  enchainer(retirer);
  changer();
}

/** Une série vient d'être cochée : le repos repart sur la durée choisie. */
export function relancerChrono(): void {
  fin = Date.now() + duree * 1000;
  court = true;
  enchainer(() => poser(duree));
  changer();
}

/** Le décompte a atteint zéro pendant qu'on le regardait. */
export function terminerChrono(): void {
  resteFige = 0;
  court = false;
  enchainer(retirer);
  changer();
}
