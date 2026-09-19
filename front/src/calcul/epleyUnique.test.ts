import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { REPS_MAX_POUR_1RM } from './performance';

/**
 * EPLEY N'A QU'UNE ÉCRITURE DANS TOUT LE DÉPÔT — PAS SEULEMENT DANS LE FRONT.
 *
 * Demandé par le propriétaire du projet le 19 septembre 2026, en une phrase qui
 * dit exactement le risque : *« si un jour on touche à l'un sans toucher à
 * l'autre il va y avoir une divergence sans s'en rendre compte »*.
 *
 * CE JOUR-LÀ, IL Y EN AVAIT TROIS, dans trois langages :
 *
 *   1. `src/calcul/performance.ts`         — la référence (règle 5)
 *   2. `api/src/Entity/SeanceExercice.php` — une copie assumée, exposée en
 *      `seance:lire`, que PERSONNE ne lisait
 *   3. `db/01-schema.sql`, vue `v_performance` — `MAX(sr.poids * (1 + 0.0333 *
 *      sr.reps))`, **sans le plafond de 15 répétitions**, et que personne ne
 *      lisait non plus
 *
 * La troisième était donc déjà FAUSSE : c'est le constat E1 dans une vue SQL —
 * une série de 93 répétitions à 32 kg y vaut 131 kg, soit davantage qu'une
 * série de 7 à 35 kg. Les deux copies mortes ont été supprimées ; seule reste
 * `performance.ts`.
 *
 * POURQUOI UN GARDE PLUTÔT QU'UN FICHIER DE RÈGLES PARTAGÉ. Le mot de passe et
 * le rendement ont, eux, DEUX juges assumés — l'écran doit répondre pendant la
 * frappe — et c'est `api/regles/*.json` qui les tient d'accord. Le 1RM n'a
 * aucune raison d'être calculé deux fois : le front recalcule tout ce qu'il
 * affiche. Un second juge n'apportait rien qu'un risque, donc on le retire au
 * lieu de le synchroniser.
 *
 * CE TEST LIT `api/` ET `db/`, hors de `front/`. C'est voulu, et c'est le seul
 * moyen : une divergence entre PHP et TypeScript ne se voit d'aucun des deux
 * côtés. Même dispositif que `motDePassePartage.test.ts`, qui lit
 * `api/regles/motdepasse.json` par un chemin relatif.
 */

/* Depuis `front/`, là où `npm test` s'exécute. */
const RACINE = resolve(process.cwd(), '..');
const REFERENCE = 'front/src/calcul/performance.ts';

/** Ce qu'on refuse : le coefficient d'Epley, où qu'il soit écrit. */
const COEFFICIENT = /0\.0333|0,0333/;

const EXTENSIONS = /\.(ts|tsx|php|sql|py)$/;
const IGNORES = new Set([
  'node_modules', 'dist', 'vendor', 'var', 'graphify-out', '.git', '.expo',
  'sauvegardes', 'captures-verification', 'brut',
]);

function sources(chemin: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(chemin)) {
    if (IGNORES.has(entree) || entree.startsWith('.')) continue;
    const complet = join(chemin, entree);
    if (statSync(complet).isDirectory()) trouves.push(...sources(complet));
    else if (EXTENSIONS.test(entree)) trouves.push(complet.replace(/\\/g, '/'));
  }

  return trouves;
}

/* CE DÉPÔT CITE SES FORMULES DANS SA PROSE. `performance.ts` écrit « 0,0333 »
   dans un commentaire, `SeanceExercice.php` l'écrivait dans le sien, et ce
   fichier-ci le fait trois fois plus haut. Sans ce retrait, le garde se
   déclencherait sur ses propres explications — et on le désactiverait. */
const sansCommentaires = (source: string): string => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*(\/\/|--|#).*$/gm, ' ');

const FICHIERS = sources(RACINE)
  .map((f) => ({
    f: f.slice(RACINE.length + 1),
    source: sansCommentaires(readFileSync(f, 'utf8')),
  }))
  /* Les tests ont le droit d'écrire le chiffre : ils l'éprouvent. */
  .filter(({ f }) => !/\.test(-rendu|-data)?\.(ts|tsx)$|^api\/tests\//.test(f));

describe('le coefficient d’Epley n’a qu’une écriture dans tout le dépôt', () => {
  it('le motif reconnaît bien la référence — le témoin', () => {
    const reference = FICHIERS.find(({ f }) => f === REFERENCE);

    assert.ok(reference, `${REFERENCE} introuvable depuis ${RACINE}`);
    assert.match(reference.source, COEFFICIENT,
      'le motif ne reconnaît plus la formule de référence : il ne garde plus rien');
    assert.ok(FICHIERS.length > 200,
      `${FICHIERS.length} fichiers parcourus, c'est trop peu : le balayage rate des dossiers`);
  });

  it('personne d’autre ne le réécrit, aucun langage compris', () => {
    const copies = FICHIERS
      .filter(({ f, source }) => f !== REFERENCE && COEFFICIENT.test(source))
      .map(({ f }) => f);

    assert.deepEqual(copies, [],
      'Ces fichiers réécrivent le coefficient d’Epley. Il n’a qu’un domicile, '
      + `${REFERENCE} — et une seconde écriture, dans quelque langage que ce `
      + 'soit, finira par diverger sans que personne le voie.');
  });

  it('le plafond de 15 répétitions vit au même endroit, et il est exporté', () => {
    /* LE COEFFICIENT SEUL NE SUFFIT PAS. La vue SQL supprimée portait le bon
       0.0333 et AUCUN plafond : elle rendait donc un « record » sur une série
       de 93 répétitions, qui mesure l'endurance et non la force. Garder l'un
       sans l'autre laisserait revenir exactement ce défaut-là. */
    assert.equal(REPS_MAX_POUR_1RM, 15);
  });
});
