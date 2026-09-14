/**
 * LES RÈGLES DE L'ÉDITEUR D'EXERCICE, SANS UNE LIGNE DE RENDU.
 *
 * Ce que ce module décide : ce qu'on peut saisir, ce qui compte pour une
 * modification, et ce qu'on envoie à l'API. Rien d'autre.
 *
 * POURQUOI IL EXISTE. Ces sept règles de comparaison vivaient au milieu de
 * trois cent cinquante lignes de JSX dans `app/admin-exercices.tsx`. Or
 * `tsconfig.tests.json` n'inclut que `src/**\/*.test.ts` : tout ce qui est
 * dans `app/` est HORS de portée des tests, sans le moindre signal. Les
 * règles qui décident si un enregistrement écrase une valeur existante
 * n'étaient donc couvertes par rien.
 *
 * L'audit (03-front §4) plaçait cette logique dans un hook
 * `useEditeurExercice`, « testable sans rendu ». Ce n'est pas vrai tel quel :
 * un hook React exige un moteur de rendu, et le projet n'en embarque aucun
 * pour les tests. La partie pure est donc ici, sans React ; le hook n'est
 * plus qu'un porteur d'état par-dessus.
 *
 * Découpage du 15 septembre 2026. L'extraction était mécanique : aucune règle
 * n'a changé de sens au passage, et `editionExercice.test.ts` en tient la
 * preuve.
 */

/* Imports relatifs pour les valeurs : l'alias `@/` n'est pas réécrit par
   `tsc -p tsconfig.tests.json` et casserait en MODULE_NOT_FOUND au
   `node --test`, alors que `npm run verif` passerait. */
import type { Exercice } from '../api/types';
import { groupeDeLaValeur, valeurPourGroupe } from './groupes';
import { assembler, MATERIELS, normaliser, SECONDAIRES, ZONES } from './vocabulaire';

/** Les champs de texte modifiables, dans l'ordre où ils apparaissent sur la fiche. */
export const CHAMPS = [
  { cle: 'nomFr', etiquette: 'Nom français' },
  { cle: 'videoUrl', etiquette: 'Lien YouTube' },
  /* `partieCorps` ET `musclesSecondaires` N'Y SONT PLUS NON PLUS, POUR LA
     MÊME RAISON QUE `muscleCible` ci-dessous : c'étaient des champs de texte
     libre sur un vocabulaire qu'il fallait connaître par cœur — `upper legs`,
     `hip flexors` — et que personne ne peut retaper deux fois pareil. La base
     en porte la trace : `traps` ET `trapezius`, `deltoids` ET « épaules »,
     `lats` ET `latissimus dorsi` — quarante-deux mots pour une vingtaine de
     muscles. Ils se choisissent maintenant dans une liste, en français, plus
     bas dans l'éditeur. Le matériel les a rejoints : il est renseigné sur
     les 1318 exercices importés, en anglais, avec vingt-huit valeurs
     exactes — rien à saisir, tout à traduire. */
  /* `muscleCible` N'EST PLUS ICI, ET C'EST UNE CORRECTION.
     C'était un champ de texte libre. Or le filtre par vignette compare la
     valeur EXACTEMENT à celle du catalogue — `pectorals`, pas « Pectoraux ».
     Taper le mot en français, ou au pluriel, ou en abrégé, faisait tomber
     l'exercice dans « Autre » sans le moindre message : on l'aurait cherché
     dans les pectoraux pendant longtemps. Il se choisit désormais sur les
     mêmes vignettes que le filtre — ce qu'on peut désigner est exactement ce
     qu'on peut retrouver. */
  { cle: 'formatPrescrit', etiquette: 'Format prescrit' },
  { cle: 'instructions', etiquette: 'Exécution', long: true },
] as const;

export type CleModifiable = (typeof CHAMPS)[number]['cle'];
export type Brouillon = Record<CleModifiable, string>;

