import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { C, N, T } from './index';

/**
 * La charte doit rester le SEUL endroit où l'on écrit une taille ou une
 * couleur.
 *
 * Ce test existe parce que la centralisation ne tient pas toute seule : il a
 * suffi d'une trentaine d'écrans écrits chacun avec ses propres nombres pour
 * que grossir le texte de l'application devienne une retouche de trente
 * fichiers. Rien n'avait prévenu — le typage passait, les tests aussi.
 *
 * Il échoue donc dès qu'un fichier réintroduit une valeur en dur, en disant
 * lequel et à quelle ligne.
 */

const RACINES = ['app', 'src'];
const EXEMPTS = ['src/theme/index.ts', 'src/theme/charte.test.ts'];

function fichiers(racine: string): string[] {
  const trouves: string[] = [];
  const parcourir = (chemin: string) => {
    for (const entree of readdirSync(chemin)) {
      if (entree === 'node_modules' || entree.startsWith('.')) continue;
      const complet = join(chemin, entree);
      if (statSync(complet).isDirectory()) parcourir(complet);
      else if (/\.tsx?$/.test(entree)) trouves.push(complet.replace(/\\/g, '/'));
    }
  };
  parcourir(racine);

  return trouves.filter((f) => !EXEMPTS.includes(f));
}

const TOUS = RACINES.flatMap(fichiers);

/** Les lignes fautives, avec de quoi les retrouver sans chercher. */
function fautes(motif: RegExp): string[] {
  const releve: string[] = [];
  for (const f of TOUS) {
    readFileSync(f, 'utf8').split('\n').forEach((ligne, i) => {
      const m = motif.exec(ligne);
      if (m) releve.push(`${f}:${i + 1}  ${m[0]}`);
    });
  }

  return releve;
}

describe('la charte est le seul endroit où l\'on décide', () => {
  it('trouve bien les fichiers à surveiller', () => {
    assert.ok(TOUS.length > 20, `${TOUS.length} fichiers parcourus, c'est trop peu`);
  });

  it('aucune taille de police en dur', () => {
    const trouvees = fautes(/fontSize:\s*\d/);
    assert.deepEqual(trouvees, [],
      `Utilise l'échelle T de src/theme :\n${trouvees.join('\n')}`);
  });

  it('aucune taille de chiffre en dur', () => {
    const trouvees = fautes(/taille=\{\s*\d|taille\s*=\s*\d/);
    assert.deepEqual(trouvees, [],
      `Utilise l'échelle N de src/theme :\n${trouvees.join('\n')}`);
  });

  it('aucune couleur en dur', () => {
    const trouvees = fautes(/'#[0-9a-fA-F]{3,8}'|rgba?\([0-9., ]+\)/);
    assert.deepEqual(trouvees, [],
      `Ajoute la couleur à C dans src/theme :\n${trouvees.join('\n')}`);
  });

  it('aucune police en dur', () => {
    const trouvees = fautes(/fontFamily:\s*'/);
    assert.deepEqual(trouvees, [],
      `Utilise P de src/theme :\n${trouvees.join('\n')}`);
  });
});

describe('l\'échelle elle-même', () => {
  it('monte, sans marche en double', () => {
    const marches = Object.values(T);
    assert.deepEqual([...marches].sort((a, b) => a - b), marches, 'les marches sont croissantes');
    assert.equal(new Set(marches).size, marches.length, 'deux marches identiques ne servent à rien');
  });

  it('garde les chiffres au-dessus du texte courant', () => {
    assert.ok(N.petit >= T.moyen,
      'un chiffre en Barlow Condensed paraît plus petit qu\'un texte de même taille');
  });

  it('reste lisible : rien en dessous de 11 px', () => {
    assert.ok(Math.min(...Object.values(T)) >= 11);
  });

  /* On ne vérifie PAS l'absence de doublons : `fec` et `vif` partagent la
     même teinte, et c'est voulu — le doré est à la fois la couleur d'accent
     et celle des féculents. Un test qui l'interdirait prendrait un choix de
     conception pour une erreur. */
  it('ne contient que des couleurs exploitables', () => {
    for (const [nom, valeur] of Object.entries(C)) {
      assert.match(valeur, /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9., ]+\))$/,
        `C.${nom} n'est pas une couleur`);
    }
  });
});
