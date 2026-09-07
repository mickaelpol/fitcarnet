import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Seance, Serie } from '@/api/types';
import { historiqueParExercice, recordsAnterieurs } from './historiqueSeances';

/**
 * L'HISTORIQUE, ET LE RECORD FANTÔME.
 *
 * La formule d'Epley était écrite TROIS fois dans le projet, et les trois
 * copies n'appliquaient pas la même règle de validité :
 *
 *   - `performance.ts` — la référence, avec son plafond REPS_MAX_POUR_1RM ;
 *   - `useHistorique` — plafond recopié en dur (`serie.reps <= 15`) ;
 *   - `useRecordsAnterieurs` — AUCUN plafond.
 *
 * L'écran de séance consomme les deux dernières : le disque comparait donc
 * deux nombres calculés selon deux règles différentes. Une séance d'endurance
 * de 30 répétitions à 40 kg posait un « record » de 79,96 kg, et chaque
 * développé suivant s'affichait en RECUL face à un record que la formule
 * elle-même déclare invalide — la courbe de progression racontait l'inverse
 * de ce qui se passait.
 *
 * `performance.ts` dit pourquoi le plafond existe : « une série de 93
 * répétitions à 32 kg donnerait entre 50 et 131 kg — c'est-à-dire davantage
 * qu'une série de 7 à 35 kg, ce qui est absurde ».
 */

const serie = (reps: number | null, poids: number | null): Serie =>
  ({ ordre: 1, reps, poids, secondes: null } as Serie);

const seance = (date: string, idExercice: number, series: Serie[]): Seance => ({
  date,
  type: 'Push',
  exercices: [{
    exercice: `/api/exercices/${idExercice}`,
    ordre: 1, mode: 'charge', notes: null, secondesTotal: null, series,
  }],
});

test('une série d\'endurance ne pose pas de record', () => {
  /* 30 répétitions à 40 kg : Epley donnerait 79,96 kg. C'est de l'endurance,
     pas de la force — l'effort compte dans le volume, jamais dans le 1RM. */
  const records = recordsAnterieurs([seance('2026-01-10', 7, [serie(30, 40)])]);

  assert.equal(records.get(7), undefined,
    'un record de 79,96 kg né d\'une série de 30 reps est un fantôme');
});

test('les deux vues de l\'historique s\'accordent sur le même 1RM', () => {
  /* Le disque compare le record antérieur (une vue) à la progression
     (l'autre). Deux règles différentes, et il compare des choses qui ne se
     comparent pas. */
  const seances = [
    seance('2026-01-10', 7, [serie(30, 40), serie(8, 60)]),
    seance('2026-02-10', 7, [serie(6, 65)]),
  ];

  const records = recordsAnterieurs(seances, '2026-03-01');
  const { rm } = historiqueParExercice(seances);
  const meilleurDeLHistorique = Math.max(...(rm.get(7) ?? []));

  assert.equal(records.get(7), meilleurDeLHistorique,
    'le record antérieur et le sommet de la courbe doivent être le même nombre');
});

test('le record retenu est la meilleure série COURTE', () => {
  const records = recordsAnterieurs([
    seance('2026-01-10', 7, [serie(30, 40), serie(8, 60), serie(6, 65)]),
  ]);

  // Epley(65, 6) = 65 × 1,1998 = 77,99 ; Epley(60, 8) = 75,98
  assert.equal(records.get(7), 78);
});

test('dateExclue écarte la séance du jour et les suivantes', () => {
  const seances = [
    seance('2026-01-10', 7, [serie(5, 50)]),
    seance('2026-02-10', 7, [serie(5, 90)]),
  ];

  const records = recordsAnterieurs(seances, '2026-02-10');

  // Seule la séance de janvier compte : Epley(50, 5) = 58,3
  assert.equal(records.get(7), 58.3);
});

test('le volume compte les séries longues, que le 1RM écarte', () => {
  /* C'est la contrepartie du plafond : l'effort d'endurance n'est pas nié,
     il est compté là où il veut dire quelque chose. */
  const { rm, volume } = historiqueParExercice([
    seance('2026-01-10', 7, [serie(30, 40)]),
  ]);

  assert.equal(rm.get(7), undefined, 'aucun 1RM exploitable');
  assert.deepEqual(volume.get(7), [1200], '30 × 40 = 1200 kg soulevés');
});

test('une série sans poids ni répétitions est ignorée sans planter', () => {
  const records = recordsAnterieurs([
    seance('2026-01-10', 7, [serie(null, null), serie(0, 50), serie(5, 0)]),
  ]);

  assert.equal(records.get(7), undefined);
});

test('un exercice donné en objet plutôt qu\'en IRI est reconnu', () => {
  const s: Seance = {
    date: '2026-01-10',
    type: 'Push',
    exercices: [{
      exercice: { id: 7, nom: 'Développé' } as never,
      ordre: 1, mode: 'charge', notes: null, secondesTotal: null,
      series: [serie(5, 50)],
    }],
  };

  assert.equal(recordsAnterieurs([s]).get(7), 58.3);
});
