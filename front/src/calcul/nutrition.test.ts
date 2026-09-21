import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ratioDepuisPesees } from './nutrition';

/* CE QUI A DISPARU D'ICI LE 21 SEPTEMBRE 2026, et pourquoi.
 *
 * Ce fichier éprouvait « cohérence des macros » (`controler`) et « détection
 * des kilojoules » (`soupconKilojoules`, `kilojoulesCertains`) — deux
 * jugements que le front rendait sur un aliment.
 *
 * Ils sont sur le SERVEUR depuis le 20 septembre : l'écran envoie la saisie à
 * `POST /api/verification/aliment` et affiche ce qui revient. Les fonctions
 * étaient restées exportées sans plus aucun appelant, avec leurs tests — et
 * `kilojoulesCertains` portait encore « verrouillée sur son jumeau PHP par
 * api/regles/coherence.json », un fichier supprimé depuis.
 *
 * Elles sont éprouvées là où elles vivent : `AnomaliesAlimentTest`,
 * `CoherenceNutritionnelleTest` et `VerdictAlimentTest` côté API, plus
 * `AnomaliesPortageTest` qui compare le portage à l'ancien front sur
 * 7 936 cas. Rien n'a été perdu en chemin ; ce fichier n'en était que le
 * double. */

describe('ratio depuis deux pesées', () => {
  it('arrondit au centième', () => {
    assert.equal(ratioDepuisPesees(100, 230), 2.3);
    assert.equal(ratioDepuisPesees(350, 187), 0.53);
  });

  it('refuse une pesée absente ou nulle', () => {
    assert.equal(ratioDepuisPesees(0, 230), null);
    assert.equal(ratioDepuisPesees(100, 0), null);
  });
});
