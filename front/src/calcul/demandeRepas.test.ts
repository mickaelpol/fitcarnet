import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FIBRES_DIGNES_D_ETRE_DITES, ROLES, TOLERANCE, alimentsAjoutables, demandePour, ecartTenu, fibresDuRepas, grammesSaisis, imposePour, renfortsDuRole, saisieIllisible, type Compose, vers,
} from './demandeRepas';
import type { Aliment } from '@/solveur/types';
import { LEGUME_PAR_PORTION } from '../solveur/composer';

/**
 * CE QUI EST TESTÉ ICI, ET POURQUOI ÇA N'EXISTAIT PAS AVANT.
 *
 * Ces fonctions vivaient dans `app/(onglets)/repas.tsx`, une ROUTE. Le motif
 * de `tsconfig.tests.json` ne couvre que `src/**` : un test posé à côté d'elles
 * n'aurait jamais été exécuté, sans le moindre signal. Elles sont donc
 * descendues dans `src/calcul/` le 15 septembre 2026 — rang 4 du lot 6 de
 * l'audit — sans que rien de leur comportement ne change.
 *
 * `demandePour` porte la règle « un reste déclaré est un plafond, zéro est un
 * retrait » et n'avait AUCUN test, alors que c'est l'entrée même du constat É2.
 */

const alim = (p: Partial<Aliment> & Pick<Aliment, 'id' | 'nom' | 'categorie'>): Aliment => ({
  kcal100: 100, prot100: 10, gluc100: 10, lip100: 1, ratio: 1, ...p,
});

const RIZ = alim({ id: 'r', nom: 'Riz', categorie: 'fec', kcal100: 350, prot100: 7, gluc100: 77, lip100: 1, ratio: 3 });
const POULET = alim({ id: 'p', nom: 'Poulet', categorie: 'prot', kcal100: 120, prot100: 23, gluc100: 0, lip100: 3, ratio: 0.75 });
const BROCOLI = alim({ id: 'b', nom: 'Brocoli', categorie: 'leg', kcal100: 34, prot100: 3, gluc100: 4, lip100: 0, ratio: 0.9 });
const AMANDE = alim({ id: 'a', nom: 'Amandes', categorie: 'ole', kcal100: 600, prot100: 21, gluc100: 5, lip100: 53 });

const compose = (p: Partial<Compose> = {}): Compose => ({
  roles: {}, ajouts: [], releves: {}, restes: {}, verrous: [], ...p,
});

const CIBLE = { kcal: 700, prot: 45, gluc: 80, lip: 20 };

/* -------------------------------------------------- une saisie valable */

describe('grammesSaisis — vide n\'est pas zéro', () => {
  it('rend null quand rien n\'a été tapé', () => {
    /* Règle 6 du projet : un champ vide veut dire « je ne sais pas ». Le
       rendre 0 ferait retirer l'aliment du repas sans que personne l'ait
       demandé. */
    assert.equal(grammesSaisis(undefined), null);
    assert.equal(grammesSaisis(''), null);
    assert.equal(grammesSaisis('   '), null);
  });

  it('rend 0 quand zéro a été tapé — c\'est un choix, pas une absence', () => {
    assert.equal(grammesSaisis('0'), 0);
    assert.equal(grammesSaisis(' 0 '), 0);
    assert.equal(grammesSaisis('0,0'), 0);
  });

  it('accepte la virgule décimale, celle du clavier français', () => {
    assert.equal(grammesSaisis('12,5'), 12.5);
    assert.equal(grammesSaisis('12.5'), 12.5);
    assert.equal(grammesSaisis(' 80 '), 80);
  });

  it('rejette ce que le calcul ne saurait pas utiliser', () => {
    /* « 12O » avec la lettre O, et « -50 » : avant, tous deux faisaient
       entrer l'aliment avec 0 g. Il restait affiché dans la liste, le
       résultat était calculé sans lui, et rien n'indiquait que le chiffre
       avait été jeté. */
    assert.equal(grammesSaisis('12O'), null);
    assert.equal(grammesSaisis('-50'), null);
    assert.equal(grammesSaisis('abc'), null);
    assert.equal(grammesSaisis('1,2,3'), null);
  });
});

