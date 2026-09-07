import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Serie } from '@/api/types';
import {
  arrondirCharge, epley, estimerDepuisEssai, PALIERS, repsAu,
  REPS_MAX_POUR_1RM, rmDesSeries, volumeDesSeries,
} from './performance';

/**
 * LES MESURES DE PROGRESSION.
 *
 * Ce module n'avait AUCUN test, et il n'était même pas compilé par la suite :
 * `tsconfig.tests.json` énumérait ses fichiers à la main, et celui-ci n'y
 * figurait pas. Trois constats de l'audit de septembre 2026 y vivaient — dont
 * le record fantôme né d'une formule recopiée sans son plafond.
 *
 * Les chiffres d'ici s'affichent sur la carte d'exercice et dans le disque de
 * progression : un 1RM faux ne plante rien, il raconte simplement une
 * progression qui n'a pas eu lieu.
 */

const serie = (reps: number | null, poids: number | null): Serie =>
  ({ ordre: 1, reps, poids, secondes: null } as Serie);

/* ------------------------------------------------------------- Epley */

test('Epley ajoute 3,33 % par répétition', () => {
  assert.equal(Math.round(epley(100, 5) * 10) / 10, 116.7);
});

/* ------------------------------------------------- une seule répétition */

test('une répétition à 100 kg EST un 1RM de 100 kg', () => {
  /* La définition, pas une estimation. `estimerDepuisEssai` porte déjà cette
     garde et dit pourquoi : « Epley y ajouterait 3,3 % — un chiffre inventé ».
     `rmDesSeries` ne l'avait pas : la même conviction appliquée à un endroit
     et oubliée à l'autre. Résultat, la carte d'exercice affichait 103,3 kg là
     où le calculateur affichait 100 kg, pour la même série. */
  assert.equal(rmDesSeries([serie(1, 100)]), 100);
});

test('les deux chemins vers le 1RM s\'accordent sur une répétition', () => {
  assert.equal(rmDesSeries([serie(1, 87.5)]), estimerDepuisEssai(87.5, 1));
});

test('les deux chemins s\'accordent aussi au-delà d\'une répétition', () => {
  assert.equal(rmDesSeries([serie(6, 65)]), estimerDepuisEssai(65, 6));
});

/* ------------------------------------------------------- le plafond */

test('au-delà du plafond, aucune estimation n\'est rendue', () => {
  /* « Une série de 93 répétitions à 32 kg donnerait entre 50 et 131 kg —
     c'est-à-dire davantage qu'une série de 7 à 35 kg, ce qui est absurde. » */
  assert.equal(rmDesSeries([serie(REPS_MAX_POUR_1RM + 1, 40)]), null);
  assert.equal(estimerDepuisEssai(40, REPS_MAX_POUR_1RM + 1), null);
});

test('le plafond lui-même reste valable', () => {
  assert.notEqual(rmDesSeries([serie(REPS_MAX_POUR_1RM, 40)]), null);
});

test('la meilleure série courte gagne, les longues sont ignorées', () => {
  // 30 reps à 40 kg vaudrait 79,96 par Epley : c'est le record fantôme.
  assert.equal(rmDesSeries([serie(30, 40), serie(6, 65)]), 78);
});

/* --------------------------------------------------------- cas limites */

test('une série vide ou nulle ne produit rien', () => {
  assert.equal(rmDesSeries([]), null);
  assert.equal(rmDesSeries([serie(null, null)]), null);
  assert.equal(rmDesSeries([serie(0, 50)]), null);
  assert.equal(rmDesSeries([serie(5, 0)]), null);
});

/* ------------------------------------------------------------ volume */

test('le volume compte tout, séries longues comprises', () => {
  /* La contrepartie du plafond : l'endurance n'est pas niée, elle est comptée
     là où elle veut dire quelque chose. */
  assert.equal(volumeDesSeries([serie(30, 40), serie(6, 65)]), 1590);
});

test('le volume ignore les séries incomplètes', () => {
  assert.equal(volumeDesSeries([serie(null, 40), serie(5, null)]), 0);
});

/* ------------------------------------------------------------ paliers */

test('à 100 % du maximum, c\'est une répétition', () => {
  assert.equal(repsAu(100), 1);
});

test('la table des paliers descend du maximum vers le plus léger', () => {
  assert.deepEqual([...PALIERS], [...PALIERS].sort((a, b) => b - a));
  assert.equal(PALIERS[0], 100);
});

/* ------------------------------------------------------------ charges */

test('les charges s\'arrondissent au palier de 2,5 kg, comme les disques', () => {
  assert.equal(arrondirCharge(62.3), 62.5);
  assert.equal(arrondirCharge(61), 60);
  assert.equal(arrondirCharge(63.8), 65);
});

test('le pas d\'arrondi se règle, pour les haltères par kilo', () => {
  assert.equal(arrondirCharge(62.3, 1), 62);
});
