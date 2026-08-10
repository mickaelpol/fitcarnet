import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { resoudre, arrondir } from './algebre';
import { calculer, convertir, pourObtenirCuit, versReference } from './solveur';
import { A, CIBLES } from './aliments.test-data';
import type { Fixe } from './types';

const q = (r: ReturnType<typeof calculer>, nom: string) =>
  r.quantites.find((x) => x.aliment.nom === nom);

describe('algèbre', () => {
  it('résout un système simple', () => {
    const x = resoudre([[2, 1], [1, 3]], [5, 10]);
    assert.ok(x);
    assert.ok(Math.abs(x![0] - 1) < 1e-9);
    assert.ok(Math.abs(x![1] - 3) < 1e-9);
  });

  it('détecte un système singulier', () => {
    assert.equal(resoudre([[1, 2], [2, 4]], [3, 6]), null);
  });

  it('gère le pivot partiel (premier coefficient nul)', () => {
    const x = resoudre([[0, 1], [1, 0]], [2, 3]);
    assert.ok(x);
    assert.ok(Math.abs(x![0] - 3) < 1e-9 && Math.abs(x![1] - 2) < 1e-9);
  });

  it('arrondit au pas demandé', () => {
    assert.equal(arrondir(12.3, 5), 10);
    assert.equal(arrondir(12.6, 5), 15);
    assert.equal(arrondir(12.3, 0.5), 12.5);
    assert.equal(arrondir(12.34, 0), 12.34);
  });
});

describe('déjeuner : cas nominal', () => {
  const fixes: Fixe[] = [
    { aliment: A.haricots, grammes: 180 },
    { aliment: A.concombre, grammes: 100 },
    { aliment: A.huile, grammes: 6 },
  ];
  const r = calculer(CIBLES.R2, { proteine: A.saumon, glucide: A.patateDouce, lipide: A.amandes }, fixes);

  it('atteint les cibles', () => {
    assert.equal(r.ok, true, JSON.stringify(r.ecarts));
  });

  it('donne des quantités réalistes', () => {
    const saumon = q(r, 'Saumon')!;
    assert.ok(saumon.aCuire > 120 && saumon.aCuire < 260, `saumon ${saumon.aCuire}`);
    const pd = q(r, 'Patate douce')!;
    assert.ok(pd.assiette > 100 && pd.assiette < 400, `patate douce ${pd.assiette}`);
  });

  it('convertit le cru en cuit pour la protéine', () => {
    const s = q(r, 'Saumon')!;
    assert.ok(Math.abs(s.assiette - s.aCuire * 0.85) < 0.01);
  });
});

describe('conversions cru / cuit / sec', () => {
  const r = calculer(CIBLES.R4, { proteine: A.poulet, glucide: A.riz, lipide: A.amandes },
    [{ aliment: A.haricots, grammes: 200 }, { aliment: A.huile, grammes: 2 }]);

  it('le riz est affiché en grammes secs', () => {
    const riz = q(r, 'Riz basmati')!;
    assert.ok(Math.abs(riz.aCuire - riz.assiette / 3) < 0.01,
      `sec ${riz.aCuire} / cuit ${riz.assiette}`);
    assert.ok(riz.aCuire < riz.assiette);
  });

  it('le poulet perd 25 % à la cuisson', () => {
    const p = q(r, 'Blanc de poulet')!;
    assert.ok(Math.abs(p.assiette - p.aCuire * 0.75) < 0.01);
  });

  it('un légume ne change pas de poids', () => {
    const h = q(r, 'Haricots verts')!;
    assert.equal(h.aCuire, h.assiette);
  });
});

