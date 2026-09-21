/**
 * La part pure de la chaîne de calcul du calculateur.
 *
 * Ces fonctions ont vécu dans `app/(onglets)/repas.tsx` jusqu'au
 * 15 septembre 2026, donc SANS AUCUN TEST — `tsconfig.tests.json` ne compile
 * que `src`, et un test posé dans `app/` n'est jamais exécuté, sans le moindre
 * signal. Les voilà éprouvées.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { AlimentDisponible, Cible } from '../api/types';
import type { Aliment } from '../solveur/types';
import type { AuMieux } from '../solveur/composer';
import type { Compose } from './demandeRepas';
import {
  alimentsCalculables, alimentsSansFibresConnues, cibleDuRepas, cibleEnGlucidesTotaux,
  cuissonsEffectives, demandesDuPlan, fibresPar100,
  mettreAPlat,
} from './planCalcule';

const dispo = (p: Partial<AlimentDisponible> & { reference: string }): AlimentDisponible => ({
  nom: p.reference, categorie: 'prot', kcal100: 100, prot100: 20, gluc100: 0, lip100: 2,
  fibres100: 0, ratio: 1, stock: 1, unite: 'g', grammesParUnite: 1, emplacement: null,
  grammesDisponibles: 1,
  peseeAvant: null, peseeApres: null, provenanceRatio: 'table', ...p,
});

const cible = (p: Partial<Cible> & { repas: Cible['repas'] }): Cible => ({
  '@id': `/api/cibles/${p.repas}`, id: 1, kcal: 600, prot: 40, gluc: 60, lip: 20, ...p,
});

const aliment = (id: string): Aliment => ({
  id, nom: id, categorie: 'prot', kcal100: 100, prot100: 20, gluc100: 0, lip100: 2, ratio: 1,
});

/* ------------------------------------------------------ alimentsCalculables */

test('un aliment sans poids par unité est écarté : les macros sont pour 100 g', () => {
  const sortie = alimentsCalculables([
    dispo({ reference: 'grocy:1', nom: 'Poulet' }),
    dispo({ reference: 'grocy:2', nom: 'Lait de coco', grammesParUnite: null }),
  ]);

  assert.deepEqual(sortie.map((a) => a.nom), ['Poulet']);
});

test('un aliment épuisé ou sans énergie déclarée est écarté', () => {
  const sortie = alimentsCalculables([
    dispo({ reference: 'grocy:1', nom: 'Poulet' }),
    dispo({ reference: 'grocy:2', nom: 'Riz épuisé', stock: 0 }),
    dispo({ reference: 'grocy:3', nom: 'Sel', kcal100: 0 }),
  ]);

  assert.deepEqual(sortie.map((a) => a.nom), ['Poulet']);
});

test('un stock négatif ne passe pas non plus pour disponible', () => {
  assert.deepEqual(alimentsCalculables([dispo({ reference: 'grocy:1', stock: -3 })]), []);
});

test("l'identifiant du solveur est la référence du frigo", () => {
  const [a] = alimentsCalculables([dispo({ reference: 'grocy:12', nom: 'Poulet' })]);
  assert.equal(a?.id, 'grocy:12');
});

test('des fibres inconnues restent inconnues, elles ne deviennent pas zéro', () => {
  const [a] = alimentsCalculables([dispo({ reference: 'grocy:1', fibres100: null })]);
  assert.equal(a?.fibres100, undefined);
});

/* ------------------------------------------------------------ fibresPar100 */

test('les fibres inconnues s’affichent à zéro, faute de mieux', () => {
  const m = fibresPar100([
    dispo({ reference: 'grocy:1', fibres100: 7 }),
    dispo({ reference: 'grocy:2', fibres100: null }),
  ]);

  assert.equal(m.get('grocy:1'), 7);
  assert.equal(m.get('grocy:2'), 0);
});

/* ------------------------------------------------ alimentsSansFibresConnues */

test('sans cible en glucides totaux, on ne signale rien', () => {
  const aliments = [dispo({ reference: 'grocy:1', nom: 'Pain complet', categorie: 'fec', fibres100: null })];

  assert.deepEqual(alimentsSansFibresConnues(aliments, [cible({ repas: 'R2' })]), []);
});

