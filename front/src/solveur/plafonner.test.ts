import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { A, CIBLES, STOCK } from './aliments.test-data';
import { composer } from './composer';
import { ajusterAuStock } from './plafonner';
import type { Aliment } from './types';

describe('le stock fait la loi', () => {
  const cibles = CIBLES.R2;
  const illimite = () => 100000;

  it('ne touche à rien quand tout tient dans le stock', () => {
    const depart = composer(STOCK, 1);
    const a = ajusterAuStock(depart, cibles, illimite, STOCK);

    assert.deepEqual(a.plafonnes, []);
    assert.deepEqual(a.variables, depart.variables);
  });

  /* Le cas rapporté : le solveur réclamait plus de saumon qu'il n'y en avait. */
  it('plafonne l\'aliment qui déborde et confie le reste à un autre', () => {
    const stock = [A.saumon, A.poulet, A.riz, A.amandes, A.courgettes];
    const dispo = (x: { id: number | string }) => (x.id === A.saumon.id ? 120 : 100000);

    const a = ajusterAuStock(composer(stock, 1), cibles, dispo, stock);

    assert.equal(a.plafonnes.length, 1);
    assert.equal(a.plafonnes[0]!.aliment, A.saumon);
    assert.equal(a.plafonnes[0]!.grammes, 120);
    assert.equal(a.plafonnes[0]!.releve, A.poulet, 'le poulet porte le reste des protéines');
    assert.equal(a.variables.proteine, A.poulet);
    assert.ok(a.fixes.some((f) => f.aliment === A.saumon && f.grammes === 120));
  });

  it('tombe quand même sur les cibles après complément', () => {
    const stock = [A.saumon, A.poulet, A.riz, A.amandes, A.courgettes];
    const dispo = (x: { id: number | string }) => (x.id === A.saumon.id ? 120 : 100000);

    const a = ajusterAuStock(composer(stock, 1), cibles, dispo, stock);

    assert.equal(a.resultat.ok, true, a.resultat.diagnostics.map((d) => d.message).join(' · '));
  });

  it('ne sert jamais plus que ce qu\'on a', () => {
    const stock = [A.saumon, A.poulet, A.riz, A.amandes, A.courgettes];
    const plafonds: Record<string, number> = { [A.saumon.id]: 120, [A.poulet.id]: 150 };
    const dispo = (x: { id: number | string }) => plafonds[String(x.id)] ?? 100000;

    const a = ajusterAuStock(composer(stock, 1), cibles, dispo, stock);

    for (const q of a.resultat.quantites) {
      assert.ok(q.aCuire <= dispo(q.aliment) + 0.5,
        `${q.aliment.nom} : ${q.aCuire} g demandés pour ${dispo(q.aliment)} g en stock`);
    }
  });

  it('vaut pour les glucides comme pour les protéines', () => {
    const stock = [A.poulet, A.riz, A.quinoa, A.amandes];
    const dispo = (x: { id: number | string }) => (x.id === A.riz.id ? 30 : 100000);

    const a = ajusterAuStock(composer(stock, 1), cibles, dispo, stock);

    assert.equal(a.plafonnes[0]!.aliment, A.riz);
    assert.equal(a.variables.glucide, A.quinoa);
  });

  /* Sans relève, mieux vaut dire « je n'y arrive pas » que promettre un repas
     qu'on ne peut pas cuisiner. */
  it('renonce proprement quand plus personne ne peut prendre le relais', () => {
    const stock = [A.poulet, A.riz, A.amandes];
    const dispo = (x: { id: number | string }) => (x.id === A.poulet.id ? 50 : 100000);

    const a = ajusterAuStock(composer(stock, 1), cibles, dispo, stock);

    assert.equal(a.variables.proteine, undefined);
    assert.equal(a.plafonnes[0]!.releve, undefined);
    assert.ok(a.resultat.diagnostics.length > 0, 'le manque est annoncé');
  });

  /**
   * F7, 15 septembre 2026. LA SORTIE DE SECOURS RENDAIT UN PLAN INCUISINABLE
   * EN LE PRÉSENTANT COMME BON.
   *
   * La boucle est bornée à douze tours — « pour qu'un cas non prévu s'arrête
   * au lieu de figer l'écran ». Mais son `return` de fin rendait
   * `calculer(...)` SANS reconfronter le résultat au stock : la dernière
   * variable, celle qui n'avait pas eu le temps d'être plafonnée, sortait avec
   * la quantité que l'algèbre demandait, `ok: true` et zéro diagnostic.
   *
   * REPRODUIT, et c'est ce qui manquait au constat : treize protéines à 5 g
   * chacune. Chaque tour en consomme une et passe la main à la suivante ;
   * au douzième la borne tombe, et l'application affiche sereinement 32 g de
   * « Poulet 13 » quand il en reste 5. Un plan faux annoncé comme juste est
   * exactement ce que la règle 7 interdit.
   *
   * Conséquence utile en amont : `resoudreAuMieux` sort immédiatement sur
   * `base.resultat.ok`. Tant que ce plan se disait bon, aucune autre
   * combinaison n'était même essayée.
   */
  it('ne présente jamais comme valide un plan que le frigo ne peut pas fournir', () => {
    const miettes: Aliment[] = Array.from({ length: 15 }, (_, i) => ({
      id: `p${i + 1}`, nom: `Poulet ${i + 1}`, categorie: 'prot' as const,
      kcal100: 165, prot100: 31, gluc100: 0, lip100: 3.6, ratio: 1,
    }));
    const stock = [...miettes, A.riz, A.amandes];
    const dispo = (x: { id: number | string }) =>
      (String(x.id).startsWith('p') ? 5 : 100000);

    const a = ajusterAuStock(
      { variables: { proteine: miettes[0]!, glucide: A.riz, lipide: A.amandes }, fixes: [] },
      cibles, dispo, stock);

    assert.equal(a.plafonnes.length, 12, 'la borne des douze tours est bien atteinte');

    const trop = a.resultat.quantites.filter((q) => q.aCuire > dispo(q.aliment) + 0.5);
    assert.equal(trop.length, 1,
      'le dernier relais sort du frigo, faute de tour pour le plafonner');

    const d = a.resultat.diagnostics.find((x) => x.code === 'stock_insuffisant');
    assert.ok(d, `aucun blocage annoncé : ${JSON.stringify(a.resultat.diagnostics)}`);
    assert.equal(d!.gravite, 'blocage');
    assert.match(d!.message, /Poulet 13/);
    assert.equal(a.resultat.ok, false,
      'un repas qu\'on ne peut pas cuisiner n\'est pas un repas réussi');
  });

  it('enchaîne les relèves tant qu\'il en reste', () => {
    const stock = [A.saumon, A.truite, A.poulet, A.riz, A.amandes];
    const petits: Record<string, number> = {
      [A.saumon.id]: 80, [A.truite.id]: 80,
    };
    const dispo = (x: { id: number | string }) => petits[String(x.id)] ?? 100000;

    const a = ajusterAuStock(composer(stock, 1), cibles, dispo, stock);

    assert.equal(a.plafonnes.length, 2, 'saumon puis truite');
    assert.equal(a.variables.proteine, A.poulet);
    assert.equal(a.resultat.ok, true);
  });
});