describe('protéine trop grasse : cible inatteignable', () => {
  // 60 g de protéines avec du saumon : les lipides explosent quoi qu'on fasse
  const r = calculer({ ...CIBLES.R2, prot: 60 },
    { proteine: A.saumon, glucide: A.patateDouce, lipide: A.amandes },
    [{ aliment: A.haricots, grammes: 180 }, { aliment: A.huile, grammes: 6 }]);

  it('signale le blocage', () => {
    assert.equal(r.ok, false);
    assert.ok(r.diagnostics.some((d) => d.code === 'lipides_incompressibles'),
      JSON.stringify(r.diagnostics));
  });

  it('supprime les oléagineux plutôt que d’en mettre une quantité négative', () => {
    assert.equal(q(r, 'Amandes'), undefined);
  });

  it('atteint quand même protéines et glucides', () => {
    assert.ok(Math.abs(r.ecarts.prot) <= 1.5, `prot ${r.ecarts.prot}`);
    assert.ok(Math.abs(r.ecarts.gluc) <= 2.5, `gluc ${r.ecarts.gluc}`);
  });

  it('explique quoi faire', () => {
    const d = r.diagnostics.find((x) => x.code === 'lipides_incompressibles')!;
    assert.match(d.message, /plus maigre/);
  });
});

describe('les macros affichées correspondent aux quantités pesées', () => {
  it('recalcule après arrondi, pas avant', () => {
    const r = calculer(CIBLES.R2, { proteine: A.truite, glucide: A.quinoa, lipide: A.noix },
      [{ aliment: A.courgettes, grammes: 180 }, { aliment: A.huile, grammes: 6 }]);

    // on recompose les macros à la main depuis les quantités annoncées
    let kcal = 0, prot = 0, gluc = 0, lip = 0;
    for (const x of r.quantites) {
      const ref = x.aliment.etatReference === 'cru' ? x.aCuire : x.assiette;
      kcal += (x.aliment.kcal100 * ref) / 100;
      prot += (x.aliment.prot100 * ref) / 100;
      gluc += (x.aliment.gluc100 * ref) / 100;
      lip += (x.aliment.lip100 * ref) / 100;
    }
    assert.ok(Math.abs(kcal - r.macros.kcal) < 0.5, `kcal ${kcal} vs ${r.macros.kcal}`);
    assert.ok(Math.abs(prot - r.macros.prot) < 0.05);
    assert.ok(Math.abs(gluc - r.macros.gluc) < 0.05);
    assert.ok(Math.abs(lip - r.macros.lip) < 0.05);
  });

  it('respecte les pas d’arrondi demandés', () => {
    const r = calculer(CIBLES.R2, { proteine: A.saumon, glucide: A.patateDouce, lipide: A.amandes },
      [{ aliment: A.haricots, grammes: 180 }], { arrondi: { proteine: 5, glucide: 10, lipide: 1 } });
    const saumon = q(r, 'Saumon')!;
    assert.equal(saumon.aCuire % 5, 0, `saumon ${saumon.aCuire}`);
    const pd = q(r, 'Patate douce')!;
    assert.equal(pd.assiette % 10, 0, `patate douce ${pd.assiette}`);
  });
});

describe('quantité imposée (reste à écouler)', () => {
  it('complète avec un second féculent', () => {
    // 180 g de riz cuit imposés, la patate douce complète les glucides
    const r = calculer(CIBLES.R4, { proteine: A.poulet, glucide: A.patateDouce, lipide: A.amandes },
      [
        { aliment: A.riz, grammes: 180 },
        { aliment: A.haricots, grammes: 200 },
        { aliment: A.huile, grammes: 2 },
      ]);
    assert.equal(r.ok, true, JSON.stringify(r.ecarts));
    const riz = q(r, 'Riz basmati')!;
    assert.equal(riz.assiette, 180);
    assert.equal(riz.aCuire, 60);
    assert.ok(q(r, 'Patate douce')!.assiette > 0);
  });

  it('signale quand la quantité imposée sature déjà les glucides', () => {
    const r = calculer(CIBLES.R4, { proteine: A.poulet, glucide: A.patateDouce, lipide: A.amandes },
      [{ aliment: A.riz, grammes: 600 }, { aliment: A.haricots, grammes: 200 }]);
    assert.equal(r.ok, false);
    assert.ok(r.diagnostics.some((d) => d.code === 'glucides_hors_cible'));
    assert.equal(q(r, 'Patate douce'), undefined);
  });
});

