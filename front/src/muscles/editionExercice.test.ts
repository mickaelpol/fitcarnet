import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Exercice } from '../api/types';
import {
  basculerGroupe, corpsAEnvoyer, ecarts, saisieDepuis,
} from './editionExercice';

/**
 * CE QUE CES TESTS PROTÈGENT : QU'OUVRIR UNE FICHE NE LA RÉÉCRIVE PAS.
 *
 * Les sept règles de comparaison de l'éditeur décident si l'enregistrement
 * écrase une valeur existante. Elles vivaient au milieu de trois cent
 * cinquante lignes de JSX, dans `app/admin-exercices.tsx` — donc hors de
 * portée de `tsconfig.tests.json`, qui n'inclut que `src/**\/*.test.ts` :
 * aucune n'était testée.
 *
 * LA PANNE QU'ELLES ÉVITENT est écrite dans le code d'origine, deux fois : un
 * exercice portant `traps, trapezius` ne coche qu'une case. Comparé à la
 * chaîne d'origine, l'éditeur annonçait une modification sur une fiche qu'on
 * venait seulement d'ouvrir, et la réécrivait au premier enregistrement venu.
 * D'où la comparaison sur la forme NORMALISÉE, des deux côtés.
 *
 * Découpage du 15 septembre 2026 (constat 03-front §4). L'audit annonçait la
 * logique de l'éditeur « testable sans rendu » dans un hook : c'est faux tel
 * quel — un hook React exige un moteur de rendu, que le projet n'embarque
 * pas. Les règles pures sont donc descendues ici, sans React, et
 * `useEditeurExercice` n'est plus qu'un porteur d'état par-dessus.
 */

const ex = (p: Partial<Exercice>): Exercice => ({
  '@id': '/api/exercices/7',
  id: 7,
  nom: 'Barbell shrug',
  nomFr: null,
  formatPrescrit: null,
  modeDefaut: 'charge',
  groupes: [],
  videoUrl: null,
  partieCorps: null,
  source: 'import',
  ...p,
});

/** Une fiche complète telle qu'elle arrive de `GET /api/exercices/{id}`. */
const fiche = ex({
  nomFr: 'Haussement d’épaules',
  formatPrescrit: '4×12',
  modeDefaut: 'charge',
  groupes: ['Push', 'Pull'],
  videoUrl: 'https://youtu.be/abcdefghijk',
  partieCorps: 'shoulders',
  muscleCible: 'traps',
  musclesSecondaires: 'delts, upper back',
  equipement: 'barbell',
  instructions: 'Debout, barre en pronation.',
});

describe('editionExercice — ouvrir sans toucher ne modifie rien', () => {
  it('une saisie tirée de la fiche ne compte aucun écart', () => {
    assert.equal(ecarts(saisieDepuis(fiche), fiche).nombre, 0);
  });

  it('`traps, trapezius` ne compte pas pour un changement', () => {
    /* LA PANNE MÊME : deux mots pour un muscle ne cochent qu'une case. Comparé
       à la chaîne d'origine, l'éditeur aurait annoncé une modification sur une
       fiche qu'on vient d'ouvrir. */
    const brut = ex({ ...fiche, musclesSecondaires: 'delts, deltoids, upper back' });
    assert.equal(ecarts(saisieDepuis(brut), brut).nombre, 0);
  });

  it('tant que la fiche n’est pas arrivée, il n’y a rien à comparer', () => {
    const vide = ecarts(saisieDepuis(fiche), undefined);
    assert.equal(vide.nombre, 0);
    assert.deepEqual(vide.champs, []);
  });

  it('un brouillon absent ne compte aucun écart de texte', () => {
    const s = { ...saisieDepuis(fiche), brouillon: null };
    assert.deepEqual(ecarts(s, fiche).champs, []);
  });
});