describe('saisieIllisible — ce qui mérite un message à l\'écran', () => {
  it('ne se plaint pas d\'un champ vide', () => {
    assert.equal(saisieIllisible(undefined), false);
    assert.equal(saisieIllisible(''), false);
    assert.equal(saisieIllisible('  '), false);
  });

  it('ne se plaint pas d\'un zéro explicite', () => {
    assert.equal(saisieIllisible('0'), false);
  });

  it('se plaint de ce qui a été tapé mais reste inutilisable', () => {
    assert.equal(saisieIllisible('12O'), true);
    assert.equal(saisieIllisible('-50'), true);
  });
});

/* ------------------------------------------------------- demandePour */

describe('demandePour — un reste déclaré est un plafond', () => {
  it('sans reste déclaré, l\'aliment reste une variable sans plafond', () => {
    const d = demandePour('R2', compose({ roles: { glucide: RIZ, proteine: POULET } }), 1, CIBLE);
    assert.equal(d.plafonds, undefined);
    assert.equal(d.variables.glucide?.id, 'r');
    assert.equal(d.fixes.some((f) => f.aliment.id === 'r'), false);
  });

  it('un reste chiffré devient un plafond, pas une quantité imposée', () => {
    /* Écrire « il me reste 80 g de riz » ne doit pas obliger à en manger 80 :
       le calcul en sert ce qu'il faut, sans jamais dépasser. */
    const c = compose({
      roles: { glucide: RIZ },
      restes: { r: { grammes: '80', unite: 'cru' } },
    });
    const d = demandePour('R2', c, 1, CIBLE);
    assert.equal(d.plafonds?.['r'], 80);
    assert.equal(d.variables.glucide?.id, 'r');
    assert.equal(d.fixes.some((f) => f.aliment.id === 'r'), false);
  });

  it('ZÉRO EST UN RETRAIT, pas un plafond à zéro', () => {
    /* Un plafond à zéro ferait chercher un remplaçant du même rôle —
       l'inverse de « je n'en mets pas ». */
    const c = compose({
      roles: { glucide: RIZ },
      restes: { r: { grammes: '0', unite: 'cru' } },
    });
    const d = demandePour('R2', c, 1, CIBLE);
    assert.equal(d.plafonds, undefined);
    assert.equal(d.variables.glucide, undefined);
    assert.deepEqual(
      d.fixes.filter((f) => f.aliment.id === 'r').map((f) => f.grammes), [0],
    );
  });

  it('un plafond saisi en cuit se compte en grammes à cuire', () => {
    /* Le riz a un rendement de 3 : 240 g cuits, c'est 80 g à cuire. Le
       solveur ne travaille qu'en poids pesé. */
    const c = compose({
      roles: { glucide: RIZ },
      restes: { r: { grammes: '240', unite: 'cuit' } },
    });
    assert.equal(demandePour('R2', c, 1, CIBLE).plafonds?.['r'], 80);
  });

  it('une saisie illisible ne déclare rien du tout', () => {
    /* D7 : la règle de validité était réécrite ici, 35 lignes sous
       `grammesSaisis`. Deux copies, donc deux occasions de diverger — et une
       divergence ferait d'un « 8O » tapé de travers un plafond de 8 g, ou
       ferait disparaître l'aliment du repas. */
    for (const brut of ['8O', '-50', 'abc', '  ']) {
      const c = compose({
        roles: { glucide: RIZ },
        restes: { r: { grammes: brut, unite: 'cru' } },
      });
      const d = demandePour('R2', c, 1, CIBLE);
      assert.equal(d.plafonds, undefined, brut);
      assert.equal(d.variables.glucide?.id, 'r', brut);
      assert.equal(d.fixes.some((f) => f.aliment.id === 'r'), false, brut);
    }
  });

  it('`demandePour` et `grammesSaisis` disent la même chose, saisie par saisie', () => {
    /* Le garde-fou de D7 : si l'une des deux règles bougeait sans l'autre,
       cette boucle le dirait. */
    for (const brut of ['', ' ', '0', '0,0', '80', '12,5', '12O', '-50', 'abc', '1e2']) {
      const g = grammesSaisis(brut);
      const c = compose({
        roles: { glucide: RIZ },
        restes: { r: { grammes: brut, unite: 'cru' } },
      });
      const d = demandePour('R2', c, 1, CIBLE);
      const retire = d.fixes.some((f) => f.aliment.id === 'r' && f.grammes === 0);
      const plafonne = d.plafonds?.['r'] !== undefined;

      assert.equal(retire, g === 0, `retrait pour « ${brut} »`);
      assert.equal(plafonne, g !== null && g > 0, `plafond pour « ${brut} »`);
    }
  });

  it('un rôle imposé sert la quantité du modèle, multipliée par les convives', () => {
    const d = demandePour('R2', compose({ roles: { legume: BROCOLI } }), 3, CIBLE);
    const legume = d.fixes.find((f) => f.aliment.id === 'b');
    assert.equal(legume?.grammes, (imposePour('R2', 'legume') ?? 0) * 3);
  });

  /* CE TEST DISAIT L'INVERSE, ET IL FIGEAIT UN DÉFAUT.
     Écrit le 14 septembre en CARACTÉRISANT le code — démarche légitime pour un
     refactoring mécanique, mais qui grave la valeur fausse dès qu'elle en est
     une. Il exigeait 50 g là où le plan en demandait 600, et aurait donc
     interdit la correction d'É2 : le prochain à corriger aurait vu un test
     rouge et cru à une régression.
     Le bornage n'a pas disparu, il a repris sa place — dans `plafonds`, que
     `composer` sait relever avec un relais. Voir le bloc « un reste déclaré ne
     rabote PAS ce que le plan demande ». */
  it('un rôle imposé n\'est PAS raboté par le reste : le plafond s\'en charge', () => {
    const c = compose({
      roles: { legume: BROCOLI },
      restes: { b: { grammes: '50', unite: 'cru' } },
    });
    const d = demandePour('R2', c, 3, CIBLE);

    assert.equal(d.fixes.find((f) => f.aliment.id === 'b')?.grammes,
      (imposePour('R2', 'legume') ?? 0) * 3, 'le plan en veut 600 pour trois convives');
    assert.ok(Math.abs((d.plafonds?.['b'] ?? 0) - 50) < 0.5,
      'et le plafond dit qu\'on n\'en a que 50');
  });

  it('un ajout sans quantité pèse zéro, sans faire échouer le calcul', () => {
    const d = demandePour('R2', compose({ ajouts: [AMANDE] }), 1, CIBLE);
    assert.equal(d.fixes.find((f) => f.aliment.id === 'a')?.grammes, 0);
  });

  it('les cibles sont multipliées par le nombre de convives', () => {
    const d = demandePour('R2', compose(), 2, CIBLE);
    assert.deepEqual(d.cibles, { kcal: 1400, prot: 90, gluc: 160, lip: 40 });
  });
});