describe('les quatre repas du plan', () => {
  const cas = [
    ['matin', CIBLES.R1, { proteine: A.oeufs, glucide: A.avoine, lipide: A.amandes },
      [{ aliment: A.fraises, grammes: 55 }] as Fixe[]],
    ['midi', CIBLES.R2, { proteine: A.saumon, glucide: A.patateDouce, lipide: A.amandes },
      [{ aliment: A.haricots, grammes: 180 }, { aliment: A.concombre, grammes: 100 },
       { aliment: A.huile, grammes: 6 }] as Fixe[]],
    ['16 h', CIBLES.R3, { proteine: A.skyr, glucide: A.avoine, lipide: A.amandes },
      [{ aliment: A.blancs, grammes: 175 }, { aliment: A.banane, grammes: 83 }] as Fixe[]],
    ['soir', CIBLES.R4, { proteine: A.poulet, glucide: A.patateDouce, lipide: A.amandes },
      [{ aliment: A.haricots, grammes: 200 }, { aliment: A.huile, grammes: 2 }] as Fixe[]],
  ] as const;

  for (const [nom, cibles, variables, fixes] of cas) {
    it(`${nom} : macros atteintes`, () => {
      const r = calculer(cibles, variables, [...fixes]);
      assert.equal(r.ok, true,
        `${nom} → écarts ${JSON.stringify(r.ecarts)} / ${JSON.stringify(r.quantites.map((x) => [x.aliment.nom, x.assiette]))}`);
    });
  }
});

describe('robustesse', () => {
  it('refuse un trio d’aliments au profil identique', () => {
    const r = calculer(CIBLES.R2,
      { proteine: A.huile, glucide: A.huile, lipide: A.huile }, []);
    assert.equal(r.ok, false);
    assert.ok(r.diagnostics.some((d) => d.code === 'systeme_singulier'));
  });

  it('ne produit jamais de quantité négative', () => {
    const r = calculer({ kcal: 200, prot: 5, gluc: 5, lip: 2 },
      { proteine: A.saumon, glucide: A.patateDouce, lipide: A.amandes },
      [{ aliment: A.haricots, grammes: 400 }, { aliment: A.huile, grammes: 20 }]);
    for (const x of r.quantites) {
      assert.ok(x.assiette >= 0, `${x.aliment.nom} = ${x.assiette}`);
      assert.ok(x.aCuire >= 0);
    }
  });

  it('fonctionne sans aucun ingrédient imposé', () => {
    const r = calculer(CIBLES.R2,
      { proteine: A.poulet, glucide: A.riz, lipide: A.amandes }, []);
    assert.equal(r.ok, true, JSON.stringify(r.ecarts));
  });

  it('reste stable sur des cibles extrêmes', () => {
    const r = calculer({ kcal: 3000, prot: 200, gluc: 300, lip: 100 },
      { proteine: A.poulet, glucide: A.riz, lipide: A.amandes }, []);
    assert.ok(Number.isFinite(r.macros.kcal));
    for (const x of r.quantites) assert.ok(Number.isFinite(x.assiette));
  });
});

