import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Serie } from '@/api/types';
import {
  arrondirCharge, epley, estimerDepuisEssai, PALIERS, paliersPour, pasConseille,
  PAS_DISPONIBLES, predictionValide, MIN_CHARGES_TRAVAIL, repsAu, REPS_MAX_POUR_1RM, rmDesSeries,
  volumeDesSeries,
} from './performance';

/**
 * LES MESURES DE PROGRESSION.
 *
 * Ce module n'avait AUCUN test, et il n'était même pas compilé par la suite :
 * `tsconfig.tests.json` énumérait ses fichiers à la main, et celui-ci n'y
 * figurait pas. Trois constats de l'audit de septembre 2026 y vivaient — dont
 * le record fantôme né d'une formule recopiée sans son plafond.
 *
 * Les chiffres d'ici s'affichent sur la carte d'exercice et dans le disque de
 * progression : un 1RM faux ne plante rien, il raconte simplement une
 * progression qui n'a pas eu lieu.
 */

const serie = (reps: number | null, poids: number | null): Serie =>
  ({ ordre: 1, reps, poids, secondes: null } as Serie);

/* ------------------------------------------------------------- Epley */

test('Epley ajoute 3,33 % par répétition', () => {
  assert.equal(Math.round(epley(100, 5) * 10) / 10, 116.7);
});

/* ------------------------------------------------- une seule répétition */

test('une répétition à 100 kg EST un 1RM de 100 kg', () => {
  /* La définition, pas une estimation. `estimerDepuisEssai` porte déjà cette
     garde et dit pourquoi : « Epley y ajouterait 3,3 % — un chiffre inventé ».
     `rmDesSeries` ne l'avait pas : la même conviction appliquée à un endroit
     et oubliée à l'autre. Résultat, la carte d'exercice affichait 103,3 kg là
     où le calculateur affichait 100 kg, pour la même série. */
  assert.equal(rmDesSeries([serie(1, 100)]), 100);
});

test('les deux chemins vers le 1RM s\'accordent sur une répétition', () => {
  assert.equal(rmDesSeries([serie(1, 87.5)]), estimerDepuisEssai(87.5, 1));
});

test('les deux chemins s\'accordent aussi au-delà d\'une répétition', () => {
  assert.equal(rmDesSeries([serie(6, 65)]), estimerDepuisEssai(65, 6));
});

/* ------------------------------------------------------- le plafond */

test('au-delà du plafond, aucune estimation n\'est rendue', () => {
  /* « Une série de 93 répétitions à 32 kg donnerait entre 50 et 131 kg —
     c'est-à-dire davantage qu'une série de 7 à 35 kg, ce qui est absurde. » */
  assert.equal(rmDesSeries([serie(REPS_MAX_POUR_1RM + 1, 40)]), null);
  assert.equal(estimerDepuisEssai(40, REPS_MAX_POUR_1RM + 1), null);
});

test('le plafond lui-même reste valable', () => {
  assert.notEqual(rmDesSeries([serie(REPS_MAX_POUR_1RM, 40)]), null);
});

test('la meilleure série courte gagne, les longues sont ignorées', () => {
  // 30 reps à 40 kg vaudrait 79,96 par Epley : c'est le record fantôme.
  assert.equal(rmDesSeries([serie(30, 40), serie(6, 65)]), 78);
});

/* --------------------------------------------------------- cas limites */

test('une série vide ou nulle ne produit rien', () => {
  assert.equal(rmDesSeries([]), null);
  assert.equal(rmDesSeries([serie(null, null)]), null);
  assert.equal(rmDesSeries([serie(0, 50)]), null);
  assert.equal(rmDesSeries([serie(5, 0)]), null);
});

/* ------------------------------------------------------------ volume */

test('le volume compte tout, séries longues comprises', () => {
  /* La contrepartie du plafond : l'endurance n'est pas niée, elle est comptée
     là où elle veut dire quelque chose. */
  assert.equal(volumeDesSeries([serie(30, 40), serie(6, 65)]), 1590);
});

test('le volume ignore les séries incomplètes', () => {
  assert.equal(volumeDesSeries([serie(null, 40), serie(5, null)]), 0);
});

/* ------------------------------------------------------------ paliers */

test('à 100 % du maximum, c\'est une répétition', () => {
  assert.equal(repsAu(100), 1);
});

/* CE TEST A ÉTÉ RÉÉCRIT le 15 septembre 2026, et il faut dire pourquoi.
   Il exigeait `PALIERS[0] === 100` et comparait la table brute à son propre
   tri. Il ne disait rien de faux : il figeait une FORME — une table de nombres
   partant du maximum — que la décision produit change. Ce qu'il garantissait
   vraiment, l'ordre décroissant, est conservé ci-dessous ; le reste décrivait
   l'ancienne table, pas une propriété du domaine. */
