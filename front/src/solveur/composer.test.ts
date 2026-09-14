import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { A, CIBLES, STOCK } from './aliments.test-data';
import { composer } from './composer';
import { ajusterAuStock } from './plafonner';
import {
  BLANCS_PAR_PORTION, HUILE_PAR_PORTION, LEGUME_PAR_PORTION, roleDe,
} from './repasVocabulaire';
import { calculer } from './solveur';

describe('composition d\'un repas', () => {
  /* Le modèle du repas décide de sa forme : midi porte huile et légume,
     le matin porte un fruit et ni l'un ni l'autre. */
  it('suit le modèle du repas — midi', () => {
    const { fixes } = composer(STOCK, 1, new Set(), 'R2');

    assert.deepEqual(fixes.map((f) => f.aliment.nom).sort(),
      [A.courgettes.nom, A.huile.nom].sort());
  });

  it('suit le modèle du repas — matin : un fruit, pas de légume ni d\'huile', () => {
    const { fixes } = composer(STOCK, 1, new Set(), 'R1');

    assert.deepEqual(fixes.map((f) => f.aliment.nom), [A.banane.nom]);
  });

  it('ne met pas de brocoli à la collation', () => {
    const { fixes } = composer(STOCK, 1, new Set(), 'R3');

    assert.equal(fixes.some((f) => roleDe(f.aliment) === 'legume'), false);
  });

  /* La collation porte DEUX sources de protéines : le laitage s'ajuste, les
     blancs d'œufs sont figés. */
  it('donne au laitage le rôle de variable protéique à la collation', () => {
    const stock = [A.skyr, A.blancs, A.avoine, A.banane, A.amandes];
    const { variables, fixes, imposes } = composer(stock, 1, new Set(), 'R3');

    assert.equal(variables.proteine, A.skyr, 'le skyr s\'ajuste');
    assert.equal(imposes.proteine, A.blancs, 'les blancs sont une quantité fixe');
    assert.equal(fixes.find((f) => f.aliment === A.blancs)?.grammes, BLANCS_PAR_PORTION);
    assert.equal(fixes.find((f) => f.aliment === A.banane)?.grammes, 83);
  });

  /* Le plan nomme ses aliments : la collation porte de l'avoine, pas du
     boulgour, et aucune propriété nutritionnelle ne permet de le deviner. */
  it('préfère l\'aliment nommé par le plan', () => {
    const stock = [A.skyr, A.blancs, A.boulgour, A.avoine, A.banane, A.amandes];
    const { variables } = composer(stock, 1, new Set(), 'R3');

    assert.equal(variables.glucide, A.avoine, 'le boulgour passe avant dans le stock');
  });

  it('se rabat sur un autre aliment du rôle quand le préféré manque', () => {
    const stock = [A.skyr, A.blancs, A.boulgour, A.banane, A.amandes];
    const { variables } = composer(stock, 1, new Set(), 'R3');

    assert.equal(variables.glucide, A.boulgour, 'une préférence n\'est pas une contrainte');
  });

  /* Le skyr epuise ne doit pas etre remplace par du blanc de poulet. */
  it('ne remplace un laitage que par un laitage', () => {
    const stock = [A.skyr, A.lait, A.poulet, A.blancs, A.avoine, A.banane, A.amandes];
    const dispo = (x: { id: number | string }) => (x.id === A.skyr.id ? 50 : 100000);

    const a = ajusterAuStock(composer(stock, 1, new Set(), 'R3'), CIBLES.R3, dispo, stock);

    assert.equal(a.plafonnes[0]?.aliment, A.skyr);
    assert.equal(a.plafonnes[0]?.releve, A.lait, 'un autre laitage, pas une viande');
  });

  it('prend un aliment par rôle', () => {
    const { variables, fixes, manquants } = composer(STOCK, 1);

    assert.equal(roleDe(variables.proteine!), 'proteine');
    assert.equal(roleDe(variables.glucide!), 'glucide');
    assert.equal(roleDe(variables.lipide!), 'lipide');
    assert.equal(fixes.length, 2, 'huile et légume sont des quantités imposées');
    assert.deepEqual(manquants, []);
  });

  it('sert les quantites du plan : 200 g de legume, 5 g d\'huile', () => {
    const { fixes } = composer(STOCK, 1, new Set(), 'R2');
    const de = (a: { nom: string }) => fixes.find((f) => f.aliment.nom === a.nom)!;

    assert.equal(de(A.courgettes).grammes, 200);
    assert.equal(de(A.huile).grammes, 5);
  });

  it('impose huile et légume au prorata des portions', () => {
    const { fixes } = composer(STOCK, 3);
    const de = (a: { nom: string }) => fixes.find((f) => f.aliment.nom === a.nom)!;

    assert.equal(de(A.huile).grammes, HUILE_PAR_PORTION * 3);
    assert.equal(de(A.courgettes).grammes, LEGUME_PAR_PORTION * 3);
    assert.equal(de(A.courgettes).unite, undefined,
      'sans unité : la quantité s\'entend dans l\'état de référence, donc cuit');
  });

  it('se passe de légume quand il n\'y en a pas en stock', () => {
    const sansLegume = STOCK.filter((a) => roleDe(a) !== 'legume');
    const { fixes, manquants } = composer(sansLegume, 1);

    assert.deepEqual(fixes.map((f) => f.aliment.nom), [A.huile.nom]);
    assert.deepEqual(manquants, [], 'un légume absent n\'est pas un manque');
  });

  /* Le point demandé : les deux lipides figurent au repas, mais un seul
     s'ajuste — trois macros ne déterminent que trois inconnues. */
  it('fait figurer l\'huile ET l\'oléagineux', () => {
    const { variables, fixes, imposes } = composer(STOCK, 1);

    assert.equal(variables.lipide, A.amandes, 'l\'oléagineux porte les lipides');
    assert.equal(imposes.huile, A.huile);
    assert.ok(fixes.some((f) => f.aliment === A.huile), 'l\'huile est une quantité fixe');
  });

  it('confie les lipides à l\'huile quand aucun oléagineux n\'est en stock', () => {
    const sansOle = STOCK.filter((a) => a.categorie !== 'ole');
    const { variables, fixes, imposes, manquants } = composer(sansOle, 1);

    assert.equal(variables.lipide, A.huile, 'sans elle, rien ne porterait les lipides');
    assert.equal(imposes.huile, undefined, 'elle cesse alors d\'être une quantité fixe');
    assert.equal(fixes.some((f) => f.aliment === A.huile), false);
    assert.deepEqual(manquants, []);
  });

  it('signale le lipide manquant quand ni huile ni oléagineux', () => {
    const { manquants } = composer([A.poulet, A.riz], 1);

    assert.deepEqual(manquants, ['lipide']);
  });

  it('signale les rôles qu\'il n\'a pas pu remplir', () => {
    const { variables, manquants } = composer([A.poulet, A.courgettes], 1);

    assert.equal(variables.proteine, A.poulet);
    assert.deepEqual(manquants, ['glucide', 'lipide']);
  });

  it('ignore les aliments sans rôle', () => {
    const { variables, fixes } = composer([{ ...A.riz, categorie: 'autre' as const }], 1);

    assert.deepEqual(variables, {});
    assert.deepEqual(fixes, []);
  });

  it('donne deux fois le même résultat pour le même stock', () => {
    assert.deepEqual(composer(STOCK, 1), composer(STOCK, 1));
  });

  /* Depuis que le laitage a son propre rôle, STOCK ne contient qu'UNE
     protéine : il en faut deux pour que la variété ait un sens. */
  it('évite de resservir ce qui a déjà servi dans la journée', () => {
    const varie = [...STOCK, A.thon];
    const premier = composer(varie, 1);
    const second = composer(varie, 1, new Set([premier.variables.proteine!.id]));

    assert.notEqual(second.variables.proteine!.id, premier.variables.proteine!.id);
  });

  it('resert le même aliment quand c\'est le seul du rôle', () => {
    const maigre = [A.poulet, A.riz, A.huile];
    const { variables } = composer(maigre, 1, new Set([A.poulet.id]));

    assert.equal(variables.proteine, A.poulet, 'une seule protéine : elle revient');
  });
});