test('une seule cible en glucides totaux suffit à rendre le problème réel', () => {
  const aliments = [dispo({ reference: 'grocy:1', nom: 'Pain complet', categorie: 'fec', fibres100: null })];
  const cibles = [cible({ repas: 'R1' }), cible({ repas: 'R2', glucidesTotaux: true })];

  assert.deepEqual(alimentsSansFibresConnues(aliments, cibles), ['Pain complet']);
});

test('on ne nomme que ce qui contient forcément des fibres', () => {
  const cibles = [cible({ repas: 'R2', glucidesTotaux: true })];
  const aliments = [
    dispo({ reference: 'a', nom: 'Pain complet', categorie: 'fec', fibres100: null }),
    dispo({ reference: 'b', nom: 'Brocoli', categorie: 'leg', fibres100: null }),
    dispo({ reference: 'c', nom: 'Pomme', categorie: 'fruit', fibres100: null }),
    dispo({ reference: 'd', nom: 'Amandes', categorie: 'ole', fibres100: null }),
    /* Une huile ou un blanc de poulet n'en ont pas : les signaler noierait
       les vrais cas. */
    dispo({ reference: 'e', nom: 'Huile d’olive', categorie: 'huile', fibres100: null }),
    dispo({ reference: 'f', nom: 'Poulet', categorie: 'prot', fibres100: null }),
    dispo({ reference: 'g', nom: 'Skyr', categorie: 'lait', fibres100: null }),
  ];

  assert.deepEqual(
    alimentsSansFibresConnues(aliments, cibles),
    ['Pain complet', 'Brocoli', 'Pomme', 'Amandes'],
  );
});

test('des fibres connues à zéro ne sont pas des fibres inconnues', () => {
  const cibles = [cible({ repas: 'R2', glucidesTotaux: true })];
  const aliments = [dispo({ reference: 'a', nom: 'Riz', categorie: 'fec', fibres100: 0 })];

  assert.deepEqual(alimentsSansFibresConnues(aliments, cibles), []);
});

test('glucidesTotaux absent vaut faux, il n’est pas « peut-être »', () => {
  assert.equal(cibleEnGlucidesTotaux([cible({ repas: 'R2' })]), false);
  assert.equal(cibleEnGlucidesTotaux([]), false);
  assert.equal(cibleEnGlucidesTotaux([cible({ repas: 'R2', glucidesTotaux: true })]), true);
});

/* -------------------------------------------------------------- cibleDuRepas */

test('la cible se retrouve par créneau', () => {
  const cibles = [cible({ repas: 'R1', kcal: 400 }), cible({ repas: 'R3', kcal: 200 })];

  assert.equal(cibleDuRepas(cibles, 'R3')?.kcal, 200);
  assert.equal(cibleDuRepas(cibles, 'R4'), undefined);
});

/* ------------------------------------------------------------ demandesDuPlan */

const composeVide = (roles: Compose['roles'] = {}): Compose =>
  ({ roles, restes: {}, verrous: [], ajouts: [], releves: {} });

test('sans plan composé, aucune demande', () => {
  assert.deepEqual(demandesDuPlan(null, [0], {}, [cible({ repas: 'R2' })]), []);
});

test('un repas sans cible ne produit pas de demande : pas d’objectif, rien à résoudre', () => {
  const plan = { '0|R2': composeVide({ proteine: aliment('grocy:1') }) };

  assert.deepEqual(demandesDuPlan(plan, [0], {}, []), []);
});

test('un créneau qui a une cible mais rien de composé ne produit pas de demande', () => {
  assert.deepEqual(demandesDuPlan({}, [0], {}, [cible({ repas: 'R2' })]), []);
});

test('les demandes sortent dans l’ordre du temps, quel que soit l’ordre des clés', () => {
  const plan = {
    '3|R2': composeVide(), '0|R4': composeVide(), '0|R1': composeVide(),
  };
  const cibles = [cible({ repas: 'R1' }), cible({ repas: 'R2' }), cible({ repas: 'R4' })];

  const sortie = demandesDuPlan(plan, [0, 3], {}, cibles);

  assert.deepEqual(
    sortie.map((d) => `${d.jour}|${d.repas}`),
    ['0|R1', '0|R4', '3|R2'],
  );
});

