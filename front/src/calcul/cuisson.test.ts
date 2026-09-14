import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BROCOLI, MODES, POULET, RIZ, pour, repas } from './cuisson.test-data';
import { cleDeCuisson, enFournees, repartition } from './fournees';
import type { Cuissons } from './fournees';
import { figerLePlan } from './planFige';

/**
 * CE QUI RESTE À LA PORTE : LA CHAÎNE ENTIÈRE, PAS UN DE SES MAILLONS.
 *
 * Le reste de ce fichier est parti le 15 septembre 2026 vers
 * `fournees.test.ts`, `planFige.test.ts` et `habitudesCuisson.test.ts`, en
 * regard des trois modules extraits de `cuisson.ts`.
 *
 * Ce bloc-là ne s'y rangeait pas. Il enchaîne `enFournees`, `repartition` PUIS
 * `figerLePlan` — c'est exactement ce que fait l'écran, et l'une de ses
 * attentes porte sur la COUTURE : « ce qui ne se cuit pas reste distinct de ce
 * qui sort d'une fournée » ne vaut que si les deux modules s'accordent. Le
 * ranger dans `planFige.test.ts` en aurait fait un test qui dépend en silence
 * du comportement de `fournees` ; le ranger dans `fournees.test.ts` aurait
 * menti sur son sujet. Un test rangé de force dans le mauvais fichier coûte
 * plus cher qu'un test resté à la porte.
 */

describe('Un plan enregistré se relit sans rien recalculer', () => {
  const plan = [pour(2, repas('0|R2',
    { aliment: RIZ, aCuire: 100 }, { aliment: BROCOLI, aCuire: 50 }))];
  const choisi: Cuissons = { [cleDeCuisson('0|R2', RIZ)]: 1 };
  const fige = () => figerLePlan(
    [{ aliment: POULET, grammes: 300 }],
    enFournees(plan, choisi, MODES),
    repartition(plan, choisi),
    () => 'Aujourd\'hui · Midi');

  it('ne contient AUCUN identifiant d\'aliment', () => {
    /* Un aliment supprimé du frigo depuis ne doit pas rendre un plan
       illisible. On fige des noms et des grammes, jamais des références. */
    const json = JSON.stringify(fige());
    assert.ok(!json.includes('"id"'), 'un identifiant a fuité dans l\'instantané');
  });

  it('garde les deux quantités de chaque boîte', () => {
    const b = fige().boites[0]!;
    assert.equal(b.convives, 2);
    assert.equal(b.cuits[0]!.assiette, 200);
    assert.equal(b.cuits[0]!.parPersonne, 100);
  });

  it('garde la liste de courses telle qu\'elle était ce jour-là', () => {
    /* Demandé explicitement : savoir ce qu'il manquait au moment où le plan a
       été fait fait partie du plan. */
    assert.deepEqual(fige().courses, [
      { nom: 'Poulet', categorie: 'prot', grammes: 300 },
    ]);
  });

  it('date les boîtes au moment où on les fige', () => {
    /* « 2|R3 » ne désignera plus le même jour dans trois jours. La clé est
       donc traduite en toutes lettres à l'enregistrement, pas à la lecture. */
    assert.equal(fige().boites[0]!.titre, 'Aujourd\'hui · Midi');
  });

  it('garde AUSSI le repas en code, pas seulement en toutes lettres', () => {
    /* Le titre se lit, il ne se relit pas. Rattacher une boîte à ses
       compléments alimentaires demande « R2 », et l'obtenir en inversant la
       table des libellés casserait silencieusement le jour où l'on renomme
       « 16 h » en « collation ». Le jour, lui, reste hors du code : il ne
       veut plus rien dire trois jours après. */
    assert.equal(fige().boites[0]!.repas, 'R2');
  });

  it('ce qui ne se cuit pas reste distinct de ce qui sort d\'une fournée', () => {
    const b = fige().boites[0]!;
    assert.deepEqual(b.cuits.map((x) => x.nom), ['Riz']);
    assert.deepEqual(b.crus.map((x) => x.nom), ['Brocoli']);
  });

  it('survit à un aller-retour JSON', () => {
    /* C'est ce que fait la base : le contenu part en jsonb et revient. Une
       forme qui ne survit pas au voyage ne sert à rien. */
    assert.deepEqual(JSON.parse(JSON.stringify(fige())), fige());
  });
});