/**
 * Les deux champs qui ne sont pas du texte libre, et qui changent le
 * COMPORTEMENT de l'exercice — pas seulement son affichage.
 *
 * `modeDefaut` décide de ce qu'on saisit pendant une séance : des charges, un
 * temps sous tension, ou un chronomètre. `groupes` décide dans quelles séances
 * l'exercice est proposé.
 */
export const MODES = [
  { cle: 'charge', libelle: 'Charge' },
  { cle: 'iso', libelle: 'Isométrie' },
  { cle: 'chrono', libelle: 'Chrono' },
] as const;

export const GROUPES = ['Push', 'Pull', 'Legs'] as const;

/** L'état de saisie de l'éditeur. `null` tant que la fiche complète n'est pas arrivée. */
export interface SaisieExercice {
  brouillon: Brouillon | null;
  mode: string | null;
  groupes: string[] | null;
  /** La clé de vignette — ou `null` si le muscle actuel n'en a aucune. */
  muscle: string | null;
  /* La zone telle qu'elle est écrite en base — `upper legs`, pas « Cuisses ».
     Un tableau d'un élément au plus : `ChoixPuces` parle la même langue en
     simple et en multiple, et un cas particulier de moins est un bug de
     moins. */
  zone: string[] | null;
  secondaires: string[] | null;
  materiel: string[] | null;
}

/** Ce qui a bougé depuis l'ouverture de la fiche. */
export interface Ecarts {
  champs: readonly CleModifiable[];
  mode: boolean;
  groupes: boolean;
  muscle: boolean;
  zone: boolean;
  secondaires: boolean;
  materiel: boolean;
  /** Le compte affiché sur le bouton « Enregistrer (n) ». */
  nombre: number;
}

/**
 * La saisie de départ, tirée de la fiche COMPLÈTE.
 *
 * ON PART DE LA FORME NORMALISÉE, ET C'EST CE QUI ÉVITE LES FAUX CHANGEMENTS.
 * Un exercice portant `traps, trapezius` ne coche qu'une case ; si l'on
 * comparait ensuite à la chaîne d'origine, l'éditeur annoncerait une
 * modification sur une fiche qu'on vient seulement d'ouvrir, et la réécrirait
 * au premier enregistrement venu.
 */
export function saisieDepuis(complet: Exercice): SaisieExercice {
  return {
    brouillon: Object.fromEntries(
      CHAMPS.map((c) => [c.cle, complet[c.cle] ?? '']),
    ) as Brouillon,
    mode: complet.modeDefaut,
    groupes: complet.groupes,
    muscle: groupeDeLaValeur(complet.muscleCible),
    zone: normaliser(ZONES, complet.partieCorps),
    secondaires: normaliser(SECONDAIRES, complet.musclesSecondaires),
    materiel: normaliser(MATERIELS, complet.equipement),
  };
}

/**
 * Les sept règles de comparaison. Elles décident si l'enregistrement écrase
 * une valeur existante, et c'est tout le sujet.
 */
