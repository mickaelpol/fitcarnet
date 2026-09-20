import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PAS_DE_RANG, echangeDeRangs, libelleDejaPris, prochainRang } from './listeOrdonnee';

/**
 * LES TROIS RÈGLES DE L'ADMINISTRATION D'UNE LISTE ORDONNÉE.
 *
 * Elles vivaient dans `app/admin-cuissons.tsx` — `prochainOrdre` ligne 65,
 * `deja` ligne 69, `decaler` ligne 72 — c'est-à-dire dans `app/`, là où
 * `tsconfig.tests.json` ne va PAS. Trois règles réelles, aucune éprouvée, et
 * rien pour le signaler.
 *
 * Elles comptent pour de bon : cette table décide quels aliments partent dans
 * la même fournée. Deux modes au même rang, et l'ordre affiché devient celui
 * de l'alphabet, c'est-à-dire n'importe lequel.
 *
 * Descendues le 20 septembre 2026 (palier 0), à comportement strictement
 * identique.
 */

interface Mode { id: number; ordre: number }

/* `noUncheckedIndexedAccess` rend `liste[1]` possiblement `undefined` : on
   nomme donc les lignes plutôt que de les indexer. */
const modes = (...rangs: number[]): Mode[] =>
  rangs.map((ordre, i) => ({ id: i + 1, ordre }));

const PREMIER: Mode = { id: 1, ordre: 10 };
const MILIEU: Mode = { id: 2, ordre: 20 };
const DERNIER: Mode = { id: 3, ordre: 30 };
const TROIS: Mode[] = [PREMIER, MILIEU, DERNIER];

describe('le prochain rang', () => {
  it('part à dix sur une liste vide', () => {
    assert.equal(prochainRang([]), PAS_DE_RANG);
  });

  it('se pose dix crans après le dernier', () => {
    /* Les pas de dix laissent la place d'intercaler sans renuméroter toute la
       liste. C'est la seule raison du chiffre. */
    assert.equal(prochainRang(modes(10, 20, 30)), 40);
  });

  it('regarde le rang le PLUS HAUT, pas le dernier de la liste', () => {
    /* Une liste rendue dans un autre ordre — par l'API, par un tri d'écran —
       ne doit pas faire réutiliser un rang déjà pris. */
    assert.equal(prochainRang(modes(30, 10, 20)), 40);
  });

  it('supporte les rangs négatifs sans repartir de zéro', () => {
    assert.equal(prochainRang(modes(-30, -20)), -10);
  });
});

describe('le libellé déjà pris', () => {
  it('ignore la casse et les espaces du bord', () => {
    const liste = [{ libelle: 'Vapeur' }];

    assert.equal(libelleDejaPris(liste, '  vapeur '), true);
    assert.equal(libelleDejaPris(liste, 'VAPEUR'), true);
  });

  it('LE TÉMOIN : deux cuissons réellement différentes le restent', () => {
    /* Sans ce cas, une comparaison trop large refuserait de créer
       « Four 200 °C » parce que « Four 180 °C » existe — et les deux
       partiraient dans la même fournée, ce que la table existe pour éviter. */
    const liste = [{ libelle: 'Four 180 °C' }];

    assert.equal(libelleDejaPris(liste, 'Four 200 °C'), false);
    assert.equal(libelleDejaPris(liste, 'Vapeur'), false);
  });

  it('une liste vide ne prend rien', () => {
    assert.equal(libelleDejaPris([], 'Vapeur'), false);
  });
});

describe('déplacer une ligne', () => {
  it('échange les deux rangs, et ne les incrémente pas', () => {
    /* Incrémenter finit par produire deux lignes de même rang. L'échange, lui,
       conserve l'ensemble des rangs utilisés. */
    assert.deepEqual(echangeDeRangs(TROIS, MILIEU, +1), [
      { id: 2, ordre: 30 },
      { id: 3, ordre: 20 },
    ]);
  });

  it('remonte aussi bien qu\'il descend', () => {
    assert.deepEqual(echangeDeRangs(TROIS, MILIEU, -1), [
      { id: 2, ordre: 10 },
      { id: 1, ordre: 20 },
    ]);
  });

  it('ne fait RIEN aux deux bouts', () => {
    /* Pas d'échange avec un voisin qui n'existe pas : c'est ce qui rendait
       `decaler` muet en haut et en bas de liste, et il faut le garder. */
    assert.deepEqual(echangeDeRangs(TROIS, PREMIER, -1), []);
    assert.deepEqual(echangeDeRangs(TROIS, DERNIER, +1), []);
  });

  it('ne fait rien pour une ligne absente de la liste', () => {
    assert.deepEqual(echangeDeRangs(modes(10, 20), { id: 99, ordre: 5 }, +1), []);
  });
});
