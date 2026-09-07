import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CATALOGUE } from '../solveur/frigos.test-data';
import type { Aliment } from '@/solveur/types';

import {
  inexploitable, kcalAtwater, macrosSiDejaCuites,
  verifierAliment, verifierCatalogue,
} from './plausibilite';

/**
 * Le riz basmati, dans l'unique convention de l'application : les valeurs du
 * grain SEC, celui qu'on pose sur la balance. Ce sont les 130 kcal d'hier
 * multipliées par le rendement de 3.
 */
const base = (p: Partial<Aliment> = {}): Aliment => ({
  id: 'x', nom: 'Test', categorie: 'fec',
  kcal100: 390, prot100: 8.1, gluc100: 84.6, lip100: 0.9, fibres100: 2.1,
  ratio: 3,
  ...p,
});

/** Le même riz décrit par erreur avec ses valeurs CUITES. */
const cuitesParErreur = (p: Partial<Aliment> = {}): Aliment => base({
  kcal100: 130, prot100: 2.7, gluc100: 28.2, lip100: 0.3, fibres100: 0.7, ...p,
});

const codes = (a: Aliment): string[] => verifierAliment(a).map((d) => d.code);

describe('Ce que le rendement ne peut PLUS faire', () => {
  /* LE test de cette refonte, et le seul qui compte vraiment.
     Auparavant, macros et rendement décrivaient chacun l'aliment de leur
     côté : les faire diverger produisait un blocage, et l'application devait
     demander à l'utilisateur laquelle des deux valeurs était la sienne.
     Désormais le rendement n'entre dans aucune macro. Le faire varier sur
     TOUTE sa plage ne peut plus rendre un aliment sain malade. */
  it('faire varier le rendement ne rend jamais les macros fausses', () => {
    for (let r = 1; r <= 5; r += 0.01) {
      const bloquants = verifierAliment(base({ ratio: r }))
        .filter((d) => d.gravite === 'blocage');
      assert.deepEqual(bloquants, [], `rendement ${r.toFixed(2)}`);
    }
  });

  it('la pesée du 8 août ne déclenche plus rien du tout', () => {
    /* 83 g de riz sec → 393 g cuits, soit 4,68. C'est cette mesure qui
       affichait le grand bandeau rouge, et qui obligeait à choisir entre
       « corriger le rendement » et « corriger les macros ». Elle était juste
       depuis le début : un riz à 81 % d'eau existe. */
    assert.deepEqual(codes(base({ nom: 'Riz basmati', ratio: 393 / 84 })), []);
  });

  it('un rendement approximatif ne déplace pas un gramme à peser', () => {
    /* Corollaire, vérifié ailleurs par le solveur mais rappelé ici : ce
       module n'a plus à trancher entre deux réparations, parce qu'il n'y a
       plus qu'un seul nombre en cause à la fois. */
    const messages = verifierAliment(base({ ratio: 4.68 })).map((d) => d.message);
    assert.deepEqual(messages, []);
  });
});

