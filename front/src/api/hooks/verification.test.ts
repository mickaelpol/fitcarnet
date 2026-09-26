import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ilYAQuelqueChoseAJuger, type SaisieAliment } from './saisieAJuger';

/**
 * QUAND FAUT-IL DÉRANGER LE SERVEUR ?
 *
 * LE COMMENTAIRE PROMETTAIT CE QUE LE CODE NE FAISAIT PAS — motif 3 du projet,
 * relevé le 21 septembre 2026. `useVerdictAliment` affirmait : *« `enabled`
 * coupe l'appel tant que rien n'est saisi : une modale qui s'ouvre ne doit pas
 * interroger le serveur pour lui dire qu'elle est vide »*.
 *
 * MESURE AU NAVIGATEUR, éditeur FERMÉ, sur l'ouverture du frigo :
 *
 *   POST /api/verification/aliment
 *   {"categorie":"prot","kcal100":"","prot100":"","gluc100":"","lip100":"",
 *    "fibres100":"","ratio":"1","peseeAvant":"","peseeApres":""}
 *
 * Un appel complet pour dire au serveur que tout est vide, à chaque ouverture
 * du frigo. `enabled: interrogee !== null` ne coupait rien : l'éditeur est
 * monté en permanence et remonte son état initial, qui n'est pas `null`.
 *
 * LA CATÉGORIE ET LE RENDEMENT NE COMPTENT PAS comme « quelque chose de
 * saisi » : ils ont une valeur par défaut (`prot`, `1`) que personne n'a tapée.
 * Les retenir aurait laissé le défaut intact.
 */

const vide: SaisieAliment = {
  categorie: 'prot',
  kcal100: '',
  prot100: '',
  gluc100: '',
  lip100: '',
  fibres100: '',
  ratio: '1',
  peseeAvant: '',
  peseeApres: '',
};

describe('quand le serveur a quelque chose à juger', () => {
  it('une saisie entièrement vide ne vaut pas un appel', () => {
    assert.equal(ilYAQuelqueChoseAJuger(vide), false);
  });

  it('rien du tout non plus', () => {
    assert.equal(ilYAQuelqueChoseAJuger(null), false);
  });

  it('la catégorie par défaut ne suffit pas : personne ne l’a choisie', () => {
    assert.equal(ilYAQuelqueChoseAJuger({ ...vide, categorie: 'fec' }), false);
  });

  it('le rendement par défaut non plus', () => {
    assert.equal(ilYAQuelqueChoseAJuger({ ...vide, ratio: '2.26' }), false);
  });

  it('LE TÉMOIN : une seule macro tapée suffit, et le serveur répond', () => {
    /* Sans ce cas, un garde qui rendrait TOUJOURS `false` passerait les quatre
       épreuves ci-dessus en supprimant la fonctionnalité entière. */
    assert.equal(ilYAQuelqueChoseAJuger({ ...vide, kcal100: '350' }), true);
  });

  it('chacun des cinq champs compte, pas seulement les calories', () => {
    /* Une garde écrite sur `kcal100` seul laisserait l'écran muet pour qui
       commence par les protéines — et c'est un ordre de saisie normal. */
    for (const champ of ['kcal100', 'prot100', 'gluc100', 'lip100', 'fibres100'] as const) {
      assert.equal(ilYAQuelqueChoseAJuger({ ...vide, [champ]: '7' }), true,
        `le champ ${champ} doit déclencher le verdict`);
    }
  });

  it('un zéro tapé est une saisie : vide n’est pas zéro', () => {
    /* Règle 6 du projet. « 0 g de lipides » est une réponse, et elle mérite
       un verdict — un garde écrit sur la véracité (`Number(v)`) l'aurait
       traitée comme un champ vide. */
    assert.equal(ilYAQuelqueChoseAJuger({ ...vide, lip100: '0' }), true);
  });

  it('une espace seule ne compte pas pour une saisie', () => {
    assert.equal(ilYAQuelqueChoseAJuger({ ...vide, kcal100: '   ' }), false);
  });

  it('une pesée en cours compte, elle aussi', () => {
    /* Le rendement CANDIDAT vient de deux pesées réelles, contrairement au
       rendement par défaut : il y a bien quelque chose à juger. */
    assert.equal(ilYAQuelqueChoseAJuger({ ...vide, peseeAvant: '100' }), true);
  });
});