describe('propriété : sur 5 000 combinaisons aléatoires', () => {
  const prots = [A.saumon, A.truite, A.cabillaud, A.thon, A.poulet, A.boeuf5, A.oeufs, A.skyr];
  const fecs = [A.patateDouce, A.riz, A.quinoa, A.avoine];
  const oles = [A.amandes, A.noix];
  const legs = [A.haricots, A.courgettes, A.concombre];
  const cibles = [CIBLES.R1, CIBLES.R2, CIBLES.R3, CIBLES.R4];

  let atteintes = 0;
  let total = 0;
  const anomalies: string[] = [];

  // générateur déterministe : même suite à chaque exécution
  let graine = 12345;
  const alea = () => {
    graine = (graine * 1103515245 + 12345) % 2147483648;
    return graine / 2147483648;
  };
  const tire = <T>(t: readonly T[]): T => t[Math.floor(alea() * t.length)]!;

  for (let i = 0; i < 5000; i++) {
    const c = tire(cibles);
    const v = { proteine: tire(prots), glucide: tire(fecs), lipide: tire(oles) };
    const f: Fixe[] = [
      { aliment: tire(legs), grammes: Math.round(alea() * 250) },
      { aliment: A.huile, grammes: Math.round(alea() * 10) },
    ];
    const r = calculer(c, v, f);
    total++;
    if (r.ok) atteintes++;

    for (const x of r.quantites) {
      if (!Number.isFinite(x.assiette) || !Number.isFinite(x.aCuire)) {
        anomalies.push(`non fini : ${x.aliment.nom}`);
      }
      if (x.assiette < 0 || x.aCuire < 0) {
        anomalies.push(`négatif : ${x.aliment.nom} = ${x.assiette}`);
      }
    }
    if (!Number.isFinite(r.macros.kcal)) anomalies.push('macros non finies');
    // toute combinaison hors cible doit être expliquée
    if (!r.ok && r.diagnostics.length === 0) anomalies.push('écart sans diagnostic');
  }

  it('ne produit jamais de valeur invalide ni de négatif', () => {
    assert.equal(anomalies.length, 0, anomalies.slice(0, 5).join(' | '));
  });

  it('explique systématiquement les cas hors cible', () => {
    assert.equal(anomalies.filter((a) => a.includes('diagnostic')).length, 0);
  });

  it('atteint les cibles dans la grande majorité des cas', () => {
    const taux = (atteintes / total) * 100;
    console.log(`      → ${taux.toFixed(1)} % de combinaisons dans la tolérance (${atteintes}/${total})`);
    assert.ok(taux > 60, `taux trop faible : ${taux.toFixed(1)} %`);
  });
});

describe('LE CŒUR : écouler les restes, quels qu’ils soient', () => {
  it('100 g de riz CUIT restant : le reste du repas s’adapte', () => {
    const r = calculer(CIBLES.R4,
      { proteine: A.poulet, glucide: A.patateDouce, lipide: A.amandes },
      [
        { aliment: A.riz, grammes: 100, unite: 'cuit' },   // le reste du midi
        { aliment: A.haricots, grammes: 200 },
        { aliment: A.huile, grammes: 2 },
      ]);
    assert.equal(r.ok, true, JSON.stringify(r.ecarts));
    const riz = q(r, 'Riz basmati')!;
    assert.equal(riz.assiette, 100, 'les 100 g cuits sont respectés');
    assert.ok(Math.abs(riz.aCuire - 100 / 3) < 0.01, 'équivalent sec affiché');
    assert.equal(riz.impose, true);
  });

  it('90 g de saumon CUIT restant : converti en cru pour le calcul', () => {
    const r = calculer(CIBLES.R2,
      { proteine: A.poulet, glucide: A.patateDouce, lipide: A.amandes },
      [
        { aliment: A.saumon, grammes: 90, unite: 'cuit' },
        { aliment: A.haricots, grammes: 180 },
        { aliment: A.huile, grammes: 6 },
      ]);
    const saumon = q(r, 'Saumon')!;
    assert.equal(saumon.assiette, 90, 'assiette = ce qui reste');
    assert.ok(Math.abs(saumon.aCuire - 90 / 0.85) < 0.01, 'équivalent cru = 105,9 g');
    // les macros doivent compter le saumon sur son poids CRU (105,9 g), pas 90
    const attendu = (A.saumon.prot100 * (90 / 0.85)) / 100;
    assert.ok(r.macros.prot > attendu, 'le saumon est bien comptabilisé au poids cru');
  });

  it('150 g de brocolis cuits : un légume ne change pas de poids', () => {
    const r = calculer(CIBLES.R2,
      { proteine: A.saumon, glucide: A.patateDouce, lipide: A.amandes },
      [{ aliment: A.courgettes, grammes: 150, unite: 'cuit' }, { aliment: A.huile, grammes: 6 }]);
    const c = q(r, 'Courgettes')!;
    assert.equal(c.assiette, 150);
    assert.equal(c.aCuire, 150);
  });

  it('trois restes à la fois : le repas se recompose autour', () => {
    const r = calculer(CIBLES.R4,
      { proteine: A.poulet, glucide: A.patateDouce, lipide: A.amandes },
      [
        { aliment: A.riz, grammes: 100, unite: 'cuit' },
        { aliment: A.saumon, grammes: 40, unite: 'cuit' },
        { aliment: A.courgettes, grammes: 120, unite: 'cuit' },
        { aliment: A.huile, grammes: 2 },
      ]);
    assert.equal(r.ok, true, JSON.stringify(r.ecarts));
    assert.equal(q(r, 'Riz basmati')!.assiette, 100);
    assert.equal(q(r, 'Saumon')!.assiette, 40);
    assert.equal(q(r, 'Courgettes')!.assiette, 120);
  });

  it('quantité imposée saisie en CRU : équivalent cuit annoncé', () => {
    const r = calculer(CIBLES.R4,
      { proteine: A.poulet, glucide: A.patateDouce, lipide: A.amandes },
      [{ aliment: A.riz, grammes: 40, unite: 'cru' }, { aliment: A.haricots, grammes: 200 }]);
    const riz = q(r, 'Riz basmati')!;
    assert.equal(riz.aCuire, 40, '40 g secs à cuire');
    assert.equal(riz.assiette, 120, '→ 120 g dans l’assiette');
  });

  it('pourObtenirCuit donne la quantité à peser', () => {
    assert.ok(Math.abs(pourObtenirCuit(A.riz, 180) - 60) < 0.01);
    assert.ok(Math.abs(pourObtenirCuit(A.saumon, 153) - 180) < 0.5);
    assert.equal(pourObtenirCuit(A.haricots, 200), 200);
  });
});