describe('Le riz de mars — ce qui a failli arriver dans l\'assiette', () => {
  /* Le bug réel : les macros du riz CUIT posées sur un riz qu'on pèse SEC.
     Le solveur calculait juste, et faisait peser trois fois trop. C'est la
     seule erreur de saisie que ce module attrape encore — mais il sait
     maintenant la réparer tout seul. */
  it('des valeurs cuites saisies sur un grain sec sont un blocage', () => {
    assert.deepEqual(codes(cuitesParErreur()), ['valeurs_deja_cuites']);
  });

  it('et le message donne UNE correction, pas un choix', () => {
    const d = verifierAliment(cuitesParErreur())
      .find((x) => x.code === 'valeurs_deja_cuites');

    assert.equal(d?.gravite, 'blocage');
    assert.match(d!.message, /Multiplie tout par le rendement/);
    assert.match(d!.message, /390 kcal/);
    assert.match(d!.message, /84\.6 g de glucides/);
    /* Ce qui a disparu du message, et c'est délibéré : la question posée à
       l'utilisateur. */
    assert.doesNotMatch(d!.message, /toi seul sais/);
    assert.doesNotMatch(d!.message, /Deux corrections/);
  });

  it('la correction proposée est exactement une multiplication', () => {
    const sien = macrosSiDejaCuites(cuitesParErreur());
    assert.equal(Math.round(sien.kcal100), 390);
    assert.equal(Math.round(sien.gluc100 * 10) / 10, 84.6);
    /* Les proportions sont conservées : la cuisson n'ajoute que de l'eau. */
    assert.ok(Math.abs(sien.gluc100 / sien.kcal100 - 28.2 / 130) < 1e-9);
  });

  it('des valeurs qu\'aucun rendement n\'explique reçoivent un autre message', () => {
    /* 40 kcal pour un grain sec : multiplier par 3 donne 120, toujours hors
       bande. Ce n'est pas une saisie cuite, c'est une saisie fausse — et lui
       proposer une multiplication serait un mauvais conseil. */
    const c = codes(cuitesParErreur({
      kcal100: 40, prot100: 0.8, gluc100: 8.7, lip100: 0.1,
    }));
    assert.ok(c.includes('grain_sec_invraisemblable'));
    assert.ok(!c.includes('valeurs_deja_cuites'));
  });

  it('un féculent qui ne gonfle pas n\'est pas jugé sur la bande du grain sec', () => {
    // pommes de terre, patate douce : rendement 1, 92 kcal, et c'est normal
    assert.deepEqual(
      codes(base({
        nom: 'Patate douce', kcal100: 92, prot100: 2, gluc100: 20.7,
        lip100: 0.16, fibres100: 2.5, ratio: 1,
      })),
      [],
    );
  });

  it('les flocons d\'avoine non plus', () => {
    /* 375 kcal/100 g, rendement 1 : on ne les cuit pas dans cette app. */
    assert.deepEqual(
      codes(base({
        nom: 'Flocons avoine', kcal100: 375, prot100: 12.5, gluc100: 59.5,
        lip100: 7.5, fibres100: 8, ratio: 1,
      })),
      [],
    );
  });

  it('LE cas de la semoule : un féculent qui rétrécit est un blocage', () => {
    /* 142 kcal déclarées sèches avec un rendement de 0,41. Les 142 kcal ne
       peuvent PAS être attrapées seules — une pomme de terre en fait 92, et
       c'est normal. Le rendement impossible est le seul indice visible que le
       reste de la fiche est faux. */
    const semoule = base({
      nom: 'Semoule complète', kcal100: 142, prot100: 4.3, gluc100: 26.8,
      lip100: 1, fibres100: 1.9, ratio: 0.41,
    });
    const d = verifierAliment(semoule).find((x) => x.code === 'feculent_qui_retrecit');
    assert.equal(d?.gravite, 'blocage');
    assert.match(d!.message, /décrivent\s+probablement le produit CUIT/);
    assert.ok(inexploitable(semoule), 'aucun repas ne doit se bâtir dessus');
  });

  it('mais un rendement TROP grand ne bloque pas : il n\'annonce qu\'un poids', () => {
    const c = codes(base({ ratio: 5.5 }));
    assert.ok(c.includes('rendement_hors_norme'));
    assert.equal(
      verifierAliment(base({ ratio: 5.5 })).find((x) => x.code === 'rendement_hors_norme')
        ?.gravite,
      'avertissement');
  });

  it('un grain sec anormalement dense est signalé sans bloquer', () => {
    const d = verifierAliment(base({ kcal100: 520, prot100: 8.1, gluc100: 84.6 }))
      .find((x) => x.code === 'grain_sec_trop_dense');
    assert.equal(d?.gravite, 'avertissement');
  });
});

