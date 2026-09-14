import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BROCOLI, MODES, POULET, RIZ, pour, repas } from './cuisson.test-data';
import {
  cleDeCuisson, enFournees, repartition, resteSansCuisson, sansCuisson,
} from './fournees';
import type { Cuissons } from './fournees';

/**
 * LE BATCH COOKING NE CHANGE QUE LA RESTITUTION.
 *
 * Les repas sont les mêmes, les quantités aussi : on les additionne par
 * fournée au lieu de les répartir par repas. Rien n'est recalculé ici — c'est
 * la garantie qu'un regroupement ne peut pas fausser un gramme.
 */

describe('Les quantités s\'additionnent sur toute la période', () => {
  it('un aliment servi trois fois donne UNE ligne et son total', () => {
    const plan = [
      repas('0|R2', { aliment: RIZ, aCuire: 100 }),
      repas('0|R4', { aliment: RIZ, aCuire: 120 }),
      repas('1|R2', { aliment: RIZ, aCuire: 80 }),
    ];
    const choisi: Cuissons = {
      [cleDeCuisson('0|R2', RIZ)]: 1,
      [cleDeCuisson('0|R4', RIZ)]: 1,
      [cleDeCuisson('1|R2', RIZ)]: 1,
    };

    const f = enFournees(plan, choisi, MODES);
    assert.equal(f.length, 1);
    assert.equal(f[0]!.lignes.length, 1, 'une seule ligne pour un seul aliment');
    assert.equal(f[0]!.lignes[0]!.aCuire, 300);
  });

  it('rien n\'est perdu : le total des fournées vaut le total du plan', () => {
    const plan = [
      repas('0|R2', { aliment: RIZ, aCuire: 100 }, { aliment: POULET, aCuire: 150 }),
      repas('0|R4', { aliment: BROCOLI, aCuire: 200 }),
    ];
    const choisi: Cuissons = {
      [cleDeCuisson('0|R2', RIZ)]: 1,
      [cleDeCuisson('0|R2', POULET)]: 4,
      [cleDeCuisson('0|R4', BROCOLI)]: 1,
    };

    const total = enFournees(plan, choisi, MODES)
      .flatMap((f) => f.lignes).reduce((n, l) => n + l.aCuire, 0);
    assert.equal(total, 450);
  });
});

describe('Une fournée, c\'est une ligne de la table — pas un mode approchant', () => {
  it('« Four 180 » et « Four 200 » sont DEUX fournées', () => {
    /* C'est précisément ce que le batch cooking doit dire : on ne met pas le
       poisson à 180 avec les légumes à 200 en espérant que ça passe. */
    const plan = [repas('0|R2',
      { aliment: POULET, aCuire: 150 }, { aliment: BROCOLI, aCuire: 200 })];
    const choisi: Cuissons = {
      [cleDeCuisson('0|R2', POULET)]: 4,
      [cleDeCuisson('0|R2', BROCOLI)]: 5,
    };

    assert.equal(enFournees(plan, choisi, MODES).length, 2);
  });

  it('les fournées sortent dans l\'ordre voulu par l\'administrateur', () => {
    const plan = [repas('0|R2',
      { aliment: POULET, aCuire: 150 }, { aliment: BROCOLI, aCuire: 200 })];
    const choisi: Cuissons = {
      [cleDeCuisson('0|R2', POULET)]: 5,
      [cleDeCuisson('0|R2', BROCOLI)]: 1,
    };

    assert.deepEqual(
      enFournees(plan, choisi, MODES).map((f) => f.mode.libelle),
      ['Vapeur', 'Four 200 °C']);
  });

  it('un mode supprimé pendant qu\'un plan est ouvert est écarté, pas inventé', () => {
    const plan = [repas('0|R2', { aliment: RIZ, aCuire: 100 })];
    const choisi: Cuissons = { [cleDeCuisson('0|R2', RIZ)]: 99 };

    assert.deepEqual(enFournees(plan, choisi, MODES), []);
  });
});