test('le RANG du calendrier est le rang de période, sans retraduction', () => {
  const plan = { '7|R2': composeVide() };
  const sortie = demandesDuPlan(plan, [7], {}, [cible({ repas: 'R2' })]);

  assert.equal(sortie[0]?.jour, 7);
});

test('les convives par défaut valent 1, et la cible est multipliée par les portions', () => {
  const plan = { '0|R2': composeVide(), '0|R3': composeVide() };
  const cibles = [cible({ repas: 'R2', kcal: 600 }), cible({ repas: 'R3', kcal: 600 })];

  const [seul, aDeux] = demandesDuPlan(plan, [0], { '0|R3': 2 }, cibles);

  assert.equal(seul?.cibles.kcal, 600);
  assert.equal(aDeux?.cibles.kcal, 1200);
});

/* ---------------------------------------------------------------- mettreAPlat */

const auMieux = (quantites: AuMieux['resultat']['quantites']): AuMieux => ({
  resultat: { ok: true, quantites, totaux: { kcal: 0, prot: 0, gluc: 0, lip: 0 }, ecarts: [] },
  echanges: [],
} as unknown as AuMieux);

test('seuls les créneaux résolus arrivent à plat, dans l’ordre du temps', () => {
  const resultats = new Map<string, AuMieux>([
    ['1|R2', auMieux([])], ['0|R4', auMieux([])], ['0|R1', auMieux([])],
  ]);

  assert.deepEqual(
    mettreAPlat(resultats, [0, 1], {}).map((r) => r.cle),
    ['0|R1', '0|R4', '1|R2'],
  );
});

test('un jour non retenu ne descend pas dans les boîtes, même s’il est résolu', () => {
  const resultats = new Map<string, AuMieux>([['5|R2', auMieux([])]]);

  assert.deepEqual(mettreAPlat(resultats, [0], {}), []);
});

test('le nombre de convives suit le repas jusqu’aux boîtes', () => {
  const resultats = new Map<string, AuMieux>([['0|R2', auMieux([])], ['0|R3', auMieux([])]]);

  const plat = mettreAPlat(resultats, [0], { '0|R2': 3 });

  assert.equal(plat[0]?.convives, 3);
  assert.equal(plat[1]?.convives, 1);
});

test('les quantités sont reprises telles quelles : le regroupement ne recalcule rien', () => {
  const q = [{ aliment: aliment('grocy:1'), aCuire: 137, assiette: 103, impose: false }];
  const plat = mettreAPlat(new Map([['0|R2', auMieux(q)]]), [0], {});

  assert.deepEqual(plat[0]?.quantites, q);
});

/* ----------------------------------------------------------- cuissonsEffectives */

const platDe = (nom: string, cle = '0|R2') => ([{
  cle, convives: 1,
  quantites: [{ aliment: { ...aliment('grocy:1'), nom }, aCuire: 100, assiette: 100, impose: false }],
}]);

test("l'habitude sert de défaut quand rien n'a été choisi", () => {
  const sortie = cuissonsEffectives(platDe('Riz'), { riz: 4 }, {});

  assert.equal(sortie['0|R2|grocy:1'], 4);
});

test('un choix explicite passe devant l’habitude, et y reste', () => {
  const sortie = cuissonsEffectives(platDe('Riz'), { riz: 4 }, { '0|R2|grocy:1': 7 });

  assert.equal(sortie['0|R2|grocy:1'], 7);
});

test('« se mange tel quel » est un choix, pas une absence de réponse', () => {
  const sortie = cuissonsEffectives(platDe('Riz'), { riz: 4 }, { '0|R2|grocy:1': null });

  assert.equal(sortie['0|R2|grocy:1'], null);
  assert.equal('0|R2|grocy:1' in sortie, true);
});

test('sans habitude ni choix, la cuisson reste inconnue — elle ne vaut pas « aucune »', () => {
  const sortie = cuissonsEffectives(platDe('Riz'), {}, {});

  assert.equal('0|R2|grocy:1' in sortie, false);
});
