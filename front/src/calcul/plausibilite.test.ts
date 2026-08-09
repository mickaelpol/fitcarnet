import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CATALOGUE } from '../solveur/frigos.test-data';
import type { Aliment } from '@/solveur/types';

import {
  densiteAvantCuisson, inexploitable, kcalAtwater, macrosSelonLeRendement,
  verifierAliment, verifierCatalogue,
} from './plausibilite';

const base = (p: Partial<Aliment> = {}): Aliment => ({
  id: 'x', nom: 'Test', categorie: 'fec',
  kcal100: 130, prot100: 2.7, gluc100: 28.2, lip100: 0.3, fibres100: 0.7,
  ratio: 3, etatReference: 'cuit',
  ...p,
});

const codes = (a: Aliment): string[] => verifierAliment(a).map((d) => d.code);

describe('Le riz de mars — ce qui a failli arriver dans l\'assiette', () => {
  /* Le bug réel : l'import Grocy marquait les féculents « cru », donc les
     macros du riz SEC étaient lues comme celles du riz cuit. Le solveur
     calculait juste, et la portion était 2,3 fois trop grosse. */
  it('un féculent déclaré cru est un blocage', () => {
    assert.ok(codes(base({ etatReference: 'cru' })).includes('feculent_reference_crue'));
  });

  it('le message dit de combien on se tromperait', () => {
    const d = verifierAliment(base({ etatReference: 'cru', ratio: 3 }))
      .find((x) => x.code === 'feculent_reference_crue');
    assert.ok(d?.message.includes('3.0 fois trop'));
  });

  it('un féculent qui ne gonfle pas peut être servi tel quel', () => {
    // pommes de terre, patate douce : pesées cuites, rendement 1
    assert.deepEqual(
      codes(base({ nom: 'Patate douce', kcal100: 92, prot100: 2, gluc100: 20.7, lip100: 0.16, ratio: 1 })),
      [],
    );
  });

  it('les flocons d\'avoine ne sont pas pris pour du riz sec', () => {
    /* 375 kcal/100 g, mais rendement 1 : on ne les cuit pas dans cette app.
       Le contrôle énergétique ne doit pas s'y appliquer. */
    assert.deepEqual(
      codes(base({
        nom: 'Flocons avoine', kcal100: 375, prot100: 12.5, gluc100: 59.5,
        lip100: 7.5, fibres100: 8, ratio: 1,
      })),
      [],
    );
  });
});

describe('La conservation de l\'énergie tranche les rendements douteux', () => {
  it('un rendement de 4.68 avec les macros de la table est un blocage', () => {
    /* Ce n'est pas la pesée qui est rejetée — un riz à 4,68 existe, il
       contient 81 % d'eau. C'est de lui coller les macros d'un riz à 70 %
       d'eau : ce riz-là ferait alors 608 kcal/100 g à sec, plus dense que du
       beurre. */
    const c = codes(base({ ratio: 4.68 }));
    assert.ok(c.includes('rendement_contredit_par_energie'));
    assert.ok(!c.includes('rendement_hors_norme'), 'la pesée seule n\'est pas fautive');
    assert.equal(Math.round(densiteAvantCuisson(base({ ratio: 4.68 }))), 608);
  });

  it('un rendement de 3 sur du riz à 130 kcal est cohérent', () => {
    assert.deepEqual(codes(base({ ratio: 3 })), []);
    assert.equal(Math.round(densiteAvantCuisson(base({ ratio: 3 }))), 390);
  });

  it('un rendement trop bas est signalé, avec la fourchette qui marcherait', () => {
    const d = verifierAliment(base({ ratio: 2 }))
      .find((x) => x.code === 'rendement_contredit_par_energie');
    assert.ok(d, 'un riz sec à 260 kcal/100 g aurait dû être signalé');
    assert.match(d!.message, /2\.31–3\.08/);
  });

  it('c\'est un blocage : le repas calculé dessus sera faux', () => {
    /* Rien n'est désactivé — mais tant que ces deux nombres se contredisent,
       les grammes affichés ne veulent rien dire. */
    const d = verifierAliment(base({ ratio: 2 }))
      .find((x) => x.code === 'rendement_contredit_par_energie');
    assert.equal(d?.gravite, 'blocage');
  });
});

