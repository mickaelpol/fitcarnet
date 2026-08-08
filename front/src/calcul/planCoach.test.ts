import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type PlanAmericain, convertir, fibresDouteuses } from './planCoach';

/** Le plan réel, recopié tel qu'il est imprimé. */
const PLAN: Record<string, PlanAmericain> = {
  R1: { kcal: 578.6, prot: 26.8, glucides: 64.7, lipides: 25.9, fibres: 3.5 },
  R2: { kcal: 661.9, prot: 42.8, glucides: 61.8, lipides: 25.8, fibres: 8.3 },
  R3: { kcal: 591.7, prot: 57.2, glucides: 51.7, lipides: 16.4, fibres: 0 },
  R4: { kcal: 551.8, prot: 30.1, glucides: 80.2, lipides: 15.4, fibres: 2.3 },
};

describe('conversion d\'un plan américain', () => {
  it('retranche les fibres des glucides, et rien d\'autre', () => {
    const c = convertir(PLAN.R2!);

    assert.equal(c.gluc, 53.5, '61,8 g dont 8,3 de fibres');
    assert.equal(c.prot, 42.8, 'les protéines ne bougent pas');
    assert.equal(c.lip, 25.8, 'les lipides non plus');
    assert.equal(c.fibres, 8.3);
  });

  it('ne touche à rien quand le plan n\'annonce aucune fibre', () => {
    const c = convertir(PLAN.R3!);
    assert.equal(c.gluc, 51.7);
  });

  it('recalcule les calories à l\'européenne, fibres à 2 kcal', () => {
    const c = convertir(PLAN.R2!);
    // 4×42,8 + 4×53,5 + 2×8,3 + 9×25,8
    assert.equal(c.kcal, 634);
    assert.equal(c.kcalAnnoncees, 662, 'ce que le plan disait, gardé pour comparaison');
  });

  it('convertit les quatre repas du plan réel', () => {
    assert.deepEqual(
      (['R1', 'R2', 'R3', 'R4'] as const).map((r) => convertir(PLAN[r]!).gluc),
      [61.2, 53.5, 51.7, 77.9]);
  });

  /* Retrancher plus de fibres qu'il n'y a de glucides n'a pas de sens : dans
     cette convention, les fibres SONT une part des glucides. */
  it('ne produit jamais de glucide négatif', () => {
    const c = convertir({ kcal: 100, prot: 5, glucides: 10, lipides: 2, fibres: 25 });
    assert.equal(c.gluc, 0);
  });

  it('supporte un plan déjà sans fibres', () => {
    const c = convertir({ kcal: 300, prot: 20, glucides: 30, lipides: 10, fibres: 0 });
    assert.equal(c.gluc, 30);
    assert.equal(c.kcal, 4 * 20 + 4 * 30 + 9 * 10);
  });
});

describe('fibres douteuses', () => {
  /* Le cas réel : 0 g de fibres annoncé pour un repas de 200 g de haricots
     verts et 300 g de patates douces. Ce n'est pas une valeur, c'est un
     champ vide. */
  it('signale un repas glucidique sans fibres', () => {
    assert.equal(fibresDouteuses(PLAN.R3!), true, '51,7 g de glucides et 0 fibre');
  });

  it('signale aussi le dîner, à peine mieux renseigné', () => {
    assert.equal(fibresDouteuses(PLAN.R4!), true, '80,2 g de glucides et 2,3 de fibres');
  });

  /* Vérifié aliment par aliment : 80 g de farine d'avoine, 55 g de fraises
     et 20 g d'amandes font environ 10 g de fibres, pas 3,5. */
  it('signale le petit-déjeuner, sous-estimé lui aussi', () => {
    assert.equal(fibresDouteuses(PLAN.R1!), true, '64,7 g de glucides et 3,5 de fibres');
  });

  it('ne dit rien quand les fibres sont plausibles', () => {
    assert.equal(fibresDouteuses(PLAN.R2!), false, '61,8 g de glucides et 8,3 de fibres');
  });

  /* Trois repas sur quatre : ce plan n'a pas compté ses fibres. */
  it('en signale trois sur les quatre du plan réel', () => {
    const signales = (['R1', 'R2', 'R3', 'R4'] as const)
      .filter((r) => fibresDouteuses(PLAN[r]!));

    assert.deepEqual(signales, ['R1', 'R3', 'R4']);
  });

  it('ne s\'alarme pas sur un repas sans glucides', () => {
    assert.equal(
      fibresDouteuses({ kcal: 300, prot: 50, glucides: 2, lipides: 10, fibres: 0 }),
      false, 'un steak n\'a pas à contenir de fibres');
  });
});
