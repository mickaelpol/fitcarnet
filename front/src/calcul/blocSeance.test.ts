import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Exercice, Modele, Seance, SeanceExercice } from '@/api/types';
/*
 * LE FORMATEUR DE L'ÉCRAN, ET PAS UN SOSIE.
 *
 * Ces tests injectaient leur propre `nb` — `String(v).replace('.', ',')` —
 * pendant que l'écran (`exerciceSeance.tsx:113`) passait celui de `@/theme`.
 * Les deux ne rendaient pas la même chose : le sosie écrivait « 42,5 », le vrai
 * « 42.5 ». L'assertion « 12×42,5 » plus bas décrivait donc un affichage que
 * l'application ne produisait nulle part — un test vert qui garantissait le
 * rendu d'une fonction que personne n'exécute. Relevé le 17 septembre 2026, en
 * même temps que la virgule rendue à `nb`.
 *
 * On importe désormais le vrai. En relatif : `tsc -p tsconfig.tests.json` ne
 * réécrit pas l'alias `@/`, et le `require` partirait tel quel dans
 * `dist-tests/`.
 */
import { nb } from '../theme';
import {
  apercuDerniereFois, avancementDe, avecIdentifiantSeance, blocDepuisExercice,
  blocsDepuisModele,
} from './blocSeance';

/**
 * LES TROIS RÈGLES DE L'ÉCRAN DE SÉANCE, ENFIN ÉPROUVABLES.
 *
 * Elles vivaient en clair dans `app/seance/[id].tsx`, et rien ne pouvait les
 * atteindre : `tsconfig.tests.json` n'inclut que `src/**\/*.test.ts`, donc un
 * test posé dans `app/` n'est jamais exécuté — sans le moindre signal.
 * Extraites le 15 septembre 2026 (rang 12 du lot 6 de l'audit de septembre).
 *
 * Ce qu'elles disent, et qui n'était vérifié par personne :
 *   - un « for time » n'a qu'un temps total, ses lignes supplémentaires ne
 *     comptent pas comme des séries dans la jauge d'avancement ;
 *   - on repart de ce qui a été FAIT la dernière fois, et le format prescrit
 *     ne sert que faute de mieux ;
 *   - la réponse du serveur ne rend QUE l'identifiant de la séance, jamais le
 *     reste : ce qui a été tapé pendant l'attente ne doit pas disparaître.
 */

/**
 * LE RACCOURCI « ↓ DERNIÈRE FOIS » ÉTAIT ÉTEINT POUR TOUT UN MODE.
 *
 * Écrit en clair dans `exerciceSeance.tsx`, l'aperçu ne gardait que les séries
 * portant des `reps` ou un `poids`. Une séance en « Tenue » n'en produit
 * aucune — rien que des `secondes` : la liste devenait vide, l'aperçu valait
 * `''`, et le bouton n'était jamais proposé, alors que `rechargerDerniereFois`
 * savait parfaitement restaurer les durées. Trouvé par la revue le 16 septembre
 * 2026, le jour où le mode est devenu choisissable dans un modèle.
 */
test('l\'aperçu montre les durées d\'un exercice travaillé en tenue', () => {
  const tenue = [
    { reps: null, poids: null, secondes: 45 },
    { reps: null, poids: null, secondes: 40 },
  ];

  assert.equal(apercuDerniereFois(tenue, nb), '45 s · 40 s');
});

test('l\'aperçu garde « 12×42,5 » en charge — le témoin inverse', () => {
  /* Sans lui, « montrer les secondes » pourrait se corriger en cassant
     l'affichage des charges, et le test précédent resterait vert. */
  const charge = [
    { reps: 12, poids: 42.5, secondes: null },
    { reps: 10, poids: null, secondes: null },
    { reps: null, poids: 60, secondes: null },
  ];

  assert.equal(apercuDerniereFois(charge, nb), '12×42,5 · 10 rép · 60 kg');
});

/**
 * LA COLLISION : une série qui porte des répétitions ET une durée.
 *
 * Elle existe pour de vrai — avant l'introduction du temps global, le chrono
 * d'un « for time » était stocké sur la première série (`exerciceSeance.tsx:60`),
 * et `serie.tsx:31` recopie `secondesCible → secondes` dans TOUS les modes au
 * cochage. En plaçant le cas « secondes » en tête, l'aperçu de ces séries-là
 * passait de « 12 rép » à « 45 s » alors que le bouton recharge les deux.
 * Relevé par la revue le 16 septembre 2026 : l'ajout doit être un repli.
 */
test('répétitions et durée sur la même série : les répétitions l\'emportent', () => {
  const melangee = [
    { reps: 12, poids: null, secondes: 45 },
    { reps: 10, poids: 40, secondes: 30 },
  ];

  assert.equal(apercuDerniereFois(melangee, nb), '12 rép · 10×40',
    'aucun mode existant ne doit changer d\'affichage à cause du cas « Tenue »');
});

test('une série sans rien du tout ne laisse pas de trou dans l\'aperçu', () => {
  const trouee = [
    { reps: 12, poids: 40, secondes: null },
    { reps: null, poids: null, secondes: null },
    { reps: 11, poids: 40, secondes: null },
  ];

  assert.equal(apercuDerniereFois(trouee, nb), '12×40 · 11×40');
});

