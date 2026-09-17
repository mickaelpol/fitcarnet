import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { contenuEnMots, enumeration } from './contenuCompte';

/**
 * CE QUE LA SUPPRESSION D'UN COMPTE DÉTRUIT, DIT EN TOUTES LETTRES.
 *
 * L'écran d'administration l'écrivait deux fois — sur la carte du compte et
 * dans la confirmation — chacune à sa façon, et aucune ne comptait les
 * aliments ni le stock : un compte sans séance mais au frigo plein
 * s'annonçait « 0 séance · 0 série · 0 modèle · 0 plan ». Depuis le
 * 17 septembre 2026, l'API les compte ; ce module est la seule mise en mots.
 */

const VIDE = {
  seances: 0, series: 0, modeles: 0, plans: 0, aliments: 0, stock: 0,
  cibles: 0, complements: 0, exercices: 0,
};

describe('contenuEnMots', () => {
  it('nomme aussi les aliments et le stock', () => {
    assert.deepEqual(
      contenuEnMots({ ...VIDE, aliments: 12, stock: 9 }).slice(4, 6),
      ['12 aliments', '9 lignes de stock'],
    );
  });

  it('nomme les objectifs, les compléments et les exercices personnels', () => {
    assert.deepEqual(
      contenuEnMots({ ...VIDE, cibles: 4, complements: 3, exercices: 2 }),
      ['0 séance', '0 série', '0 modèle', '0 plan', '0 aliment', '0 ligne de stock',
        '4 objectifs', '3 compléments', '2 exercices personnels'],
    );
  });

  it('accorde au singulier jusqu’à un, au pluriel au-delà', () => {
    assert.deepEqual(
      contenuEnMots({
        seances: 1, series: 2, modeles: 1, plans: 3, aliments: 1, stock: 1,
        cibles: 1, complements: 1, exercices: 1,
      }),
      ['1 séance', '2 séries', '1 modèle', '3 plans', '1 aliment', '1 ligne de stock',
        '1 objectif', '1 complément', '1 exercice personnel'],
    );
  });
});

describe('enumeration', () => {
  it('sépare par des virgules et termine par « et »', () => {
    assert.equal(enumeration(['a', 'b', 'c']), 'a, b et c');
  });

  it('ne met ni virgule ni « et » quand il n’y a qu’un élément', () => {
    assert.equal(enumeration(['a']), 'a');
    assert.equal(enumeration(['a', 'b']), 'a et b');
  });
});
