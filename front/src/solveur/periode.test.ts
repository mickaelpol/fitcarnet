import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cleDuRepas, composer, listeDeCourses, REPAS, resoudreLaJournee, resoudreLaPeriode,
} from './composer';
import type { DemandeDatee, Repas, Role } from './composer';
import { CIBLES_PLAN, frigoAleatoire } from './frigos.test-data';
import type { Frigo } from './frigos.test-data';
import type { Aliment } from './types';

/**
 * PLUSIEURS JOURS, UN SEUL FRIGO.
 *
 * La journée partageait déjà son stock entre ses quatre repas. La période fait
 * la même chose sur plusieurs jours, et c'est délibérément le MÊME mécanisme :
 * `resoudreLaJournee` n'est plus qu'un appel à `resoudreLaPeriode` sur un seul
 * jour. Un bug de partage se verrait donc des deux côtés à la fois.
 *
 * Le choix de fond, pris avec Mickaël : le frigo se VIDE au fil des jours. Un
 * frigo qui doit tenir cinq jours s'épuisera, et les derniers repas seront
 * recomposés autour de ce qui reste. C'est la réalité qu'on veut voir — mieux
 * vaut savoir dès le lundi que le jeudi ne passera pas.
 */

const jours = (frigo: Frigo, combien: number, portions = 2): DemandeDatee[] => {
  const out: DemandeDatee[] = [];
  for (let jour = 0; jour < combien; jour += 1) {
    for (const repas of REPAS) {
      const par = CIBLES_PLAN[repas];
      const depart = composer(frigo.aliments, portions, new Set(), repas);
      out.push({
        jour,
        repas,
        variables: depart.variables,
        fixes: depart.fixes,
        cibles: {
          kcal: par.kcal * portions, prot: par.prot * portions,
          gluc: par.gluc * portions, lip: par.lip * portions,
        },
        verrous: new Set<Role>(),
        glucidesTotaux: false,
      });
    }
  }

  return out;
};

/** Ce que TOUTE la période réclame, aliment par aliment. */
const totalReclame = (
  sorties: Map<string, { resultat: { quantites: { aliment: Aliment; aCuire: number }[] } }>,
): Map<Aliment['id'], number> => {
  const total = new Map<Aliment['id'], number>();
  for (const sortie of sorties.values()) {
    for (const q of sortie.resultat.quantites) {
      total.set(q.aliment.id, (total.get(q.aliment.id) ?? 0) + q.aCuire);
    }
  }

  return total;
};

describe('La période ne réclame jamais plus que le frigo', () => {
  it('sur trois jours, comme sur un seul', () => {
    const fautes: string[] = [];

    for (let graine = 1; graine <= 80; graine += 1) {
      const frigo = frigoAleatoire(graine);
      if (frigo.aliments.length === 0) continue;

      const sorties = resoudreLaPeriode(
        jours(frigo, 3), frigo.stockDe, frigo.aliments);

      for (const [id, demande] of totalReclame(sorties)) {
        const aliment = frigo.aliments.find((a) => a.id === id);
        if (aliment === undefined) continue;
        const dispo = frigo.stockDe(aliment);
        /* Un demi-gramme par repas : douze repas, six grammes de marge. */
        if (demande > dispo + 6) {
          fautes.push(`  graine ${graine} — ${aliment.nom} : `
            + `${demande.toFixed(0)} g réclamés sur 3 jours, `
            + `${dispo.toFixed(0)} g en stock`);
        }
      }
    }

    assert.equal(fautes.length, 0,
      'La période réclame plus que ce que contient le frigo.\n'
        + fautes.slice(0, 10).join('\n'));
  });

  it('et plus la période est longue, moins elle en réclame par jour', () => {
    /* Le corollaire du frigo qui se vide : allonger la période n'augmente pas
       la consommation totale, elle la RÉPARTIT. Si ce test tombe, c'est que
       chaque jour est reparti d'un frigo plein. */
    const frigo = frigoAleatoire(7);
    const total = (n: number): number => {
      let somme = 0;
      for (const g of totalReclame(
        resoudreLaPeriode(jours(frigo, n), frigo.stockDe, frigo.aliments)).values()) {
        somme += g;
      }

      return somme;
    };

    const unJour = total(1);
    const cinqJours = total(5);
    assert.ok(cinqJours < 5 * unJour,
      `5 jours réclament ${cinqJours.toFixed(0)} g, soit ${(cinqJours / unJour).toFixed(1)} `
        + 'fois une journée — le frigo ne se vide pas');
  });
});