test('l\'aperçu s\'arrête à quatre séries, et rend « » quand il n\'y a rien', () => {
  const huit = Array.from({ length: 8 }, () => ({ reps: 10, poids: 20, secondes: null }));

  assert.equal(apercuDerniereFois(huit, nb), '10×20 · 10×20 · 10×20 · 10×20');
  assert.equal(apercuDerniereFois([], nb), '', 'vide reste vide : le bouton ne s\'affiche pas');
  assert.equal(apercuDerniereFois(undefined, nb), '');
});

const exercice = (id: number, modeDefaut: Exercice['modeDefaut'] = 'charge'): Exercice => ({
  '@id': `/api/exercices/${id}`,
  id,
  nom: `Exercice ${id}`,
  nomFr: null,
  formatPrescrit: null,
  modeDefaut,
  groupes: [],
  videoUrl: null,
  partieCorps: null,
  source: 'perso',
});

const bloc = (
  idExercice: number,
  series: { faite: boolean }[],
  mode: SeanceExercice['mode'] = null,
): SeanceExercice => ({
  exercice: `/api/exercices/${idExercice}`,
  ordre: 0,
  mode,
  notes: null,
  secondesTotal: null,
  series: series.map((s, i) => ({
    ordre: i, reps: null, poids: null, secondes: null, faite: s.faite,
    repsCible: null, poidsCible: null, secondesCible: null,
  })),
});

const catalogue = (...ex: Exercice[]): Map<number, Exercice> =>
  new Map(ex.map((e) => [e.id, e]));

/* ---- avancementDe ---- */

test('l\'avancement compte les séries faites sur le total', () => {
  const a = avancementDe(
    [bloc(7, [{ faite: true }, { faite: false }, { faite: true }])],
    catalogue(exercice(7)),
  );

  assert.deepEqual(a, { faites: 2, total: 3 });
});

test('un « for time » ne compte que pour UNE série, quel que soit le nombre de lignes', () => {
  /* Un exercice chronométré n'a qu'un temps total : ses lignes
     supplémentaires détaillent l'effort, elles ne sont pas des séries. */
  const a = avancementDe(
    [bloc(7, [{ faite: true }, { faite: true }, { faite: true }], 'chrono')],
    catalogue(exercice(7)),
  );

  assert.deepEqual(a, { faites: 1, total: 1 });
});

test('le mode du bloc l\'emporte, et à défaut celui du catalogue', () => {
  /* Bloc sans mode + exercice « chrono » au catalogue : on retombe sur le
     catalogue, donc une seule série. */
  const parCatalogue = avancementDe(
    [bloc(7, [{ faite: true }, { faite: true }])],
    catalogue(exercice(7, 'chrono')),
  );
  assert.deepEqual(parCatalogue, { faites: 1, total: 1 });

  /* Le bloc dit « charge » : il gagne, malgré le catalogue. */
  const parBloc = avancementDe(
    [bloc(7, [{ faite: true }, { faite: true }], 'charge')],
    catalogue(exercice(7, 'chrono')),
  );
  assert.deepEqual(parBloc, { faites: 2, total: 2 });
});

test('un exercice absent du catalogue retombe sur « charge »', () => {
  /* Le catalogue peut ne pas avoir chargé : la jauge doit rester juste
     plutôt que de traiter la séance comme une suite de chronos. */
  const a = avancementDe([bloc(99, [{ faite: true }, { faite: false }])], catalogue());

  assert.deepEqual(a, { faites: 1, total: 2 });
});

test('une séance vide donne un avancement nul, sans division à venir', () => {
  assert.deepEqual(avancementDe([], catalogue()), { faites: 0, total: 0 });
});

/* ---- blocDepuisExercice ---- */

test('on reprend ce qui a été fait la dernière fois, en cibles', () => {
  const b = blocDepuisExercice(
    exercice(7),
    2,
    [{ reps: 8, poids: 60, secondes: null }, { reps: 6, poids: 65, secondes: null }],
    { series: 3, reps: 12 },
  );

  assert.equal(b.exercice, '/api/exercices/7');
  assert.equal(b.ordre, 2);
  assert.equal(b.mode, 'charge');
  assert.equal(b.series.length, 2, 'deux séries la dernière fois, deux séries proposées');
  assert.deepEqual(
    b.series.map((s) => ({ repsCible: s.repsCible, poidsCible: s.poidsCible })),
    [{ repsCible: 8, poidsCible: 60 }, { repsCible: 6, poidsCible: 65 }],
  );

  /* Les cibles seules sont reprises : rien n'est pré-rempli comme « fait ».
     Vide ≠ zéro — c'est à l'utilisateur de dire ce qu'il a soulevé. */
  assert.ok(b.series.every((s) => s.reps === null && s.poids === null && !s.faite));
});

test('sans passé, le format prescrit sert de point de départ', () => {
  const b = blocDepuisExercice(exercice(7), 0, undefined, { series: 4, reps: 10 });

  assert.equal(b.series.length, 4);
  assert.ok(b.series.every((s) => s.repsCible === 10 && s.poidsCible === null));
});

