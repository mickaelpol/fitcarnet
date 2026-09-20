import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { Exercice, SeanceExercice } from '@/api/types';
import { avancementDe } from './blocSeance';

/**
 * LE VERROU ENTRE LES DEUX JUGES DE L'AVANCEMENT — relevé le 19 septembre 2026.
 *
 * L'API et le front répondent tous les deux à « où en est cette séance ? » :
 * `Seance::getAvancement()` là-bas, `avancementDe()` ici. Et les deux
 * tournent vraiment, à deux écrans de distance :
 *
 *     app/(onglets)/seances.tsx:51   lit le champ calculé par le serveur
 *     app/seance/[id].tsx:113        recalcule à chaque case cochée
 *
 * S'ils divergeaient, le compteur changerait tout seul en passant d'un écran
 * à l'autre, et personne ne saurait lequel croire. Rien ne les tenait
 * alignés : chacun était testé de son côté, ce qui est exactement la
 * situation qui rend une divergence invisible — les deux suites restent
 * vertes en se contredisant.
 *
 * Ce fichier et son jumeau `api/tests/Entity/AvancementPartageTest.php`
 * lisent LE MÊME fichier, `api/regles/avancement.json`.
 *
 * POURQUOI DEUX JUGES SONT ASSUMÉS. Même raison que pour le mot de passe :
 * cocher une série doit bouger le compteur immédiatement, sans aller-retour
 * réseau, hors ligne compris. Le serveur reste seul à décider de ce qui est
 * enregistré.
 */

interface ExercicePartage {
  mode: string | null;
  modeDefaut: string | null;
  series: boolean[];
}

interface CasPartage {
  nom: string;
  exercices: ExercicePartage[];
  faites: number;
  total: number;
  pourquoi: string;
}

/* Depuis `front/`, là où `npm test` s'exécute. La liste vit sous `api/` parce
   que le conteneur de l'API ne monte que ce dossier. */
const CHEMIN = path.resolve(process.cwd(), '../api/regles/avancement.json');

const regles = JSON.parse(readFileSync(CHEMIN, 'utf-8')) as { cas: CasPartage[] };

/**
 * Le cas de la liste, monté dans les formes du front.
 *
 * Un exercice sans `modeDefaut` est un exercice ABSENT du catalogue — il peut
 * ne pas avoir chargé — et non un exercice présent avec un mode vide : c'est
 * ainsi que le front le vit, et le repli sur « charge » est là pour ça.
 */
function monter(exercices: ExercicePartage[]): {
  blocs: SeanceExercice[];
  parId: Map<number, Exercice>;
} {
  const parId = new Map<number, Exercice>();
  const blocs = exercices.map((e, rang) => {
    const id = rang + 1;
    if (null !== e.modeDefaut) {
      parId.set(id, { id, modeDefaut: e.modeDefaut } as Exercice);
    }

    return {
      id,
      exercice: `/api/exercices/${id}`,
      mode: e.mode,
      series: e.series.map((faite, ordre) => ({ id: ordre + 1, ordre, faite })),
    } as unknown as SeanceExercice;
  });

  return { blocs, parId };
}

test('chaque cas de la liste partagée est compté comme elle le dit', () => {
  for (const cas of regles.cas) {
    const { blocs, parId } = monter(cas.exercices);

    assert.deepEqual(
      avancementDe(blocs, parId), { faites: cas.faites, total: cas.total },
      `api/regles/avancement.json dit « ${cas.nom} » = ${cas.faites} sur ${cas.total} `
      + `(${cas.pourquoi}), le front dit autre chose`,
    );
  }
});

test('LE TÉMOIN : la liste couvre bien le cas qui sépare les deux règles', () => {
  /* Sans ce contrôle, quelqu'un pourrait vider `cas` de ses exercices chrono
     — ou ne jamais en écrire — et le test ci-dessus resterait vert en ne
     garantissant plus rien. C'est le motif 4 du projet : un test qui ne peut
     pas échouer. La règle ENTIÈRE tient dans le traitement du mode « chrono » ;
     s'il n'est pas éprouvé, rien ne l'est. */
  const avecChrono = regles.cas.filter(
    (c) => c.exercices.some((e) => 'chrono' === e.mode || 'chrono' === e.modeDefaut));

  assert.ok(avecChrono.length >= 3,
    'la liste doit porter au moins trois cas en mode chrono : le mode posé sur la '
    + 'ligne, celui hérité du catalogue, et un mélangé à un exercice à la charge');

  const melange = regles.cas.find((c) => c.exercices.length > 1
    && c.exercices.some((e) => 'chrono' === e.mode)
    && c.exercices.some((e) => 'charge' === e.mode));

  assert.ok(melange, 'il faut un cas où les deux modes cohabitent dans la même séance');
  assert.notEqual(
    melange.total, melange.exercices.reduce((n, e) => n + e.series.length, 0),
    'ce cas doit avoir un total DIFFÉRENT du simple nombre de lignes, sans quoi '
    + 'un décompte naïf le passerait sans appliquer la règle du chrono');
});