describe('LE CŒUR : substituer un aliment ne change pas les macros', () => {
  const fixes: Fixe[] = [
    { aliment: A.haricots, grammes: 180 },
    { aliment: A.concombre, grammes: 100 },
    { aliment: A.huile, grammes: 6 },
  ];

  const proteines = [A.saumon, A.truite, A.cabillaud, A.thon, A.poulet, A.boeuf5];
  const feculents = [A.patateDouce, A.riz, A.quinoa];
  const oleagineux = [A.amandes, A.noix];

  it('toute combinaison protéine × féculent × oléagineux tombe sur les mêmes macros', () => {
    const echecs: string[] = [];
    for (const p of proteines) {
      for (const f of feculents) {
        for (const o of oleagineux) {
          const r = calculer(CIBLES.R2, { proteine: p, glucide: f, lipide: o }, fixes);
          if (!r.ok) {
            echecs.push(`${p.nom}/${f.nom}/${o.nom} → ${JSON.stringify(r.ecarts)}`);
            continue;
          }
          // les macros doivent être identiques d'une combinaison à l'autre
          assert.ok(Math.abs(r.macros.prot - CIBLES.R2.prot) <= 1.5);
          assert.ok(Math.abs(r.macros.gluc - CIBLES.R2.gluc) <= 2.5);
          assert.ok(Math.abs(r.macros.lip - CIBLES.R2.lip) <= 1.2);
        }
      }
    }
    console.log(`      → ${proteines.length * feculents.length * oleagineux.length - echecs.length}`
      + `/${proteines.length * feculents.length * oleagineux.length} combinaisons exactes`);
    // seuls les cas physiquement impossibles peuvent échouer, et ils sont expliqués
    assert.ok(echecs.length <= 2, echecs.join(' | '));
  });

  it('remplacer le féculent ajuste la protéine, pas seulement le féculent', () => {
    const avec = (f: typeof A.patateDouce) =>
      calculer(CIBLES.R2, { proteine: A.saumon, glucide: f, lipide: A.amandes }, fixes);
    const pd = avec(A.patateDouce);
    const qu = avec(A.quinoa);
    const saumonPd = q(pd, 'Saumon')!.aCuire;
    const saumonQu = q(qu, 'Saumon')!.aCuire;
    // le quinoa apporte 4,4 g de protéines / 100 g : le saumon doit BAISSER
    assert.ok(saumonQu < saumonPd,
      `saumon ${saumonQu} (quinoa) devrait être < ${saumonPd} (patate douce)`);
    assert.equal(pd.ok, true);
    assert.equal(qu.ok, true);
  });
});