describe('la composition alimente le solveur', () => {
  it('un repas composé automatiquement tombe sur ses cibles', () => {
    const { variables, fixes } = composer(STOCK, 1);
    const r = calculer(CIBLES.R2, variables, fixes);

    assert.equal(r.ok, true, r.diagnostics.map((d) => d.message).join(' · '));
  });

  it('les quantités suivent le nombre de portions', () => {
    const une = composer(STOCK, 1);
    const trois = composer(STOCK, 3);

    const r1 = calculer(CIBLES.R2, une.variables, une.fixes);
    const r3 = calculer(
      { kcal: CIBLES.R2.kcal * 3, prot: CIBLES.R2.prot * 3,
        gluc: CIBLES.R2.gluc * 3, lip: CIBLES.R2.lip * 3 },
      trois.variables, trois.fixes);

    const proteineDe = (r: typeof r1) =>
      r.quantites.find((q) => q.aliment.id === une.variables.proteine!.id)!.aCuire;

    const rapport = proteineDe(r3) / proteineDe(r1);
    assert.ok(Math.abs(rapport - 3) < 0.1, `trois portions ≈ trois fois : ${rapport}`);
  });

  it('calcule quand même avec un rôle manquant, et le dit', () => {
    const { variables, fixes, manquants } = composer([A.poulet, A.riz, A.courgettes], 1);
    const r = calculer(CIBLES.R2, variables, fixes);

    assert.deepEqual(manquants, ['lipide']);
    assert.ok(r.quantites.length > 0, 'le repas est calculé malgré le rôle manquant');
  });
});

