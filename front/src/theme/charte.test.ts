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

/**
 * CE QUI SE LIT VRAIMENT, ET PAS SEULEMENT CE QUI EST JOLI SUR UN ÉCRAN NEUF.
 *
 * Ce bloc existe parce que le défaut a vécu longtemps sans être vu :
 * `C.discret` affichait les unités — « kg », « rép » — à 2,51:1 sur
 * `surface2`, soit la moitié du minimum lisible. Personne ne l'avait
 * remarqué : sur un bon écran, dans une pièce sombre, ça passe. Dans une salle
 * au néon ou dehors, non.
 *
 * Une couleur trop pâle ne casse rien, ne lève aucune erreur et ne se voit pas
 * en relecture. Sans un test qui la mesure, elle revient — au premier
 * ajustement esthétique, et sans que personne l'ait décidé.
 */
describe('la palette reste lisible', () => {
  /* Luminance relative, formule WCAG 2.1. */
  const luminance = (hex: string): number => {
    const canal = (v: number): number => {
      const c = v / 255;

      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const n = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));

    return 0.2126 * canal(r!) + 0.7152 * canal(g!) + 0.0722 * canal(b!);
  };

  const contraste = (a: string, b: string): number => {
    const [x, y] = [luminance(a), luminance(b)];

    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  /** Les trois fonds sur lesquels du texte peut se poser. */
  const FONDS = { fond: C.fond, surface: C.surface, surface2: C.surface2 };

  /** Les couleurs qui servent à ÉCRIRE. `ligne` en est absente : c'est un
      trait, pas du texte, et lui imposer 4,5:1 en ferait une barre noire. */
  const ENCRES = {
    encre: C.encre, attenue: C.attenue, discret: C.discret,
    vif: C.vif, ok: C.ok, erreur: C.erreur,
  };

  it('tout texte atteint 4,5:1 sur chacun des trois fonds', () => {
    const faibles: string[] = [];
    for (const [nomEncre, encre] of Object.entries(ENCRES)) {
      for (const [nomFond, fond] of Object.entries(FONDS)) {
        const r = contraste(encre, fond);
        if (r < 4.5) faibles.push(`C.${nomEncre} sur C.${nomFond} : ${r.toFixed(2)}:1`);
      }
    }
    assert.deepEqual(faibles, [],
      `Sous le seuil de lisibilité (4,5:1) :\n${faibles.join('\n')}`);
  });

  it('les deux niveaux de mise en retrait restent distincts', () => {
    /* Sinon on corrige un défaut de lisibilité en en créant un de hiérarchie :
       deux gris au même contraste ne disent plus lequel compte le moins. */
    const ecart = contraste(C.attenue, C.fond) / contraste(C.discret, C.fond);
    assert.ok(ecart >= 1.3,
      `attenue et discret sont trop proches (rapport ${ecart.toFixed(2)}) : `
      + 'la hiérarchie visuelle disparaît');
  });
});
