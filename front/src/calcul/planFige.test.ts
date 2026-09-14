import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BROCOLI, RIZ, repas } from './cuisson.test-data';
import {
  consommationDuPlan, dejaPromis, estCuisine, figerLePlan,
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
