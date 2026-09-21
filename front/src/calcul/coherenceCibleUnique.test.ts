import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

/**
 * AUCUN ÉCRAN NE JUGE PLUS LA COHÉRENCE D'UNE CIBLE — palier B, 21 septembre 2026.
 *
 * « Tes grammes représentent 740 calories, pas 710 » : jusqu'ici, cette phrase
 * était écrite dans `app/objectifs.tsx`, avec le seuil de 15 kcal, les deux
 * conventions de glucides et la formule. L'écran décidait donc seul de ce qu'il
 * reprochait à l'utilisateur.
 *
 * Elle vient maintenant de `POST /api/verification/cible`
 * (`api/src/Service/CoherenceDesCibles.php`), et l'écran l'affiche telle quelle.
 *
 * ── POURQUOI CE GARDE EXISTE, ET PAS SEULEMENT LES TESTS PHP ──────────────
 *
 * Les tests PHP prouvent que la règle est JUSTE. Ils ne peuvent pas voir qu'un
 * écran s'est remis à la réécrire à côté — c'est précisément ce qui s'était
 * produit pour la jauge de mot de passe, où l'écran d'invitation annonçait
 * « 12 caractères » alors que le serveur n'appliquait plus cette règle.
 *
 * ── LE JUMEAU QUI RESTE, ET IL EST DÉCLARÉ ────────────────────────────────
 *
 * `front/src/solveur/solveur.ts` garde `ecartDeCoherence`, `bornesDeCoherence`
 * et `SEUIL_COHERENCE` : le solveur calcule encore dans le navigateur et pose
 * le même constat dans ses diagnostics. Il part au palier 3, avec le reste du
 * solveur. Exactement la situation d'`Atwater.php` et de `nutrition.ts`, écrite
 * dans les en-têtes des deux côtés.
 *
 * Ce qui est interdit, c'est la copie NON DÉCLARÉE — et c'est ce que ce fichier
 * garde : le seuil ne peut pas diverger entre les deux langages sans que ce
 * test tombe.
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

/* Ce dépôt raconte ses pannes dans ses commentaires, et celui d'`objectifs.tsx`
   nommera longtemps la règle qui en est partie. Sans ce retrait, le garde se
   déclencherait sur l'explication du déménagement lui-même. */
const sansCommentaires = (source: string): string => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

const ECRANS = sources(join(RACINE, 'front/app'))
  .map((f) => ({
    f: f.slice(RACINE.length + 1),
    source: sansCommentaires(readFileSync(f, 'utf8')),
  }))
  .filter(({ f }) => !/\.test(-rendu|-data)?\.tsx?$/.test(f));

const SOLVEUR = 'front/src/solveur/solveur.ts';
const OBJECTIFS = 'front/app/objectifs.tsx';

/** Les trois symboles qui portent la règle, et qu'aucun écran ne doit toucher. */
const SYMBOLES = /\b(ecartDeCoherence|bornesDeCoherence|SEUIL_COHERENCE)\b/;

