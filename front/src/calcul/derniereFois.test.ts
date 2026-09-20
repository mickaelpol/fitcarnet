import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Seance } from '@/api/types';
import { derniereFoisParExercice, recordsAnterieurs, strictementAvant } from './historiqueSeances';

/**
 * « LA DERNIÈRE FOIS » — la troisième réduction, restée dans un hook.
 *
 * `historiqueSeances.ts` dit dans son en-tête POURQUOI ces réductions n'y
 * vivent plus : enfermées dans des `useMemo`, au milieu d'un fichier qui
 * importe react-query et React Native, **rien ne pouvait les éprouver**. Deux
 * des trois sont descendues le 15 septembre 2026. `useDerniereFois` est restée
 * sur place, avec trois règles métier en clair :
 *
 *   - « strictement avant ce jour-là » ;
 *   - « la plus récente d'abord », et une seule par exercice ;
 *   - ce qui compte comme série renseignée.
 *
 * Aucune n'était testable. Et son résultat PRÉREMPLIT une nouvelle séance : ce
 * sont des charges et des répétitions affichées à quelqu'un qui va soulever.
 *
 * ET LE FILTRE DE DATE ÉTAIT UN DOUBLE JUGE, à six lignes d'écart de son
 * jumeau dans deux fichiers :
 *
 *     historiqueSeances.ts:41   s.date.slice(0, 10) >= dateExclue.slice(0, 10)  → on saute
 *     api/hooks/seances.ts:58   s.date.slice(0, 10) <  dateExclue.slice(0, 10)  → on garde
 *
 * Identiques aujourd'hui, et consommés CÔTE À CÔTE dans `app/seance/[id].tsx`
 * avec la même date. Le jour où l'un passe à `<=`, l'écran affiche un record et
 * une « dernière fois » qui ne parlent pas de la même période.
 *
 * Descendue et fusionnée le 20 septembre 2026 (palier 0).
 */

const seance = (date: string, exercice: number, series: {
  reps?: number | null; poids?: number | null; secondes?: number | null;
}[]): Seance => ({
  date,
  exercices: [{
    exercice: `/api/exercices/${exercice}`,
    series: series.map((x) => ({
      reps: x.reps ?? null, poids: x.poids ?? null, secondes: x.secondes ?? null,
    })),
  }],
} as unknown as Seance);

describe('la borne de date, partagée', () => {
  it('« strictement avant » exclut le jour lui-même', () => {
    /* C'est tout le sens du paramètre : préparer la séance du 20 ne doit pas
       lire la séance du 20 en cours de saisie, sinon elle se copie elle-même. */
    assert.equal(strictementAvant('2026-09-19', '2026-09-20'), true);
    assert.equal(strictementAvant('2026-09-20', '2026-09-20'), false);
    assert.equal(strictementAvant('2026-09-21', '2026-09-20'), false);
  });

  it('compare le JOUR, pas l\'instant', () => {
    /* Les dates arrivent en ISO complet. Comparer les chaînes entières ferait
       dépendre le résultat de l'heure d'enregistrement. */
    assert.equal(strictementAvant('2026-09-20T23:59:00Z', '2026-09-20T00:00:00Z'), false);
    assert.equal(strictementAvant('2026-09-19T23:59:00Z', '2026-09-20T08:00:00Z'), true);
  });

  it('sans date d\'exclusion, tout l\'historique compte', () => {
    assert.equal(strictementAvant('2026-09-20', undefined), true);
  });

  it('LE VERROU : les deux lecteurs coupent au MÊME endroit', () => {
    /* C'était le double juge. Une séance du jour même doit être invisible aux
       DEUX : celle qui cherche le record et celle qui cherche la dernière
       fois. Sans ce cas, l'un pourrait passer à `<=` sans que rien ne tombe. */
    const leJourMeme = [seance('2026-09-20', 7, [{ reps: 5, poids: 100 }])];

    assert.equal(recordsAnterieurs(leJourMeme, '2026-09-20').size, 0,
      'le record ne doit pas voir la séance du jour');
    assert.equal(derniereFoisParExercice(leJourMeme, '2026-09-20').size, 0,
      'la dernière fois non plus — et c\'est la même règle');

    const laVeille = [seance('2026-09-19', 7, [{ reps: 5, poids: 100 }])];

    assert.equal(recordsAnterieurs(laVeille, '2026-09-20').size, 1);
    assert.equal(derniereFoisParExercice(laVeille, '2026-09-20').size, 1);
  });
});

describe('ce que rend « la dernière fois »', () => {
  it('garde la séance la PLUS RÉCENTE de chaque exercice', () => {
    const faites = derniereFoisParExercice([
      seance('2026-09-10', 7, [{ reps: 5, poids: 80 }]),
      seance('2026-09-18', 7, [{ reps: 5, poids: 100 }]),
      seance('2026-09-14', 7, [{ reps: 5, poids: 90 }]),
    ]);

    assert.deepEqual(faites.get(7), [{ reps: 5, poids: 100, secondes: null }]);
  });

  it('traite chaque exercice séparément', () => {
    const faites = derniereFoisParExercice([
      seance('2026-09-18', 7, [{ reps: 5, poids: 100 }]),
      seance('2026-09-10', 9, [{ reps: 12, poids: 30 }]),
    ]);

    assert.equal(faites.size, 2);
    assert.deepEqual(faites.get(9), [{ reps: 12, poids: 30, secondes: null }]);
  });

  it('ignore les lignes où rien n\'a été saisi', () => {
    /* Une séance planifiée mais non faite laisse des lignes vides. Les
       reprendre proposerait « 0 rep à 0 kg » comme point de départ. */
    const faites = derniereFoisParExercice([
      seance('2026-09-18', 7, [
        { reps: 5, poids: 100 },
        { reps: null, poids: null, secondes: null },
      ]),
    ]);

    assert.deepEqual(faites.get(7), [{ reps: 5, poids: 100, secondes: null }]);
  });

  it('une séance ENTIÈREMENT vide ne masque pas la précédente', () => {
    /* LE CAS QUI COMPTE. On ouvre la séance du jour, on ne saisit rien, on
       revient : si la séance vide avait « gagné » parce qu'elle est la plus
       récente, le préremplissage aurait perdu les vraies charges. */
    const faites = derniereFoisParExercice([
      seance('2026-09-19', 7, [{ reps: null, poids: null, secondes: null }]),
      seance('2026-09-12', 7, [{ reps: 5, poids: 100 }]),
    ]);

    assert.deepEqual(faites.get(7), [{ reps: 5, poids: 100, secondes: null }]);
  });

  it('un chrono compte, même sans charge', () => {
    /* `secondes` seul est une série renseignée : un « for time » n'a ni reps
       ni poids, et l'oublier viderait la dernière fois de tous les chronos. */
    const faites = derniereFoisParExercice([seance('2026-09-18', 7, [{ secondes: 240 }])]);

    assert.deepEqual(faites.get(7), [{ reps: null, poids: null, secondes: 240 }]);
  });

  it('un historique vide rend une table vide, pas une erreur', () => {
    assert.equal(derniereFoisParExercice([]).size, 0);
  });
});