describe('cibles incohérentes entre elles', () => {
  it('signale quand les kcal ne correspondent pas aux macros', () => {
    // 30 P + 80 G + 15 L = 435 + 135 = 575 kcal, pas 450
    const r = calculer({ kcal: 450, prot: 30, gluc: 80, lip: 15 },
      { proteine: A.poulet, glucide: A.riz, lipide: A.amandes },
      [{ aliment: A.haricots, grammes: 200 }]);
    const d = r.diagnostics.find((x) => x.code === 'cibles_incoherentes');
    assert.ok(d, JSON.stringify(r.diagnostics));
    assert.match(d!.message, /pas 450/);
  });

  it('les macros restent atteintes malgré l’incohérence', () => {
    const r = calculer({ kcal: 450, prot: 30, gluc: 80, lip: 15 },
      { proteine: A.poulet, glucide: A.riz, lipide: A.amandes },
      [{ aliment: A.haricots, grammes: 200 }]);
    assert.equal(r.ok, true, JSON.stringify(r.ecarts));
    assert.ok(Math.abs(r.ecarts.prot) <= 1.5);
    assert.ok(Math.abs(r.ecarts.gluc) <= 2.5);
    assert.ok(Math.abs(r.ecarts.lip) <= 1.2);
  });

  it('ne signale rien quand les cibles sont cohérentes', () => {
    const r = calculer({ kcal: 575, prot: 30, gluc: 80, lip: 15 },
      { proteine: A.poulet, glucide: A.riz, lipide: A.amandes },
      [{ aliment: A.haricots, grammes: 200 }]);
    assert.equal(r.diagnostics.some((x) => x.code === 'cibles_incoherentes'), false);
  });
});

describe('LE CŒUR : calculer même sans marge complète', () => {
  it('deux ajustables seulement : protéines et glucides tombent juste', () => {
    const r = calculer(CIBLES.R4,
      { proteine: A.poulet, glucide: A.patateDouce },   // pas d'oléagineux libre
      [{ aliment: A.haricots, grammes: 200 }, { aliment: A.huile, grammes: 2 }]);
    assert.ok(Math.abs(r.ecarts.prot) <= 1.5, `prot ${r.ecarts.prot}`);
    assert.ok(Math.abs(r.ecarts.gluc) <= 2.5, `gluc ${r.ecarts.gluc}`);
    // les lipides dérivent, et c'est annoncé
    assert.ok(r.diagnostics.some((d) => d.code === 'lipides_hors_cible'),
      JSON.stringify(r.diagnostics));
  });

  it('un seul ajustable : la macro correspondante tombe juste', () => {
    const r = calculer(CIBLES.R4, { proteine: A.poulet },
      [{ aliment: A.riz, grammes: 150, unite: 'cuit' }, { aliment: A.haricots, grammes: 200 }]);
    assert.ok(Math.abs(r.ecarts.prot) <= 1.5, `prot ${r.ecarts.prot}`);
    assert.ok(r.diagnostics.length > 0, 'les autres écarts sont expliqués');
  });

  it('rien d’ajustable : l’app dit quand même ce qui manque', () => {
    const r = calculer(CIBLES.R4, {},
      [
        { aliment: A.poulet, grammes: 60, unite: 'cuit' },
        { aliment: A.riz, grammes: 100, unite: 'cuit' },
        { aliment: A.haricots, grammes: 120 },
      ]);
    assert.equal(r.ok, false);
    assert.ok(r.diagnostics.some((d) => d.code === 'aucune_marge'));
    // les totaux sont calculés malgré tout
    assert.ok(r.macros.prot > 0 && r.macros.gluc > 0);
    assert.equal(r.quantites.length, 3);
    // et chaque écart est chiffré
    assert.ok(r.diagnostics.some((d) => /manque/.test(d.message)),
      r.diagnostics.map((d) => d.message).join(' | '));
  });

  it('trois restes partiels : chacun est complété', () => {
    const r = calculer(CIBLES.R4,
      { proteine: A.poulet, glucide: A.riz, lipide: A.amandes },
      [{ aliment: A.haricots, grammes: 120 }]);
    assert.equal(r.ok, true, JSON.stringify(r.ecarts));
    const poulet = r.quantites.find((x) => x.aliment.nom === 'Blanc de poulet')!;
    const riz = r.quantites.find((x) => x.aliment.nom === 'Riz basmati')!;
    assert.ok(poulet.aCuire > 0 && riz.aCuire > 0);
  });
});

