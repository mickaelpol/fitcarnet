import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import { describe, it, type TestContext } from 'node:test';
import { AlertesFrigo } from './alertesFrigo';

/**
 * UN PRODUIT QU'ON NE VOIT PAS DOIT AU MOINS ÊTRE NOMMÉ.
 *
 * Relevé par l'utilisateur le 19 septembre 2026, sur un frigo Grocy réel :
 *
 *   « J'ai tenté d'ajouter "flageolet rouge" […] l'erreur me dit
 *     "Flageolet rouge existe déjà dans Grocy. Ouvre-le pour corriger ses
 *     valeurs." sauf que je ne vois pas cet aliment dans mon frigo ! »
 *
 * `FrigoGrocy::lire()` écarte tout produit auquel il manque une valeur
 * nutritionnelle (`$manquants → continue`). L'alerte existait déjà et disait
 * la vérité — « N produit(s) Grocy sans valeurs nutritionnelles » — mais elle
 * ne donnait QUE LE COMPTE. Impossible de savoir lequel, donc impossible
 * d'aller le compléter ; et la création répondait « il existe déjà ». Une
 * boucle fermée sur elle-même : l'application refuse de le créer et refuse de
 * dire où il est.
 *
 * L'alerte voisine, `sansFibres`, nommait ses aliments depuis toujours. Deux
 * bandeaux côte à côte, deux traitements : le motif 1 de l'audit, le jumeau
 * oublié, appliqué à un texte.
 */

const RIEN = {
  erreurSuppression: null,
  quantiteEnEchec: false,
  enCoursDEnvoi: false,
  traites: 0,
  total: 0,
  inventaireFini: false,
  echecs: [],
  sansPoids: [],
  sansFibres: [],
};

describe('les produits Grocy écartés faute de valeurs', () => {
  it('sont nommés, et pas seulement comptés', (t: TestContext) => {
    t.after(cleanup);
    render(<AlertesFrigo {...RIEN} bloquants={[
      { nom: 'Flageolet rouge' },
      { nom: 'Chou-rave' },
    ]} />);

    /* LE NOM EST LE SEUL RENSEIGNEMENT QUI SERVE. « 2 produits » n'apprend
       rien : on ne peut ni les chercher dans Grocy, ni comprendre pourquoi
       celui qu'on cherchait n'est pas là. */
    assert.ok(screen.queryByText(/Flageolet rouge/), 'le nom du produit doit être affiché');
    assert.ok(screen.queryByText(/Chou-rave/), 'tous les noms, pas seulement le premier');
  });

  it('expliquent POURQUOI on ne les voit pas, et où aller', (t: TestContext) => {
    t.after(cleanup);
    render(<AlertesFrigo {...RIEN} bloquants={[{ nom: 'Flageolet rouge' }]} />);

    const texte = document.body.textContent ?? '';

    assert.match(texte, /n'apparaissent pas|n’apparaissent pas/,
      'sans cette phrase, on croit que le produit n\'existe pas du tout');
    assert.match(texte, /Grocy/,
      'c\'est dans Grocy que ça se corrige, pas dans l\'application');
  });

  it('se taisent quand il n\'y en a aucun — le témoin', (t: TestContext) => {
    t.after(cleanup);
    /* Sans ce cas, un bandeau affiché en permanence passerait les deux tests
       ci-dessus tout en criant sur un frigo parfaitement sain. */
    render(<AlertesFrigo {...RIEN} bloquants={[]} />);

    assert.doesNotMatch(document.body.textContent ?? '', /valeurs nutritionnelles/,
      'aucun produit écarté : le bandeau ne doit pas exister');
  });
});