/* ---------------------------------------------- aliments ajoutables (D8) */

describe('un reste déclaré ne rabote PAS ce que le plan demande', () => {
  /* CONSTAT É2, SECOND CHEMIN — trouvé le 15 septembre 2026.
   *
   * Le correctif de septembre portait sur `composer.ts` : `ignorerPlafonds`
   * empêche la liste de courses de se laisser rétrécir par un plafond. Mais un
   * rôle IMPOSÉ par le modèle ne passait pas par les plafonds : sa quantité
   * était rabotée ici, dans `fixes`, par un `Math.min`.
   *
   * Un `fixes` raboté est indiscernable d'un « je n'en veux que 80 g » une fois
   * arrivé au solveur : l'information « le plan en voulait 200 » est détruite
   * AVANT d'entrer dans `composer.ts`, et `ignorerPlafonds` ne peut plus la
   * relever. La liste de courses faisait donc sous-acheter — exactement É2.
   *
   * Et ce n'est pas tout. `composer` borne lui-même les fixes au stock, mais en
   * cherchant un RELAIS pour le manque (`choisirReleve`, composer.ts:398-420).
   * Raboter en amont lui cache le débordement : aucun relais n'est proposé, et
   * l'utilisateur perd les 120 g au lieu de se les voir remplacés.
   *
   * Le commentaire du bloc disait déjà le bon comportement — « un plafond
   * déclaré est simplement un frigo plus petit », « relève par un autre aliment
   * comprise ». Le `Math.min` le contredisait. */
  const avecReste = (grammes: string) => compose({
    roles: { legume: BROCOLI },
    restes: { b: { grammes, unite: 'cru' as const } },
  });

  it('garde la quantité du modèle dans les fixes, et pose le plafond à côté', () => {
    const d = demandePour('R2', avecReste('80'), 1, CIBLE);

    const legume = d.fixes.find((f) => f.aliment.id === 'b');
    assert.ok(legume, 'le légume imposé par le modèle doit être dans les fixes');
    assert.equal(legume.grammes, LEGUME_PAR_PORTION,
      'le plan en veut ce qu\'il en veut : c\'est au solveur de le borner, avec relais');
    assert.ok(Math.abs((d.plafonds?.['b'] ?? 0) - 80) < 0.5,
      'le reste déclaré reste un PLAFOND — c\'est lui qui dit ce qu\'on a');
  });

  /* Le témoin. Sans reste déclaré rien ne change — sinon on ne saurait pas si
     le test précédent décrit une correction ou une régression. */
  it('sans reste déclaré, la quantité du modèle est servie telle quelle', () => {
    const d = demandePour('R2', compose({ roles: { legume: BROCOLI } }), 1, CIBLE);

    assert.equal(d.fixes.find((f) => f.aliment.id === 'b')?.grammes, LEGUME_PAR_PORTION);
    assert.equal(d.plafonds?.['b'], undefined, 'sans reste déclaré, aucun plafond');
  });

  /* Zéro garde son sens de RETRAIT, et ce n'est pas la même chose : « je n'en
     mets pas » doit écarter l'aliment, pas demander un relais. */
  it('zéro reste un retrait, pas un plan raboté', () => {
    const d = demandePour('R2', avecReste('0'), 1, CIBLE);

    assert.equal(d.fixes.find((f) => f.aliment.id === 'b')?.grammes, 0);
  });
});

