import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BROCOLI, RIZ, repas } from './cuisson.test-data';
import { cleDeCuisson, sansCuisson } from './fournees';
import type { Cuissons } from './fournees';
import {
  cleDHabitude, depuisLesHabitudes, habitudesAEcrire,
} from './habitudesCuisson';

/* ============================================ les cuissons habituelles */

describe('cleDHabitude', () => {
  it('rend la même clé quelle que soit la façon d\'écrire le nom', () => {
    /* Sans cela, « Riz Basmati » et « riz basmati » feraient deux habitudes
       pour un seul riz, et l'utilisateur verrait ses réglages disparaître au
       moindre changement de casse. */
    const attendu = 'riz basmati';
    for (const ecriture of [
      'Riz basmati', 'RIZ BASMATI', 'riz  basmati', '  Riz Basmati  ',
      'riz-basmati', 'Riz (basmati)',
    ]) {
      assert.equal(cleDHabitude(ecriture), attendu, ecriture);
    }
  });

  it('enlève les accents sans passer par normalize()', () => {
    /* Hermes n'implémente pas toujours String.prototype.normalize. La table
       de lettres doit donc suffire — c'est ce que ce test vérifie. */
    assert.equal(cleDHabitude('Pâtes complètes'), 'pates completes');
    assert.equal(cleDHabitude('Œufs'), 'oeufs');
    assert.equal(cleDHabitude('Bœuf haché 5%'), 'boeuf hache 5');
  });

  it('ne confond pas deux aliments différents', () => {
    assert.notEqual(cleDHabitude('Riz basmati'), cleDHabitude('Riz complet'));
  });
});

describe('depuisLesHabitudes', () => {
  const plan = [
    repas('0|R2', { aliment: RIZ, aCuire: 100 }, { aliment: BROCOLI, aCuire: 200 }),
    repas('1|R2', { aliment: RIZ, aCuire: 150 }),
  ];

  it('propose la même habitude dans tous les repas où l\'aliment revient', () => {
    const pre = depuisLesHabitudes(plan, { riz: 1 });
    assert.equal(pre[cleDeCuisson('0|R2', RIZ)], 1);
    assert.equal(pre[cleDeCuisson('1|R2', RIZ)], 1);
  });

  it('« sans cuisson » est une habitude, pas une absence d\'habitude', () => {
    /* C'est tout l'intérêt pour le skyr et les amandes : sans ça, l'écran
       redemanderait éternellement pour des aliments dont on a déjà dit
       qu'ils ne se cuisent pas. */
    const pre = depuisLesHabitudes(plan, { brocoli: null });
    const cle = cleDeCuisson('0|R2', BROCOLI);
    assert.ok(cle in pre, 'l\'habitude « sans cuisson » a été perdue');
    assert.equal(pre[cle], null);
    assert.equal(sansCuisson(plan, pre), 2, 'seul le riz devrait rester à situer');
  });

  it('ne dit rien d\'un aliment jamais rencontré', () => {
    assert.deepEqual(depuisLesHabitudes(plan, {}), {});
  });

  it('un choix de l\'écran passe TOUJOURS devant l\'habitude', () => {
    /* La fusion, telle que l'écran la fait. C'est ce qui rend un choix
       explicite indéracinable, quoi qu'il arrive aux habitudes. */
    const cle = cleDeCuisson('0|R2', RIZ);
    const fusion: Cuissons = { ...depuisLesHabitudes(plan, { riz: 1 }), [cle]: 4 };
    assert.equal(fusion[cle], 4);
    assert.equal(fusion[cleDeCuisson('1|R2', RIZ)], 1, 'l\'autre repas garde l\'habitude');
  });
});

describe('habitudesAEcrire', () => {
  const plan = [
    repas('0|R2', { aliment: RIZ, aCuire: 100 }, { aliment: BROCOLI, aCuire: 200 }),
    repas('1|R2', { aliment: RIZ, aCuire: 150 }),
  ];

  it('n\'écrit rien quand rien n\'a changé', () => {
    /* Une semaine sans changement doit pouvoir se composer sans une seule
       écriture. Sinon chaque plan repousse `maj_le` sur trente lignes pour
       rien. */
    const choisi = depuisLesHabitudes(plan, { riz: 1, brocoli: null });
    assert.deepEqual(habitudesAEcrire(plan, choisi, { riz: 1, brocoli: null }), []);
  });

  it('écrit une habitude jamais vue', () => {
    const choisi: Cuissons = { [cleDeCuisson('0|R2', BROCOLI)]: 1 };
    assert.deepEqual(habitudesAEcrire(plan, choisi, {}), [{ aliment: 'brocoli', mode: 1 }]);
  });

  it('distingue « pas d\'habitude » de « habitude sans cuisson »', () => {
    /* Les deux valent `undefined` et `null`, et les confondre ferait sauter
       la première écriture d'un « sans cuisson » — le skyr redemanderait
       indéfiniment. */
    const choisi: Cuissons = { [cleDeCuisson('0|R2', BROCOLI)]: null };
    assert.deepEqual(habitudesAEcrire(plan, choisi, {}), [{ aliment: 'brocoli', mode: null }]);
    assert.deepEqual(habitudesAEcrire(plan, choisi, { brocoli: null }), []);
  });

  it('garde la DERNIÈRE décision quand un aliment est cuit de deux façons', () => {
    /* Un riz au four lundi et à l'eau jeudi : l'habitude est « à l'eau ».
       C'est le sens de « ce que tu as fait la dernière fois ». */
    const choisi: Cuissons = {
      [cleDeCuisson('0|R2', RIZ)]: 4,
      [cleDeCuisson('1|R2', RIZ)]: 1,
    };
    assert.deepEqual(habitudesAEcrire(plan, choisi, {}), [{ aliment: 'riz', mode: 1 }]);
  });

  it('ne laisse pas une décision intermédiaire écraser la dernière', () => {
    /* Le piège du passage unique : jeudi remet l'habitude connue, donc
       « inchangé », donc écarté — et lundi resterait dans le lot. On
       enregistrerait « four » pour un plan qui finit à l'eau. */
    const choisi: Cuissons = {
      [cleDeCuisson('0|R2', RIZ)]: 4,
      [cleDeCuisson('1|R2', RIZ)]: 1,
    };
    assert.deepEqual(habitudesAEcrire(plan, choisi, { riz: 1 }), []);
  });

  it('ignore ce qui n\'a pas encore été décidé', () => {
    assert.deepEqual(habitudesAEcrire(plan, {}, {}), []);
  });
});
