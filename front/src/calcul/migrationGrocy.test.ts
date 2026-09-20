import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { avancementMigration, restantsAMigrer } from './migrationGrocy';

/**
 * LE DÉFAUT VÉCU EN MIGRATION RÉELLE, le 20 septembre 2026.
 *
 * L'écran annonçait « 62 sur 62 aliments sont passés dans la base » et gardait
 * quand même « Oasis sorbet » dans la liste à traiter. Le produit avait été
 * rempli, il revenait — et il serait revenu à chaque fois.
 *
 *     nom dans Grocy : 'Oasis sorbet '   (13 caractères, espace finale)
 *     nom en base    : 'Oasis sorbet'    (12 — le serveur fait trim())
 *
 * Deux défauts en un : la comparaison ignorait le `trim()` du serveur, et le
 * compteur additionnait des lignes de la base au lieu de compter les
 * correspondances. Les deux nombres étaient justes séparément ; c'est leur
 * rapprochement qui mentait.
 */

const grocy = (...noms: string[]) => noms.map((nom) => ({ nom }));

describe('ce qu\'il reste à migrer', () => {
  it('une espace finale ne fait pas revenir un produit déjà fait', () => {
    /* LE CAS RÉEL, à l'octet près. */
    const restants = restantsAMigrer(grocy('Oasis sorbet ', 'Coca'), ['Oasis sorbet']);

    assert.deepEqual(restants.map((a) => a.nom), ['Coca']);
  });

  it('et une espace en base non plus, dans l\'autre sens', () => {
    assert.deepEqual(restantsAMigrer(grocy('Coca'), [' Coca']), []);
  });

  it('LE TÉMOIN : deux produits réellement différents le restent', () => {
    /* Sans ce cas, normaliser trop fort passerait le test ci-dessus tout en
       faisant disparaître des produits jamais migrés. On ne touche NI à la
       casse NI aux accents : « Sel » et « sel » sont deux lignes chez qui les
       a créées ainsi, et les confondre en perdrait une. */
    assert.equal(restantsAMigrer(grocy('Sel', 'sel'), ['Sel']).length, 1);
    assert.equal(restantsAMigrer(grocy('Pâtes'), ['Pates']).length, 1);
  });

  it('garde l\'ordre d\'origine', () => {
    /* La liste se lit du haut vers le bas pendant une soirée. La voir se
       réordonner à chaque enregistrement ferait perdre sa place. */
    const restants = restantsAMigrer(grocy('A', 'B', 'C'), ['B']);

    assert.deepEqual(restants.map((a) => a.nom), ['A', 'C']);
  });
});

describe('l\'avancement affiché', () => {
  it('compte les CORRESPONDANCES, pas les lignes de la base', () => {
    /* C'est le « 62 sur 62 » qui mentait. Le catalogue du compte peut porter
       des aliments créés à la main, qui n'ont jamais été dans Grocy : les
       compter comme migrés annonce une fin qui n'est pas arrivée. */
    const avancement = avancementMigration(
      grocy('Coca', 'Oasis sorbet '),
      ['Coca', 'Riz maison', 'Poulet maison'],
    );

    assert.deepEqual(avancement, { faits: 1, total: 2 });
  });

  it('dit 2 sur 2 quand c\'est vraiment fini', () => {
    assert.deepEqual(
      avancementMigration(grocy('Coca', 'Oasis sorbet '), ['Coca', 'Oasis sorbet']),
      { faits: 2, total: 2 });
  });

  it('ne divise rien par zéro sur un frigo vide', () => {
    assert.deepEqual(avancementMigration([], []), { faits: 0, total: 0 });
  });
});
