import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

/**
 * LE CINQUIÈME DOUBLE JUGE EST PARTI — palier B4, 25 septembre 2026.
 *
 * « Ce qui est pré-rempli est ce que tu as fait la dernière fois » était jugée
 * DEUX fois : `habitudesAEcrire` (front/src/calcul/habitudesCuisson.ts)
 * décidait quelle décision gagne pour un aliment cuisiné deux fois dans un
 * même plan, ET laquelle ne vaut pas la peine d'être écrite — en comparant à
 * `connues[cle]`. `LotDHabitudes::depuis` (api/src/Service/LotDHabitudes.php)
 * re-dédoublonnait côté serveur avec exactement la même règle.
 *
 * Depuis B4, le front envoie les cuissons EFFECTIVES du plan, SANS JUGER, et
 * `PUT /api/mes-cuissons` seul décide — via `LotDHabitudes::depuis` — ce qui
 * mérite d'être écrit : il retient la dernière décision de chaque aliment et
 * n'écrit que les écarts.
 *
 * ── CE QUE LE FRONT GARDE, ET C'EST DÉCLARÉ ───────────────────────────────
 *
 * `cleDHabitude` (fabrication de la clé d'habitude, table d'accents manuelle
 * car Hermes n'implémente pas `normalize`) et `depuisLesHabitudes`
 * (pré-remplissage de l'écran ; il part au palier 3) restent dans
 * `habitudesCuisson.ts`. Ce garde ne les vise pas.
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

/* Ce dépôt raconte ses pannes dans ses commentaires, et celui de
   `habitudesCuisson.ts` racontera longtemps le déménagement de cette règle
   vers le serveur. Sans ce retrait, le garde se déclencherait sur
   l'explication du déménagement lui-même. */
const sansCommentaires = (source: string): string => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

/* Le front ET l'app : le double juge vivait dans `front/src/calcul` et son
   seul appelant dans `front/src/composants` — le contraire du garde de
   `coherenceCibleUnique.test.ts`, qui ne visait que des écrans. */
const FICHIERS = [
  ...sources(join(RACINE, 'front/src')),
  ...sources(join(RACINE, 'front/app')),
]
  .map((f) => ({
    f: f.slice(RACINE.length + 1),
    source: sansCommentaires(readFileSync(f, 'utf8')),
  }))
  .filter(({ f }) => !/\.test(-rendu|-data)?\.tsx?$/.test(f));

const LOT_D_HABITUDES = 'api/src/Service/LotDHabitudes.php';

/**
 * Comparer ce qu'on vient de choisir à ce qu'on croit déjà enregistré.
 *
 * Le nom de la table varie — `connues`, `habitudes`, `deja` — donc le motif ne
 * s'accroche pas à un nom précis mais à la FORME : une indexation confrontée à
 * `mode`. Les deux opérateurs, parce que la même faute s'écrit aussi bien à
 * l'endroit qu'à l'envers.
 */
const COMPARAISON = /\b(connues|habitudes|cuissons|deja)\[[^\]]+\]\s*[!=]==\s*mode\b/;

/**
 * Retenir la dernière décision de chaque aliment avant de l'envoyer.
 *
 * Le motif vise le GESTE et non la déclaration : une table remplie par clé
 * d'habitude. `new Map<string, number | null>()` seul aurait laissé passer un
 * `new Map()` sans type, un `Record` ou un `reduce` — trois façons d'écrire la
 * même règle. Ce qui ne se contourne pas, c'est `cleDHabitude` : c'est la
 * seule fabrique de clé du dépôt, et dédoublonner par aliment sans elle est
 * impossible.
 */