test('sans passé NI format, trois séries sans cible', () => {
  /* Le dernier recours : trois lignes vides plutôt qu'un bloc sans série,
     qu'on ne pourrait pas remplir. */
  const b = blocDepuisExercice(exercice(7), 0, undefined, null);

  assert.equal(b.series.length, 3);
  assert.ok(b.series.every((s) => s.repsCible === null));
});

test('un passé VIDE reste un passé : zéro série, et non le format prescrit', () => {
  /* Vide ≠ absent. Une dernière fois sans série ne doit pas ressusciter
     silencieusement le format prescrit. */
  const b = blocDepuisExercice(exercice(7), 0, [], { series: 3, reps: 12 });

  assert.equal(b.series.length, 0);
});

test('les séries sont numérotées dans l\'ordre, à partir de zéro', () => {
  const b = blocDepuisExercice(exercice(7), 0, undefined, { series: 3, reps: 10 });

  assert.deepEqual(b.series.map((s) => s.ordre), [0, 1, 2]);
});

/* ---- blocsDepuisModele ---- */

const modele = (exercices: Modele['exercices']): Modele => ({
  nom: 'Push', type: 'Push', exercices,
});

test('les cibles du modèle deviennent les objectifs de la séance', () => {
  const blocs = blocsDepuisModele(modele([{
    exercice: '/api/exercices/7',
    ordre: 0,
    mode: 'charge',
    notes: 'à ignorer',
    series: [
      { ordre: 0, repsCible: 10, poidsCible: 50, secondesCible: null },
      { ordre: 1, repsCible: 8, poidsCible: 55, secondesCible: null },
    ],
  }]));

  assert.equal(blocs.length, 1);
  assert.equal(blocs[0].exercice, '/api/exercices/7');
  assert.deepEqual(
    blocs[0].series.map((s) => ({ repsCible: s.repsCible, poidsCible: s.poidsCible })),
    [{ repsCible: 10, poidsCible: 50 }, { repsCible: 8, poidsCible: 55 }],
  );

  /* Rien de réalisé n'est copié : le modèle dit ce qu'on VISE. */
  assert.ok(blocs[0].series.every((s) => s.reps === null && s.poids === null && !s.faite));
  assert.equal(blocs[0].notes, null);
});

test('l\'exercice d\'un modèle est repris en IRI, qu\'il arrive en objet ou en chaîne', () => {
  /* API Platform sérialise la même relation des deux façons selon la route.
     L'API veut « /api/exercices/7 » : un identifiant nu ferait pointer la
     séance sur le mauvais exercice, et personne ne le verrait avant la
     séance suivante. */
  const blocs = blocsDepuisModele(modele([
    { exercice: exercice(7), ordre: 0, mode: 'charge', notes: null, series: [] },
    { exercice: '/api/exercices/9', ordre: 1, mode: 'iso', notes: null, series: [] },
  ]));

  assert.deepEqual(blocs.map((b) => b.exercice), ['/api/exercices/7', '/api/exercices/9']);
});

test('les blocs et leurs séries sont renumérotés depuis zéro', () => {
  /* L'ordre vient de la POSITION dans le modèle, pas du champ `ordre` : un
     modèle dont les ordres ont des trous ne doit pas les propager. */
  const blocs = blocsDepuisModele(modele([
    {
      exercice: '/api/exercices/7',
      ordre: 5,
      mode: 'charge',
      notes: null,
      series: [{ ordre: 9, repsCible: 10, poidsCible: null, secondesCible: null }],
    },
    { exercice: '/api/exercices/9', ordre: 12, mode: null, notes: null, series: [] },
  ]));

  assert.deepEqual(blocs.map((b) => b.ordre), [0, 1]);
  assert.deepEqual(blocs[0].series.map((s) => s.ordre), [0]);
});

/* ---- avecIdentifiantSeance ---- */

test('la réponse du serveur ne cède QUE son identifiant', () => {
  /* On ne remplace pas l'état par la réponse : ce qui a été tapé pendant les
     deux secondes et demie d'attente serait perdu — une série ajoutée, une
     charge saisie, jetées sans que rien ne le signale. */
  const locale: Seance = {
    date: '2026-09-15', type: 'Push', exercices: [bloc(7, [{ faite: true }])],
  };
  const distante: Seance = { id: 42, date: '2026-09-15', type: 'Push', exercices: [] };

  const fusion = avecIdentifiantSeance(locale, distante);

  assert.equal(fusion.id, 42, 'sans identifiant, le prochain envoi créerait une 2e séance');
  assert.equal(fusion.exercices.length, 1, 'la saisie locale survit');
});

test('une séance qui a déjà un identifiant n\'est pas touchée', () => {
  const locale: Seance = { id: 42, date: '2026-09-15', type: 'Push', exercices: [] };
  const distante: Seance = { id: 99, date: '2026-09-15', type: 'Pull', exercices: [] };

  assert.equal(avecIdentifiantSeance(locale, distante), locale);
});
