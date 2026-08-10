import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cleDHabitude, cleDeCuisson, consommationDuPlan, dejaPromis,
  depuisLesHabitudes, enFournees, estCuisine, figerLePlan, habitudesAEcrire,
  repartition, resteSansCuisson, sansCuisson,
} from './cuisson';
import type { Cuissons, ModeCuisson, PlanEnregistre } from './cuisson';
import type { Aliment } from '@/solveur/types';

/**
 * LE BATCH COOKING NE CHANGE QUE LA RESTITUTION.
 *
 * Les repas sont les mêmes, les quantités aussi : on les additionne par
 * fournée au lieu de les répartir par repas. Rien n'est recalculé ici — c'est
 * la garantie qu'un regroupement ne peut pas fausser un gramme.
 */

const MODES: ModeCuisson[] = [
  { id: 1, libelle: 'Vapeur', ordre: 10 },
  { id: 4, libelle: 'Four 180 °C', ordre: 40 },
  { id: 5, libelle: 'Four 200 °C', ordre: 50 },
];

const a = (nom: string): Aliment => ({
  id: nom, nom, categorie: 'prot',
  kcal100: 100, prot100: 20, gluc100: 0, lip100: 2, ratio: 1,
});

const RIZ = a('Riz');
const POULET = a('Poulet');
const BROCOLI = a('Brocoli');

/* `assiette` vaut ici deux fois le poids pesé : un riz qui double. Ça rend
   visible, dans les attentes, laquelle des deux colonnes est lue — et une
   fournée qui annoncerait du cuit, ou une boîte qui annoncerait du sec, se
   verrait immédiatement. */
const repas = (cle: string, ...q: { aliment: Aliment; aCuire: number }[]) =>
  ({ cle, convives: 1, quantites: q.map((x) => ({ ...x, assiette: x.aCuire * 2 })) });

/** Le même repas, cuisiné pour plusieurs. */
const pour = (convives: number, r: ReturnType<typeof repas>) => ({ ...r, convives });

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

describe('Un plan enregistré se relit sans rien recalculer', () => {
  const plan = [pour(2, repas('0|R2',
    { aliment: RIZ, aCuire: 100 }, { aliment: BROCOLI, aCuire: 50 }))];
  const choisi: Cuissons = { [cleDeCuisson('0|R2', RIZ)]: 1 };
  const fige = () => figerLePlan(
    [{ aliment: POULET, grammes: 300 }],
    enFournees(plan, choisi, MODES),
    repartition(plan, choisi),
    () => 'Aujourd\'hui · Midi');

  it('ne contient AUCUN identifiant d\'aliment', () => {
    /* Un aliment supprimé du frigo depuis ne doit pas rendre un plan
       illisible. On fige des noms et des grammes, jamais des références. */
    const json = JSON.stringify(fige());
    assert.ok(!json.includes('"id"'), 'un identifiant a fuité dans l\'instantané');
  });

  it('garde les deux quantités de chaque boîte', () => {
    const b = fige().boites[0]!;
    assert.equal(b.convives, 2);
    assert.equal(b.cuits[0]!.assiette, 200);
    assert.equal(b.cuits[0]!.parPersonne, 100);
  });

  it('garde la liste de courses telle qu\'elle était ce jour-là', () => {
    /* Demandé explicitement : savoir ce qu'il manquait au moment où le plan a
       été fait fait partie du plan. */
    assert.deepEqual(fige().courses, [
      { nom: 'Poulet', categorie: 'prot', grammes: 300 },
    ]);
  });

  it('date les boîtes au moment où on les fige', () => {
    /* « 2|R3 » ne désignera plus le même jour dans trois jours. La clé est
       donc traduite en toutes lettres à l'enregistrement, pas à la lecture. */
    assert.equal(fige().boites[0]!.titre, 'Aujourd\'hui · Midi');
  });

  it('ce qui ne se cuit pas reste distinct de ce qui sort d\'une fournée', () => {
    const b = fige().boites[0]!;
    assert.deepEqual(b.cuits.map((x) => x.nom), ['Riz']);
    assert.deepEqual(b.crus.map((x) => x.nom), ['Brocoli']);
  });

  it('survit à un aller-retour JSON', () => {
    /* C'est ce que fait la base : le contenu part en jsonb et revient. Une
       forme qui ne survit pas au voyage ne sert à rien. */
    assert.deepEqual(JSON.parse(JSON.stringify(fige())), fige());
  });
});

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