describe('editionExercice — ce qui compte pour un écart', () => {
  const depart = saisieDepuis(fiche);

  it('un champ de texte modifié compte pour un', () => {
    const e = ecarts({ ...depart, brouillon: { ...depart.brouillon!, nomFr: 'Shrug' } }, fiche);
    assert.deepEqual(e.champs, ['nomFr']);
    assert.equal(e.nombre, 1);
  });

  it('les espaces autour d’une saisie ne comptent pas', () => {
    const brouillon = { ...depart.brouillon!, nomFr: '  Haussement d’épaules  ' };
    assert.equal(ecarts({ ...depart, brouillon }, fiche).nombre, 0);
  });

  it('un champ vidé compte pour un écart', () => {
    const e = ecarts({ ...depart, brouillon: { ...depart.brouillon!, instructions: '' } }, fiche);
    assert.deepEqual(e.champs, ['instructions']);
  });

  it('le mode, les groupes, le muscle, la zone, le matériel et les secondaires comptent chacun pour un', () => {
    const e = ecarts({
      ...depart,
      mode: 'iso',
      groupes: ['Legs'],
      muscle: 'pectoraux',
      zone: ['chest'],
      materiel: ['dumbbell'],
      secondaires: ['biceps'],
    }, fiche);
    assert.equal(e.mode, true);
    assert.equal(e.groupes, true);
    assert.equal(e.muscle, true);
    assert.equal(e.zone, true);
    assert.equal(e.materiel, true);
    assert.equal(e.secondaires, true);
    assert.equal(e.nombre, 6, 'six règles, six écarts');
  });

  it('changer de valeur SOUS LA MÊME VIGNETTE ne compte pas pour un changement', () => {
    /* `upper back` et `lats` relèvent tous deux de « Dos ». L'utilisateur n'a
       rien touché : comparer les valeurs de base crierait au changement. */
    const dos = ex({ ...fiche, muscleCible: 'upper back' });
    assert.equal(ecarts(saisieDepuis(dos), dos).muscle, false);
  });

  it('l’ordre des groupes cochés n’est pas un changement', () => {
    /* `basculerGroupe` range toujours dans l'ordre de GROUPES : sans cet ordre
       canonique, cocher Push puis Pull et l'inverse passeraient pour deux
       états différents. */
    const pull = basculerGroupe([], 'Pull');
    assert.deepEqual(basculerGroupe(pull, 'Push'), ['Push', 'Pull']);
    assert.equal(ecarts({ ...depart, groupes: ['Push', 'Pull'] }, fiche).groupes, false);
  });

  it('basculer deux fois revient au point de départ', () => {
    assert.deepEqual(basculerGroupe(basculerGroupe([], 'Legs'), 'Legs'), []);
  });
});

describe('editionExercice — on n’envoie QUE ce qui a changé', () => {
  const depart = saisieDepuis(fiche);

  it('rien de touché, rien à envoyer', () => {
    assert.deepEqual(corpsAEnvoyer(depart, ecarts(depart, fiche)), {});
  });

  it('un seul champ touché n’en envoie qu’un', () => {
    /* Renvoyer les huit champs à chaque fois écraserait une modification faite
       ailleurs entre-temps, sans qu'on ait jamais voulu y toucher. */
    const s = { ...depart, brouillon: { ...depart.brouillon!, nomFr: 'Shrug' } };
    assert.deepEqual(corpsAEnvoyer(s, ecarts(s, fiche)), { nomFr: 'Shrug' });
  });

  it('un champ vidé part en `null`, jamais en chaîne vide', () => {
    const s = { ...depart, brouillon: { ...depart.brouillon!, instructions: '' } };
    assert.deepEqual(corpsAEnvoyer(s, ecarts(s, fiche)), { instructions: null });
  });

  it('la saisie est envoyée sans ses espaces', () => {
    const s = { ...depart, brouillon: { ...depart.brouillon!, formatPrescrit: '  5×5  ' } };
    assert.deepEqual(corpsAEnvoyer(s, ecarts(s, fiche)), { formatPrescrit: '5×5' });
  });

  it('la vignette est traduite en valeur de base à l’écriture', () => {
    const s = { ...depart, muscle: 'pectoraux' };
    assert.deepEqual(corpsAEnvoyer(s, ecarts(s, fiche)), { muscleCible: 'pectorals' });
  });

  it('aucune vignette retenue écrit `null` — l’exercice rejoint « Autre »', () => {
    const s = { ...depart, muscle: null };
    assert.deepEqual(corpsAEnvoyer(s, ecarts(s, fiche)), { muscleCible: null });
  });

  it('zone et matériel n’envoient qu’une valeur, `null` si rien n’est coché', () => {
    const s = { ...depart, zone: [], materiel: [] };
    assert.deepEqual(corpsAEnvoyer(s, ecarts(s, fiche)), { partieCorps: null, equipement: null });
  });

  it('les secondaires partent assemblés, ou `null` si aucun', () => {
    const plusieurs = { ...depart, secondaires: ['biceps', 'triceps'] };
    assert.deepEqual(
      corpsAEnvoyer(plusieurs, ecarts(plusieurs, fiche)),
      { musclesSecondaires: 'biceps, triceps' },
    );
    const aucun = { ...depart, secondaires: [] };
    assert.deepEqual(corpsAEnvoyer(aucun, ecarts(aucun, fiche)), { musclesSecondaires: null });
  });

  it('le mode et les groupes partent tels quels', () => {
    const s = { ...depart, mode: 'chrono', groupes: ['Legs'] };
    assert.deepEqual(
      corpsAEnvoyer(s, ecarts(s, fiche)),
      { modeDefaut: 'chrono', groupes: ['Legs'] },
    );
  });
});
