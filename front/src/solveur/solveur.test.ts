import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { resoudre, arrondir } from './algebre';
/* Chemin RELATIF, et pas `@/calcul/nutrition` : `tsc -p tsconfig.tests.json`
   ne réécrit pas l'alias, et un `require('@/…')` casse dans `dist-tests/` au
   moment du `node --test`, pas au typage. */
import { kcalDesGrammes } from '../calcul/nutrition';
import {
  bornesDeCoherence, calculer, convertir, ecartDeCoherence, kcalDesMacros,
  pourObtenirCuit, versReference,
} from './solveur';
import { A, CIBLES } from './aliments.test-data';
import type { Fixe } from './types';

const q = (r: ReturnType<typeof calculer>, nom: string) =>
  r.quantites.find((x) => x.aliment.nom === nom);

describe('algèbre', () => {
  it('résout un système simple', () => {
    const x = resoudre([[2, 1], [1, 3]], [5, 10]);
    assert.ok(x);
    /* Les deux composantes sont AFFIRMÉES présentes, pas supposées : un `!`
       aurait comparé `undefined - 1` et rendu un test vert sur un vecteur
       tronqué (M13, 18 septembre 2026). */
    const [x0, x1] = x;
    assert.ok(x0 !== undefined && x1 !== undefined, 'solution tronquée');
    assert.ok(Math.abs(x0 - 1) < 1e-9);
    assert.ok(Math.abs(x1 - 3) < 1e-9);
  });

  it('détecte un système singulier', () => {
    assert.equal(resoudre([[1, 2], [2, 4]], [3, 6]), null);
  });

  it('gère le pivot partiel (premier coefficient nul)', () => {
    const x = resoudre([[0, 1], [1, 0]], [2, 3]);
    assert.ok(x);
    const [x0, x1] = x;
    assert.ok(x0 !== undefined && x1 !== undefined, 'solution tronquée');
    assert.ok(Math.abs(x0 - 3) < 1e-9 && Math.abs(x1 - 2) < 1e-9);
  });

  it('arrondit au pas demandé', () => {
    assert.equal(arrondir(12.3, 5), 10);
    assert.equal(arrondir(12.6, 5), 15);
    assert.equal(arrondir(12.3, 0.5), 12.5);
    assert.equal(arrondir(12.34, 0), 12.34);
  });

  /**
   * M4, corrigé le 15 septembre 2026. `EPSILON = 1e-10` était comparé en
   * valeur ABSOLUE à un pivot fait de macros pour 100 g — des coefficients qui
   * valent 0,07 ou 0,78, jamais 1e-10. Le garde-fou ne pouvait donc se
   * déclencher que sur des aliments STRICTEMENT identiques, c'est-à-dire
   * jamais dans le cas qu'annonce son propre message.
   *
   * Deux riz distants de 1,4 % donnaient un déterminant de 6,4e-4 — six ordres
   * de grandeur au-dessus du seuil — et `resoudre` rendait une « solution » de
   * −41 109 g / +41 094 g. Le rattrapage des négatifs cachait le chiffre, mais
   * l'explication affichée devenait fausse : « le reste apporte déjà tout ce
   * qu'il faut » alors que les protéines finissaient à 6,4 g pour 40 visés.
   *
   * Le seuil est désormais RELATIF à l'amplitude de la colonne d'origine, donc
   * sans unité : c'est la seule forme qui ait un sens quand les coefficients
   * sont des grammes pour 100 g.
   */
  describe('un pivot minuscule n’est pas un pivot nul (M4)', () => {
    /* Colonnes = aliments, lignes = protéines / glucides / lipides pour 1 g.
       Riz A 7,0/78,0/0,6 · riz B 7,1/78,2/0,62 · huile 0/0/100. */
    const DEUX_RIZ_JUMEAUX = [
      [0.070, 0.071, 0],
      [0.780, 0.782, 0],
      [0.006, 0.0062, 1],
    ];
    /* Les mêmes rôles, mais du riz blanc contre du riz COMPLET : 7,5 g de
       protéines, 76 g de glucides, 2,5 g de lipides. Deux aliments qu'on a le
       droit de départager — le seuil ne doit pas les refuser. */
    const BLANC_ET_COMPLET = [
      [0.070, 0.075, 0],
      [0.780, 0.760, 0],
      [0.006, 0.025, 1],
    ];
    const CIBLE = [40, 100, 20];

    it('refuse deux féculents que rien ne distingue vraiment', () => {
      assert.equal(resoudre(DEUX_RIZ_JUMEAUX, CIBLE), null,
        'le déterminant vaut 6,4e-4 : largement au-dessus de 1e-10, et pourtant '
          + 'la « solution » pesait ±41 kg de riz');
    });

    it('résout encore deux féculents réellement différents', () => {
      const x = resoudre(BLANC_ET_COMPLET, CIBLE);
      assert.ok(x, 'riz blanc contre riz complet reste un système légitime');
      /* et la solution est bien celle du système, pas un artefact */
      for (let i = 0; i < 3; i++) {
        const ligne = BLANC_ET_COMPLET[i];
        const cible = CIBLE[i];
        assert.ok(ligne !== undefined && cible !== undefined, `ligne ${i} absente`);
        const obtenu = ligne.reduce((s, c, j) => {
          const xj = x[j];
          assert.ok(xj !== undefined, `composante ${j} absente de la solution`);
          return s + c * xj;
        }, 0);
        assert.ok(Math.abs(obtenu - cible) < 1e-6);
      }
    });

    it('le verdict ne dépend pas de l’unité choisie', () => {
      /* Un seuil absolu n'est pas une propriété du système : il suffit de
         changer d'échelle pour changer de réponse. Exprimer les mêmes macros
         par milligramme déclarait singulier un système parfaitement sain. */
      const parMilliardieme = (M: number[][]): number[][] =>
        M.map((l) => l.map((v) => v * 1e-9));

      assert.ok(resoudre(parMilliardieme(BLANC_ET_COMPLET), CIBLE.map((v) => v * 1e-9)),
        'un système sain le reste quelle que soit l’unité');
      assert.equal(resoudre(parMilliardieme(DEUX_RIZ_JUMEAUX), CIBLE.map((v) => v * 1e-9)), null,
        'un système dégénéré le reste quelle que soit l’unité');
    });
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
      const ref = x.aCuire;   // les macros valent pour le poids PESÉ, toujours
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
    /* 180 g de riz CUIT imposés — un reste de la veille, qu'on pèse forcément
       cuit. Depuis qu'il n'y a plus qu'une convention, « 180 g de riz » veut
       dire 180 g de riz SEC : l'unité doit donc être dite. C'est une saisie
       plus bavarde, mais elle n'a plus qu'une seule lecture possible. */
    const r = calculer(CIBLES.R4, { proteine: A.poulet, glucide: A.patateDouce, lipide: A.amandes },
      [
        { aliment: A.riz, grammes: 180, unite: 'cuit' },
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
      [{ aliment: A.riz, grammes: 600, unite: 'cuit' }, { aliment: A.haricots, grammes: 200 }]);
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

  /**
   * M4 vu de l'écran. Le message « ces aliments se ressemblent trop » ne sortait
   * que sur des aliments STRICTEMENT identiques — jamais sur deux qui se
   * ressemblent seulement, c'est-à-dire jamais dans son propre cas.
   *
   * À la place, `resoudre` rendait ±41 kg de riz, la boucle des négatifs
   * zéroait la colonne fautive, et l'écran affichait « Pas de Riz A dans ce
   * repas : le reste apporte déjà tout ce qu'il faut » pendant que les
   * protéines finissaient à 6,4 g pour 40 visés. L'écart était juste ; c'est
   * l'explication qui mentait — et une explication fausse coûte plus qu'un
   * refus, parce qu'elle empêche de comprendre quoi changer.
   */
  it('refuse deux féculents qui se ressemblent trop, sans inventer d’explication', () => {
    const jumeau = (nom: string, k: number, p: number, g: number, l: number) =>
      ({ id: nom, nom, categorie: 'fec' as const, kcal100: k, prot100: p, gluc100: g, lip100: l, ratio: 1 });
    const r = calculer({ kcal: 710, prot: 40, gluc: 100, lip: 20 }, {
      proteine: jumeau('Riz A', 350, 7.0, 78.0, 0.6),
      glucide: jumeau('Riz B', 351, 7.1, 78.2, 0.62),
      lipide: A.huile,
    }, []);

    assert.equal(r.ok, false);
    assert.ok(r.diagnostics.some((d) => d.code === 'systeme_singulier'),
      `attendu « se ressemblent trop », reçu ${JSON.stringify(r.diagnostics.map((d) => d.code))}`);
    /* Et surtout : plus une seule phrase qui prétende que le repas se passe
       très bien de l'aliment qu'on vient d'écarter. */
    assert.equal(r.diagnostics.some((d) => d.code === 'quantite_negative'), false);
    for (const d of r.diagnostics) {
      assert.doesNotMatch(d.message, /apporte déjà tout ce qu'il faut/);
    }
  });

  /**
   * F1, 15 septembre 2026. UN ALIMENT ÉCARTÉ AU SECOND TOUR DISPARAISSAIT SANS
   * UN MOT.
   *
   * La boucle des négatifs écrivait `nouveau[v] = Math.max(0, sol[i])` : la
   * quantité négative rendue par le sous-système était écrasée sur place. Au
   * tour suivant, la boucle ne trouvait donc plus rien à écarter, sortait, et
   * n'émettait jamais le `quantite_negative` de ce second aliment.
   *
   * Reproduit tel quel : petit-déjeuner skyr / flocons d'avoine / amandes avec
   * 100 g d'œufs imposés, cible 20 P / 50 G / 12 L. Les amandes étaient
   * annoncées ; le skyr, lui, quittait la table en silence. Les macros étaient
   * justes — c'est l'explication qui manquait, et une quantité qui s'évapore
   * sans raison est exactement ce que la règle 6 interdit.
   */
  it('dit AUSSI quand un aliment est écarté au second tour', () => {
    const r = calculer({ kcal: 388, prot: 20, gluc: 50, lip: 12 },
      { proteine: A.skyr, glucide: A.avoine, lipide: A.amandes },
      [{ aliment: A.oeufs, grammes: 100 }]);

    assert.equal(r.quantites.some((q) => q.aliment === A.skyr), false,
      'le skyr est bien écarté du repas');

    const ecartes = r.diagnostics
      .filter((d) => d.code === 'quantite_negative')
      .map((d) => d.message);

    assert.equal(ecartes.length, 2,
      `deux aliments écartés, donc deux explications ; reçu ${JSON.stringify(ecartes)}`);
    assert.ok(ecartes.some((m) => m.includes('skyr')),
      `le skyr disparaît sans un mot : ${JSON.stringify(ecartes)}`);
    assert.ok(ecartes.some((m) => m.includes('amandes')),
      `les amandes aussi doivent être annoncées : ${JSON.stringify(ecartes)}`);
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

  /**
   * M1, corrigé le 15 septembre 2026. La ligne écrivait `4·P + 4·G + 9·L` à la
   * main — l'Atwater AMÉRICAIN, celui que `nutrition.ts` interdit en tête de
   * fichier. Tout le reste de `calculer` sait lire `glucidesTotaux` ; pas
   * celle-là.
   *
   * En glucides TOTAUX la cible en glucides COMPREND les fibres, et une fibre
   * vaut 2 kcal/g, pas 4. Compter les 100 g à 4 kcal/g surestimait donc de
   * 2 kcal par gramme de fibre. Le seuil du diagnostic étant de 15 kcal,
   * 7,5 g de fibres suffisaient à faire accuser une cible parfaitement
   * atteignable — et c'est la famille d'aliments la plus banale.
   *
   * La cible ne dit PAS sa part de fibres, et on ne l'invente pas : en mode
   * totaux on ne compare plus à un nombre mais à l'INTERVALLE que les grammes
   * peuvent produire, de « tout en fibres » à « aucune fibre ».
   */
  describe('en glucides totaux, la part de fibres est inconnue', () => {
    const trio = { proteine: A.poulet, glucide: A.riz, lipide: A.amandes };

    it('ne crie pas à l’incohérence pour une cible que des fibres rendent juste', () => {
      /* 100 g de glucides TOTAUX dont ~15 g de fibres :
         4×40 + 4×85 + 2×15 + 9×20 = 160 + 340 + 30 + 180 = 710. */
      const r = calculer({ kcal: 710, prot: 40, gluc: 100, lip: 20 },
        trio, [], { glucidesTotaux: true });
      const d = r.diagnostics.find((x) => x.code === 'cibles_incoherentes');
      assert.equal(d, undefined,
        `710 kcal est atteignable avec 15 g de fibres — reçu : ${d?.message}`);
    });

    it('signale encore une cible qu’aucune part de fibres ne peut sauver', () => {
      /* Bornes : 4×40 + 2×100 + 9×20 = 540 (tout en fibres) à
         4×40 + 4×100 + 9×20 = 740 (aucune fibre). 300 est hors de tout. */
      const r = calculer({ kcal: 300, prot: 40, gluc: 100, lip: 20 },
        trio, [], { glucidesTotaux: true });
      assert.ok(r.diagnostics.some((x) => x.code === 'cibles_incoherentes'),
        '300 kcal est hors de l’intervalle [540 ; 740], quelle que soit la part de fibres');
    });

    it('le message annonce l’intervalle, jamais un chiffre unique inventé', () => {
      const r = calculer({ kcal: 300, prot: 40, gluc: 100, lip: 20 },
        trio, [], { glucidesTotaux: true });
      const d = r.diagnostics.find((x) => x.code === 'cibles_incoherentes');
      assert.ok(d);
      assert.match(d!.message, /540/);
      assert.match(d!.message, /740/);
    });

    it('en convention européenne, rien ne change', () => {
      /* Les fibres sont hors des glucides : la cible dit exactement ce
         qu'elle vaut, et le diagnostic garde son chiffre unique. */
      const r = calculer({ kcal: 710, prot: 40, gluc: 100, lip: 20 }, trio, []);
      const d = r.diagnostics.find((x) => x.code === 'cibles_incoherentes');
      assert.ok(d, '4×40 + 4×100 + 9×20 = 740, pas 710');
      assert.match(d!.message, /740/);
      assert.match(d!.message, /pas 710/);
    });
  });

  /**
   * Règle 5 : aucune formule métier recopiée. `nutrition.ts` porte
   * `KCAL_PROTEINES / KCAL_GLUCIDES / KCAL_FIBRES / KCAL_LIPIDES` et fait foi.
   * Ce test lie les deux modules : réécrire un 4 ou un 9 en dur ici, ou
   * changer une constante là-bas, fait diverger les deux côtés.
   */
  it('les calories des macros sortent de nutrition.ts, pas d’une copie', () => {
    const m = { prot: 40, gluc: 85, lip: 20, fibres: 15 };
    /* PAR `kcalDesGrammes` DIRECTEMENT. Ce test passait par
       `controler(…).calculees`, qui n'etait qu'un appel a `kcalDesGrammes`
       deguise ; `controler` a ete supprime le 21 septembre 2026 avec le reste
       du jugement mort du front. Le lien est desormais direct — et c'est la
       fonction que la regle 5 designe. */
    assert.equal(kcalDesMacros(m), kcalDesGrammes(m));
    assert.equal(kcalDesMacros({ prot: 40, gluc: 100, lip: 20 }), 740);
  });

  /**
   * CE `describe` A CHANGÉ DE RAISON D'ÊTRE — palier B, 21 septembre 2026.
   *
   * Il s'appelait « la cohérence des cibles, telle que l'écran objectifs la
   * lit », et c'était vrai : `app/objectifs.tsx` appelait ces deux fonctions,
   * ne pouvait pas être testé lui-même (le motif de `tsconfig.tests.json` ne
   * descend que sous `src/`), et sa règle n'était donc vérifiée qu'ICI.
   *
   * L'ÉCRAN NE LES APPELLE PLUS. Sa règle vit sur le serveur
   * (`api/src/Service/CoherenceDesCibles.php`, éprouvée par
   * `CoherenceDesCiblesTest`), et il affiche la phrase reçue.
   *
   * Ces cas gardent donc ce qui RESTE ici : le diagnostic
   * `cibles_incoherentes` du solveur, qui pose le même constat sur les cibles
   * mises à l'échelle d'un repas. Ils partent au palier 3, avec le solveur.
   */
  describe('la coherence des cibles, telle que le solveur la pose', () => {
    const cible = { kcal: 710, prot: 40, gluc: 100, lip: 20 };

    it('borne les calories par la part de fibres, de 2 à 4 kcal/g', () => {
      /* 4×40 + 9×20 = 340 de socle ; 100 g de glucides valent 200 kcal tout en
         fibres, 400 sans aucune fibre. */
      assert.deepEqual(bornesDeCoherence(cible), { min: 540, max: 740 });
    });

    it('en européen, l’écart se lit sur un chiffre unique', () => {
      assert.equal(ecartDeCoherence(cible), 710 - 740);
      assert.equal(ecartDeCoherence({ ...cible, kcal: 740 }), 0);
    });

    it('en glucides totaux, toute cible dans l’intervalle est atteignable', () => {
      for (const kcal of [540, 600, 710, 740]) {
        assert.equal(ecartDeCoherence({ ...cible, kcal }, true), 0,
          `${kcal} kcal tombe dans [540 ; 740] : une part de fibres l'explique`);
      }
    });

    it('en glucides totaux, l’écart se compte depuis la borne franchie', () => {
      assert.equal(ecartDeCoherence({ ...cible, kcal: 800 }, true), 800 - 740);
      assert.equal(ecartDeCoherence({ ...cible, kcal: 300 }, true), 300 - 540);
    });

    it('sans glucides, les deux conventions disent la même chose', () => {
      /* Pas de glucides, donc pas de fibres possibles : l'intervalle se
         referme sur un point et la question de la convention ne se pose plus. */
      const sansGluc = { kcal: 340, prot: 40, gluc: 0, lip: 20 };
      assert.equal(ecartDeCoherence(sansGluc, true), ecartDeCoherence(sansGluc, false));
      assert.deepEqual(bornesDeCoherence(sansGluc), { min: 340, max: 340 });
    });
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

  /**
   * F3, 15 septembre 2026. LE MESSAGE PARLAIT UNE AUTRE LANGUE QUE LA CIBLE.
   *
   * `macrosDe(aliment, q)` était appelé ici SANS son troisième paramètre — le
   * seul des cinq appels du fichier à l'oublier. En glucides totaux, la cible
   * compte les fibres dedans, le solveur aussi ; ce diagnostic, non. Pour 5 g
   * d'un pain à 60 g de glucides et 15 g de fibres, il annonçait « 3,0 g de
   * glucides » là où le repas et son objectif en comptent 3,8.
   *
   * Aucun calcul n'en dépendait : c'est une phrase, et une phrase qui donne un
   * chiffre dans une convention que l'écran n'utilise pas est un chiffre faux.
   */
  it('annonce les glucides dans la convention de la cible', () => {
    const pain = {
      id: 'pain', nom: 'Pain complet', categorie: 'fec' as const,
      kcal100: 250, prot100: 8, gluc100: 60, lip100: 1, fibres100: 15, ratio: 1,
    };
    const cibles = { kcal: 222, prot: 30, gluc: 3.75, lip: 10 };
    const variables = { proteine: A.poulet, glucide: pain, lipide: A.huile };

    const d = (totaux: boolean) =>
      calculer(cibles, variables, [], { glucidesTotaux: totaux })
        .diagnostics.find((x) => x.code === 'apport_negligeable'
          && x.message.startsWith('Pain complet'));

    assert.match(d(false)!.message, /5\.0 g, soit 3\.0 g de glucides/,
      'en convention européenne, les fibres sont hors des glucides');
    assert.match(d(true)!.message, /5\.0 g, soit 3\.8 g de glucides/,
      'en glucides TOTAUX, la même phrase doit compter les fibres dedans');
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

describe('ce qu on pese vs ce qu on sert', () => {
  /* Le riz du bug de mars, decrit dans l unique convention : les valeurs du
     grain SEC, celui qu on pose sur la balance. Ce sont les 155 kcal du riz
     cuit multipliees par 2,26.

     La conversion est exacte, et c est tout l interet : le solveur trouvait
     97 g a peser en lisant 220 g cuits, il trouve toujours 97 g en lisant
     directement le sec. Meme riz, meme balance, un champ de moins. */
  const rizSec = {
    id: 'riz', nom: 'Riz basmati', categorie: 'fec' as const,
    kcal100: 350.3, prot100: 7, gluc100: 75, lip100: 1.6,
    ratio: 2.26,
  };

  it('ce qu on pese EST la reference, et l assiette s en deduit', () => {
    const { aCuire, assiette } = convertir(rizSec, 97);

    assert.equal(aCuire, 97, 'la colonne a peser ne depend pas du rendement');
    assert.ok(Math.abs(assiette - 220) < 1, `${assiette} g cuits pour 97 g secs`);
  });

  it('donne les grammes a peser pour la cible', () => {
    const r = calculer(
      { kcal: 340, prot: 7, gluc: 73, lip: 1.5 },
      { glucide: rizSec });

    const q = r.quantites.find((x) => x.aliment.id === 'riz')!;
    assert.ok(q.aCuire < q.assiette, 'un feculent pese moins sec que cuit');
    assert.ok(Math.abs(q.aCuire - 97) < 5, `${q.aCuire} g a peser, environ 97 attendus`);
  });

  it('le rendement ne deplace PAS la colonne a peser', () => {
    /* L invariant central de la refonte. Trois rendements tres differents sur
       le meme grain sec : la balance dit la meme chose, seule l annonce du
       poids servi change. Avant, faire varier le rendement changeait les
       grammes a peser — d ou le besoin de le verifier a tout prix. */
    const cible = { kcal: 340, prot: 7, gluc: 73, lip: 1.5 };
    const peser = (ratio: number) => calculer(cible, { glucide: { ...rizSec, ratio } })
      .quantites.find((x) => x.aliment.id === 'riz')!;

    assert.equal(peser(2.26).aCuire, peser(3).aCuire);
    assert.equal(peser(3).aCuire, peser(4.68).aCuire);
    assert.ok(peser(4.68).assiette > peser(2.26).assiette, 'seule l assiette bouge');
  });

  /* La proteine perd du poids au lieu d en gagner : meme regle, autre sens. */
  it('pese la viande CRUE et en sert moins', () => {
    const { aCuire, assiette } = convertir(A.poulet, 150);

    assert.equal(aCuire, 150, 'on pese 150 g de poulet cru');
    assert.ok(assiette < aCuire, 'il en reste moins apres cuisson');
  });
});
