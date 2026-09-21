import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BROCOLI, RIZ, repas } from './cuisson.test-data';
import {
  consommationDuPlan, estCuisine, figerLePlan,
} from './planFige';
import type { PlanEnregistre } from './planFige';

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

describe('estCuisine', () => {
  it('ne dit « cuisiné » que sur une date réellement présente', () => {
    assert.equal(estCuisine({ cuisineLe: '2026-08-13T10:00:00Z' }), true);
    assert.equal(estCuisine({ cuisineLe: null }), false);
    assert.equal(estCuisine({ cuisineLe: undefined }), false);
    assert.equal(estCuisine({ cuisineLe: '' }), false);
    assert.equal(estCuisine({}), false);
  });
});

describe('l\'instantané sait ce qu\'il prend au frigo', () => {
  it('figerLePlan écrit « consomme » et annonce la version 3', () => {
    /* VERSION 3 DEPUIS LES COMPLÉMENTS : les boîtes portent désormais leur
       repas en code. Les plans version 1 et 2 restent lisibles — le champ est
       facultatif, et une boîte qui ne l'a pas n'affiche pas de complément
       plutôt que d'aller le deviner. */
    const plan = [repas('0|R2', { aliment: RIZ, aCuire: 100 })];
    const fige = figerLePlan([], [], [], (c) => c, plan);
    assert.equal(fige.version, 3);
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