describe('un aliment ajustable devenu inutile', () => {
  it('signale quand sa quantité tombe à presque rien', () => {
    /* Le bœuf couvre presque toutes les protéines du soir : il ne reste au
       thon que quelques grammes, qui ne veulent plus rien dire dans une
       assiette. Le chiffre a bougé le jour où les haricots verts sont passés
       aux glucides EUROPÉENS — 4,1 g au lieu de 7, les fibres à part — ce qui
       laissait plus de place au féculent et poussait le thon dans le négatif
       au lieu du négligeable. Le cas testé n'a pas changé, son réglage si. */
    const r = calculer({ kcal: 551.8, prot: 30.1, gluc: 80.3, lip: 15.4 },
      { proteine: A.thon, glucide: A.patateDouce, lipide: A.amandes },
      [
        { aliment: A.boeuf5, grammes: 46, unite: 'cuit' },
        { aliment: A.haricots, grammes: 200 },
        { aliment: A.huile, grammes: 2 },
      ]);
    const d = r.diagnostics.find((x) => x.code === 'apport_negligeable');
    assert.ok(d, r.diagnostics.map((x) => x.code).join(','));
    assert.match(d!.message, /Thon/);
    assert.match(d!.message, /Retire-le/);
    assert.equal(r.ok, true, 'les macros restent atteintes');
  });

  it('ne dit rien quand chaque aliment pèse vraiment', () => {
    // protéine maigre : les trois quantités sont substantielles
    const r = calculer(CIBLES.R4, { proteine: A.poulet, glucide: A.patateDouce, lipide: A.amandes },
      [{ aliment: A.haricots, grammes: 200 }, { aliment: A.huile, grammes: 2 }]);
    assert.equal(r.diagnostics.some((d) => d.code === 'apport_negligeable'), false,
      r.quantites.map((x) => `${x.aliment.nom} ${x.assiette.toFixed(0)}`).join(' | '));
  });

  it('révèle un cas de fond : une protéine grasse chasse les oléagineux', () => {
    // le saumon apporte tant de gras que les amandes n'ont plus de place
    const r = calculer(CIBLES.R2, { proteine: A.saumon, glucide: A.patateDouce, lipide: A.amandes },
      [{ aliment: A.haricots, grammes: 180 }, { aliment: A.huile, grammes: 6 }]);
    assert.ok(r.diagnostics.some((d) => d.code === 'apport_negligeable'),
      'l\'app doit prévenir que les amandes ne servent plus à rien');
    assert.equal(r.ok, true, 'les macros restent atteintes');
  });
});