test('la table descend du plus lourd au plus léger', () => {
  const pourcents = PALIERS.map((p) => p.pourcent);
  assert.deepEqual(pourcents, [...pourcents].sort((a, b) => b - a));
  assert.equal(new Set(pourcents).size, pourcents.length);
});

test('la zone de progression 70-90 % est couverte, palier par palier', () => {
  /* « Pour progresser en musculation il faut travailler entre 70 et 90 %
     environ. » Neuf paliers par pas de 2,5 %, et neuf cibles de répétitions
     distinctes : on choisit sa ligne par le nombre de répétitions visé. */
  const travail = PALIERS.filter((p) => p.nature === 'travail').map((p) => p.pourcent);
  assert.deepEqual(travail, [90, 87.5, 85, 82.5, 80, 77.5, 75, 72.5, 70]);
  assert.deepEqual(travail.map(repsAu), [3, 4, 5, 6, 8, 9, 10, 11, 13]);
});

test('l\'échauffement reste proposé, sous la zone de travail', () => {
  /* Un débutant comme un confirmé s'échauffe : les paliers légers ne
     disparaissent pas, ils perdent seulement leur prédiction. */
  const echauffement = PALIERS.filter((p) => p.nature === 'echauffement').map((p) => p.pourcent);
  assert.ok(echauffement.length >= 3);
  assert.ok(echauffement.every((p) => p < 70));
});

/* --------------------------------------------- le domaine de prédiction */

test('le domaine se déduit du plafond, il ne se réécrit pas à la main', () => {
  assert.ok(predictionValide(70));
  assert.ok(!predictionValide(65));
  assert.ok(repsAu(70) <= REPS_MAX_POUR_1RM);
  assert.ok(repsAu(65) > REPS_MAX_POUR_1RM);
});

test('aucune ligne n\'annonce de répétitions hors du domaine d\'Epley', () => {
  for (const rm of [7.5, 12, 20, 37.5, 60, 100, 210]) {
    for (const ligne of paliersPour(rm, pasConseille(rm))) {
      if (ligne.reps === null) continue;
      for (const pct of ligne.pourcents) {
        assert.ok(
          predictionValide(pct),
          `${rm} kg : la ligne annonce des répétitions alors que ${pct} % en vaut ${repsAu(pct)}`,
        );
      }
      assert.ok(ligne.reps.max <= REPS_MAX_POUR_1RM);
      assert.ok(ligne.reps.min <= ligne.reps.max);
    }
  }
});

test('sous 70 %, la charge est donnée mais jamais la prédiction', () => {
  /* Le disque affichait « 45 répétitions » à 40 % avec le même aplomb que
     « 3 répétitions à 90 % ». `estimerDepuisEssai` REFUSE de calculer au-delà
     de 15 répétitions : la table promettait ce que la formule refuse.
     Règle 7 — un chiffre faux est pire qu'un refus de répondre. */
  const echauffement = paliersPour(100).filter((l) => l.nature === 'echauffement');
  assert.ok(echauffement.length >= 3);
  assert.ok(echauffement.every((l) => l.reps === null));
  assert.ok(echauffement.every((l) => l.charge > 0));
});

/* ------------------------------------------- les paliers qui se confondent */

test('deux paliers qui donnent la même charge ne font qu\'une ligne', () => {
  /* 1RM de 20 kg, pas de 2,5 kg : l'ancienne table affichait ONZE lignes pour
     cinq charges — trois d'entre elles disaient « 15 kg » sans que rien ne
     signale qu'elles se confondaient. */
  const lignes = paliersPour(20, 2.5);
  const charges = lignes.map((l) => l.charge);
  assert.deepEqual(charges, [...new Set(charges)]);

  const premiere = lignes[0];
  assert.ok(premiere !== undefined, '20 kg ne produit aucune ligne');
  assert.deepEqual(premiere.pourcents, [90, 87.5, 85, 82.5]);
  assert.equal(premiere.charge, 17.5);
  assert.deepEqual(premiere.reps, { min: 3, max: 6 });
});

test('une ligne confondue dit son étendue, pas une seule de ses valeurs', () => {
  const confondues = paliersPour(20, 2.5).filter((l) => l.pourcents.length > 1);
  assert.ok(confondues.length > 0);
  for (const l of confondues) {
    if (l.reps === null) continue;
    assert.ok(l.reps.max > l.reps.min, 'une ligne confondue doit couvrir plusieurs répétitions');
  }
});

