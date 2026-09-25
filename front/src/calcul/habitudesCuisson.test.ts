import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BROCOLI, RIZ, repas } from './cuisson.test-data';
import { cleDeCuisson, sansCuisson } from './fournees';
import type { Cuissons } from './fournees';
import {
  cleDHabitude, depuisLesHabitudes, lignesDHabitudes,
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

describe('lignesDHabitudes', () => {
  /* Remplace `habitudesAEcrire` le 25 septembre 2026 : le serveur retient
     désormais la dernière décision de chaque aliment et compare lui-même à ce
     qu'il a en base — l'écran n'a plus à juger « connues », et ne peut donc
     plus se tromper dessus (`usePlanCalcule.ts:133` passait `mesCuissons.data
     ?? {}`, qui valait `{}` chaque fois que la requête était en pause hors
     ligne, et déclarait TOUTE cuisson du plan comme nouvelle). */
  const plan = [
    repas('0|R2', { aliment: RIZ, aCuire: 100 }, { aliment: BROCOLI, aCuire: 200 }),
    repas('1|R2', { aliment: RIZ, aCuire: 150 }),
  ];

  it('donne une ligne par couple (repas, aliment) décidé, dans l\'ordre du plan', () => {
    // CA-6
    /* Le riz est décidé deux fois — au four dans le premier repas, à l'eau
       dans le second. Contrairement à `habitudesAEcrire`, qui ne gardait que
       la dernière, ici les DEUX lignes partent : c'est au serveur de trancher
       « la dernière décision gagne », pas à l'écran. */
    const choisi: Cuissons = {
      [cleDeCuisson('0|R2', RIZ)]: 4,
      [cleDeCuisson('1|R2', RIZ)]: 1,
    };
    assert.deepEqual(
      lignesDHabitudes(plan, choisi),
      [{ aliment: 'riz', mode: 4 }, { aliment: 'riz', mode: 1 }],
    );
  });

  it('envoie « sans cuisson » (mode null) mais pas une cuisson non décidée (undefined)', () => {
    // CA-6
    /* `null` est une réponse — « ça se mange sans cuisson » — et doit partir.
       `undefined` veut dire « personne n'a encore choisi » : ça ne part pas,
       sans quoi le serveur recevrait une ligne qui ne veut rien dire. */
    const choisi: Cuissons = { [cleDeCuisson('0|R2', BROCOLI)]: null };
    assert.deepEqual(lignesDHabitudes(plan, choisi), [{ aliment: 'brocoli', mode: null }]);
  });

  it('envoie une décision même si elle est identique à une habitude déjà connue', () => {
    // CA-7
    /* La fonction ne prend plus de troisième paramètre : elle ne PEUT plus
       comparer à « ce qui est déjà connu », et c'est voulu — c'est justement
       cette comparaison, faite côté écran sur un `mesCuissons.data ?? {}`
       parfois vide à tort, qui repoussait `maj_le` sur toute une trentaine
       d'habitudes en cas de requête hors ligne en pause. */
    assert.equal(lignesDHabitudes.length, 2, 'lignesDHabitudes ne doit prendre que deux paramètres');

    const choisi: Cuissons = { [cleDeCuisson('0|R2', RIZ)]: 1 };
    /* Avec `habitudesAEcrire`, un mode identique à l'habitude connue (`{ riz:
       1 }`) était écarté — voir le test « n'écrit rien quand rien n'a changé »
       ci-dessus. Ici, il n'y a rien à écarter : la ligne part quand même,
       c'est le serveur qui verra qu'il n'y a rien à faire. */
    assert.deepEqual(lignesDHabitudes(plan, choisi), [{ aliment: 'riz', mode: 1 }]);
  });

  it('produit des lignes même quand rien n\'a changé, mais rien du tout si rien n\'est décidé', () => {
    // CA-6
    /* Un plan entièrement pré-rempli par les habitudes (aucun choix qui
       diffère de ce que le serveur a déjà) part quand même : un seul PUT, et
       c'est le serveur qui répondra `{"enregistrees":0}` — l'écran n'a plus à
       le deviner. */
    const choisiInchange = depuisLesHabitudes(plan, { riz: 1, brocoli: null });
    assert.deepEqual(
      lignesDHabitudes(plan, choisiInchange),
      [
        { aliment: 'riz', mode: 1 },
        { aliment: 'brocoli', mode: null },
        { aliment: 'riz', mode: 1 },
      ],
    );

    /* À l'inverse, un plan où personne n'a encore rien décidé n'a rien à
       envoyer : ce n'est pas « tout est inchangé », c'est qu'il n'y a même
       pas de décision à transmettre. */
    assert.deepEqual(lignesDHabitudes(plan, {}), []);
  });
});
