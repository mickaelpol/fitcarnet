import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { nombreSaisi } from '../calcul/saisieNombre';
import { C, N, T, nb } from './index';

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

/**
 * LE COMMENTAIRE PROMETTAIT UNE VIRGULE, LE CODE RENDAIT UN POINT.
 *
 * `nb` portait depuis toujours « Formatage court : 154 g, 12,5 g — jamais
 * "154.00" ». Son `v.toFixed(1)` rendait pourtant « 12.5 », à un utilisateur
 * français, dans une application entièrement en français. Relevé par la revue
 * le 16 septembre 2026, tranché le 17.
 *
 * ON A CORRIGÉ LE CODE, PAS LE COMMENTAIRE, et la raison n'est pas
 * l'esthétique : l'application écrivait DÉJÀ la virgule par ailleurs.
 * `texteDuNombre` (`calcul/saisieNombre.ts`) rend « 42,25 » dans tout champ
 * modifiable. Le même poids s'affichait donc « 42,25 » quand on pouvait le
 * corriger et « 42.5 » quand on ne le pouvait pas. C'est cette incohérence-là
 * qui était le défaut ; le commentaire disait juste.
 *
 * CE QUI RENDAIT LE CHANGEMENT SÛR — vérifié appelant par appelant, les
 * quatorze. `nb` ne sert QUE d'affichage : ses sorties partent en enfants JSX
 * ou en gabarits suivis d'une unité (« g », « kcal », « kg », « % »). Aucune
 * n'alimente un champ de saisie, aucune n'est relue par `parseFloat`, aucune
 * ne sert de coordonnée (la courbe de `sparkline.tsx` calcule ses hauteurs sur
 * les nombres bruts, `nb` n'y touche que le texte du pied). La panne « 42,5
 * enregistré 425 » du 15 septembre 2026 est hors d'atteinte : elle vivait dans
 * les champs, et un champ passe par `ChampNombre`, jamais par `nb`.
 */
describe('nb, le formatage court', () => {
  it('rend la virgule française, comme son commentaire l\'a toujours promis', () => {
    assert.equal(nb(12.5), '12,5');
    assert.equal(nb(42.5), '42,5');
  });

  it('n\'écrit jamais « 154.00 » : un entier reste un entier', () => {
    assert.equal(nb(154), '154');
    assert.equal(nb(0), '0');
  });

  it('avale les miettes sous 0,05 plutôt que d\'afficher une fausse précision', () => {
    /* 154,02 g sur une balance de cuisine, c'est 154 g. */
    assert.equal(nb(154.02), '154');
    assert.equal(nb(2.06), '2,1');
  });

  it('ne laisse AUCUN point décimal s\'échapper', () => {
    /* Le test qui tient la règle : une réécriture en `toFixed` seul retombe ici. */
    for (const v of [0, 0.04, 1.25, 12.5, 99.95, 154, 154.02, 1000.5]) {
      assert.ok(!nb(v).includes('.'), `nb(${v}) = « ${nb(v)} » contient un point`);
    }
  });

  it('reste relisible par le lecteur du projet — ce qui s\'affiche se retape', () => {
    /* La garantie qui rend la virgule sans danger : `nombreSaisi` relit la
       sortie de `nb` sans la déformer. Si un jour l'un des deux change de
       convention sans l'autre, un utilisateur qui recopie un chiffre lu à
       l'écran dans un champ écrirait autre chose. C'est exactement la famille
       de panne du 15 septembre 2026. */
    for (const v of [0, 1.25, 12.5, 42.5, 154, 1000.5]) {
      const affiche = nb(v);
      const relu = nombreSaisi(affiche);
      assert.notEqual(relu, null, `« ${affiche} » n'est pas relisible`);
      /* On compare à la quantité que l'écran DÉSIGNE, pas à `v` : `nb` arrondit
         à une décimale, et exiger `v` ferait échouer le test sur la seule
         virgule flottante — (1,25).toFixed(1) vaut « 1,3 », dont l'écart à 1,25
         dépasse 0,05 d'un cheveu. Ce qui doit être vrai, c'est que le lecteur
         retrouve exactement le nombre écrit. */
      assert.equal(relu, Number(affiche.replace(',', '.')),
        `« ${affiche} » se relit ${relu}`);
    }
  });
});