describe('alimentsAjoutables — une seule liste, pas deux', () => {
  const stock = [RIZ, POULET, BROCOLI, AMANDE];

  it('écarte ce qui tient déjà un rôle et ce qui est déjà ajouté', () => {
    const c = compose({ roles: { glucide: RIZ }, ajouts: [AMANDE] });
    assert.deepEqual(alimentsAjoutables(stock, c).map((a) => a.id), ['p', 'b']);
  });

  it('rend tout le stock quand le repas est vide', () => {
    assert.deepEqual(alimentsAjoutables(stock, compose()).map((a) => a.id), ['r', 'p', 'b', 'a']);
  });

  it('LA POSITION CHOISIE DÉSIGNE LE BON ALIMENT', () => {
    /* D8 : la liste affichée et la liste indexée par `onChoisir` étaient deux
       `stock.filter(...)` recopiés. La modale ne parle qu'en positions — les
       identifiants du frigo sont des références (« grocy:12 ») — donc deux
       filtres qui divergent font ajouter un aliment pour un autre, sans
       aucune erreur visible. */
    const c = compose({ roles: { glucide: RIZ }, ajouts: [AMANDE] });
    const liste = alimentsAjoutables(stock, c);
    const affiche = liste.map((a, i) => ({ id: i, nom: a.nom }));

    assert.equal(liste[affiche[1]!.id]?.nom, affiche[1]!.nom);
  });
});

/* ---------------------------------------------------- vers / vocabulaire */

describe('vers — « on ne sait pas » n\'est pas « zéro »', () => {
  it('garde les fibres inconnues inconnues', () => {
    const a = vers({
      reference: 'x', nom: 'Pain', categorie: 'fec', kcal100: 250,
      prot100: 9, gluc100: 42, lip100: 2, fibres100: null, ratio: 1,
    } as Parameters<typeof vers>[0]);
    assert.equal(a.fibres100, undefined);
  });

  it('transmet les fibres connues, zéro compris', () => {
    const a = vers({
      reference: 'x', nom: 'Huile', categorie: 'huile', kcal100: 900,
      prot100: 0, gluc100: 0, lip100: 100, fibres100: 0, ratio: 1,
    } as Parameters<typeof vers>[0]);
    assert.equal(a.fibres100, 0);
  });
});

describe('le vocabulaire des rôles', () => {
  it('couvre les sept rôles du solveur, une fois chacun', () => {
    assert.equal(new Set(ROLES.map((r) => r.cle)).size, ROLES.length);
    assert.equal(ROLES.length, 7);
  });

  it('imposePour ne rend une quantité que pour un rôle imposé', () => {
    assert.equal(imposePour('R2', 'legume'), 200);
    assert.equal(imposePour('R2', 'glucide'), undefined);
  });
});


/* --------------------------------------- ce que l'écran de repas décidait
 *
 * Trois règles rapatriées de `composants/carteRepas.tsx` le 20 septembre 2026
 * (palier 0). Elles vivaient dans le JSX — l'une dans un `style`, l'autre dans
 * une condition d'affichage — et aucune n'était testée.
 * ----------------------------------------------------------------------- */

