"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = require("node:test");
const algebre_1 = require("./algebre");
const solveur_1 = require("./solveur");
const aliments_test_data_1 = require("./aliments.test-data");
const q = (r, nom) => r.quantites.find((x) => x.aliment.nom === nom);
(0, node_test_1.describe)('algèbre', () => {
    (0, node_test_1.it)('résout un système simple', () => {
        const x = (0, algebre_1.resoudre)([[2, 1], [1, 3]], [5, 10]);
        node_assert_1.strict.ok(x);
        node_assert_1.strict.ok(Math.abs(x[0] - 1) < 1e-9);
        node_assert_1.strict.ok(Math.abs(x[1] - 3) < 1e-9);
    });
    (0, node_test_1.it)('détecte un système singulier', () => {
        node_assert_1.strict.equal((0, algebre_1.resoudre)([[1, 2], [2, 4]], [3, 6]), null);
    });
    (0, node_test_1.it)('gère le pivot partiel (premier coefficient nul)', () => {
        const x = (0, algebre_1.resoudre)([[0, 1], [1, 0]], [2, 3]);
        node_assert_1.strict.ok(x);
        node_assert_1.strict.ok(Math.abs(x[0] - 3) < 1e-9 && Math.abs(x[1] - 2) < 1e-9);
    });
    (0, node_test_1.it)('arrondit au pas demandé', () => {
        node_assert_1.strict.equal((0, algebre_1.arrondir)(12.3, 5), 10);
        node_assert_1.strict.equal((0, algebre_1.arrondir)(12.6, 5), 15);
        node_assert_1.strict.equal((0, algebre_1.arrondir)(12.3, 0.5), 12.5);
        node_assert_1.strict.equal((0, algebre_1.arrondir)(12.34, 0), 12.34);
    });
});
(0, node_test_1.describe)('déjeuner : cas nominal', () => {
    const fixes = [
        { aliment: aliments_test_data_1.A.haricots, grammes: 180 },
        { aliment: aliments_test_data_1.A.concombre, grammes: 100 },
        { aliment: aliments_test_data_1.A.huile, grammes: 6 },
    ];
    const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R2, { proteine: aliments_test_data_1.A.saumon, glucide: aliments_test_data_1.A.patateDouce, lipide: aliments_test_data_1.A.amandes }, fixes);
    (0, node_test_1.it)('atteint les cibles', () => {
        node_assert_1.strict.equal(r.ok, true, JSON.stringify(r.ecarts));
    });
    (0, node_test_1.it)('donne des quantités réalistes', () => {
        const saumon = q(r, 'Saumon');
        node_assert_1.strict.ok(saumon.aCuire > 120 && saumon.aCuire < 260, `saumon ${saumon.aCuire}`);
        const pd = q(r, 'Patate douce');
        node_assert_1.strict.ok(pd.assiette > 100 && pd.assiette < 400, `patate douce ${pd.assiette}`);
    });
    (0, node_test_1.it)('convertit le cru en cuit pour la protéine', () => {
        const s = q(r, 'Saumon');
        node_assert_1.strict.ok(Math.abs(s.assiette - s.aCuire * 0.85) < 0.01);
    });
});
(0, node_test_1.describe)('conversions cru / cuit / sec', () => {
    const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R4, { proteine: aliments_test_data_1.A.poulet, glucide: aliments_test_data_1.A.riz, lipide: aliments_test_data_1.A.amandes }, [{ aliment: aliments_test_data_1.A.haricots, grammes: 200 }, { aliment: aliments_test_data_1.A.huile, grammes: 2 }]);
    (0, node_test_1.it)('le riz est affiché en grammes secs', () => {
        const riz = q(r, 'Riz basmati');
        node_assert_1.strict.ok(Math.abs(riz.aCuire - riz.assiette / 3) < 0.01, `sec ${riz.aCuire} / cuit ${riz.assiette}`);
        node_assert_1.strict.ok(riz.aCuire < riz.assiette);
    });
    (0, node_test_1.it)('le poulet perd 25 % à la cuisson', () => {
        const p = q(r, 'Blanc de poulet');
        node_assert_1.strict.ok(Math.abs(p.assiette - p.aCuire * 0.75) < 0.01);
    });
    (0, node_test_1.it)('un légume ne change pas de poids', () => {
        const h = q(r, 'Haricots verts');
        node_assert_1.strict.equal(h.aCuire, h.assiette);
    });
});
(0, node_test_1.describe)('protéine trop grasse : cible inatteignable', () => {
    // 60 g de protéines avec du saumon : les lipides explosent quoi qu'on fasse
    const r = (0, solveur_1.calculer)({ ...aliments_test_data_1.CIBLES.R2, prot: 60 }, { proteine: aliments_test_data_1.A.saumon, glucide: aliments_test_data_1.A.patateDouce, lipide: aliments_test_data_1.A.amandes }, [{ aliment: aliments_test_data_1.A.haricots, grammes: 180 }, { aliment: aliments_test_data_1.A.huile, grammes: 6 }]);
    (0, node_test_1.it)('signale le blocage', () => {
        node_assert_1.strict.equal(r.ok, false);
        node_assert_1.strict.ok(r.diagnostics.some((d) => d.code === 'lipides_incompressibles'), JSON.stringify(r.diagnostics));
    });
    (0, node_test_1.it)('supprime les oléagineux plutôt que d’en mettre une quantité négative', () => {
        node_assert_1.strict.equal(q(r, 'Amandes'), undefined);
    });
    (0, node_test_1.it)('atteint quand même protéines et glucides', () => {
        node_assert_1.strict.ok(Math.abs(r.ecarts.prot) <= 1.5, `prot ${r.ecarts.prot}`);
        node_assert_1.strict.ok(Math.abs(r.ecarts.gluc) <= 2.5, `gluc ${r.ecarts.gluc}`);
    });
    (0, node_test_1.it)('explique quoi faire', () => {
        const d = r.diagnostics.find((x) => x.code === 'lipides_incompressibles');
        node_assert_1.strict.match(d.message, /plus maigre/);
    });
});
(0, node_test_1.describe)('les macros affichées correspondent aux quantités pesées', () => {
    (0, node_test_1.it)('recalcule après arrondi, pas avant', () => {
        const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R2, { proteine: aliments_test_data_1.A.truite, glucide: aliments_test_data_1.A.quinoa, lipide: aliments_test_data_1.A.noix }, [{ aliment: aliments_test_data_1.A.courgettes, grammes: 180 }, { aliment: aliments_test_data_1.A.huile, grammes: 6 }]);
        // on recompose les macros à la main depuis les quantités annoncées
        let kcal = 0, prot = 0, gluc = 0, lip = 0;
        for (const x of r.quantites) {
            const ref = x.aliment.etatReference === 'cru' ? x.aCuire : x.assiette;
            kcal += (x.aliment.kcal100 * ref) / 100;
            prot += (x.aliment.prot100 * ref) / 100;
            gluc += (x.aliment.gluc100 * ref) / 100;
            lip += (x.aliment.lip100 * ref) / 100;
        }
        node_assert_1.strict.ok(Math.abs(kcal - r.macros.kcal) < 0.5, `kcal ${kcal} vs ${r.macros.kcal}`);
        node_assert_1.strict.ok(Math.abs(prot - r.macros.prot) < 0.05);
        node_assert_1.strict.ok(Math.abs(gluc - r.macros.gluc) < 0.05);
        node_assert_1.strict.ok(Math.abs(lip - r.macros.lip) < 0.05);
    });
    (0, node_test_1.it)('respecte les pas d’arrondi demandés', () => {
        const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R2, { proteine: aliments_test_data_1.A.saumon, glucide: aliments_test_data_1.A.patateDouce, lipide: aliments_test_data_1.A.amandes }, [{ aliment: aliments_test_data_1.A.haricots, grammes: 180 }], { arrondi: { proteine: 5, glucide: 10, lipide: 1 } });
        const saumon = q(r, 'Saumon');
        node_assert_1.strict.equal(saumon.aCuire % 5, 0, `saumon ${saumon.aCuire}`);
        const pd = q(r, 'Patate douce');
        node_assert_1.strict.equal(pd.assiette % 10, 0, `patate douce ${pd.assiette}`);
    });
});
(0, node_test_1.describe)('quantité imposée (reste à écouler)', () => {
    (0, node_test_1.it)('complète avec un second féculent', () => {
        // 180 g de riz cuit imposés, la patate douce complète les glucides
        const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R4, { proteine: aliments_test_data_1.A.poulet, glucide: aliments_test_data_1.A.patateDouce, lipide: aliments_test_data_1.A.amandes }, [
            { aliment: aliments_test_data_1.A.riz, grammes: 180 },
            { aliment: aliments_test_data_1.A.haricots, grammes: 200 },
            { aliment: aliments_test_data_1.A.huile, grammes: 2 },
        ]);
        node_assert_1.strict.equal(r.ok, true, JSON.stringify(r.ecarts));
        const riz = q(r, 'Riz basmati');
        node_assert_1.strict.equal(riz.assiette, 180);
        node_assert_1.strict.equal(riz.aCuire, 60);
        node_assert_1.strict.ok(q(r, 'Patate douce').assiette > 0);
    });
    (0, node_test_1.it)('signale quand la quantité imposée sature déjà les glucides', () => {
        const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R4, { proteine: aliments_test_data_1.A.poulet, glucide: aliments_test_data_1.A.patateDouce, lipide: aliments_test_data_1.A.amandes }, [{ aliment: aliments_test_data_1.A.riz, grammes: 600 }, { aliment: aliments_test_data_1.A.haricots, grammes: 200 }]);
        node_assert_1.strict.equal(r.ok, false);
        node_assert_1.strict.ok(r.diagnostics.some((d) => d.code === 'glucides_hors_cible'));
        node_assert_1.strict.equal(q(r, 'Patate douce'), undefined);
    });
});
(0, node_test_1.describe)('les quatre repas du plan', () => {
    const cas = [
        ['matin', aliments_test_data_1.CIBLES.R1, { proteine: aliments_test_data_1.A.oeufs, glucide: aliments_test_data_1.A.avoine, lipide: aliments_test_data_1.A.amandes },
            [{ aliment: aliments_test_data_1.A.fraises, grammes: 55 }]],
        ['midi', aliments_test_data_1.CIBLES.R2, { proteine: aliments_test_data_1.A.saumon, glucide: aliments_test_data_1.A.patateDouce, lipide: aliments_test_data_1.A.amandes },
            [{ aliment: aliments_test_data_1.A.haricots, grammes: 180 }, { aliment: aliments_test_data_1.A.concombre, grammes: 100 },
                { aliment: aliments_test_data_1.A.huile, grammes: 6 }]],
        ['16 h', aliments_test_data_1.CIBLES.R3, { proteine: aliments_test_data_1.A.skyr, glucide: aliments_test_data_1.A.avoine, lipide: aliments_test_data_1.A.amandes },
            [{ aliment: aliments_test_data_1.A.blancs, grammes: 175 }, { aliment: aliments_test_data_1.A.banane, grammes: 83 }]],
        ['soir', aliments_test_data_1.CIBLES.R4, { proteine: aliments_test_data_1.A.poulet, glucide: aliments_test_data_1.A.patateDouce, lipide: aliments_test_data_1.A.amandes },
            [{ aliment: aliments_test_data_1.A.haricots, grammes: 200 }, { aliment: aliments_test_data_1.A.huile, grammes: 2 }]],
    ];
    for (const [nom, cibles, variables, fixes] of cas) {
        (0, node_test_1.it)(`${nom} : macros atteintes`, () => {
            const r = (0, solveur_1.calculer)(cibles, variables, [...fixes]);
            node_assert_1.strict.equal(r.ok, true, `${nom} → écarts ${JSON.stringify(r.ecarts)} / ${JSON.stringify(r.quantites.map((x) => [x.aliment.nom, x.assiette]))}`);
        });
    }
});
(0, node_test_1.describe)('robustesse', () => {
    (0, node_test_1.it)('refuse un trio d’aliments au profil identique', () => {
        const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R2, { proteine: aliments_test_data_1.A.huile, glucide: aliments_test_data_1.A.huile, lipide: aliments_test_data_1.A.huile }, []);
        node_assert_1.strict.equal(r.ok, false);
        node_assert_1.strict.ok(r.diagnostics.some((d) => d.code === 'systeme_singulier'));
    });
    (0, node_test_1.it)('ne produit jamais de quantité négative', () => {
        const r = (0, solveur_1.calculer)({ kcal: 200, prot: 5, gluc: 5, lip: 2 }, { proteine: aliments_test_data_1.A.saumon, glucide: aliments_test_data_1.A.patateDouce, lipide: aliments_test_data_1.A.amandes }, [{ aliment: aliments_test_data_1.A.haricots, grammes: 400 }, { aliment: aliments_test_data_1.A.huile, grammes: 20 }]);
        for (const x of r.quantites) {
            node_assert_1.strict.ok(x.assiette >= 0, `${x.aliment.nom} = ${x.assiette}`);
            node_assert_1.strict.ok(x.aCuire >= 0);
        }
    });
    (0, node_test_1.it)('fonctionne sans aucun ingrédient imposé', () => {
        const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R2, { proteine: aliments_test_data_1.A.poulet, glucide: aliments_test_data_1.A.riz, lipide: aliments_test_data_1.A.amandes }, []);
        node_assert_1.strict.equal(r.ok, true, JSON.stringify(r.ecarts));
    });
    (0, node_test_1.it)('reste stable sur des cibles extrêmes', () => {
        const r = (0, solveur_1.calculer)({ kcal: 3000, prot: 200, gluc: 300, lip: 100 }, { proteine: aliments_test_data_1.A.poulet, glucide: aliments_test_data_1.A.riz, lipide: aliments_test_data_1.A.amandes }, []);
        node_assert_1.strict.ok(Number.isFinite(r.macros.kcal));
        for (const x of r.quantites)
            node_assert_1.strict.ok(Number.isFinite(x.assiette));
    });
});
(0, node_test_1.describe)('propriété : sur 5 000 combinaisons aléatoires', () => {
    const prots = [aliments_test_data_1.A.saumon, aliments_test_data_1.A.truite, aliments_test_data_1.A.cabillaud, aliments_test_data_1.A.thon, aliments_test_data_1.A.poulet, aliments_test_data_1.A.boeuf5, aliments_test_data_1.A.oeufs, aliments_test_data_1.A.skyr];
    const fecs = [aliments_test_data_1.A.patateDouce, aliments_test_data_1.A.riz, aliments_test_data_1.A.quinoa, aliments_test_data_1.A.avoine];
    const oles = [aliments_test_data_1.A.amandes, aliments_test_data_1.A.noix];
    const legs = [aliments_test_data_1.A.haricots, aliments_test_data_1.A.courgettes, aliments_test_data_1.A.concombre];
    const cibles = [aliments_test_data_1.CIBLES.R1, aliments_test_data_1.CIBLES.R2, aliments_test_data_1.CIBLES.R3, aliments_test_data_1.CIBLES.R4];
    let atteintes = 0;
    let total = 0;
    const anomalies = [];
    // générateur déterministe : même suite à chaque exécution
    let graine = 12345;
    const alea = () => {
        graine = (graine * 1103515245 + 12345) % 2147483648;
        return graine / 2147483648;
    };
    const tire = (t) => t[Math.floor(alea() * t.length)];
    for (let i = 0; i < 5000; i++) {
        const c = tire(cibles);
        const v = { proteine: tire(prots), glucide: tire(fecs), lipide: tire(oles) };
        const f = [
            { aliment: tire(legs), grammes: Math.round(alea() * 250) },
            { aliment: aliments_test_data_1.A.huile, grammes: Math.round(alea() * 10) },
        ];
        const r = (0, solveur_1.calculer)(c, v, f);
        total++;
        if (r.ok)
            atteintes++;
        for (const x of r.quantites) {
            if (!Number.isFinite(x.assiette) || !Number.isFinite(x.aCuire)) {
                anomalies.push(`non fini : ${x.aliment.nom}`);
            }
            if (x.assiette < 0 || x.aCuire < 0) {
                anomalies.push(`négatif : ${x.aliment.nom} = ${x.assiette}`);
            }
        }
        if (!Number.isFinite(r.macros.kcal))
            anomalies.push('macros non finies');
        // toute combinaison hors cible doit être expliquée
        if (!r.ok && r.diagnostics.length === 0)
            anomalies.push('écart sans diagnostic');
    }
    (0, node_test_1.it)('ne produit jamais de valeur invalide ni de négatif', () => {
        node_assert_1.strict.equal(anomalies.length, 0, anomalies.slice(0, 5).join(' | '));
    });
    (0, node_test_1.it)('explique systématiquement les cas hors cible', () => {
        node_assert_1.strict.equal(anomalies.filter((a) => a.includes('diagnostic')).length, 0);
    });
    (0, node_test_1.it)('atteint les cibles dans la grande majorité des cas', () => {
        const taux = (atteintes / total) * 100;
        console.log(`      → ${taux.toFixed(1)} % de combinaisons dans la tolérance (${atteintes}/${total})`);
        node_assert_1.strict.ok(taux > 60, `taux trop faible : ${taux.toFixed(1)} %`);
    });
});
(0, node_test_1.describe)('LE CŒUR : écouler les restes, quels qu’ils soient', () => {
    (0, node_test_1.it)('100 g de riz CUIT restant : le reste du repas s’adapte', () => {
        const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R4, { proteine: aliments_test_data_1.A.poulet, glucide: aliments_test_data_1.A.patateDouce, lipide: aliments_test_data_1.A.amandes }, [
            { aliment: aliments_test_data_1.A.riz, grammes: 100, unite: 'cuit' }, // le reste du midi
            { aliment: aliments_test_data_1.A.haricots, grammes: 200 },
            { aliment: aliments_test_data_1.A.huile, grammes: 2 },
        ]);
        node_assert_1.strict.equal(r.ok, true, JSON.stringify(r.ecarts));
        const riz = q(r, 'Riz basmati');
        node_assert_1.strict.equal(riz.assiette, 100, 'les 100 g cuits sont respectés');
        node_assert_1.strict.ok(Math.abs(riz.aCuire - 100 / 3) < 0.01, 'équivalent sec affiché');
        node_assert_1.strict.equal(riz.impose, true);
    });
    (0, node_test_1.it)('90 g de saumon CUIT restant : converti en cru pour le calcul', () => {
        const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R2, { proteine: aliments_test_data_1.A.poulet, glucide: aliments_test_data_1.A.patateDouce, lipide: aliments_test_data_1.A.amandes }, [
            { aliment: aliments_test_data_1.A.saumon, grammes: 90, unite: 'cuit' },
            { aliment: aliments_test_data_1.A.haricots, grammes: 180 },
            { aliment: aliments_test_data_1.A.huile, grammes: 6 },
        ]);
        const saumon = q(r, 'Saumon');
        node_assert_1.strict.equal(saumon.assiette, 90, 'assiette = ce qui reste');
        node_assert_1.strict.ok(Math.abs(saumon.aCuire - 90 / 0.85) < 0.01, 'équivalent cru = 105,9 g');
        // les macros doivent compter le saumon sur son poids CRU (105,9 g), pas 90
        const attendu = (aliments_test_data_1.A.saumon.prot100 * (90 / 0.85)) / 100;
        node_assert_1.strict.ok(r.macros.prot > attendu, 'le saumon est bien comptabilisé au poids cru');
    });
    (0, node_test_1.it)('150 g de brocolis cuits : un légume ne change pas de poids', () => {
        const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R2, { proteine: aliments_test_data_1.A.saumon, glucide: aliments_test_data_1.A.patateDouce, lipide: aliments_test_data_1.A.amandes }, [{ aliment: aliments_test_data_1.A.courgettes, grammes: 150, unite: 'cuit' }, { aliment: aliments_test_data_1.A.huile, grammes: 6 }]);
        const c = q(r, 'Courgettes');
        node_assert_1.strict.equal(c.assiette, 150);
        node_assert_1.strict.equal(c.aCuire, 150);
    });
    (0, node_test_1.it)('trois restes à la fois : le repas se recompose autour', () => {
        const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R4, { proteine: aliments_test_data_1.A.poulet, glucide: aliments_test_data_1.A.patateDouce, lipide: aliments_test_data_1.A.amandes }, [
            { aliment: aliments_test_data_1.A.riz, grammes: 100, unite: 'cuit' },
            { aliment: aliments_test_data_1.A.saumon, grammes: 40, unite: 'cuit' },
            { aliment: aliments_test_data_1.A.courgettes, grammes: 120, unite: 'cuit' },
            { aliment: aliments_test_data_1.A.huile, grammes: 2 },
        ]);
        node_assert_1.strict.equal(r.ok, true, JSON.stringify(r.ecarts));
        node_assert_1.strict.equal(q(r, 'Riz basmati').assiette, 100);
        node_assert_1.strict.equal(q(r, 'Saumon').assiette, 40);
        node_assert_1.strict.equal(q(r, 'Courgettes').assiette, 120);
    });
    (0, node_test_1.it)('quantité imposée saisie en CRU : équivalent cuit annoncé', () => {
        const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R4, { proteine: aliments_test_data_1.A.poulet, glucide: aliments_test_data_1.A.patateDouce, lipide: aliments_test_data_1.A.amandes }, [{ aliment: aliments_test_data_1.A.riz, grammes: 40, unite: 'cru' }, { aliment: aliments_test_data_1.A.haricots, grammes: 200 }]);
        const riz = q(r, 'Riz basmati');
        node_assert_1.strict.equal(riz.aCuire, 40, '40 g secs à cuire');
        node_assert_1.strict.equal(riz.assiette, 120, '→ 120 g dans l’assiette');
    });
    (0, node_test_1.it)('pourObtenirCuit donne la quantité à peser', () => {
        node_assert_1.strict.ok(Math.abs((0, solveur_1.pourObtenirCuit)(aliments_test_data_1.A.riz, 180) - 60) < 0.01);
        node_assert_1.strict.ok(Math.abs((0, solveur_1.pourObtenirCuit)(aliments_test_data_1.A.saumon, 153) - 180) < 0.5);
        node_assert_1.strict.equal((0, solveur_1.pourObtenirCuit)(aliments_test_data_1.A.haricots, 200), 200);
    });
});
(0, node_test_1.describe)('LE CŒUR : substituer un aliment ne change pas les macros', () => {
    const fixes = [
        { aliment: aliments_test_data_1.A.haricots, grammes: 180 },
        { aliment: aliments_test_data_1.A.concombre, grammes: 100 },
        { aliment: aliments_test_data_1.A.huile, grammes: 6 },
    ];
    const proteines = [aliments_test_data_1.A.saumon, aliments_test_data_1.A.truite, aliments_test_data_1.A.cabillaud, aliments_test_data_1.A.thon, aliments_test_data_1.A.poulet, aliments_test_data_1.A.boeuf5];
    const feculents = [aliments_test_data_1.A.patateDouce, aliments_test_data_1.A.riz, aliments_test_data_1.A.quinoa];
    const oleagineux = [aliments_test_data_1.A.amandes, aliments_test_data_1.A.noix];
    (0, node_test_1.it)('toute combinaison protéine × féculent × oléagineux tombe sur les mêmes macros', () => {
        const echecs = [];
        for (const p of proteines) {
            for (const f of feculents) {
                for (const o of oleagineux) {
                    const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R2, { proteine: p, glucide: f, lipide: o }, fixes);
                    if (!r.ok) {
                        echecs.push(`${p.nom}/${f.nom}/${o.nom} → ${JSON.stringify(r.ecarts)}`);
                        continue;
                    }
                    // les macros doivent être identiques d'une combinaison à l'autre
                    node_assert_1.strict.ok(Math.abs(r.macros.prot - aliments_test_data_1.CIBLES.R2.prot) <= 1.5);
                    node_assert_1.strict.ok(Math.abs(r.macros.gluc - aliments_test_data_1.CIBLES.R2.gluc) <= 2.5);
                    node_assert_1.strict.ok(Math.abs(r.macros.lip - aliments_test_data_1.CIBLES.R2.lip) <= 1.2);
                }
            }
        }
        console.log(`      → ${proteines.length * feculents.length * oleagineux.length - echecs.length}`
            + `/${proteines.length * feculents.length * oleagineux.length} combinaisons exactes`);
        // seuls les cas physiquement impossibles peuvent échouer, et ils sont expliqués
        node_assert_1.strict.ok(echecs.length <= 2, echecs.join(' | '));
    });
    (0, node_test_1.it)('remplacer le féculent ajuste la protéine, pas seulement le féculent', () => {
        const avec = (f) => (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R2, { proteine: aliments_test_data_1.A.saumon, glucide: f, lipide: aliments_test_data_1.A.amandes }, fixes);
        const pd = avec(aliments_test_data_1.A.patateDouce);
        const qu = avec(aliments_test_data_1.A.quinoa);
        const saumonPd = q(pd, 'Saumon').aCuire;
        const saumonQu = q(qu, 'Saumon').aCuire;
        // le quinoa apporte 4,4 g de protéines / 100 g : le saumon doit BAISSER
        node_assert_1.strict.ok(saumonQu < saumonPd, `saumon ${saumonQu} (quinoa) devrait être < ${saumonPd} (patate douce)`);
        node_assert_1.strict.equal(pd.ok, true);
        node_assert_1.strict.equal(qu.ok, true);
    });
});
(0, node_test_1.describe)('cibles incohérentes entre elles', () => {
    (0, node_test_1.it)('signale quand les kcal ne correspondent pas aux macros', () => {
        // 30 P + 80 G + 15 L = 435 + 135 = 575 kcal, pas 450
        const r = (0, solveur_1.calculer)({ kcal: 450, prot: 30, gluc: 80, lip: 15 }, { proteine: aliments_test_data_1.A.poulet, glucide: aliments_test_data_1.A.riz, lipide: aliments_test_data_1.A.amandes }, [{ aliment: aliments_test_data_1.A.haricots, grammes: 200 }]);
        const d = r.diagnostics.find((x) => x.code === 'cibles_incoherentes');
        node_assert_1.strict.ok(d, JSON.stringify(r.diagnostics));
        node_assert_1.strict.match(d.message, /pas 450/);
    });
    (0, node_test_1.it)('les macros restent atteintes malgré l’incohérence', () => {
        const r = (0, solveur_1.calculer)({ kcal: 450, prot: 30, gluc: 80, lip: 15 }, { proteine: aliments_test_data_1.A.poulet, glucide: aliments_test_data_1.A.riz, lipide: aliments_test_data_1.A.amandes }, [{ aliment: aliments_test_data_1.A.haricots, grammes: 200 }]);
        node_assert_1.strict.equal(r.ok, true, JSON.stringify(r.ecarts));
        node_assert_1.strict.ok(Math.abs(r.ecarts.prot) <= 1.5);
        node_assert_1.strict.ok(Math.abs(r.ecarts.gluc) <= 2.5);
        node_assert_1.strict.ok(Math.abs(r.ecarts.lip) <= 1.2);
    });
    (0, node_test_1.it)('ne signale rien quand les cibles sont cohérentes', () => {
        const r = (0, solveur_1.calculer)({ kcal: 575, prot: 30, gluc: 80, lip: 15 }, { proteine: aliments_test_data_1.A.poulet, glucide: aliments_test_data_1.A.riz, lipide: aliments_test_data_1.A.amandes }, [{ aliment: aliments_test_data_1.A.haricots, grammes: 200 }]);
        node_assert_1.strict.equal(r.diagnostics.some((x) => x.code === 'cibles_incoherentes'), false);
    });
});
(0, node_test_1.describe)('LE CŒUR : calculer même sans marge complète', () => {
    (0, node_test_1.it)('deux ajustables seulement : protéines et glucides tombent juste', () => {
        const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R4, { proteine: aliments_test_data_1.A.poulet, glucide: aliments_test_data_1.A.patateDouce }, // pas d'oléagineux libre
        [{ aliment: aliments_test_data_1.A.haricots, grammes: 200 }, { aliment: aliments_test_data_1.A.huile, grammes: 2 }]);
        node_assert_1.strict.ok(Math.abs(r.ecarts.prot) <= 1.5, `prot ${r.ecarts.prot}`);
        node_assert_1.strict.ok(Math.abs(r.ecarts.gluc) <= 2.5, `gluc ${r.ecarts.gluc}`);
        // les lipides dérivent, et c'est annoncé
        node_assert_1.strict.ok(r.diagnostics.some((d) => d.code === 'lipides_hors_cible'), JSON.stringify(r.diagnostics));
    });
    (0, node_test_1.it)('un seul ajustable : la macro correspondante tombe juste', () => {
        const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R4, { proteine: aliments_test_data_1.A.poulet }, [{ aliment: aliments_test_data_1.A.riz, grammes: 150, unite: 'cuit' }, { aliment: aliments_test_data_1.A.haricots, grammes: 200 }]);
        node_assert_1.strict.ok(Math.abs(r.ecarts.prot) <= 1.5, `prot ${r.ecarts.prot}`);
        node_assert_1.strict.ok(r.diagnostics.length > 0, 'les autres écarts sont expliqués');
    });
    (0, node_test_1.it)('rien d’ajustable : l’app dit quand même ce qui manque', () => {
        const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R4, {}, [
            { aliment: aliments_test_data_1.A.poulet, grammes: 60, unite: 'cuit' },
            { aliment: aliments_test_data_1.A.riz, grammes: 100, unite: 'cuit' },
            { aliment: aliments_test_data_1.A.haricots, grammes: 120 },
        ]);
        node_assert_1.strict.equal(r.ok, false);
        node_assert_1.strict.ok(r.diagnostics.some((d) => d.code === 'aucune_marge'));
        // les totaux sont calculés malgré tout
        node_assert_1.strict.ok(r.macros.prot > 0 && r.macros.gluc > 0);
        node_assert_1.strict.equal(r.quantites.length, 3);
        // et chaque écart est chiffré
        node_assert_1.strict.ok(r.diagnostics.some((d) => /manque/.test(d.message)), r.diagnostics.map((d) => d.message).join(' | '));
    });
    (0, node_test_1.it)('trois restes partiels : chacun est complété', () => {
        const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R4, { proteine: aliments_test_data_1.A.poulet, glucide: aliments_test_data_1.A.riz, lipide: aliments_test_data_1.A.amandes }, [{ aliment: aliments_test_data_1.A.haricots, grammes: 120 }]);
        node_assert_1.strict.equal(r.ok, true, JSON.stringify(r.ecarts));
        const poulet = r.quantites.find((x) => x.aliment.nom === 'Blanc de poulet');
        const riz = r.quantites.find((x) => x.aliment.nom === 'Riz basmati');
        node_assert_1.strict.ok(poulet.aCuire > 0 && riz.aCuire > 0);
    });
});
(0, node_test_1.describe)('un aliment ajustable devenu inutile', () => {
    (0, node_test_1.it)('signale quand sa quantité tombe à presque rien', () => {
        // 100 g de bœuf cuits couvrent déjà les protéines du soir : le thon ne sert plus
        const r = (0, solveur_1.calculer)({ kcal: 551.8, prot: 30.1, gluc: 80.3, lip: 15.4 }, { proteine: aliments_test_data_1.A.thon, glucide: aliments_test_data_1.A.patateDouce, lipide: aliments_test_data_1.A.amandes }, [
            { aliment: aliments_test_data_1.A.boeuf5, grammes: 50, unite: 'cuit' },
            { aliment: aliments_test_data_1.A.haricots, grammes: 200 },
            { aliment: aliments_test_data_1.A.huile, grammes: 2 },
        ]);
        const d = r.diagnostics.find((x) => x.code === 'apport_negligeable');
        node_assert_1.strict.ok(d, r.diagnostics.map((x) => x.code).join(','));
        node_assert_1.strict.match(d.message, /Thon/);
        node_assert_1.strict.match(d.message, /Retire-le/);
        node_assert_1.strict.equal(r.ok, true, 'les macros restent atteintes');
    });
    (0, node_test_1.it)('ne dit rien quand chaque aliment pèse vraiment', () => {
        // protéine maigre : les trois quantités sont substantielles
        const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R4, { proteine: aliments_test_data_1.A.poulet, glucide: aliments_test_data_1.A.patateDouce, lipide: aliments_test_data_1.A.amandes }, [{ aliment: aliments_test_data_1.A.haricots, grammes: 200 }, { aliment: aliments_test_data_1.A.huile, grammes: 2 }]);
        node_assert_1.strict.equal(r.diagnostics.some((d) => d.code === 'apport_negligeable'), false, r.quantites.map((x) => `${x.aliment.nom} ${x.assiette.toFixed(0)}`).join(' | '));
    });
    (0, node_test_1.it)('révèle un cas de fond : une protéine grasse chasse les oléagineux', () => {
        // le saumon apporte tant de gras que les amandes n'ont plus de place
        const r = (0, solveur_1.calculer)(aliments_test_data_1.CIBLES.R2, { proteine: aliments_test_data_1.A.saumon, glucide: aliments_test_data_1.A.patateDouce, lipide: aliments_test_data_1.A.amandes }, [{ aliment: aliments_test_data_1.A.haricots, grammes: 180 }, { aliment: aliments_test_data_1.A.huile, grammes: 6 }]);
        node_assert_1.strict.ok(r.diagnostics.some((d) => d.code === 'apport_negligeable'), 'l\'app doit prévenir que les amandes ne servent plus à rien');
        node_assert_1.strict.equal(r.ok, true, 'les macros restent atteintes');
    });
});
