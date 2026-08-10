import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AlimentDisponible } from '@/api/types';
import { SEUIL_ECART, ecartsInventaire, filtrerFrigo, grouperParEmplacement } from './frigo';

const aliment = (
  reference: string,
  nom: string,
  stock: number,
  emplacement: string | null = 'Frigo',
): AlimentDisponible => ({
  reference, nom, categorie: 'autre',
  kcal100: 0, prot100: 0, gluc100: 0, lip100: 0, fibres100: null,
  ratio: 1,
  stock, unite: 'g', grammesParUnite: 1,
  emplacement, peseeAvant: null, peseeApres: null, provenanceRatio: 'table',
});

describe('écarts d\'inventaire', () => {
  const stock = [aliment('base:1', 'Riz', 500), aliment('base:2', 'Thon', 120)];

  it('un champ vide n\'est pas un zéro', () => {
    assert.deepEqual(ecartsInventaire(stock, { 'base:1': '', 'base:2': '   ' }), []);
  });

  it('un zéro saisi part, lui', () => {
    assert.deepEqual(
      ecartsInventaire(stock, { 'base:1': '0' }),
      [{ reference: 'base:1', quantite: 0 }]);
  });

  it('n\'envoie que ce qui a changé', () => {
    const lignes = ecartsInventaire(stock, { 'base:1': '500', 'base:2': '90' });
    assert.deepEqual(lignes, [{ reference: 'base:2', quantite: 90 }]);
  });

  it('ignore une différence sous le seuil d\'arrondi', () => {
    assert.deepEqual(ecartsInventaire(stock, { 'base:1': String(500 + SEUIL_ECART / 2) }), []);
  });

  it('accepte la virgule décimale', () => {
    assert.deepEqual(
      ecartsInventaire(stock, { 'base:2': '119,5' }),
      [{ reference: 'base:2', quantite: 119.5 }]);
  });

  it('écarte une saisie illisible ou négative plutôt que de deviner', () => {
    assert.deepEqual(ecartsInventaire(stock, { 'base:1': 'abc', 'base:2': '-3' }), []);
  });

  it('ignore une saisie qui ne correspond à aucun aliment', () => {
    assert.deepEqual(ecartsInventaire(stock, { 'base:99': '10' }), []);
  });
});

describe('regroupement par emplacement', () => {
  it('descend du frais au sec, puis alphabétiquement', () => {
    const sections = grouperParEmplacement([
      aliment('a', 'Riz', 1, 'Placard'),
      aliment('b', 'Lait', 1, 'Frigo'),
      aliment('c', 'Petits pois', 1, 'Congélateur'),
      aliment('d', 'Divers', 1, 'Cave'),
    ]);

    assert.deepEqual(
      sections.map((s) => s.titre),
      ['Frigo', 'Congélateur', 'Placard', 'Cave']);
  });

  it('range les sans-emplacement sous un titre explicite', () => {
    const sections = grouperParEmplacement([aliment('a', 'Riz', 1, null)]);
    assert.equal(sections[0]!.titre, 'Sans emplacement');
  });

  it('trie les aliments par nom, à la française', () => {
    const sections = grouperParEmplacement([
      aliment('a', 'Œufs', 1), aliment('b', 'Épinards', 1), aliment('c', 'Beurre', 1),
    ]);

    assert.deepEqual(sections[0]!.data.map((x) => x.nom), ['Beurre', 'Épinards', 'Œufs']);
  });
});

describe('recherche dans le frigo', () => {
  const liste = [
    aliment('a', 'Épinards', 1, 'Congélateur'),
    aliment('b', 'Riz complet', 1, 'Placard'),
  ];

  it('ignore les accents et la casse', () => {
    assert.deepEqual(filtrerFrigo(liste, 'EPINARD').map((x) => x.nom), ['Épinards']);
  });

  it('cherche aussi dans l\'emplacement', () => {
    assert.deepEqual(filtrerFrigo(liste, 'congelateur').map((x) => x.nom), ['Épinards']);
  });

  it('rend tout sur une recherche vide', () => {
    assert.equal(filtrerFrigo(liste, '   ').length, 2);
  });
});