const DEDOUBLONNAGE = /(new Map|Record<string)[\s\S]{0,400}?(\.set\(|\[)\s*cleDHabitude\(/;

describe('les habitudes de cuisson ne sont dédoublonnées que sur le serveur', () => {
  it('LE TÉMOIN : le balayage voit bien les sources, et LotDHabitudes porte encore la règle', () => {
    // CA-1 (d)
    /* 145 fichiers de production au 25 septembre 2026 (front/src + front/app,
       hors tests). Le plancher est bas exprès : il attrape un balayage qui ne
       descend plus dans les sous-dossiers, pas la disparition d'un fichier. */
    assert.ok(FICHIERS.length > 100,
      `${FICHIERS.length} fichiers parcourus, c'est trop peu : le balayage rate des dossiers`);

    assert.match(lire(LOT_D_HABITUDES), /\$aEcrire\[\$aliment\]\s*=\s*\$mode;/,
      `${LOT_D_HABITUDES} ne porte plus le dédoublonnage « la dernière décision gagne » : `
      + 'si le serveur a cessé de le porter, ce garde n’a plus lieu d’être et doit être '
      + 'retiré avec elle.');
  });

  it('LE TÉMOIN DES DEUX MOTIFS : ils reconnaissent encore le code qu’ils refusent', () => {
    /* SANS CE CAS, CE GARDE NE PEUT PLUS TOMBER — et c'est le motif 4 du
       projet, le test qui ne peut pas échouer. Une fois `habitudesAEcrire`
       supprimée, `COMPARAISON` et `DEDOUBLONNAGE` ne rencontrent plus rien :
       ils passeraient au vert même écrits de travers, même vidés. On leur
       redonne donc leur proie — le code RÉEL de `habitudesAEcrire`, recopié
       tel qu'il était le 21 septembre 2026, quatre jours avant sa suppression.

       Le jour où quelqu'un réécrit ces motifs et casse leur forme, c'est ici
       que ça se voit, et non dans six mois sur une régression silencieuse. */
    const ANCIEN_JUGE = `
      const derniere = new Map<string, number | null>();
      for (const r of repas) {
        for (const q of r.quantites) {
          const decide = choisi[cleDeCuisson(r.cle, q.aliment)];
          if (decide === undefined) continue;
          derniere.set(cleDHabitude(q.aliment.nom), decide);
        }
      }
      return [...derniere]
        .filter(([cle, mode]) => connues[cle] !== mode)
        .map(([aliment, mode]) => ({ aliment, mode }));
    `;

    assert.match(ANCIEN_JUGE, COMPARAISON,
      '`COMPARAISON` ne reconnaît plus le tri des écarts tel qu’il était écrit : '
      + 'le motif a été cassé, et le garde ne protège plus rien.');
    assert.match(ANCIEN_JUGE, DEDOUBLONNAGE,
      '`DEDOUBLONNAGE` ne reconnaît plus « la dernière décision gagne » telle qu’elle '
      + 'était écrite : le motif a été cassé, et le garde ne protège plus rien.');

    /* L'envers du témoin : le code qui l'a REMPLACÉ doit, lui, passer. Un motif
       si large qu'il refuserait la bonne écriture serait tout aussi inutile —
       il finirait désactivé. */
    const NOUVEAU = `
      for (const r of repas) {
        for (const q of r.quantites) {
          const decide = choisi[cleDeCuisson(r.cle, q.aliment)];
          if (decide === undefined) continue;
          lignes.push({ aliment: cleDHabitude(q.aliment.nom), mode: decide });
        }
      }
    `;

    assert.doesNotMatch(NOUVEAU, COMPARAISON, '`COMPARAISON` refuse la mise à plat sans jugement');
    assert.doesNotMatch(NOUVEAU, DEDOUBLONNAGE, '`DEDOUBLONNAGE` refuse la mise à plat sans jugement');
  });

  it('aucun fichier ne nomme habitudesAEcrire', () => {
    // CA-1 (a)
    const coupables = FICHIERS.filter(({ source }) => /\bhabitudesAEcrire\b/.test(source)).map(({ f }) => f);

    assert.deepEqual(coupables, [],
      'Ces fichiers nomment encore `habitudesAEcrire`. Elle a disparu : le front envoie '
      + 'désormais les cuissons effectives du plan sans les juger, et `PUT /api/mes-cuissons` '
      + '(`LotDHabitudes::depuis`) seul décide ce qui mérite d’être écrit.');
  });

  it('aucun fichier ne compare une cuisson choisie à une habitude connue', () => {
    // CA-1 (b)
    const coupables = FICHIERS.filter(({ source }) => COMPARAISON.test(source)).map(({ f }) => f);

    assert.deepEqual(coupables, [],
      'Ces fichiers trient encore les écarts entre la cuisson choisie et l’habitude '
      + 'connue (un `.filter` sur `connues[...] !== mode` ou `habitudes[...] !== mode`). '
      + 'Ce tri appartient à `PUT /api/mes-cuissons`, pas à l’écran.');
  });

  it('aucun fichier ne dédoublonne « la dernière décision gagne »', () => {
    // CA-1 (c)
    const coupables = FICHIERS.filter(({ source }) => DEDOUBLONNAGE.test(source)).map(({ f }) => f);

    assert.deepEqual(coupables, [],
      'Ces fichiers ré-implémentent « la dernière décision gagne » pour un aliment '
      + 'cuisiné deux fois dans le même plan. Cette règle n’a plus qu’une écriture : '
      + '`LotDHabitudes::depuis`, en PHP.');
  });
});