describe('Ce qui n\'a pas de cuisson n\'est pas cuit', () => {
  it('un aliment sans mode choisi n\'entre dans aucune fournée', () => {
    const plan = [repas('0|R2',
      { aliment: RIZ, aCuire: 100 }, { aliment: BROCOLI, aCuire: 200 })];
    const choisi: Cuissons = { [cleDeCuisson('0|R2', RIZ)]: 1 };

    const f = enFournees(plan, choisi, MODES);
    assert.equal(f.length, 1);
    assert.deepEqual(f[0]!.lignes.map((l) => l.aliment.nom), ['Riz']);
  });

  it('un plan sans aucun choix ne donne aucune fournée', () => {
    assert.deepEqual(enFournees([repas('0|R2', { aliment: RIZ, aCuire: 100 })], {}, MODES), []);
  });

  it('on sait combien d\'aliments attendent encore un mode', () => {
    /* L'écran doit pouvoir dire « il en reste 3 à renseigner » plutôt que
       d'afficher une fournée incomplète sans prévenir. */
    const plan = [repas('0|R2',
      { aliment: RIZ, aCuire: 100 },
      { aliment: POULET, aCuire: 150 },
      { aliment: BROCOLI, aCuire: 200 })];

    assert.equal(sansCuisson(plan, {}), 3);
    assert.equal(sansCuisson(plan, { [cleDeCuisson('0|R2', RIZ)]: 1 }), 2);
  });

  it('« sans cuisson » est un CHOIX, pas une absence de réponse', () => {
    /* Le skyr et les amandes se mangent tels quels. Sans cet état, ils
       resteraient éternellement « à situer » : l'écran réclamerait une
       cuisson pour des aliments qui n'en ont pas, et on ne saurait jamais si
       un plan est complet. Même distinction que le zéro et le champ vide. */
    const plan = [repas('0|R2',
      { aliment: RIZ, aCuire: 100 }, { aliment: BROCOLI, aCuire: 200 })];
    const choisi: Cuissons = {
      [cleDeCuisson('0|R2', RIZ)]: 1,
      [cleDeCuisson('0|R2', BROCOLI)]: null,
    };

    assert.equal(sansCuisson(plan, choisi), 0, 'plus rien à décider');
    const f = enFournees(plan, choisi, MODES);
    assert.equal(f.length, 1, 'et le brocoli n\'entre dans aucune fournée');
    assert.deepEqual(f[0]!.lignes.map((l) => l.aliment.nom), ['Riz']);
  });

  it('un aliment non décidé et un aliment sans cuisson ne se confondent pas', () => {
    const plan = [repas('0|R2',
      { aliment: RIZ, aCuire: 100 }, { aliment: BROCOLI, aCuire: 200 })];

    assert.equal(sansCuisson(plan, { [cleDeCuisson('0|R2', RIZ)]: null }), 1);
    assert.equal(sansCuisson(plan, {}), 2);
  });

  it('un seul geste règle tout ce qui reste', () => {
    /* Un plan de sept jours porte une trentaine de lignes, dont beaucoup ne
       se cuisent pas. Les pointer une par une pour dire « rien à faire »
       serait absurde. */
    const plan = [repas('0|R2',
      { aliment: RIZ, aCuire: 100 },
      { aliment: POULET, aCuire: 150 },
      { aliment: BROCOLI, aCuire: 200 })];
    const deja: Cuissons = { [cleDeCuisson('0|R2', RIZ)]: 1 };

    const apres = resteSansCuisson(plan, deja);
    assert.equal(sansCuisson(plan, apres), 0);
    /* Ce qui était déjà choisi n'est pas écrasé. */
    assert.equal(apres[cleDeCuisson('0|R2', RIZ)], 1);
    assert.equal(apres[cleDeCuisson('0|R2', POULET)], null);
  });

  it('le même aliment dans deux repas se règle séparément', () => {
    /* Pommes de terre au four ce soir, vapeur demain : le choix porte sur le
       couple repas + aliment, jamais sur l'aliment seul. */
    const plan = [
      repas('0|R4', { aliment: BROCOLI, aCuire: 200 }),
      repas('1|R4', { aliment: BROCOLI, aCuire: 200 }),
    ];
    const choisi: Cuissons = {
      [cleDeCuisson('0|R4', BROCOLI)]: 4,
      [cleDeCuisson('1|R4', BROCOLI)]: 1,
    };

    const f = enFournees(plan, choisi, MODES);
    assert.equal(f.length, 2, 'deux jours, deux cuissons, deux fournées');
  });
});