/* ================= le frigo n'est pas compté deux fois ================= */

describe('consommationDuPlan', () => {
  const plan = [
    repas('0|R2', { aliment: RIZ, aCuire: 100 }, { aliment: BROCOLI, aCuire: 200 }),
    repas('1|R2', { aliment: RIZ, aCuire: 150 }),
  ];

  it('additionne les grammes PESÉS sur toute la période', () => {
    /* `aCuire`, jamais `assiette`. Ce qu'on sort du frigo, c'est du riz sec :
       l'eau que la cuisson ajoute n'a jamais été dans le bac. Ici l'assiette
       vaut le double du pesé — prendre la mauvaise colonne se verrait. */
    const c = consommationDuPlan(plan);
    assert.deepEqual(c.find((x) => x.nom === 'Riz')!.grammes, 250);
    assert.deepEqual(c.find((x) => x.nom === 'Brocoli')!.grammes, 200);
  });

  it('donne UNE ligne par aliment, avec sa référence', () => {
    const c = consommationDuPlan(plan);
    assert.equal(c.length, 2);
    assert.equal(c.find((x) => x.nom === 'Riz')!.reference, RIZ.id);
  });

  it('compte aussi ce qui ne se cuit pas', () => {
    /* Le skyr et les amandes sortent du frigo comme le reste. Les fournées
       n'en couvrent qu'une partie — s'appuyer sur elles oublierait tout ce
       qui se mange tel quel, et le frigo ne baisserait jamais dessus. */
    const c = consommationDuPlan([repas('0|R4', { aliment: BROCOLI, aCuire: 50 })]);
    assert.deepEqual(c, [{ reference: BROCOLI.id, nom: 'Brocoli', grammes: 50 }]);
  });

  it('ne dit rien d\'un plan vide', () => {
    assert.deepEqual(consommationDuPlan([]), []);
  });
});

describe('dejaPromis', () => {
  const contenu = (
    lignes: { reference: string; nom: string; grammes: number }[],
  ): PlanEnregistre => ({
    version: 2, courses: [], fournees: [], boites: [], consomme: lignes,
  });

  it('LE BUG : deux plans prévus ne peuvent plus compter le même poulet', () => {
    /* On compose lundi-mercredi, on enregistre ; on compose jeudi-samedi. Sans
       réservation, le second repartait du stock d'avant et annonçait
       « objectifs atteints » sur du poulet déjà promis. */
    const promis = dejaPromis([
      { contenu: contenu([{ reference: 'grocy:7', nom: 'Poulet', grammes: 800 }]), cuisineLe: null },
    ]);
    assert.equal(promis.get('grocy:7'), 800);
  });

  it('un plan CUISINÉ ne réserve plus rien', () => {
    /* Son stock a déjà été décrémenté pour de vrai. Le compter encore le
       déduirait deux fois — la même erreur, prise par l'autre bout. */
    const promis = dejaPromis([
      { contenu: contenu([{ reference: 'grocy:7', nom: 'Poulet', grammes: 800 }]),
        cuisineLe: '2026-08-10T12:00:00Z' },
    ]);
    assert.equal(promis.size, 0);
  });

  it('deux plans prévus sur le même aliment s\'additionnent', () => {
    const ligne = [{ reference: 'grocy:7', nom: 'Poulet', grammes: 300 }];
    const promis = dejaPromis([
      { contenu: contenu(ligne), cuisineLe: null },
      { contenu: contenu(ligne), cuisineLe: null },
    ]);
    assert.equal(promis.get('grocy:7'), 600);
  });

  it('un plan version 1 ne réserve rien plutôt que d\'inventer', () => {
    /* Il ne dit pas ce qu'il consomme. Deviner à partir de ses noms
       d'aliments donnerait une réservation fausse, qu'on ne voit pas — pire
       qu'une réservation manquante, qu'on voit. */
    const ancien: PlanEnregistre = {
      version: 1, courses: [], fournees: [], boites: [],
    };
    assert.equal(dejaPromis([{ contenu: ancien, cuisineLe: null }]).size, 0);
  });

  it('aucun plan, aucune réservation', () => {
    assert.equal(dejaPromis([]).size, 0);
  });

  it('LE BUG DU 13/08 : un champ ABSENT vaut « prévu », pas « cuisiné »', () => {
    /* Tant que le serveur n'a pas vidé son cache après la migration, il ne
       renvoie pas `cuisineLe` du tout. `!== null` répondait alors « cuisiné »
       pour TOUS les plans : plus aucune réservation, et l'écran affichait
       « Cuisiné le Invalid Date » sur un plan jamais cuisiné.

       Le défaut va vers PRÉVU. Réserver un stock qui ne l'était pas se voit
       et se corrige d'un appui ; ne pas réserver laisse trois plans se
       partager le même brocoli en silence. */
    const promis = dejaPromis([
      { contenu: contenu([{ reference: 'grocy:7', nom: 'Poulet', grammes: 800 }]) },
    ]);
    assert.equal(promis.get('grocy:7'), 800);
  });

  it('le stock disponible ne descend jamais sous zéro', () => {
    /* La règle telle que l'écran l'applique. Un frigo négatif n'existe pas,
       et le solveur le lirait comme une dette à rembourser sur les repas
       suivants. */
    const promis = dejaPromis([
      { contenu: contenu([{ reference: 'grocy:7', nom: 'Poulet', grammes: 900 }]), cuisineLe: null },
    ]);
    const enStock = 400;
    assert.equal(Math.max(0, enStock - (promis.get('grocy:7') ?? 0)), 0);
  });

  it('une chaîne vide vaut « prévu » elle aussi', () => {
    const promis = dejaPromis([
      { contenu: contenu([{ reference: 'grocy:7', nom: 'Poulet', grammes: 800 }]),
        cuisineLe: '' },
    ]);
    assert.equal(promis.get('grocy:7'), 800);
  });
});