test('la prédiction tombe dès qu\'un pourcentage confondu sort du domaine', () => {
  /* À très petit maximum, l'arrondi peut confondre un palier de travail et un
     palier d'échauffement. La ligne garde alors la charge et perd la
     prédiction : une seule extrémité hors domaine suffit. */
  for (const rm of [3, 5, 7.5, 9]) {
    for (const l of paliersPour(rm, pasConseille(rm))) {
      if (l.pourcents.some((p) => !predictionValide(p))) {
        assert.equal(l.reps, null, `${rm} kg : ${l.pourcents.join('/')} % garde une prédiction`);
      }
    }
  }
});

test('les charges descendent strictement, et aucune ne vaut zéro', () => {
  for (const rm of [1, 3, 7.5, 20, 62.5, 140, 300]) {
    const lignes = paliersPour(rm, pasConseille(rm));
    assert.ok(lignes.length > 0, `${rm} kg ne produit aucune ligne`);
    for (let i = 1; i < lignes.length; i += 1) {
      const courante = lignes[i];
      const precedente = lignes[i - 1];
      /* Une case affirmée par le test, pas par un `!` : si l'une manquait, le
         test le DIRAIT au lieu de comparer un « undefined » silencieux
         (M13, 18 septembre 2026). */
      assert.ok(courante !== undefined && precedente !== undefined, `${rm} kg : ligne ${i} absente`);
      assert.ok(
        courante.charge < precedente.charge,
        `${rm} kg : ${courante.charge} kg ne descend pas sous ${precedente.charge} kg`,
      );
    }
    assert.ok(lignes.every((l) => l.charge > 0));
  }
});

test('tous les paliers sont rendus, ou fondus, jamais perdus en silence', () => {
  const rendus = paliersPour(100, 2.5).flatMap((l) => l.pourcents);
  assert.deepEqual(rendus, PALIERS.map((p) => p.pourcent));
});

test('un maximum absent ou nul ne produit aucune ligne', () => {
  assert.deepEqual(paliersPour(0), []);
  assert.deepEqual(paliersPour(-10), []);
});

/* ------------------------------------------------------------ charges */

test('les charges s\'arrondissent au palier de 2,5 kg, comme les disques', () => {
  assert.equal(arrondirCharge(62.3), 62.5);
  assert.equal(arrondirCharge(61), 60);
  assert.equal(arrondirCharge(63.8), 65);
});

test('le pas d\'arrondi se règle, pour les haltères par kilo', () => {
  assert.equal(arrondirCharge(62.3, 1), 62);
});

test('le pas conseillé reste celui de la salle tant qu\'il tient', () => {
  /* 2,5 kg, c'est un disque de 1,25 kg de chaque côté : la charge existe. Une
     première version de `pasConseille` descendait à 1 kg dès 40 kg de maximum
     et proposait « 53 kg » à 60 kg de 1RM — une charge qu'aucun jeu de disques
     ne fait. Corrigé avant d'être affiché, le 15 septembre 2026. */
  assert.equal(pasConseille(60), 2.5);
  assert.equal(pasConseille(100), 2.5);
  assert.equal(pasConseille(200), 2.5);
  for (const rm of [55, 60, 82.5, 100, 140, 200]) {
    for (const l of paliersPour(rm, pasConseille(rm))) {
      assert.equal(l.charge % 2.5, 0, `${rm} kg : ${l.charge} kg ne se charge pas sur une barre`);
    }
  }
});

test('le pas conseillé se resserre quand la zone de travail s\'effondre', () => {
  assert.equal(pasConseille(20), 1);
  assert.equal(pasConseille(40), 1);
  for (const rm of [0, 1, 12, 20, 40, 47, 60, 83, 119, 260]) {
    assert.ok(PAS_DISPONIBLES.includes(pasConseille(rm) as never));
    const travail = paliersPour(rm, pasConseille(rm)).filter((l) => l.nature === 'travail');
    if (rm >= 20) {
      assert.ok(
        travail.length >= MIN_CHARGES_TRAVAIL,
        `${rm} kg : ${travail.length} charge(s) de travail seulement`,
      );
    }
  }
});

test('à 20 kg de maximum, la zone de progression garde cinq charges distinctes', () => {
  /* La seconde exigence de l'auteur : « ne pas oublier les personnes qui ne
     soulèvent pas beaucoup ». Avec l'ancienne table et un pas figé à 2,5 kg,
     la zone de travail de ce débutant tenait en DEUX charges, et le tableau
     répétait trois fois « 15 kg ». */
  const travail = paliersPour(20, pasConseille(20)).filter((l) => l.nature === 'travail');
  assert.deepEqual(travail.map((l) => l.charge), [18, 17, 16, 15, 14]);
  assert.ok(travail.every((l) => l.reps !== null));
});
