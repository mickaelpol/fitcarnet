import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { AlimentDisponible } from '@/api/types';
import {
  abonnerInventaire, allerAuStock, basculerVu, cloreInventaire, inventaireEnCours, modeFrigo,
  ouvrirInventaire, reinitialiserInventaire, saisirQuantite, saisiesInventaire, vusInventaire,
} from './etatInventaire';

const aliment = (reference: string, stock: number): AlimentDisponible => ({
  reference, nom: reference, categorie: 'autre',
  kcal100: 0, prot100: 0, gluc100: 0, lip100: 0, fibres100: null,
  ratio: 1, stock, unite: 'g', grammesParUnite: 1,
  emplacement: null, peseeAvant: null, peseeApres: null, provenanceRatio: 'table',
});

const frigo = [aliment('base:1', 1234.56), aliment('base:2', 0)];

describe('état de l\'inventaire', () => {
  /* Le module survit au démontage : il faut donc le remettre à zéro entre
     deux tests, comme le ferait un dépôt réussi. */
  beforeEach(() => { cloreInventaire(); });

  /* LE CONSTAT M12, REPRODUIT. Avant le 18 septembre 2026, `saisies` était un
     `useState` de l'onglet : aller vérifier une quantité dans l'onglet Stock
     démontait le composant et emportait l'inventaire en cours. */
  it('la saisie survit à un aller-retour par l\'onglet Stock', () => {
    ouvrirInventaire(frigo);
    saisirQuantite('base:1', '980');
    basculerVu('base:1');

    allerAuStock();
    assert.equal(modeFrigo(), 'stock');

    ouvrirInventaire(frigo);
    assert.equal(saisiesInventaire()['base:1'], '980', 'la quantité comptée est toujours là');
    assert.equal(vusInventaire()['base:1'], true, 'et la case « vérifié » aussi');
  });

  /* La valeur exacte, pas son affichage arrondi : préremplir « 1234,6 » pour
     un stock de 1234,56 créerait un écart de 0,04 sur une ligne que personne
     n'a touchée, et l'enverrait. */
  it('préremplit avec le stock exact', () => {
    ouvrirInventaire(frigo);
    assert.equal(saisiesInventaire()['base:1'], '1234.56');
    assert.equal(saisiesInventaire()['base:2'], '0');
  });

  /* VIDE ≠ ZÉRO. Un champ effacé veut dire « pas encore compté » ; le
     reprendre pour un zéro viderait le frigo de ce qu'on n'a pas pesé. */
  it('un champ effacé reste vide, et le retour d\'onglet ne le remplit pas', () => {
    ouvrirInventaire(frigo);
    saisirQuantite('base:1', '');

    allerAuStock();
    ouvrirInventaire(frigo);

    assert.equal(saisiesInventaire()['base:1'], '', 'toujours vide, pas repréremplie');
  });

  /* Le contournement retiré ce jour-là regardait l'ÉTAT (`saisies` vide ?) au
     lieu de l'INTENTION (une session est-elle ouverte ?). Tout effacer à la
     main suffisait à le tromper : on revenait, et l'onglet repréremplissait
     par-dessus le travail. */
  it('ne repart pas de zéro même quand toutes les saisies sont effacées', () => {
    ouvrirInventaire(frigo);
    saisirQuantite('base:1', '');
    saisirQuantite('base:2', '');

    allerAuStock();
    ouvrirInventaire(frigo);

    assert.deepEqual(saisiesInventaire(), { 'base:1': '', 'base:2': '' });
  });

  /* Un aliment apparu après l'ouverture n'a pas de valeur : il ne vaut surtout
     pas zéro, que `ecartsInventaire` enverrait comme une pesée. */
  it('n\'invente aucune valeur pour un aliment non saisi', () => {
    ouvrirInventaire(frigo);
    assert.equal(saisiesInventaire()['base:9'], undefined);
    assert.equal(vusInventaire()['base:9'], undefined);
  });

  it('« Réinitialiser » repart du stock et décoche tout', () => {
    ouvrirInventaire(frigo);
    saisirQuantite('base:1', '980');
    basculerVu('base:1');

    reinitialiserInventaire(frigo);

    assert.equal(saisiesInventaire()['base:1'], '1234.56');
    assert.deepEqual(vusInventaire(), {});
    assert.equal(inventaireEnCours(), true, 'la session reste ouverte');
  });

  /* Déposé, pas appliqué : le serveur tient désormais la liste. La garder ici
     ferait rouvrir l'inventaire sur des chiffres déjà partis. */
  it('un dépôt réussi clôt la session et ramène au stock', () => {
    ouvrirInventaire(frigo);
    saisirQuantite('base:1', '980');

    cloreInventaire();

    assert.equal(modeFrigo(), 'stock');
    assert.deepEqual(saisiesInventaire(), {});
    assert.deepEqual(vusInventaire(), {});
    assert.equal(inventaireEnCours(), false);

    ouvrirInventaire(frigo);
    assert.equal(saisiesInventaire()['base:1'], '1234.56', 'la session suivante repart du stock');
  });

  it('la case « vérifié » se coche et se décoche', () => {
    ouvrirInventaire(frigo);
    basculerVu('base:1');
    assert.equal(vusInventaire()['base:1'], true);
    basculerVu('base:1');
    assert.equal(vusInventaire()['base:1'], false);
  });

  it('prévient ses abonnés, et plus rien après le désabonnement', () => {
    let appels = 0;
    const desabonner = abonnerInventaire(() => { appels += 1; });

    ouvrirInventaire(frigo);
    saisirQuantite('base:1', '980');
    basculerVu('base:1');
    allerAuStock();
    assert.equal(appels, 4);

    desabonner();
    saisirQuantite('base:1', '12');
    assert.equal(appels, 4);
  });
});