describe('Le temps décide, pas l\'ordre de saisie', () => {
  it('cocher ses jours à rebours donne exactement le même plan', () => {
    for (let graine = 1; graine <= 40; graine += 1) {
      const frigo = frigoAleatoire(graine);
      if (frigo.aliments.length === 0) continue;

      const demandes = jours(frigo, 3);
      const endroit = resoudreLaPeriode(demandes, frigo.stockDe, frigo.aliments);
      const envers = resoudreLaPeriode(
        [...demandes].reverse(), frigo.stockDe, frigo.aliments);

      for (const [cle, sortie] of endroit) {
        const autre = envers.get(cle);
        assert.ok(autre !== undefined, `${cle} manque à l'envers (graine ${graine})`);
        assert.deepEqual(
          autre!.resultat.quantites.map((q) => [q.aliment.nom, q.aCuire]),
          sortie.resultat.quantites.map((q) => [q.aliment.nom, q.aCuire]),
          `${cle} diffère selon l'ordre de saisie (graine ${graine})`);
      }
    }
  });

  it('le premier jour est servi en entier, le dernier hérite du manque', () => {
    /* Le cas vécu, transposé sur trois jours : 500 g de brocoli, et chaque
       jour en réclame. */
    const frigo = frigoAleatoire(3);
    const sorties = resoudreLaPeriode(jours(frigo, 4), frigo.stockDe, frigo.aliments);

    const plafonnes = (jour: number): number => {
      let n = 0;
      for (const repas of REPAS) {
        n += sorties.get(cleDuRepas(jour, repas))?.resultat.diagnostics
          .filter((d) => d.code === 'quantite_plafonnee').length ?? 0;
      }

      return n;
    };

    assert.ok(plafonnes(3) >= plafonnes(0),
      `le dernier jour devrait souffrir au moins autant que le premier : `
        + `${plafonnes(0)} contre ${plafonnes(3)}`);
  });
});

describe('Une période d\'un jour EST une journée', () => {
  it('resoudreLaJournee et resoudreLaPeriode donnent le même plan', () => {
    for (let graine = 1; graine <= 40; graine += 1) {
      const frigo = frigoAleatoire(graine);
      if (frigo.aliments.length === 0) continue;

      const datees = jours(frigo, 1);
      const parJournee = resoudreLaJournee(datees, frigo.stockDe, frigo.aliments);
      const parPeriode = resoudreLaPeriode(datees, frigo.stockDe, frigo.aliments);

      for (const repas of REPAS) {
        assert.deepEqual(
          parPeriode.get(cleDuRepas(0, repas))?.resultat.quantites
            .map((q) => [q.aliment.nom, q.aCuire]),
          parJournee.get(repas)?.resultat.quantites.map((q) => [q.aliment.nom, q.aCuire]),
          `${repas} diffère (graine ${graine})`);
      }
    }
  });
});