describe('Les calories doivent correspondre aux macros', () => {
  it('un aliment dont les calories sont doublées est signalé', () => {
    assert.ok(codes(base({ kcal100: 300 })).includes('calories_incoherentes'));
  });

  it('un écart de table ordinaire ne déclenche rien', () => {
    // 130 déclarées, 125.6 par Atwater : 3,4 % d'écart
    assert.equal(Math.round(kcalAtwater(base())), 126);
    assert.ok(!codes(base()).includes('calories_incoherentes'));
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

describe('Une protéine se pèse crue', () => {
  const prot = (p: Partial<Aliment>): Aliment => base({
    categorie: 'prot', kcal100: 173.5, prot100: 18.9, gluc100: 0, lip100: 10.2,
    fibres100: 0, ratio: 0.85, etatReference: 'cru', ...p,
  });

  it('déclarée cuite, c\'est un blocage', () => {
    assert.ok(codes(prot({ etatReference: 'cuit' })).includes('proteine_reference_cuite'));
  });

  it('un poisson qui gagnerait du poids à la cuisson est signalé', () => {
    assert.ok(codes(prot({ ratio: 1.4 })).includes('rendement_hors_norme'));
  });

  it('mais ce n\'est qu\'une info : les macros d\'une protéine sont crues', () => {
    /* Le rendement d'une protéine ne sert qu'à afficher le poids cuit. Il ne
       déplace pas un gramme de ce qui est compté dans la journée. */
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
    const c = codes(base({ gluc100: -5 }));
    assert.deepEqual(c, ['valeur_negative']);
  });

  it('un rendement nul bloque', () => {
    assert.ok(codes(base({ ratio: 0 })).includes('rendement_nul'));
  });

  it('un NaN ne passe pas au travers', () => {
    assert.deepEqual(codes(base({ kcal100: Number.NaN })), ['valeur_illisible']);
  });
});

describe('Les pesées réelles du 8 août', () => {
  /* Trois mesures faites à la balance, dans l'onglet « mon frigo ». Elles
     sont ici pour de bon : ce sont les seules données de terrain qu'on ait,
     et le module doit dire la vérité sur chacune — y compris quand cette
     vérité est « ta mesure est bonne, c'est autre chose qui cloche ». */

  it('riz 83 g sec → 393 g cuit : la pesée tient, le couple non', () => {
    const riz = base({ nom: 'Riz basmati', ratio: 393 / 84 });
    const c = codes(riz);
    /* La pesée seule n'est pas mise en cause : 393 g de riz à 81 % d'eau
       contiennent bien les 73 g de matière sèche de 83 g de riz sec. */
    assert.ok(!c.includes('rendement_hors_norme'));
    assert.ok(c.includes('rendement_contredit_par_energie'));

    /* 84 g de riz sec portent environ 293 kcal. Elles ne peuvent pas
       augmenter en cuisant : réparties sur 393 g, elles font 75 kcal/100 g,
       pas les 130 de la table. */
    assert.equal(Math.round(densiteAvantCuisson(riz)), 608);
  });

  it('et le message propose les DEUX sorties, pas une seule', () => {
    const d = verifierAliment(base({ ratio: 393 / 84 }))
      .find((x) => x.code === 'rendement_contredit_par_energie');
    assert.match(d!.message, /corriger le rendement/);
    assert.match(d!.message, /garder TA pesée/);
    // ce que ferait ce riz-là, macros conservées en proportion
    assert.match(d!.message, /75 kcal/);
    assert.match(d!.message, /16\.2 g de/);
  });

  it('les macros de SON riz se déduisent de sa propre pesée', () => {
    const sien = macrosSelonLeRendement(base({ ratio: 393 / 84 }));
    assert.equal(Math.round(sien.kcal100), 75);
    assert.equal(Math.round(sien.gluc100 * 10) / 10, 16.2);
    /* Les proportions sont conservées : la cuisson n'ajoute que de l'eau. */
    assert.ok(Math.abs(sien.gluc100 / sien.kcal100 - 28.2 / 130) < 1e-9);
  });

  it('courgettes 467 g crues → 343 g cuites : rien à signaler', () => {
    /* Un légume rend son eau. 0,73 est une mesure juste, et le module l'a
       signalée à tort dans sa première version. */
    assert.deepEqual(codes(base({
      nom: 'Courgettes', categorie: 'leg', kcal100: 15, prot100: 1,
      gluc100: 1.6, lip100: 0.2, fibres100: 1, ratio: 343 / 467,
      etatReference: 'cru',
    })), []);
  });

  it('brocoli 200 g cru → 150 g à la vapeur : rien à signaler non plus', () => {
    assert.deepEqual(codes(base({
      nom: 'Brocoli', categorie: 'leg', kcal100: 28, prot100: 3,
      gluc100: 2, lip100: 0.5, fibres100: 2.6, ratio: 150 / 200,
      etatReference: 'cru',
    })), []);
  });

  it('un légume référencé CUIT est un blocage', () => {
    /* Référencé cuit, la colonne « à cuire » ne peut être juste qu'en
       connaissant le rendement — et il n'est pas dérivable. */
    assert.ok(codes(base({
      nom: 'Brocoli', categorie: 'leg', kcal100: 28, prot100: 3,
      gluc100: 2, lip100: 0.5, fibres100: 2.6, ratio: 0.75,
      etatReference: 'cuit',
    })).includes('legume_reference_cuite'));
  });

  it('un épinard qui gonflerait à 1.7 est signalé', () => {
    /* Ce que donnait la dérivation par l'énergie : 119 g crus pour servir
       200 g cuits, quand il en faut 500 à 700. */
    assert.ok(codes(base({
      nom: 'Épinards', categorie: 'leg', kcal100: 22, prot100: 2.7,
      gluc100: 0.9, lip100: 0.4, fibres100: 2.5, ratio: 1.7,
      etatReference: 'cru',
    })).includes('rendement_invraisemblable'));
  });

  it('truite 192 g crue → 102 g cuite : signalée, mais sans effet sur les macros', () => {
    const d = verifierAliment(base({
      nom: 'Truite', categorie: 'prot', kcal100: 148, prot100: 20.8,
      gluc100: 0, lip100: 6.8, fibres100: 0, ratio: 102 / 192,
      etatReference: 'cru',
    })).find((x) => x.code === 'rendement_hors_norme');

    assert.ok(d, 'un rendement de 0,53 mérite une mention');
    /* Une info, pas une faute : une protéine porte ses valeurs CRUES et se
       pèse crue. Son rendement ne change que la colonne « cuit ». */
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

  it('les anomalies sortent classées, le plus grave d\'abord', () => {
    const faux: Aliment[] = [
      base({
        id: 1, nom: 'Truite très cuite', categorie: 'prot', kcal100: 148,
        prot100: 20.8, gluc100: 0, lip100: 6.8, fibres100: 0,
        ratio: 0.53, etatReference: 'cru',
      }),
      base({ id: 2, nom: 'Riz inversé', etatReference: 'cru' }),
    ];
    const d = verifierCatalogue(faux);
    assert.equal(d[0]?.gravite, 'blocage');
    assert.equal(d[d.length - 1]?.gravite, 'info');
  });
});