describe('la cohérence d’une cible se juge sur le serveur', () => {
  it('LE TÉMOIN : le balayage voit bien les écrans, et le jumeau déclaré existe', () => {
    /* 20 écrans au 21 septembre 2026. Le plancher est bas exprès : il attrape un
       balayage qui ne descend plus dans les sous-dossiers, pas la disparition
       d'un écran. */
    assert.ok(ECRANS.length > 15,
      `${ECRANS.length} écrans parcourus, c'est trop peu : le balayage rate des dossiers`);
    assert.match(lire(SOLVEUR), SYMBOLES,
      `${SOLVEUR} ne porte plus la règle : si le solveur est passé au serveur, `
      + 'ce garde n’a plus lieu d’être et doit être retiré avec elle.');
  });

  it('aucun écran ne calcule l’écart ni ses bornes', () => {
    const coupables = ECRANS.filter(({ source }) => SYMBOLES.test(source)).map(({ f }) => f);

    assert.deepEqual(coupables, [],
      'Ces écrans jugent à nouveau une cible. La règle vit sur le serveur '
      + '(`CoherenceDesCibles.php`) et s’obtient par `POST /api/verification/cible` : '
      + 'l’écran affiche `avertissement` tel quel, il ne le recalcule pas.');
  });

  it('aucun écran ne réécrit la phrase que le serveur rédige', () => {
    const coupables = ECRANS
      .filter(({ source }) => /respecte les grammes/.test(source))
      .map(({ f }) => f);

    assert.deepEqual(coupables, [],
      'Ces écrans réécrivent la phrase d’avertissement. Le serveur envoie LA '
      + 'PHRASE, pas des codes à traduire — c’est ce qui a évité que l’écran '
      + 'd’invitation annonce une règle que le serveur n’appliquait plus.');
  });

  it('l’écran des objectifs demande bien le verdict au serveur', () => {
    const objectifs = ECRANS.find(({ f }) => f === OBJECTIFS);

    assert.ok(objectifs, `${OBJECTIFS} introuvable depuis ${RACINE}`);
    assert.match(objectifs.source, /useVerdictCible/,
      `${OBJECTIFS} n’interroge plus le serveur sur sa cible : soit le hook a été `
      + 'renommé, soit l’écran a cessé d’avertir — et il avertissait avant le palier B.');
  });

  it('LE SEUIL DIT LA MÊME CHOSE DANS LES DEUX LANGAGES', () => {
    /* LE SEUL CONTRÔLE QUI VOIT CETTE DIVERGENCE. Le jour où le seuil PHP passe
       à 20 et que le solveur reste à 15, l'écran des objectifs se tait pendant
       que le plan, lui, continue de reprocher l'écart — deux réponses à la même
       question, ce que tout ce chantier cherche à supprimer. */
    assert.equal(seuilDuFront(), seuilDuServeur(),
      '`SEUIL_COHERENCE` (solveur.ts) et `CoherenceDesCibles::SEUIL` (PHP) ont divergé. '
      + 'Ce sont deux écritures DÉCLARÉES de la même règle, le temps que le solveur '
      + 'passe au serveur : elles doivent dire le même nombre jusque-là.');
  });

  it('LE SERVEUR ÉCRIT SES NOMBRES COMME L’ÉCRAN LES ÉCRIVAIT', () => {
    /* `number_format` N'EST PAS `toFixed`, ET CE GARDE EXISTE PARCE QUE LA
       LEÇON A ÉTÉ OUBLIÉE UNE FOIS. `AnomaliesAliment` porte depuis le
       20 septembre 2026 un `decimale()` écrit exprès — « les deux candidats
       PHP échouent, chacun d'un côté » — et `FormatCourt::nb`, écrit le
       lendemain, est reparti sur `number_format`.

       Mesuré sur les deux moteurs : 3 410 divergences sur 100 001 valeurs au
       pas de 0,01. « 300,45 » s'écrivait « 300,5 » côté serveur et « 300,4 »
       côté écran — dans une phrase que l'utilisateur lit pour corriger ses
       objectifs. C'est la règle 7 prise à revers.

       Le garde est TEXTUEL et il le reste : comparer les deux moteurs pour de
       vrai demanderait de lancer PHP depuis `npm test`, qui doit pouvoir
       tourner sans Docker. */
    /* SANS LES COMMENTAIRES, et c'est le même piège que dans
       `avancementUnique.test.ts` : ce fichier PHP raconte sa panne, donc il
       écrit « number_format » une demi-douzaine de fois dans ses docblocks. Un
       garde qui se déclenche sur sa propre explication finit désactivé. */
    const php = sansCommentaires(lire('api/src/Service/FormatCourt.php'));

    assert.doesNotMatch(php, /number_format/,
      '`FormatCourt` est repassé à `number_format`, qui PRÉ-ARRONDIT : il rendra '
      + '« 300,5 » là où l’écran écrivait « 300,4 ». Le portage exact de `toFixed` '
      + 'est `FormatCourt::decimale` — c’est lui qu’il faut appeler.');
    assert.match(php, /decimale\(\$valeur, 1\)/,
      '`FormatCourt::nb` ne passe plus par le portage de `toFixed` : soit il a été '
      + 'renommé, soit quelqu’un a réécrit l’arrondi sur place.');
    assert.match(lire('front/src/theme/index.ts'), /toFixed\(1\)/,
      'le témoin : `nb` côté écran n’écrit plus avec `toFixed(1)`, donc ce garde '
      + 'compare le serveur à une référence qui a bougé.');
  });

  it('LE TÉMOIN DU CONTRÔLE CI-DESSUS : les deux motifs reconnaissent leur fichier', () => {
    /* Sans ce cas, deux `null` seraient « égaux » et le contrôle passerait en ne
       garantissant rien. C'est le motif 4 du projet. */
    assert.equal(seuilDuFront(), 15, 'le motif ne lit plus `SEUIL_COHERENCE` dans solveur.ts');
    assert.equal(seuilDuServeur(), 15, 'le motif ne lit plus `SEUIL` dans CoherenceDesCibles.php');
  });
});

// --------------------------------------------------------------------- outils

/** `export const SEUIL_COHERENCE = 15;` */
function seuilDuFront(): number | null {
  const trouve = /SEUIL_COHERENCE\s*=\s*([\d.]+)/.exec(lire(SOLVEUR))?.[1];

  return trouve === undefined ? null : Number(trouve);
}

/** `public const float SEUIL = 15.0;` */
function seuilDuServeur(): number | null {
  const php = lire('api/src/Service/CoherenceDesCibles.php');
  const trouve = /const\s+(?:float\s+)?SEUIL\s*=\s*([\d.]+)/.exec(php)?.[1];

  return trouve === undefined ? null : Number(trouve);
}
