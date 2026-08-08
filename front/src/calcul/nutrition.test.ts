import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  KCAL_MAX_100G, KJ_PAR_KCAL, controler, ratioDepuisPesees, soupconKilojoules,
} from './nutrition';

describe('cohérence des macros', () => {
  it('accepte des valeurs qui tombent juste', () => {
    // 25 prot, 5 gluc, 2 fibres, 3 lip -> 100 + 20 + 4 + 27 = 151
    const r = controler({ kcal: 151, prot: 25, gluc: 5, fibres: 2, lip: 3 });
    assert.equal(r.verdict, 'coherent');
    assert.equal(r.calculees, 151);
  });

  it('compte les fibres à 2 kcal, séparément des glucides', () => {
    const sans = controler({ kcal: 100, prot: 0, gluc: 10, fibres: 0, lip: 0 });
    const avec = controler({ kcal: 100, prot: 0, gluc: 10, fibres: 10, lip: 0 });

    assert.equal(sans.calculees, 40);
    assert.equal(avec.calculees, 60, '10 g de fibres ajoutent 20 kcal, pas 40');
  });

  it('ne tranche pas sans calories annoncées', () => {
    const r = controler({ kcal: 0, prot: 20, gluc: 0, fibres: 0, lip: 0 });
    assert.equal(r.verdict, 'indecidable');
    assert.equal(r.calculees, 80);
  });

  /* Le cas qui a motivé la tolérance élargie : sans fibres renseignées, le
     calcul sous-estime toujours un aliment qui en contient. */
  it('ne crie pas au loup sur un écart négatif quand les fibres manquent', () => {
    const r = controler({ kcal: 100, prot: 0, gluc: 10, lip: 0, fibres: null });
    assert.equal(r.verdict, 'ecart');
    assert.match(r.message, /fibres/);
  });

  it('signale une incohérence franche', () => {
    // macros pour 400 kcal annoncées 100 : +300 %
    const r = controler({ kcal: 100, prot: 100, gluc: 0, fibres: 0, lip: 0 });
    assert.equal(r.verdict, 'incoherent');
    assert.ok(r.ecart > 30);
  });
});

describe('détection des kilojoules', () => {
  it('attrape par le plafond, même sans macros exploitables', () => {
    const r = soupconKilojoules({ kcal: 1473, prot: 0, gluc: 0, lip: 0, fibres: 0 });
    assert.ok(r !== null);
    assert.equal(r.motif, 'plafond');
    assert.equal(r.converti, 352.1);
  });

  it('attrape par le rapport aux macros, sous le plafond', () => {
    // 50 kcal réelles saisies en kJ -> 209
    const vraies = { prot: 2, gluc: 8, lip: 0.7, fibres: 1 };
    const kcal = 4 * 2 + 4 * 8 + 2 * 1 + 9 * 0.7; // 48.3
    const r = soupconKilojoules({ ...vraies, kcal: kcal * KJ_PAR_KCAL });

    assert.ok(r !== null, 'le plafond seul ne suffirait pas ici');
    assert.equal(r.motif, 'rapport');
    assert.ok(Math.abs(r.converti - kcal) < 0.2);
  });

  it('laisse passer un aliment cohérent', () => {
    assert.equal(
      soupconKilojoules({ kcal: 151, prot: 25, gluc: 5, fibres: 2, lip: 3 }),
      null);
  });

  /* Une saisie fausse mais pas d'un facteur 4,184 ne doit pas se voir
     proposer une conversion : elle aggraverait l'erreur. */
  it('ne propose rien sur une erreur de saisie ordinaire', () => {
    assert.equal(
      soupconKilojoules({ kcal: 300, prot: 25, gluc: 5, fibres: 2, lip: 3 }),
      null);
  });

  it('reste muet sur des calories nulles ou négatives', () => {
    assert.equal(soupconKilojoules({ kcal: 0, prot: 1, gluc: 1, lip: 1 }), null);
    assert.equal(soupconKilojoules({ kcal: -10, prot: 1, gluc: 1, lip: 1 }), null);
  });

  /* La faille assumée, écrite noir sur blanc : sans macros et sous le
     plafond, rien ne peut détecter des kJ. Si ce test se met à échouer,
     c'est qu'une troisième détection est apparue — tant mieux, mais il
     faudra le savoir. */
  it('rate un aliment peu calorique saisi sans macros', () => {
    const r = soupconKilojoules({ kcal: 209, prot: 0, gluc: 0, lip: 0, fibres: 0 });
    assert.equal(r, null);
    assert.ok(209 < KCAL_MAX_100G);
  });
});

describe('ratio depuis deux pesées', () => {
  it('arrondit au centième', () => {
    assert.equal(ratioDepuisPesees(100, 230), 2.3);
    assert.equal(ratioDepuisPesees(350, 187), 0.53);
  });

  it('refuse une pesée absente ou nulle', () => {
    assert.equal(ratioDepuisPesees(0, 230), null);
    assert.equal(ratioDepuisPesees(100, 0), null);
  });
});