export function ecarts(saisie: SaisieExercice, complet: Exercice | undefined): Ecarts {
  const { brouillon, mode, groupes, muscle, zone, secondaires, materiel } = saisie;

  const champs = brouillon === null || complet === undefined
    ? []
    : CHAMPS.filter((c) => brouillon[c.cle].trim() !== (complet[c.cle] ?? '')).map((c) => c.cle);

  const modeChange = complet !== undefined && mode !== null && mode !== complet.modeDefaut;

  /* Comparaison par chaîne : `groupes` est toujours rangé dans l'ordre de
     GROUPES (voir `basculerGroupe`), donc deux sélections identiques donnent
     deux chaînes identiques. Sans cet ordre canonique, cocher Push puis Pull
     et l'inverse passeraient pour deux états différents. */
  const groupesChanges = complet !== undefined && groupes !== null
    && groupes.join(',') !== complet.groupes.join(',');

  /* ON COMPARE DES VIGNETTES, PAS DES VALEURS DE BASE. Un exercice sur
     `upper back` relève de « Dos » ; le rattacher à « Dos » écrirait `lats`,
     et une comparaison sur la valeur crierait au changement alors que rien ne
     bouge pour l'utilisateur. */
  const muscleChange = complet !== undefined
    && muscle !== groupeDeLaValeur(complet.muscleCible);

  /* COMPARÉS À LEUR FORME NORMALISÉE, PAS À LA CHAÎNE D'ORIGINE. `traps,
     trapezius` et `trapezius` cochent la même case : les deux doivent compter
     pour « rien n'a bougé », sinon l'éditeur annonce une modification sur une
     fiche qu'on vient d'ouvrir et la réécrit pour rien. */
  const zoneChange = complet !== undefined && zone !== null
    && assembler(zone) !== assembler(normaliser(ZONES, complet.partieCorps));

  const secondairesChanges = complet !== undefined && secondaires !== null
    && assembler(secondaires) !== assembler(normaliser(SECONDAIRES, complet.musclesSecondaires));

  const materielChange = complet !== undefined && materiel !== null
    && assembler(materiel) !== assembler(normaliser(MATERIELS, complet.equipement));

  return {
    champs,
    mode: modeChange,
    groupes: groupesChanges,
    muscle: muscleChange,
    zone: zoneChange,
    secondaires: secondairesChanges,
    materiel: materielChange,
    nombre: champs.length + (modeChange ? 1 : 0)
      + (groupesChanges ? 1 : 0) + (muscleChange ? 1 : 0)
      + (zoneChange ? 1 : 0) + (secondairesChanges ? 1 : 0) + (materielChange ? 1 : 0),
  };
}

/**
 * Ce qu'on envoie à l'API : RIEN QUE CE QUI A CHANGÉ.
 *
 * Renvoyer les huit champs à chaque fois écraserait une modification faite
 * ailleurs entre-temps, sans qu'on ait jamais voulu y toucher.
 */
export function corpsAEnvoyer(saisie: SaisieExercice, ec: Ecarts): Partial<Exercice> {
  const { brouillon, mode, groupes, muscle, zone, secondaires, materiel } = saisie;
  const corps: Partial<Exercice> = {};
  if (brouillon === null) return corps;

  for (const cle of ec.champs) {
    const v = brouillon[cle].trim();
    (corps as Record<string, string | null>)[cle] = v === '' ? null : v;
  }
  if (ec.mode && mode !== null) corps.modeDefaut = mode as Exercice['modeDefaut'];
  if (ec.groupes && groupes !== null) corps.groupes = groupes;
  /* `null` quand aucune vignette n'est retenue : l'exercice rejoint alors
     « Autre », qui est exactement ce que veut dire un muscle non renseigné. */
  if (ec.muscle) corps.muscleCible = muscle === null ? null : valeurPourGroupe(muscle);
  /* Rien de coché s'écrit `null`, jamais une chaîne vide : deux façons de
     dire « rien » finissent toujours par ne plus se ressembler — un filtre
     qui teste l'une laisserait passer l'autre. */
  if (ec.zone && zone !== null) corps.partieCorps = zone[0] ?? null;
  if (ec.materiel && materiel !== null) corps.equipement = materiel[0] ?? null;
  if (ec.secondaires && secondaires !== null) {
    corps.musclesSecondaires = secondaires.length === 0 ? null : assembler(secondaires);
  }

  return corps;
}

/**
 * Cocher ou décocher un groupe, EN GARDANT L'ORDRE DE `GROUPES`.
 *
 * L'ordre canonique est ce qui permet de comparer deux sélections par une
 * simple chaîne : sans lui, cocher Push puis Pull et l'inverse passeraient
 * pour deux états différents, et l'éditeur annoncerait une modification là où
 * il n'y en a pas.
 */
export function basculerGroupe(groupes: readonly string[], g: string): string[] {
  const suite = groupes.includes(g) ? groupes.filter((x) => x !== g) : [...groupes, g];

  return GROUPES.filter((t) => suite.includes(t));
}
