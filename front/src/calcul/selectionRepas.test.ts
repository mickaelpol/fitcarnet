import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { basculer, estCoche } from './selectionRepas';
import type { Choisis } from './selectionRepas';

/**
 * LE BUG DU DOUBLE APPUI, ET RIEN D'AUTRE.
 *
 * Il est parti sur un téléphone : les repas pré-cochés demandaient DEUX appuis
 * pour se décocher, le premier ne changeant rien de visible. Le typage et les
 * 280 autres tests du projet l'ont laissé passer sans un mot — parce que les
 * deux valeurs en jeu, `undefined` et `true`, sont toutes deux des `boolean |
 * undefined` parfaitement légaux.
 *
 * Ce fichier existe pour qu'un appui rende toujours l'inverse de ce qu'on voit.
 */

describe('une case qui a un défaut', () => {
  it('est cochée quand rien n\'a été décidé et que le défaut le dit', () => {
    /* Avoir renseigné une cible pour le déjeuner, c'est avoir dit qu'on
       déjeune : redemander de le cocher, quatre fois par jour sur sept jours,
       faisait vingt-huit appuis pour redire ce que le compte savait déjà. */
    assert.equal(estCoche({}, '0|R2', true), true);
    assert.equal(estCoche({}, '0|R2', false), false);
  });

  it('un choix explicite passe TOUJOURS devant le défaut', () => {
    assert.equal(estCoche({ '0|R2': false }, '0|R2', true), false);
    assert.equal(estCoche({ '0|R2': true }, '0|R2', false), true);
  });

  it('décocher tient, même contre un défaut à vrai', () => {
    /* `||` au lieu de `??` remettrait la case à `true` : le repas se
       recocherait tout seul au rendu suivant. */
    const apres = basculer({}, '0|R2', estCoche({}, '0|R2', true));
    assert.equal(estCoche(apres, '0|R2', true), false);
  });
});

describe('un appui change toujours quelque chose', () => {
  it('LE BUG : un seul appui décoche un repas pré-coché', () => {
    /* La case est cochée à l'écran, le dictionnaire est VIDE. Basculer depuis
       le dictionnaire donnait `!undefined`, c'est-à-dire `true` — soit
       exactement ce qui était déjà affiché. */
    const affiche = estCoche({}, '0|R2', true);
    const apres = basculer({}, '0|R2', affiche);

    assert.notEqual(estCoche(apres, '0|R2', true), affiche);
  });

  it('et vaut pour les quatre combinaisons possibles', () => {
    for (const parDefaut of [true, false]) {
      for (const decide of [undefined, true, false]) {
        const choisis: Choisis = decide === undefined ? {} : { '0|R2': decide };
        const affiche = estCoche(choisis, '0|R2', parDefaut);
        const apres = basculer(choisis, '0|R2', affiche);

        assert.notEqual(
          estCoche(apres, '0|R2', parDefaut), affiche,
          `défaut ${parDefaut}, décidé ${String(decide)}`);
      }
    }
  });

  it('deux appuis ramènent à l\'état de départ', () => {
    const un = basculer({}, '0|R2', estCoche({}, '0|R2', true));
    const deux = basculer(un, '0|R2', estCoche(un, '0|R2', true));

    assert.equal(estCoche(deux, '0|R2', true), true);
  });

  it('ne touche pas aux autres repas', () => {
    const avant = { '0|R2': true, '1|R4': false };
    const apres = basculer(avant, '0|R2', true);

    assert.equal(apres['1|R4'], false);
    assert.equal(avant['0|R2'], true, 'le dictionnaire de départ ne doit pas bouger');
  });
});