describe('Les calories doivent correspondre aux macros', () => {
  it('un aliment dont les calories sont doublées est signalé', () => {
    assert.ok(codes(base({ kcal100: 800 })).includes('calories_incoherentes'));
  });

  it('un écart de table ordinaire ne déclenche rien', () => {
    // 390 déclarées, 383 par Atwater européen : 1,8 % d'écart
    assert.equal(Math.round(kcalAtwater(base())), 383);
    assert.ok(!codes(base()).includes('calories_incoherentes'));
  });

  it('les fibres comptent 2 kcal/g, comme dans nutrition.ts', () => {
    /* CONVENTION EUROPÉENNE, et c'est tout le projet qui en dépend.
       `nutrition.ts` la pose en tête de fichier et interdit explicitement de
       mélanger les deux tables. Ce module appliquait l'Atwater AMÉRICAIN —
       fibres ignorées — quatre fichiers plus loin. */
    const chia = base({
      categorie: 'ole', kcal100: 486, prot100: 17, gluc100: 7.7, lip100: 31,
      fibres100: 34, ratio: 1,
    });

    // 4×17 + 4×7,7 + 2×34 + 9×31 = 445,8
    assert.equal(Math.round(kcalAtwater(chia)), 446);
  });

  it('un aliment riche en fibres n\'est pas accusé à tort', () => {
    /* Des graines de chia réelles : aucune des deux valeurs saisies n'est
       fausse. En ignorant les 34 g de fibres, le calcul tombait à 378 et
       l'écart de 108 kcal dépassait la marge de 20 % — le module dont la
       raison d'être est de repérer les données qui mentent accusait une
       donnée juste, sur toute la famille des oléagineux. */
    assert.ok(!codes(base({
      categorie: 'ole', kcal100: 486, prot100: 17, gluc100: 7.7, lip100: 31,
      fibres100: 34, ratio: 1,
    })).includes('calories_incoherentes'));
  });

  it('des fibres absentes valent zéro, jamais NaN', () => {
    // `fibres100` est facultatif : le type le dit, le calcul doit le tenir.
    assert.equal(Math.round(kcalAtwater(base({ fibres100: undefined }))), 379);
  });

  it('les aliments très peu caloriques ne crient pas au loup', () => {
    /* 5 kcal d'écart sur un légume à 20 kcal font 25 % — la marge absolue de
       25 kcal évite de signaler tous les légumes de la table. */
    assert.ok(!codes(base({
      categorie: 'leg', kcal100: 33, prot100: 2.8, gluc100: 2.4, lip100: 0.4,
      fibres100: 2.9, ratio: 1,
    })).includes('calories_incoherentes'));
  });
});

describe('Le rendement d\'une protéine ne fait qu\'annoncer un poids', () => {
  const prot = (p: Partial<Aliment> = {}): Aliment => base({
    nom: 'Saumon', categorie: 'prot', kcal100: 173.5, prot100: 18.9,
    gluc100: 0, lip100: 10.2, fibres100: 0, ratio: 0.85, ...p,
  });

  it('un poisson qui gagnerait du poids à la cuisson est signalé', () => {
    assert.ok(codes(prot({ ratio: 1.4 })).includes('rendement_hors_norme'));
  });

  it('mais ce n\'est qu\'une info, et ce sera vrai de tous désormais', () => {
    const d = verifierAliment(prot({ ratio: 0.53 }))
      .find((x) => x.code === 'rendement_hors_norme');
    assert.equal(d?.gravite, 'info');
    assert.match(d!.message, /Sans conséquence sur tes macros/);
  });

  it('le thon au naturel, qui ne cuit pas, passe', () => {
    assert.deepEqual(codes(prot({
      nom: 'Thon', kcal100: 116, prot100: 25.5, lip100: 1, ratio: 1,
    })), []);
  });
});

describe('L\'arithmétique de base', () => {
  it('plus de 100 g de nutriments dans 100 g de produit', () => {
    assert.ok(codes(base({ prot100: 40, gluc100: 40, lip100: 40 })).includes('plus_de_cent'));
  });

  it('une valeur négative bloque tout de suite', () => {
    assert.deepEqual(codes(base({ gluc100: -5 })), ['valeur_negative']);
  });

  it('un rendement nul bloque', () => {
    assert.deepEqual(codes(base({ ratio: 0 })), ['rendement_nul']);
  });

  it('un NaN ne passe pas au travers', () => {
    assert.deepEqual(codes(base({ kcal100: Number.NaN })), ['valeur_illisible']);
  });
});

