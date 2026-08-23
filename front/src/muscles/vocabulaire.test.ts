import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assembler, casesPour, decouper, enFrancais, libelle, normaliser, SECONDAIRES, ZONES,
} from './vocabulaire';

/**
 * CE QUE CES TESTS PROTÈGENT, C'EST LA DONNÉE — pas l'affichage.
 *
 * Un sélecteur remplace un champ de texte : à partir de maintenant, ce qu'il
 * ne sait pas représenter, il l'efface. Les deux tests qui comptent sont donc
 * « un mot inconnu reste cochable » et « ouvrir sans toucher ne modifie
 * rien ». Le reste est du confort.
 */

describe('vocabulaire', () => {
  it('découpe sur la virgule, et seulement elle', () => {
    assert.deepEqual(decouper('shoulders, triceps'), ['shoulders', 'triceps']);
    assert.deepEqual(decouper('  core  '), ['core']);
    assert.deepEqual(decouper(''), []);
    assert.deepEqual(decouper(null), []);
    /* Un mot composé n'est pas deux mots : `hip flexors` doit rester entier. */
    assert.deepEqual(decouper('hip flexors'), ['hip flexors']);
  });

  it('fusionne les écritures multiples d’un même muscle', () => {
    /* Le catalogue contient les deux ; l'exercice ne doit cocher qu'une case. */
    assert.deepEqual(normaliser(SECONDAIRES, 'traps, trapezius'), ['trapezius']);
    assert.deepEqual(normaliser(SECONDAIRES, 'lats, latissimus dorsi'), ['latissimus dorsi']);
    assert.deepEqual(normaliser(SECONDAIRES, 'deltoids, épaules'), ['shoulders']);
  });

  it('n’efface jamais un terme qu’il ne connaît pas', () => {
    const retenus = normaliser(SECONDAIRES, 'triceps, muscle inventé');
    assert.deepEqual(retenus, ['triceps', 'muscle inventé']);

    /* ET IL A UNE CASE : sans elle, l'enregistrement suivant le supprimerait
       en silence, et personne ne saurait quoi rechercher. */
    const cases = casesPour(SECONDAIRES, retenus);
    assert.ok(cases.some((c) => c.cle === 'muscle inventé' && c.label === 'muscle inventé'));
    assert.equal(assembler(retenus), 'triceps, muscle inventé');
  });

  it('est stable : normaliser deux fois ne change plus rien', () => {
    /* C'est ce qui empêche l'éditeur d'annoncer une modification sur une fiche
       qu'on vient seulement d'ouvrir — et de la réécrire pour rien. */
    for (const brut of ['traps, trapezius', 'triceps', '', 'muscle inventé, core']) {
      const une = normaliser(SECONDAIRES, brut);
      assert.deepEqual(normaliser(SECONDAIRES, assembler(une)), une);
    }
  });

  it('traduit pour l’écran, et laisse voir ce qu’il ne traduit pas', () => {
    assert.equal(libelle(ZONES, 'upper legs'), 'Cuisses');
    assert.equal(libelle(SECONDAIRES, 'hip flexors'), 'Fléchisseurs de hanche');
    assert.equal(libelle(ZONES, 'zone inventée'), 'zone inventée');
    assert.equal(enFrancais(SECONDAIRES, 'shoulders, triceps'), 'Épaules · Triceps');
    assert.equal(enFrancais(SECONDAIRES, null), '');
  });

  it('n’a pas deux cases pour le même mot', () => {
    /* Une écriture rangée sous deux termes rendrait `termeDe` dépendante de
       l'ordre du tableau : le même exercice cocherait une case différente
       selon qu'on a réordonné la liste ou non. */
    for (const table of [ZONES, SECONDAIRES]) {
      const mots = table.flatMap((t) => [t.cle, ...(t.aussi ?? [])]);
      assert.equal(new Set(mots).size, mots.length);
    }
  });
});
