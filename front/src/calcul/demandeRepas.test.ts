import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type Compose, ROLES, alimentsAjoutables, demandePour, grammesSaisis,
  imposePour, saisieIllisible, vers,
} from './demandeRepas';
import type { Aliment } from '@/solveur/types';

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

  it('un rôle imposé est borné par ce qu\'on a déclaré avoir', () => {
    const c = compose({
      roles: { legume: BROCOLI },
      restes: { b: { grammes: '50', unite: 'cru' } },
    });
    assert.equal(demandePour('R2', c, 3, CIBLE).fixes.find((f) => f.aliment.id === 'b')?.grammes, 50);
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