describe('La répartition dit quoi mettre dans chaque boîte', () => {
  it('les poids sont en CUIT, pas en pesé', () => {
    /* On pèse du riz sec pour le mettre à cuire ; on répartit du riz cuit à
       la cuillère. Annoncer le poids sec devant des boîtes ferait servir
       trois fois trop — c'est la même erreur que celle du riz de mars, un
       cran plus loin dans la chaîne. */
    const plan = [repas('0|R2', { aliment: RIZ, aCuire: 100 })];
    const choisi: Cuissons = { [cleDeCuisson('0|R2', RIZ)]: 1 };

    const boites = repartition(plan, choisi);
    assert.equal(boites[0]!.cuits[0]!.assiette, 200);
    /* La fournée, elle, annonce bien le poids PESÉ. */
    assert.equal(enFournees(plan, choisi, MODES)[0]!.lignes[0]!.aCuire, 100);
  });

  it('ce qui ne se cuit pas est mis à part, pas oublié', () => {
    /* On ne met pas un skyr dans une boîte cinq jours à l'avance : il
       s'ajoute au moment de manger. Mais il doit apparaître, sinon la boîte
       ne correspond plus au repas. */
    const plan = [repas('0|R2',
      { aliment: RIZ, aCuire: 100 }, { aliment: BROCOLI, aCuire: 200 })];
    const choisi: Cuissons = {
      [cleDeCuisson('0|R2', RIZ)]: 1,
      [cleDeCuisson('0|R2', BROCOLI)]: null,
    };

    const b = repartition(plan, choisi)[0]!;
    assert.deepEqual(b.cuits.map((x) => x.aliment.nom), ['Riz']);
    assert.deepEqual(b.crus.map((x) => x.aliment.nom), ['Brocoli']);
  });

  it('rien ne disparaît : chaque aliment du repas est dans une des deux listes', () => {
    const plan = [repas('0|R2',
      { aliment: RIZ, aCuire: 100 },
      { aliment: POULET, aCuire: 150 },
      { aliment: BROCOLI, aCuire: 200 })];

    for (const choisi of [{}, { [cleDeCuisson('0|R2', RIZ)]: 1 }] as Cuissons[]) {
      const b = repartition(plan, choisi)[0]!;
      assert.equal(b.cuits.length + b.crus.length, 3);
    }
  });

  it('une boîte par repas, dans l\'ordre du plan', () => {
    const plan = [
      repas('0|R2', { aliment: RIZ, aCuire: 100 }),
      repas('0|R4', { aliment: RIZ, aCuire: 120 }),
      repas('1|R2', { aliment: RIZ, aCuire: 80 }),
    ];

    assert.deepEqual(repartition(plan, {}).map((b) => b.cle), ['0|R2', '0|R4', '1|R2']);
  });

  it('la somme des boîtes vaut la fournée, une fois la cuisson faite', () => {
    /* L'invariant qui relie les deux moitiés de l'écran : ce qu'on a mis à
       cuire ressort intégralement dans les boîtes. Si la somme ne tombe pas,
       c'est qu'une portion s'est perdue entre la casserole et le frigo. */
    const plan = [
      repas('0|R2', { aliment: RIZ, aCuire: 100 }),
      repas('0|R4', { aliment: RIZ, aCuire: 120 }),
    ];
    const choisi: Cuissons = {
      [cleDeCuisson('0|R2', RIZ)]: 1,
      [cleDeCuisson('0|R4', RIZ)]: 1,
    };

    const cuit = enFournees(plan, choisi, MODES)[0]!.lignes[0]!.aCuire;
    const reparti = repartition(plan, choisi)
      .flatMap((b) => b.cuits).reduce((n, x) => n + x.assiette, 0);

    assert.equal(reparti, cuit * 2, 'le riz double en cuisant, et rien ne se perd');
  });
});

describe('Une boîte contient plusieurs portions, ses macros n\'en valent qu\'une', () => {
  it('la part d\'une personne est la boîte divisée par les convives', () => {
    /* Cuisiner pour trois, c'est cuisiner trois fois la même portion. La
       famille n'a pas tes besoins, mais elle ne pèse rien : c'est TOI qui te
       sers au gramme près. */
    const plan = [pour(3, repas('0|R2', { aliment: RIZ, aCuire: 100 }))];
    const choisi: Cuissons = { [cleDeCuisson('0|R2', RIZ)]: 1 };

    const ligne = repartition(plan, choisi)[0]!.cuits[0]!;
    assert.equal(ligne.assiette, 200, 'la boîte porte de quoi servir trois');
    assert.equal(ligne.parPersonne, 200 / 3, 'et une part en vaut le tiers');
  });

  it('pour une personne, les deux colonnes disent la même chose', () => {
    const plan = [repas('0|R2', { aliment: RIZ, aCuire: 100 })];
    const choisi: Cuissons = { [cleDeCuisson('0|R2', RIZ)]: 1 };

    const ligne = repartition(plan, choisi)[0]!.cuits[0]!;
    assert.equal(ligne.parPersonne, ligne.assiette);
  });

  it('la part vaut aussi pour ce qui ne se cuit pas', () => {
    /* Le skyr s'ajoute au dernier moment, mais il compte dans les macros du
       repas : sa part doit être annoncée comme les autres. */
    const plan = [pour(2, repas('0|R2', { aliment: BROCOLI, aCuire: 200 }))];

    assert.equal(repartition(plan, {})[0]!.crus[0]!.parPersonne, 200);
  });

  it('zéro convive ne fait pas exploser le calcul', () => {
    /* L'écran ne devrait jamais produire ce cas, mais une division par zéro
       afficherait « Infinity g » sur une boîte, ce qui est pire qu'un chiffre
       approximatif. */
    const plan = [pour(0, repas('0|R2', { aliment: RIZ, aCuire: 100 }))];

    assert.equal(repartition(plan, {})[0]!.crus[0]!.parPersonne, 200);
  });
});
