import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * LA SOMME D'ATWATER NE S'ÉCRIT QU'UNE FOIS (règle 5).
 *
 * Le 17 septembre 2026, `verite-documentaire` a trouvé la somme « coefficient ×
 * grammes » écrite QUATRE fois : `nutrition.ts`, `solveur.ts`
 * (`kcalDesMacros`), `plausibilite.ts` (`kcalAtwater`) et `planCoach.ts`.
 * Les coefficients étaient bien importés, donc rien ne divergeait encore —
 * mais chaque copie traitait déjà les fibres inconnues à sa façon, et c'est
 * ainsi qu'un Atwater américain s'était glissé dans le solveur et dans
 * l'écran des objectifs avant le 15 septembre. `CLAUDE.md` affirmait que
 * `nutrition.ts` était le seul à porter la formule : c'était faux.
 *
 * Désormais `kcalDesGrammes` la porte, et ce test refuse toute multiplication
 * par un coefficient `KCAL_…` ailleurs, dans `src/` comme dans `app/`. Même
 * technique que `muscles/gardeCatalogue.test.ts` : les sources, sans leurs
 * commentaires, puisque ce dépôt cite ses formules dans sa prose.
 */

const REFERENCE = 'src/calcul/nutrition.ts';

function sources(chemin: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(chemin)) {
    if (entree === 'node_modules' || entree.startsWith('.')) continue;
    const complet = join(chemin, entree);
    if (statSync(complet).isDirectory()) trouves.push(...sources(complet));
    else if (/\.tsx?$/.test(entree) && !/\.test(-rendu|-data)?\.tsx?$/.test(entree)) {
      trouves.push(complet.replace(/\\/g, '/'));
    }
  }

  return trouves;
}

const sansCommentaires = (source: string): string => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

/** Un coefficient multiplié, d'un côté ou de l'autre du `*`. */
const PRODUIT = /\bKCAL_[A-Z]+\s*\*|\*\s*KCAL_[A-Z]+\b/;

const FICHIERS = [...sources('src'), ...sources('app')].map((f) => ({
  f, source: sansCommentaires(readFileSync(f, 'utf8')),
}));

describe('la formule d’Atwater n’a qu’une écriture', () => {
  it('le motif reconnaît bien la formule — le témoin', () => {
    const reference = FICHIERS.find(({ f }) => f === REFERENCE);
    assert.ok(reference, `${REFERENCE} introuvable`);
    assert.match(reference.source, PRODUIT,
      'le motif ne reconnaît plus la formule de référence : il ne garde plus rien');
    assert.ok(FICHIERS.length > 50, `${FICHIERS.length} fichiers parcourus, c'est trop peu`);
  });

  it('personne d’autre ne la réécrit', () => {
    const copies = FICHIERS
      .filter(({ f, source }) => f !== REFERENCE && PRODUIT.test(source))
      .map(({ f }) => f);

    assert.deepEqual(copies, [],
      'Ces fichiers multiplient un coefficient d’Atwater : appeler kcalDesGrammes '
      + `de ${REFERENCE}, seul à porter la formule.`);
  });
});
