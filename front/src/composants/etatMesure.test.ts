import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SeanceExercice } from '@/api/types';
import {
  appliquerResultats, arreterMesure, cibleMesuree, demarrerMesure, mesureSur, prendreResultats,
} from './etatMesure';

const bloc = (ordre: number, iri: string): SeanceExercice => ({
  exercice: iri, ordre, mode: 'iso', notes: null, secondesTotal: null,
  series: [0, 1].map((o) => ({
    ordre: o, reps: null, poids: null, secondes: null, faite: false,
    repsCible: null, poidsCible: null, secondesCible: null,
  })),
});

const cible = (blocOrdre: number, serieOrdre: number | null, iri: string) =>
  ({ blocOrdre, serieOrdre, exerciceIri: iri, libelle: 'Gainage' });

describe('mesure d\'effort', () => {
  it('une seule mesure court à la fois, la précédente est mise de côté', () => {
    prendreResultats();
    demarrerMesure(cible(0, 0, '/api/exercices/1'));
    assert.equal(mesureSur(0, 0), true);

    demarrerMesure(cible(0, 1, '/api/exercices/1'));
    assert.equal(mesureSur(0, 0), false);
    assert.equal(mesureSur(0, 1), true);
    assert.equal(prendreResultats().length, 1, 'le temps de la première est conservé');

    arreterMesure();
    assert.equal(cibleMesuree(), null);
    assert.equal(prendreResultats().length, 1);
  });

  it('n\'arrête rien quand rien ne tourne', () => {
    prendreResultats();
    arreterMesure();
    assert.equal(prendreResultats().length, 0);
  });

  it('écrit le temps sur la série visée', () => {
    const avant = [bloc(0, '/api/exercices/1'), bloc(1, '/api/exercices/2')];
    const apres = appliquerResultats(avant, [
      { cible: cible(1, 1, '/api/exercices/2'), secondes: 42 },
    ]);

    assert.equal(apres[1]!.series[1]!.secondes, 42);
    assert.equal(apres[0]!.series[1]!.secondes, null, 'les autres blocs sont intacts');
    assert.equal(avant[1]!.series[1]!.secondes, null, 'la liste d\'origine n\'est pas modifiée');
  });

  it('écrit le temps total quand aucune série n\'est visée', () => {
    const apres = appliquerResultats([bloc(0, '/api/exercices/1')], [
      { cible: cible(0, null, '/api/exercices/1'), secondes: 90 },
    ]);

    assert.equal(apres[0]!.secondesTotal, 90);
  });

  /* Le cas qui justifie de transporter l'IRI en plus de la position : on
     réordonne la séance pendant qu'une tenue court. */
  it('retrouve l\'exercice déplacé pendant la mesure', () => {
    const reordonne = [bloc(0, '/api/exercices/2'), bloc(1, '/api/exercices/1')];
    const apres = appliquerResultats(reordonne, [
      { cible: cible(1, 0, '/api/exercices/2'), secondes: 30 },
    ]);

    assert.equal(apres[0]!.series[0]!.secondes, 30);
    assert.equal(apres[1]!.series[0]!.secondes, null);
  });

  it('n\'écrit rien si l\'exercice a disparu', () => {
    const liste = [bloc(0, '/api/exercices/1')];
    const apres = appliquerResultats(liste, [
      { cible: cible(0, 0, '/api/exercices/9'), secondes: 30 },
    ]);

    assert.deepEqual(apres, liste);
  });
});
