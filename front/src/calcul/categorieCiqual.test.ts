import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CATEGORIES } from './nutrition';
import { categorieDepuisCiqual } from './categorieCiqual';

/**
 * DU GROUPE CIQUAL VERS LA CATÉGORIE DU CALCULATEUR.
 *
 * Onze correspondances, écrites dans `app/migration-grocy.tsx` — donc
 * intestables. Ce qu'elles décident n'est pas cosmétique : la catégorie fixe
 * le RÔLE de l'aliment dans le calculateur, et `plausibilite.ts` s'en sert
 * pour juger un rendement cru/cuit. Une catégorie devinée de travers classe un
 * aliment dans le mauvais rôle, en silence.
 *
 * CE QUE L'ABSENCE DE TEST CACHAIT : `case '13000'` était du code MORT.
 * `sousgroupeCode.slice(0, 2)` rend deux caractères, jamais cinq, et `case '13'`
 * répondait déjà deux lignes plus haut. Personne ne pouvait le voir.
 *
 * Descendue le 20 septembre 2026 (palier 0).
 */

describe('la catégorie déduite d\'un groupe CIQUAL', () => {
  it('reconnaît les grandes familles', () => {
    assert.equal(categorieDepuisCiqual('0201'), 'prot');   // viandes, oeufs, poissons
    assert.equal(categorieDepuisCiqual('0302'), 'fec');    // produits céréaliers
    assert.equal(categorieDepuisCiqual('0401'), 'lait');   // laits et produits laitiers
    assert.equal(categorieDepuisCiqual('1301'), 'huile');  // huiles et graisses
    assert.equal(categorieDepuisCiqual('1501'), 'ole');    // fruits à coque
    assert.equal(categorieDepuisCiqual('2001'), 'leg');    // légumes
  });

  it('LE CODE MORT : un groupe ne fait JAMAIS cinq caractères', () => {
    /* `case '13000'` ne pouvait pas être atteint : on découpe deux caractères.
       Le garder donnait l'illusion d'une couverture supplémentaire. Ce test
       fige la vraie règle — seuls les deux premiers caractères comptent. */
    assert.equal(categorieDepuisCiqual('13000'), categorieDepuisCiqual('13'));
    assert.equal(categorieDepuisCiqual('13999'), 'huile');
  });

  it('CE QU\'ON NE SAIT PAS RESTE VIDE', () => {
    /* La règle 6 : vide veut dire « je ne sais pas ». Répondre « autre » pour
       un groupe inconnu ferait passer l'aliment en silence, avec un rôle que
       personne n'a choisi — et l'écran n'attendrait plus la saisie. */
    assert.equal(categorieDepuisCiqual('99'), '');
    assert.equal(categorieDepuisCiqual(''), '');
    assert.equal(categorieDepuisCiqual('7'), '');
  });

  it('LE TÉMOIN : tout ce qu\'elle rend est une VRAIE catégorie', () => {
    /* Sans ce cas, une faute de frappe — « prot » écrit « prots » — passerait
       le typage (la fonction rendait `string`) et se ferait refuser par le
       serveur avec un 422 opaque, une fois la saisie terminée. */
    const groupes = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));

    for (const g of groupes) {
      const c = categorieDepuisCiqual(g);

      assert.ok(c === '' || CATEGORIES.some((k) => k.cle === c),
        `« ${g} » rend « ${c} », qui n'est pas une catégorie connue`);
    }
  });
});