describe('l\'écart d\'une macro se juge PAR PERSONNE', () => {
  it('un repas pour trois n\'est pas jugé sur son total', () => {
    /* 120 kcal d'écart sur un repas pour trois, c'est 40 par assiette — sous
       la tolérance de 45. Comparer le total déclarerait raté un repas juste,
       et cette couleur est ce qui dit s'il faut corriger. */
    assert.equal(ecartTenu(120, 3, 'kcal'), true);
    assert.equal(ecartTenu(120, 1, 'kcal'), false);
  });

  it('le signe ne compte pas : trop est aussi faux que pas assez', () => {
    assert.equal(ecartTenu(-46, 1, 'kcal'), false);
    assert.equal(ecartTenu(46, 1, 'kcal'), false);
  });

  it('la borne elle-même passe', () => {
    assert.equal(ecartTenu(TOLERANCE.prot, 1, 'prot'), true);
  });

  it('zéro portion ne divise pas par zéro', () => {
    /* Un écran peut passer 0 le temps d'un rendu. Rendre Infinity y peindrait
       tout en rouge sans qu'on sache pourquoi. */
    assert.equal(ecartTenu(10, 0, 'kcal'), true);
  });
});

describe('les fibres d\'un repas', () => {
  const fibresDe = (a: { id: number | string }) => (a.id === 1 ? 7 : 1.4);

  it('se comptent sur le poids PESÉ, jamais sur le poids servi', () => {
    /* 200 g de riz sec à 1,4 g de fibres pour 100 g = 2,8 g. Le même riz cuit
       pèse 452 g : compter l'assiette donnerait 6,3 g — plus du double, pour
       de l'eau. C'est la règle 3 appliquée aux fibres. */
    assert.equal(fibresDuRepas([{ aliment: { id: 2 }, aCuire: 200 }], fibresDe), 2.8);
  });

  it('s\'additionnent sur tout le repas', () => {
    const somme = fibresDuRepas(
      [{ aliment: { id: 1 }, aCuire: 100 }, { aliment: { id: 2 }, aCuire: 200 }], fibresDe);

    assert.equal(Math.round(somme * 100) / 100, 9.8);
  });

  it('valent zéro sur un repas vide, pas NaN', () => {
    assert.equal(fibresDuRepas([], fibresDe), 0);
  });

  it('un demi-gramme ne mérite pas qu\'on en parle', () => {
    /* Le seuil était écrit `fibres > 0.5` dans le JSX, sans nom. */
    assert.equal(FIBRES_DIGNES_D_ETRE_DITES, 0.5);
  });
});

describe('les renforts d\'un role', () => {
  const q = (id: number) => ({ aliment: { id } });

  it('remonte ce qu\'un plafonnement a fait entrer sous CE role', () => {
    assert.deepEqual(
      renfortsDuRole('proteine', [q(1), q(2)],
        [{ role: 'proteine', releve: { id: 2 } }], [], new Set([1])),
      [q(2)]);
  });

  it('remonte aussi ce qu\'un echange a mis', () => {
    assert.deepEqual(
      renfortsDuRole('glucide', [q(3)], [],
        [{ role: 'glucide', mis: { id: 3 } }], new Set()),
      [q(3)]);
  });

  it('ignore ce qui concerne un AUTRE role', () => {
    /* Les renforts s'affichent sous la ligne qu'ils completent : les poser
       sous la mauvaise ferait chercher au mauvais endroit. */
    assert.deepEqual(
      renfortsDuRole('proteine', [q(2)],
        [{ role: 'glucide', releve: { id: 2 } }], [], new Set()),
      []);
  });

  it('LE BUG REEL : un aliment qui tient deja sa ligne n\'est pas reaffiche', () => {
    /* Quand l'huile prend en charge les lipides, elle apparaissait DEUX fois
       avec la meme quantite — et on la pesait deux fois. */
    assert.deepEqual(
      renfortsDuRole('lipide', [q(5)],
        [{ role: 'lipide', releve: { id: 5 } }], [], new Set([5])),
      []);
  });

  it('sans plafonnement ni echange, il n\'y a pas de renfort', () => {
    assert.deepEqual(renfortsDuRole('proteine', [q(1), q(2)], [], [], new Set()), []);
  });
});