describe('La liste de courses dit ce qui manque, pas ce qui reste', () => {
  it('ne propose jamais d\'acheter ce qu\'on a déjà en quantité', () => {
    for (let graine = 1; graine <= 40; graine += 1) {
      const frigo = frigoAleatoire(graine);
      if (frigo.aliments.length === 0) continue;

      for (const ligne of listeDeCourses(jours(frigo, 2), frigo.stockDe, frigo.aliments)) {
        assert.ok(ligne.grammes > 0,
          `${ligne.aliment.nom} : ${ligne.grammes} g à acheter (graine ${graine})`);
      }
    }
  });

  it('un frigo qui couvre tout ne donne aucune course', () => {
    const frigo = frigoAleatoire(11);
    const genereux = (): number => 100_000;

    assert.deepEqual(
      listeDeCourses(jours(frigo, 3), genereux, frigo.aliments), []);
  });

  it('un frigo vide fait acheter TOUT le plan', () => {
    /* Le frigo ne sert qu'à retrancher : à zéro, la liste est exactement ce
       que le plan réclame. C'est le test qui prouve que la liste part du plan
       IDÉAL et non du plan bridé — un plan bridé par un frigo vide ne
       contiendrait rien du tout. */
    const frigo = frigoAleatoire(5);
    const vide = (): number => 0;
    const courses = listeDeCourses(jours(frigo, 2), vide, frigo.aliments);

    assert.ok(courses.length >= 3,
      `un frigo vide devrait faire acheter plusieurs aliments, pas ${courses.length}`);

    const attendu = totalReclame(
      resoudreLaPeriode(jours(frigo, 2), () => Number.POSITIVE_INFINITY, frigo.aliments));

    for (const ligne of courses) {
      const voulu = attendu.get(ligne.aliment.id) ?? 0;
      /* Toujours ARRONDI AU-DESSUS : acheter 94 g quand il en faut 94,3 fait
         rater le dernier repas d'un cheveu. On arrondit dans le sens qui
         pardonne. */
      assert.ok(ligne.grammes >= voulu,
        `${ligne.aliment.nom} : ${ligne.grammes} g à acheter pour ${voulu.toFixed(1)} g voulus`);
      assert.ok(ligne.grammes < voulu + 1,
        `${ligne.aliment.nom} : ${ligne.grammes} g, c'est plus d'un gramme de trop`);
    }
  });

  it('après les courses, le plan idéal tient dans le frigo', () => {
    /* L'invariant qui compte : la liste doit SUFFIRE. On refait les courses,
       on les ajoute au stock, et le plan doit alors passer sans être bridé. */
    const frigo = frigoAleatoire(9);
    const demandes = jours(frigo, 3);
    const courses = listeDeCourses(demandes, frigo.stockDe, frigo.aliments);

    const apresCourses = (a: Aliment): number =>
      frigo.stockDe(a) + (courses.find((c) => c.aliment.id === a.id)?.grammes ?? 0);

    const ideal = totalReclame(
      resoudreLaPeriode(demandes, () => Number.POSITIVE_INFINITY, frigo.aliments));

    for (const [id, voulu] of ideal) {
      const aliment = frigo.aliments.find((a) => a.id === id);
      if (aliment === undefined) continue;
      assert.ok(apresCourses(aliment) >= voulu,
        `${aliment.nom} : ${voulu.toFixed(0)} g voulus, `
          + `${apresCourses(aliment).toFixed(0)} g après courses`);
    }
  });

  it('les grammes sont arrondis au-dessus et la liste triée par nom', () => {
    const frigo = frigoAleatoire(13);
    const courses = listeDeCourses(jours(frigo, 2), () => 0, frigo.aliments);

    for (const ligne of courses) {
      assert.equal(ligne.grammes, Math.round(ligne.grammes),
        `${ligne.aliment.nom} : ${ligne.grammes} g, on n'achète pas des décimales`);
    }
    const noms = courses.map((c) => c.aliment.nom);
    assert.deepEqual(noms, [...noms].sort((x, y) => x.localeCompare(y, 'fr')));
  });
});

