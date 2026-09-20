import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { POIDS_INCHANGE, expliquerRatio, resumeRatio } from './nutrition';

/**
 * CE QUE LA CUISSON FAIT AU POIDS, DIT À L'UTILISATEUR.
 *
 * Deux écritures, deux SEUILS DIFFÉRENTS — relevé le 20 septembre 2026
 * (palier 0) :
 *
 *     calcul/nutrition.ts:232      Math.abs(ratio - 1) < 0.01   → « le poids ne change pas »
 *     composants/ligneFrigo.tsx    ratio === 1                  → « poids inchangé »
 *
 * Un aliment à 1,002 — ce qu'un rendement mesuré donne très vite, 500 g avant
 * et 501 g après — recevait donc deux réponses. L'éditeur disait « le poids ne
 * change pas à la cuisson » ; le frigo, lui, annonçait « 100 g → 100 g », un
 * changement affiché qui n'en est pas un. Le même aliment, deux écrans, deux
 * vérités.
 *
 * `expliquerRatio` n'avait AUCUN test, et la copie du frigo non plus : la
 * divergence pouvait vivre indéfiniment. Le seuil est désormais une constante
 * unique, et les deux formulations en partent.
 */

describe('le seuil du « poids inchangé »', () => {
  it('juste en dessous du seuil, le poids ne change pas', () => {
    for (const ratio of [1, 1 + POIDS_INCHANGE / 2, 1 - POIDS_INCHANGE / 2]) {
      assert.match(expliquerRatio(ratio), /ne change pas/,
        `${ratio} est dans la zone « inchangé »`);
      assert.equal(resumeRatio(ratio), 'poids inchangé',
        `${ratio} doit être dit pareil dans les deux formulations`);
    }
  });

  it('LE TÉMOIN : au-delà du seuil, les deux formulations chiffrent', () => {
    /* Sans ce cas, un « poids inchangé » rendu en toutes circonstances
       passerait le test ci-dessus tout en n'annonçant plus jamais une perte
       d'eau — et un riz qui double de poids serait présenté comme stable. */
    const dehors = 1 + POIDS_INCHANGE * 2;

    assert.doesNotMatch(expliquerRatio(dehors), /ne change pas/);
    assert.notEqual(resumeRatio(dehors), 'poids inchangé');
  });

  it('les deux formulations sont d\'accord sur TOUTE la plage utile', () => {
    /* C'est le verrou : peu importe le seuil retenu, les deux doivent basculer
       au même endroit. Balayage de 0,30 à 3,00, le domaine que la base
       accepte. */
    for (let r = 0.30; r <= 3.001; r += 0.005) {
      const ratio = Math.round(r * 1000) / 1000;
      assert.equal(
        'poids inchangé' === resumeRatio(ratio),
        /ne change pas/.test(expliquerRatio(ratio)),
        `à ${ratio}, une formulation dit « inchangé » et pas l'autre`);
    }
  });
});

describe('ce que chaque formulation dit', () => {
  it('la longue fait une phrase, pour l\'éditeur', () => {
    assert.equal(expliquerRatio(2.26),
      '100 g avant cuisson donnent 226 g une fois cuits.');
  });

  it('elle nomme la perte d\'eau quand le poids baisse', () => {
    /* L'épinard : 500 g crus → 160 g cuits. Dire seulement « donnent 32 g »
       ferait croire à une erreur de saisie. */
    assert.match(expliquerRatio(0.32), /perte d'eau/);
    assert.match(expliquerRatio(0.32), /32 g/);
  });

  it('la courte tient dans une case du frigo', () => {
    /* Déplié sous un aliment, à côté de « Pour 100 g » et des macros : il n'y
       a pas la place d'une phrase. */
    assert.equal(resumeRatio(2.26), '100 g → 226 g');
    assert.equal(resumeRatio(0.32), '100 g → 32 g');
  });
});
