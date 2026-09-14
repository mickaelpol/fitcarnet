import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cleDHabitude } from './cuisson';
import { sansAccent } from './texte';

/**
 * LA SUPPRESSION DES ACCENTS NE DOIT PLUS DÉPENDRE DU MOTEUR JS.
 *
 * Jusqu'au 15 septembre 2026 elle était recopiée quatre fois — `solveur/
 * composer.ts`, `calcul/frigo.ts`, `composants/choixAliment.tsx`,
 * `app/admin-exercices.tsx` — et les quatre copies appelaient
 * `String.prototype.normalize('NFD')`. Hermes, le moteur de React Native, ne
 * l'implémente pas toujours : selon la version et selon que l'Intl complet est
 * embarqué, `normalize` est là ou n'y est pas. Les quatre barres de recherche
 * étaient donc un `TypeError` en puissance sur Android — constats D4 et F4 de
 * l'audit de septembre 2026.
 *
 * `cleDHabitude` avait déjà tranché, dans `cuisson.ts` : une table de quinze
 * lettres ne dépend d'aucun moteur. Ce module reprend cette table ; les tests
 * ci-dessous vérifient les deux choses qui comptent — le résultat, et le fait
 * qu'on n'appelle pas `normalize`.
 */

describe('sansAccent', () => {
  it('enlève tous les accents du français', () => {
    assert.equal(sansAccent('éèêë'), 'eeee');
    assert.equal(sansAccent('àâä'), 'aaa');
    assert.equal(sansAccent('ùûü'), 'uuu');
    assert.equal(sansAccent('ôö'), 'oo');
    assert.equal(sansAccent('îï'), 'ii');
    assert.equal(sansAccent('ç'), 'c');
    assert.equal(sansAccent('ÿ'), 'y');
  });

  it('passe les majuscules accentuées en minuscules sans accent', () => {
    assert.equal(sansAccent('ÉCLAIR'), 'eclair');
    assert.equal(sansAccent('Crème Fraîche'), 'creme fraiche');
    assert.equal(sansAccent('CONGÉLATEUR'), 'congelateur');
    /* Ÿ et Œ vivent hors de la plage À-ÿ : c'est `toLowerCase` en amont qui
       les y ramène. Les inverser rendrait la table aveugle à ces deux-là. */
    assert.equal(sansAccent('ŸŒ'), 'yoe');
  });

  it('laisse intacte une chaîne sans accent', () => {
    assert.equal(sansAccent('poulet'), 'poulet');
    assert.equal(sansAccent('riz basmati 500 g'), 'riz basmati 500 g');
  });

  it('rend une chaîne vide sur une chaîne vide', () => {
    assert.equal(sansAccent(''), '');
  });

  /* La ponctuation, les espaces et la casse des symboles ne sont PAS son
     affaire : `filtrerFrigo` cherche une sous-chaîne dans un nom, il lui faut
     le nom entier. C'est `cleDHabitude` qui, en plus, coupe sur tout ce qui
     n'est ni lettre ni chiffre. */
  it('ne touche ni aux espaces ni à la ponctuation', () => {
    assert.equal(sansAccent('  Pâtes (semi-complètes)  '), '  pates (semi-completes)  ');
  });

  it('développe les ligatures, ce que NFD ne faisait pas', () => {
    /* `'Œuf'.normalize('NFD')` rendait « œuf » : NFD ne décompose pas les
       ligatures, seul NFKD le fait. Taper « oeuf » ne trouvait donc pas
       « Œuf » dans les quatre anciennes copies. */
    assert.equal(sansAccent('Œuf'), 'oeuf');
    assert.equal(sansAccent('Bœuf haché'), 'boeuf hache');
    assert.equal(sansAccent('Ex æquo'), 'ex aequo');
  });

  /*
   * LE TEST QUI DIT POURQUOI CE MODULE EXISTE.
   *
   * Il retire `normalize` du prototype le temps de l'appel, exactement comme
   * un Hermes sans Intl complet. Une réécriture en `normalize('NFD')` — la
   * ligne « plus propre » qu'on a envie d'écrire — le fait tomber ici, sur le
   * poste de développement, au lieu de tomber sur un téléphone.
   *
   * `node --test` isole chaque fichier dans son propre processus ; la
   * restauration en `finally` protège quand même les tests d'à côté.
   */
  it('ne dépend pas de String.prototype.normalize (Hermes)', () => {
    const vrai = String.prototype.normalize;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (String.prototype as any).normalize;
    try {
      assert.equal(sansAccent('Congélateur'), 'congelateur');
    } finally {
      String.prototype.normalize = vrai;
    }
  });

  /*
   * L'ALIGNEMENT AVEC `cleDHabitude`, VÉRIFIÉ ET NON PROMIS.
   *
   * Les deux portent la même table. Sur un nom déjà propre — que des lettres
   * et des espaces simples — elles doivent rendre le même texte, sans quoi une
   * habitude s'écrirait sous une clé et la recherche chercherait sous une
   * autre.
   */
  it('rend la même chose que cleDHabitude sur un nom sans ponctuation', () => {
    for (const nom of ['Crème fraîche', 'Bœuf haché', 'PÂTES', 'poulet', 'Congélateur']) {
      assert.equal(sansAccent(nom), cleDHabitude(nom), nom);
    }
  });
});