describe('cible exprimée en glucides TOTAUX', () => {
  /* Un plan nord-américain écrit « 60 g de glucides » en y comprenant les
     fibres. Les données de l'app, elles, sont européennes : fibres à part. */
  const rizFibre = { ...A.riz, fibres100: 3 };
  const legumeFibre = { ...A.courgettes, fibres100: 2 };
  const cibles = { kcal: 600, prot: 40, gluc: 60, lip: 20 };

  it('ne change rien quand l\'aliment n\'a pas de fibres connues', () => {
    const sans = calculer(cibles, { proteine: A.poulet, glucide: A.riz, lipide: A.amandes });
    const avec = calculer(
      cibles, { proteine: A.poulet, glucide: A.riz, lipide: A.amandes },
      [], { glucidesTotaux: true });

    assert.deepEqual(avec.quantites.map((q) => q.aCuire), sans.quantites.map((q) => q.aCuire));
  });

  it('met MOINS de féculent quand la cible comprend les fibres', () => {
    const variables = { proteine: A.poulet, glucide: rizFibre, lipide: A.amandes };
    const europeen = calculer(cibles, variables);
    const totaux = calculer(cibles, variables, [], { glucidesTotaux: true });

    const riz = (r: typeof europeen) =>
      r.quantites.find((q) => q.aliment.id === rizFibre.id)!.aCuire;

    assert.ok(riz(totaux) < riz(europeen),
      `${riz(totaux)} devrait être inférieur à ${riz(europeen)}`);
  });

  /* Le point qui compte : glucides + fibres tombent sur la cible. */
  it('atteint la cible en glucides + fibres', () => {
    const variables = { proteine: A.poulet, glucide: rizFibre, lipide: A.amandes };
    const r = calculer(cibles, variables, [], { glucidesTotaux: true });

    const totalAvecFibres = r.quantites.reduce((n, q) => {
      const ref = versReference(q.aliment, q.aCuire, 'cru');
      const a = q.aliment as typeof rizFibre;

      return n + ((a.gluc100 + (a.fibres100 ?? 0)) * ref) / 100;
    }, 0);

    assert.ok(Math.abs(totalAvecFibres - cibles.gluc) < 2.5,
      `${totalAvecFibres.toFixed(1)} g pour une cible de ${cibles.gluc} g`);
  });

  it('compte aussi les fibres des quantités imposées', () => {
    const variables = { proteine: A.poulet, glucide: rizFibre, lipide: A.amandes };
    const fixes = [{ aliment: legumeFibre, grammes: 200, unite: 'cuit' as const }];

    const riz = (totaux: boolean) => calculer(cibles, variables, fixes, { glucidesTotaux: totaux })
      .quantites.find((q) => q.aliment.id === rizFibre.id)!.aCuire;

    assert.ok(riz(true) < riz(false),
      'les 4 g de fibres du légume comptent dans la cible et laissent moins de place au riz');
  });
});

describe('etat de reference : ce qu on pese vs ce qu on sert', () => {
  /* Le bug qui a failli faire manger 165 g de glucides au lieu de 73.
     Les macros d'un feculent valent pour son etat CUIT : 100 g de riz cuit
     portent 33 g de glucides. Les lire comme si elles valaient pour du riz
     SEC multiplie tout par le ratio de cuisson. */
  const rizCuit = {
    id: 'riz', nom: 'Riz basmati', categorie: 'fec' as const,
    kcal100: 155, prot100: 3.1, gluc100: 33.2, lip100: 0.7,
    ratio: 2.26, etatReference: 'cuit' as const,
  };

  it('pese le riz SEC et le sert cuit', () => {
    const { aCuire, assiette } = convertir(rizCuit, 220);

    assert.ok(Math.abs(aCuire - 97) < 1, `${aCuire} g secs pour 220 g cuits`);
    assert.equal(assiette, 220, 'l assiette porte bien les 220 g qui font 73 g de glucides');
  });

  it('donne les grammes a peser pour la cible', () => {
    const r = calculer(
      { kcal: 340, prot: 7, gluc: 73, lip: 1.5 },
      { glucide: rizCuit });

    const q = r.quantites.find((x) => x.aliment.id === 'riz')!;
    assert.ok(q.aCuire < q.assiette, 'un feculent pese moins sec que cuit');
    assert.ok(Math.abs(q.aCuire - 97) < 5, `${q.aCuire} g a peser, environ 97 attendus`);
  });

  /* La protéine fait l'inverse : on pese le cru, l'assiette pese moins. */
  it('pese la viande CRUE et en sert moins', () => {
    const { aCuire, assiette } = convertir(A.poulet, 150);

    assert.equal(aCuire, 150, 'on pese 150 g de poulet cru');
    assert.ok(assiette < aCuire, 'il en reste moins apres cuisson');
  });
});
