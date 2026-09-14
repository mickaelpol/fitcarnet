import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { A } from './aliments.test-data';
import { roleDe } from './repasVocabulaire';

describe('rôles déduits de la catégorie', () => {
  it('range chaque catégorie sous la macro qu\'elle pilote', () => {
    assert.equal(roleDe(A.poulet), 'proteine');
    assert.equal(roleDe(A.skyr), 'laitage', 'un laitage a son propre rôle');
    assert.equal(roleDe(A.riz), 'glucide');
    assert.equal(roleDe(A.banane), 'fruit', 'un fruit a son propre rôle');
    assert.equal(roleDe(A.amandes), 'lipide');
    assert.equal(roleDe(A.huile), 'huile', 'l\'huile a son propre rôle');
    assert.equal(roleDe(A.courgettes), 'legume');
  });
});
