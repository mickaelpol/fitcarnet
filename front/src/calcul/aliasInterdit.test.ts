import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

/**
 * L'ALIAS `@/` NE SURVIT PAS AUX TESTS, ET RIEN NE LE DISAIT.
 *
 * `npm test` compile `src/` vers `dist-tests/` puis lance Node dessus. Le
 * chemin `@/theme` n'y est PAS réécrit : un module de calcul qui l'utilise
 * pour une **valeur** tombe au lancement sur
 *
 *     Error: Cannot find module '@/theme'
 *
 * Les imports de TYPE y survivent, eux, parce qu'ils s'effacent à la
 * compilation. D'où un piège parfaitement asymétrique : `npm run verif` passe,
 * et c'est `npm test` qui tombe — sur un fichier qu'on vient d'écrire, avec un
 * message qui ne parle pas du vrai sujet.
 *
 * IL A MORDU DEUX FOIS LE MÊME JOUR, le 20 septembre 2026 : dans
 * `calcul/resumeBoite.ts` (`@/theme`) puis dans `calcul/composerLaPeriode.test.ts`
 * (`@/solveur/periode`). Une troisième dormait dans `api/hooks/seances.ts`,
 * inoffensive seulement parce qu'aucun test ne remontait jusque-là.
 *
 * Ce test remplace la vigilance par une règle. Il ne regarde que les deux
 * dossiers que les tests atteignent — c'est là, et seulement là, que l'alias
 * est un piège ; dans un `.tsx` groupé par Metro, il est parfaitement correct.
 */

const RACINE = path.resolve(process.cwd(), 'src');
const SURVEILLES = ['calcul', 'solveur'];

/** Tous les `.ts` d'un dossier, en descendant. */
function fichiers(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const complet = path.join(dossier, e.name);
    if (e.isDirectory()) return fichiers(complet);

    return e.name.endsWith('.ts') ? [complet] : [];
  });
}

test('aucun import de VALEUR en `@/` dans les modules atteints par les tests', () => {
  const fautifs: string[] = [];

  for (const dossier of SURVEILLES) {
    for (const chemin of fichiers(path.join(RACINE, dossier))) {
      const lignes = readFileSync(chemin, 'utf-8').split('\n');

      lignes.forEach((ligne, n) => {
        /* `import type { … } from '@/…'` est permis : il disparaît à la
           compilation. `import { … } from '@/…'` ne l'est pas. */
        if (/^import\s+(?!type\b)[^;]*from\s+'@\//.test(ligne)) {
          fautifs.push(`${path.relative(RACINE, chemin)}:${n + 1}  ${ligne.trim()}`);
        }
      });
    }
  }

  assert.deepEqual(fautifs, [],
    'ces imports tomberont sur « Cannot find module » au lancement de npm test.\n'
    + 'Écrire un chemin relatif, ou `import type` si c\'est bien un type :\n  '
    + fautifs.join('\n  '));
});

test('LE TÉMOIN : le motif reconnaît vraiment un import fautif', () => {
  /* Sans ce cas, une expression régulière qui ne reconnaîtrait plus rien
     laisserait le test ci-dessus éternellement vert — le motif 4 du projet,
     un test qui ne peut pas échouer. */
  const fautif = /^import\s+(?!type\b)[^;]*from\s+'@\//;

  assert.ok(fautif.test("import { nb } from '@/theme';"));
  assert.ok(fautif.test("import { a, b } from '@/solveur/periode';"));
  assert.ok(!fautif.test("import type { Aliment } from '@/solveur/types';"),
    'un import de type doit rester permis');
  assert.ok(!fautif.test("import { nb } from '../theme';"),
    'un chemin relatif doit rester permis');
});
