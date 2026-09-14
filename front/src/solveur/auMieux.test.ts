import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { A, CIBLES, STOCK } from './aliments.test-data';
import { resoudreAuMieux } from './auMieux';
import { composer } from './composer';
import { ajusterAuStock } from './plafonner';
import type { Resultat } from './types';

describe('le calculateur se débrouille seul', () => {
  const illimite = () => 100000;

  it('ne change rien quand la combinaison tombe déjà juste', () => {
    const depart = composer(STOCK, 1);
    const r = resoudreAuMieux(depart, CIBLES.R2, illimite, STOCK);

    assert.deepEqual(r.echanges, []);
    assert.equal(r.resultat.ok, true);
  });

  /* Le cas rapporté : une protéine grasse sature les lipides, l'oléagineux
     tombe à zéro, et l'utilisateur devait corriger à la main. */
  it('échange une protéine trop grasse contre une plus maigre', () => {
    const stock = [A.saumon, A.cabillaud, A.riz, A.amandes, A.courgettes];
    const cibles = { kcal: 500, prot: 45, gluc: 60, lip: 12 };

    const seul = ajusterAuStock(composer(stock, 1), cibles, illimite, stock);
    assert.equal(seul.resultat.ok, false, 'sans échange, le repas ne tombe pas juste');

    const r = resoudreAuMieux(composer(stock, 1), cibles, illimite, stock);

    assert.equal(r.echanges[0]?.role, 'proteine');
    assert.equal(r.echanges[0]?.mis, A.cabillaud, 'le plus maigre du stock');
    assert.ok(penaliteMoindre(r, seul), 'le repas est plus proche des cibles');
  });

  it('respecte ce que l\'utilisateur a choisi lui-même', () => {
    const stock = [A.saumon, A.cabillaud, A.riz, A.amandes, A.courgettes];
    const cibles = { kcal: 500, prot: 45, gluc: 60, lip: 12 };

    const r = resoudreAuMieux(
      composer(stock, 1), cibles, illimite, stock, new Set(['proteine' as const]));

    assert.equal(r.echanges.some((e) => e.role === 'proteine'), false,
      'la protéine verrouillée n\'est jamais remplacée dans le dos');
  });

  it('ne laisse jamais un résultat pire que celui de départ', () => {
    const stock = [A.poulet, A.riz, A.amandes, A.courgettes, A.huile];
    for (const cibles of [CIBLES.R1, CIBLES.R2, CIBLES.R3, CIBLES.R4]) {
      const depart = composer(stock, 1);
      const seul = ajusterAuStock(depart, cibles, illimite, stock);
      const r = resoudreAuMieux(depart, cibles, illimite, stock);

      assert.ok(!penaliteMoindre(seul, r), 'le meilleur des deux est retenu');
    }
  });
});

/** a est-il strictement plus proche des cibles que b ? */
function penaliteMoindre(
  a: { resultat: Resultat }, b: { resultat: Resultat },
): boolean {
  const p = (x: { resultat: Resultat }) => Math.abs(x.resultat.ecarts.prot)
    + Math.abs(x.resultat.ecarts.gluc) + Math.abs(x.resultat.ecarts.lip);

  return p(a) < p(b);
}
