import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

/**
 * LA RÈGLE DU CHRONO N'A QU'UNE ÉCRITURE, ET ELLE EST SUR LE SERVEUR.
 *
 * « Un exercice chrono ne compte que pour UNE série » — un « for time » n'a
 * qu'un temps total, ses lignes supplémentaires notent le détail.
 *
 * ── POURQUOI CE GARDE LIT TROIS LANGAGES ──────────────────────────────────
 *
 * La règle touche trois listes de modes, dans trois fichiers qu'aucune suite
 * ne peut comparer depuis son propre côté :
 *
 *   1. `db/01-schema.sql` — trois `CHECK (mode IN (…))`
 *   2. `api/src/Service/ModesDeTravail.php` — la règle elle-même
 *   3. `front/src/composants/choixMode.tsx` — ce que l'écran propose
 *
 * PHPUnit NE PEUT PAS FAIRE CETTE COMPARAISON : le conteneur ne monte que
 * `api/` sous `/app`, `db/` n'y est pas. Essayé le 21 septembre 2026 — le test
 * échouait en disant « aucun CHECK trouvé », ce qui est le bon comportement
 * d'un garde qui ne peut pas garder. Cette suite-ci tourne sur l'hôte et lit
 * tout le dépôt. Même dispositif qu'`epleyUnique.test.ts`.
 *
 * ── L'HISTOIRE, PARCE QU'ELLE S'EST REFAITE EN UNE JOURNÉE ────────────────
 *
 * La règle était écrite DEUX fois — `Seance::getAvancement()` et
 * `avancementDe()` — et rien ne les tenait d'accord. C'était le dernier double
 * juge du projet.
 *
 * PREMIÈRE CORRECTION, le matin du 21 septembre 2026 : le serveur envoyait un
 * POIDS par série, l'écran additionnait. Élégant, et faux dès que
 * l'utilisateur touchait au bloc — un poids par ligne est dérivé du mode et du
 * rang, les deux choses que l'écran modifie seul. Ajouter un exercice
 * « for time » affichait 0/3 là où le serveur dirait 0/1.
 *
 * SECONDE CORRECTION, le même jour : le serveur transmet la règle INDEXÉE SUR
 * LE MODE. Un bloc fabriqué à l'écran a un mode ; une bascule change la clé,
 * pas la réponse.
 *
 * **La leçon dépasse l'avancement : ne jamais transmettre au front une valeur
 * dérivée d'un état qu'il mute.**
 */

/* Depuis `front/`, là où `npm test` s'exécute. */
const RACINE = resolve(process.cwd(), '..');

const lire = (chemin: string): string => readFileSync(join(RACINE, chemin), 'utf8');

const EXTENSIONS = /\.(ts|tsx)$/;
const IGNORES = new Set(['node_modules', 'dist', '.expo', '.git', 'dist-tests']);

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

/* Ce dépôt raconte ses pannes dans ses commentaires — celui-ci écrit « chrono »
   une dizaine de fois plus haut. Sans ce retrait, le garde se déclencherait sur
   sa propre explication, et on finirait par le désactiver. */
const sansCommentaires = (source: string): string => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

const FICHIERS = sources(join(RACINE, 'front/src'))
  .concat(sources(join(RACINE, 'front/app')))
  .map((f) => ({
    f: f.slice(RACINE.length + 1),
    source: sansCommentaires(readFileSync(f, 'utf8')),
  }))
  .filter(({ f }) => !/\.test(-rendu|-data)?\.tsx?$/.test(f));

const AVANCEMENT = 'front/src/calcul/blocSeance.ts';

/**
 * LE DÉCOMPTE PARTIEL DES SÉRIES À NOMBRE ÉCRIT EN DUR.
 *
 * `avancementDe` faisait `b.series.slice(0, 1)` pour un chrono. La forme
 * correcte est `series.slice(0, n)` où `n` vient du serveur.
 *
 * IL FAUT `series` DEVANT, et ce n'est pas du zèle : une première écriture de
 * ce motif interdisait tout `.slice(0, <nombre>)` du dépôt, et elle a nommé
 * deux innocents — `blocSeance.ts:211` qui garde quatre séances, et
 * `categorieCiqual.ts` qui coupe un code CIQUAL à deux caractères. Un garde
 * qui crie sur du code juste est un garde qu'on désactive.
 */
const DECOMPTE_EN_DUR = /series\s*\.slice\(\s*0\s*,\s*\d+\s*\)/;