describe('Les pesées réelles du 8 août', () => {
  /* Des mesures faites à la balance, dans l'onglet « mon frigo ». Elles sont
     ici pour de bon : ce sont les seules données de terrain qu'on ait, et le
     module doit dire la vérité sur chacune. Deux d'entre elles ont été
     refusées à tort par sa première version. */

  it('courgettes 467 g crues → 343 g cuites : rien à signaler', () => {
    assert.deepEqual(codes(base({
      nom: 'Courgettes', categorie: 'leg', kcal100: 15, prot100: 1,
      gluc100: 1.6, lip100: 0.2, fibres100: 1, ratio: 343 / 467,
    })), []);
  });

  it('brocoli 200 g cru → 150 g à la vapeur : rien à signaler non plus', () => {
    assert.deepEqual(codes(base({
      nom: 'Brocoli', categorie: 'leg', kcal100: 28, prot100: 3,
      gluc100: 2, lip100: 0.5, fibres100: 2.6, ratio: 150 / 200,
    })), []);
  });

  it('un épinard qui gonflerait à 1.7 est signalé', () => {
    /* Ce que donnait la dérivation par l'énergie : 119 g crus pour servir
       200 g cuits, quand il en faut 500 à 700. */
    assert.ok(codes(base({
      nom: 'Épinards', categorie: 'leg', kcal100: 22, prot100: 2.7,
      gluc100: 0.9, lip100: 0.4, fibres100: 2.5, ratio: 1.7,
    })).includes('rendement_invraisemblable'));
  });

  it('truite 192 g crue → 102 g cuite : signalée, mais sans effet sur les macros', () => {
    const d = verifierAliment(base({
      nom: 'Truite', categorie: 'prot', kcal100: 148, prot100: 20.8,
      gluc100: 0, lip100: 6.8, fibres100: 0, ratio: 102 / 192,
    })).find((x) => x.code === 'rendement_hors_norme');

    assert.ok(d, 'un rendement de 0,53 mérite une mention');
    assert.equal(d!.gravite, 'info');
  });
});

describe('Le catalogue de l\'application est sain', () => {
  it('aucun aliment de référence n\'est inexploitable', () => {
    const mauvais = CATALOGUE.filter(inexploitable)
      .map((a) => `${a.nom} : ${verifierAliment(a).map((d) => d.code).join(', ')}`);
    assert.deepEqual(mauvais, []);
  });

  it('et aucun n\'a même un avertissement', () => {
    const dits = verifierCatalogue(CATALOGUE).map((d) => d.message);
    assert.deepEqual(dits, []);
  });

  it('les quatre féculents qui gonflent tombent bien dans la bande sèche', () => {
    /* Ce que la migration a fait, vérifié sur le catalogue : un grain sec,
       c'est de la matière sèche, et ça fait 300 à 400 kcal. */
    const gonflants = CATALOGUE.filter((a) => a.categorie === 'fec' && a.ratio > 1.3);
    assert.equal(gonflants.length, 4);
    for (const a of gonflants) {
      assert.ok(a.kcal100 >= 300 && a.kcal100 <= 400, `${a.nom} : ${a.kcal100} kcal`);
    }
  });

  it('les anomalies sortent classées, le plus grave d\'abord', () => {
    const faux: Aliment[] = [
      base({
        id: 1, nom: 'Truite très cuite', categorie: 'prot', kcal100: 148,
        prot100: 20.8, gluc100: 0, lip100: 6.8, fibres100: 0, ratio: 0.53,
      }),
      cuitesParErreur({ id: 2, nom: 'Riz saisi cuit' }),
    ];
    const d = verifierCatalogue(faux);
    assert.equal(d[0]?.gravite, 'blocage');
    assert.equal(d[d.length - 1]?.gravite, 'info');
  });
});