describe('Le rang du jour n\'a pas besoin d\'être 0, 1, 2…', () => {
  /* L'écran numérote ses jours en rang de calendrier — 0 pour aujourd'hui,
     3 pour dans trois jours — et passe ces rangs tels quels au solveur. Cela
     lui évite de retraduire les clés de sortie, et une traduction de moins,
     c'est une occasion de moins d'attribuer les repas d'un jour à un autre.
     Encore faut-il que le solveur accepte des rangs non contigus. */
  it('des rangs épars donnent le même plan que des rangs contigus', () => {
    const frigo = frigoAleatoire(17);
    const base = jours(frigo, 3);

    const epars = base.map((d) => ({ ...d, jour: [0, 4, 9][d.jour]! }));
    const contigus = resoudreLaPeriode(base, frigo.stockDe, frigo.aliments);
    const ecartes = resoudreLaPeriode(epars, frigo.stockDe, frigo.aliments);

    for (const repas of REPAS) {
      for (const [index, rang] of [0, 4, 9].entries()) {
        assert.deepEqual(
          ecartes.get(cleDuRepas(rang, repas))?.resultat.quantites
            .map((q) => [q.aliment.nom, q.aCuire]),
          contigus.get(cleDuRepas(index, repas))?.resultat.quantites
            .map((q) => [q.aliment.nom, q.aCuire]),
          `jour ${rang} / ${repas}`);
      }
    }
  });

  it('les clés de sortie reprennent le rang donné, sans le renuméroter', () => {
    const frigo = frigoAleatoire(21);
    const demandes = jours(frigo, 2).map((d) => ({ ...d, jour: d.jour === 0 ? 5 : 8 }));
    const sorties = resoudreLaPeriode(demandes, frigo.stockDe, frigo.aliments);

    assert.deepEqual(
      [...sorties.keys()].sort(),
      [...REPAS.map((r) => cleDuRepas(5, r)), ...REPAS.map((r) => cleDuRepas(8, r))].sort());
  });

  /**
   * DÉCLARER UN RESTE NE DOIT PAS RÉTRÉCIR LA LISTE DE COURSES.
   *
   * « Il me reste 80 g de riz » décrit le frigo. Ça ne change pas ce que le
   * plan RÉCLAME — donc pas ce qu'il faut acheter pour le tenir. Le plafond
   * survivait pourtant à la passe « frigo plein » de `listeDeCourses`, où il
   * devenait le seul frein : décrire la même réalité de deux façons donnait
   * deux listes différentes, et la seconde faisait SOUS-ACHETER. Ça ne se voit
   * qu'au supermarché, multiplié par le nombre de repas de la semaine.
   */
  describe('un reste déclaré et la liste de courses', () => {
    const avecPlafonds = (
      demandes: DemandeDatee[],
      plafonds: Record<string, number>,
    ): DemandeDatee[] => demandes.map((d) => ({ ...d, plafonds }));

    it('déclarer un reste ne réduit pas ce qu\'il faut acheter', () => {
      const frigo = frigoAleatoire(31);
      const demandes = jours(frigo, 2);
      const premier = frigo.aliments[0];
      assert.ok(premier !== undefined);

      const sans = listeDeCourses(demandes, frigo.stockDe, frigo.aliments);
      const avec = listeDeCourses(
        avecPlafonds(demandes, { [String(premier.id)]: 80 }),
        frigo.stockDe, frigo.aliments);

      const grammesDe = (
        liste: { aliment: Aliment; grammes: number }[], id: Aliment['id'],
      ): number => liste.find((l) => l.aliment.id === id)?.grammes ?? 0;

      for (const a of frigo.aliments) {
        assert.ok(grammesDe(avec, a.id) >= grammesDe(sans, a.id),
          `${a.nom} : ${grammesDe(avec, a.id)} g à acheter en déclarant un reste, `
            + `contre ${grammesDe(sans, a.id)} g sans — un reste ne rend pas la `
            + 'nourriture moins nécessaire');
      }
    });

    it('un plafond n\'empêche pas la liste de suffire au plan idéal', () => {
      /* Le même invariant que plus haut, mais avec un reste déclaré : après
         les courses, le plan que l'on VOULAIT doit passer. */
      const frigo = frigoAleatoire(37);
      const plafonnees = avecPlafonds(jours(frigo, 2), Object.fromEntries(
        frigo.aliments.map((a) => [String(a.id), 50])));
      const courses = listeDeCourses(plafonnees, frigo.stockDe, frigo.aliments);

      const apresCourses = (a: Aliment): number =>
        frigo.stockDe(a) + (courses.find((c) => c.aliment.id === a.id)?.grammes ?? 0);

      const ideal = totalReclame(
        resoudreLaPeriode(jours(frigo, 2), () => Number.POSITIVE_INFINITY, frigo.aliments));

      for (const [id, voulu] of ideal) {
        const aliment = frigo.aliments.find((a) => a.id === id);
        if (aliment === undefined) continue;
        assert.ok(apresCourses(aliment) >= voulu - 1,
          `${aliment.nom} : ${voulu.toFixed(0)} g voulus, `
            + `${apresCourses(aliment).toFixed(0)} g après courses`);
      }
    });
  });
});