describe('estCuisine', () => {
  it('ne dit « cuisiné » que sur une date réellement présente', () => {
    assert.equal(estCuisine({ cuisineLe: '2026-08-13T10:00:00Z' }), true);
    assert.equal(estCuisine({ cuisineLe: null }), false);
    assert.equal(estCuisine({ cuisineLe: undefined }), false);
    assert.equal(estCuisine({ cuisineLe: '' }), false);
    assert.equal(estCuisine({}), false);
  });

  it('LE CAS RÉEL : trois plans qui se partagent 800 g de brocoli sur 500', () => {
    /* Trois plans prévus, 300 + 300 + 200. Sans réservation, chacun repartait
       des 500 g du frigo et se croyait servi. Avec, le troisième ne trouve
       plus rien — et le dit. */
    const brocoli = (g: number) => ({
      contenu: {
        version: 2 as const, courses: [], fournees: [], boites: [],
        consomme: [{ reference: 'base:3', nom: 'Brocoli', grammes: g }],
      },
      cuisineLe: null,
    });
    const promis = dejaPromis([brocoli(300), brocoli(300), brocoli(200)]);

    assert.equal(promis.get('base:3'), 800);
    assert.equal(Math.max(0, 500 - promis.get('base:3')!), 0,
      'il ne doit plus rien rester de disponible');
  });

});

describe('l\'instantané sait ce qu\'il prend au frigo', () => {
  it('figerLePlan écrit « consomme » et annonce la version 2', () => {
    const plan = [repas('0|R2', { aliment: RIZ, aCuire: 100 })];
    const fige = figerLePlan([], [], [], (c) => c, plan);
    assert.equal(fige.version, 2);
    assert.deepEqual(fige.consomme, [{ reference: RIZ.id, nom: 'Riz', grammes: 100 }]);
  });

  it('survit à un aller-retour JSON, « consomme » compris', () => {
    /* C'est ce que fait la base : le contenu part en jsonb et revient. Une
       réservation qui ne survit pas au voyage ne réserve rien. */
    const plan = [repas('0|R2', { aliment: RIZ, aCuire: 100 })];
    const fige = figerLePlan([], [], [], (c) => c, plan);
    assert.deepEqual(JSON.parse(JSON.stringify(fige)), fige);
  });
});
