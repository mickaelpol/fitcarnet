import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COULEUR_TYPE, TYPES_SEANCE, couleurDuType } from './typesSeance';

/**
 * LES TROIS TYPES DE SÉANCE, ET LEURS COULEURS.
 *
 * Six écritures pour deux listes, relevées le 20 septembre 2026 (palier 0) :
 *
 *     app/(onglets)/modeles.tsx:7    { Push: C.prot, Pull: C.fec, Legs: C.leg }
 *     app/(onglets)/seances.tsx:9    idem
 *     app/seance/[id].tsx:24         idem
 *     app/modele/[id].tsx:20         idem
 *     app/seance/[id].tsx:23         ['Push', 'Pull', 'Legs']
 *     app/modele/[id].tsx:19         idem
 *
 * Toutes dans `app/`, donc aucune éprouvable. Le motif 8 du projet — la liste
 * écrite à la main : un quatrième type de séance devrait être posé à six
 * endroits, et la couleur oubliée retomberait en silence sur `C.ligne`, la
 * teinte des séparateurs. Deux écrans afficheraient la même séance de deux
 * couleurs différentes sans que rien ne tombe.
 */

describe('les types de séance', () => {
  it('sont les trois du plan, dans l\'ordre du cycle', () => {
    assert.deepEqual([...TYPES_SEANCE], ['Push', 'Pull', 'Legs']);
  });

  it('ont TOUS une couleur', () => {
    /* LE VERROU. C'est ce que six listes écrites à la main ne pouvaient pas
       garantir : ajouter un type sans sa couleur passait inaperçu jusqu'à ce
       qu'un écran l'affiche en gris de séparateur. */
    for (const type of TYPES_SEANCE) {
      assert.ok(COULEUR_TYPE[type], `« ${type} » doit avoir une couleur`);
    }
  });

  it('ont des couleurs DISTINCTES', () => {
    /* Deux types de la même teinte rendraient le code couleur inutile — or
       c'est la seule chose qui distingue une séance d'une autre dans la liste. */
    const teintes = new Set(TYPES_SEANCE.map((t) => COULEUR_TYPE[t]));

    assert.equal(teintes.size, TYPES_SEANCE.length);
  });
});

describe('la couleur d\'un type', () => {
  it('rend celle du type quand il est connu', () => {
    assert.equal(couleurDuType('Push'), COULEUR_TYPE.Push);
  });

  it('un type inconnu ou absent retombe sur une teinte neutre, sans crier', () => {
    /* Une séance sans type est légitime — on n'oblige personne à ranger sa
       séance dans une case. Elle ne doit ni planter ni emprunter la couleur
       d'un autre type. */
    const neutre = couleurDuType(null);

    assert.ok(neutre);
    assert.equal(couleurDuType('Cardio'), neutre);
    assert.equal(couleurDuType(undefined), neutre);
    assert.ok(!TYPES_SEANCE.some((t) => COULEUR_TYPE[t] === neutre),
      'la teinte neutre ne doit être celle d\'aucun type');
  });
});