describe('la règle du chrono ne vit que sur le serveur', () => {
  it('le témoin : le module d’avancement lit bien la règle du serveur', () => {
    const reference = FICHIERS.find(({ f }) => f === AVANCEMENT);

    assert.ok(reference, `${AVANCEMENT} introuvable depuis ${RACINE}`);
    assert.match(reference.source, /seriesQuiComptent/,
      `${AVANCEMENT} ne lit plus ce que le serveur dit des modes : soit le champ `
      + 'a été renommé, soit le front s’est remis à décider tout seul.');
    assert.ok(FICHIERS.length > 100,
      `${FICHIERS.length} fichiers parcourus, c'est trop peu : le balayage rate des dossiers`);
  });

  it('le module d’avancement ne connaît pas le mode « chrono »', () => {
    const reference = FICHIERS.find(({ f }) => f === AVANCEMENT);

    assert.doesNotMatch(reference?.source ?? '', /chrono/i,
      `${AVANCEMENT} mentionne à nouveau « chrono ». Compter les séries n’a pas `
      + 'à connaître les modes : le serveur dit combien comptent pour chacun. '
      + 'Une seconde écriture de cette règle finira par diverger sans que '
      + 'personne le voie — c’est ce qu’elle a fait pendant des mois.');
  });

  it('personne ne recompose un décompte partiel à nombre écrit en dur', () => {
    const coupables = FICHIERS
      .filter(({ source }) => DECOMPTE_EN_DUR.test(source))
      .map(({ f }) => f);

    assert.deepEqual(coupables, [],
      'Ces fichiers ne gardent qu’une partie des séries, avec un nombre écrit '
      + 'sur place. C’était le geste exact de l’ancien double juge '
      + '(`series.slice(0, 1)` pour un chrono). Le nombre doit venir de '
      + '`GET /api/modes-de-travail`.');
  });

  it('LES TROIS LISTES DE MODES DISENT LA MÊME CHOSE, dans trois langages', () => {
    /* LE SEUL CONTRÔLE QUI VOIT CETTE DIVERGENCE. Le jour où un quatrième mode
       est ajouté au schéma sans l'être dans `ModesDeTravail`, le repli « mode
       inconnu » compte toutes ses séries — en silence, parce qu'il est
       volontairement muet. Et s'il manque au sélecteur, personne ne peut le
       choisir. */
    const duSchema = modesDuSchema();
    const duServeur = modesDuServeur();
    const deLEcran = modesDeLEcran();

    assert.ok(duSchema.length > 0,
      'aucun CHECK de mode trouvé dans db/01-schema.sql : le motif ne reconnaît '
      + 'plus le schéma, ce test ne garde donc plus rien');

    for (const liste of duSchema) {
      assert.deepEqual(liste, duServeur,
        'un CHECK de `db/01-schema.sql` et `ModesDeTravail::SERIES_QUI_COMPTENT` '
        + 'ne portent pas les mêmes modes');
    }

    assert.deepEqual(deLEcran, duServeur,
      'le sélecteur de `choixMode.tsx` et `ModesDeTravail` ne proposent pas les '
      + 'mêmes modes : soit l’écran en offre un que la base refusera, soit il en '
      + 'cache un que le serveur accepte.');
  });

  it('LE TÉMOIN DU CONTRÔLE CI-DESSUS : les trois motifs reconnaissent leur fichier', () => {
    /* Sans ce cas, trois listes VIDES seraient « égales » et le contrôle
       passerait en ne garantissant rien. C'est le motif 4 du projet, et il
       guette tous les gardes qui lisent des fichiers. */
    assert.deepEqual(modesDuServeur(), ['charge', 'iso', 'chrono'],
      'le motif ne reconnaît plus les clés de `ModesDeTravail`');
    assert.equal(modesDuSchema().length, 3,
      'db/01-schema.sql porte trois CHECK de mode ; le motif n’en voit plus autant');
    assert.equal(modesDeLEcran().length, 3);
  });
});

// --------------------------------------------------------------------- outils

/** Les listes du `CHECK (mode IN (…))` de chaque table, dans l'ordre du fichier. */
function modesDuSchema(): string[][] {
  const schema = lire('db/01-schema.sql');

  /* ON NE GARDE QUE LE CONTENU DU `IN (…)`, et c'est le piège de ce motif :
     la colonne s'écrit `mode_defaut TEXT NOT NULL DEFAULT 'charge' CHECK (…)`.
     Prendre le texte entier du CHECK ramenait aussi le `'charge'` du DEFAULT,
     et la liste sortait avec un doublon. Le test l'a dit en nommant la valeur
     en trop — c'est à ça qu'il sert. */
  const listes = [...schema.matchAll(/mode(?:_defaut)?\s+TEXT[^;]*?IN\s*\(([^)]*)\)/g)];

  return listes.map(([, liste]) =>
    [...(liste ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1] ?? ''));
}

/** Les clés de `ModesDeTravail::SERIES_QUI_COMPTENT`, côté PHP. */
function modesDuServeur(): string[] {
  const php = lire('api/src/Service/ModesDeTravail.php');
  const table = /SERIES_QUI_COMPTENT\s*=\s*\[([\s\S]*?)\];/.exec(php)?.[1] ?? '';

  return [...table.matchAll(/'([a-z]+)'\s*=>/g)].map((m) => m[1] ?? '');
}

/** Ce que le sélecteur de l'écran propose — son type `ModeTravail`. */
function modesDeLEcran(): string[] {
  const tsx = lire('front/src/composants/choixMode.tsx');
  const union = /export type ModeTravail\s*=([^;]*);/.exec(tsx)?.[1] ?? '';

  return [...union.matchAll(/'([a-z]+)'/g)].map((m) => m[1] ?? '');
}
