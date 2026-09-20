import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONVIVES_MAX, CONVIVES_MIN, convivesRetenus, deplacerConvives } from './convives';

/**
 * COMBIEN DE PERSONNES MANGENT CE REPAS.
 *
 * Les deux bornes étaient écrites en clair dans l'écran, à deux lignes d'écart
 * — `Math.max(1, …)` et `Math.min(12, …)` dans `composants/etapeReglage.tsx`
 * — c'est-à-dire dans un fichier qu'aucun test ne pouvait atteindre. Rien ne
 * disait POURQUOI 12, et rien n'empêchait un autre écran d'en choisir 8.
 *
 * Le plancher, lui, était écrit une troisième et une quatrième fois, en
 * défense cette fois : `calcul/fournees.ts:258` et `calcul/poidsServi.ts:69`
 * portent tous deux `Math.max(1, r.convives)`, et le second explique dans son
 * commentaire qu'il copie le premier — un aveu de jumeau. À zéro convive, la
 * division rendait l'infini et la carte annonçait « Infinity g par personne ».
 *
 * Rapatrié le 20 septembre 2026 (palier 0).
 */

describe('les bornes', () => {
  it('on ne descend pas sous une personne', () => {
    /* Zéro convive n'est pas un repas : c'est une division par zéro. */
    assert.equal(CONVIVES_MIN, 1);
  });

  it('le plafond existe et laisse de la place à une tablée', () => {
    assert.ok(CONVIVES_MAX >= 8,
      'moins de 8 empêcherait un repas de famille, ce que l\'application permet');
  });
});

describe('le bouton plus et le bouton moins', () => {
  it('avancent d\'une personne à la fois', () => {
    assert.equal(deplacerConvives(3, +1), 4);
    assert.equal(deplacerConvives(3, -1), 2);
  });

  it('butent sans jamais sortir des bornes', () => {
    assert.equal(deplacerConvives(CONVIVES_MIN, -1), CONVIVES_MIN);
    assert.equal(deplacerConvives(CONVIVES_MAX, +1), CONVIVES_MAX);
  });

  it('ramènent dans les bornes une valeur déjà dehors', () => {
    /* Un plan enregistré quand le plafond valait 20 se relit aujourd'hui : il
       ne doit pas rester bloqué hors des bornes, ni disparaître. */
    assert.equal(deplacerConvives(CONVIVES_MAX + 5, -1), CONVIVES_MAX);
    assert.equal(deplacerConvives(0, +1), CONVIVES_MIN);
  });
});

describe('le plancher de lecture', () => {
  it('un compte de convives absent ou nul vaut une personne', () => {
    /* LE DÉFAUT RÉEL : `servi / 0` rend `Infinity`, et la carte affichait
       « Infinity g par personne ». Refuser de diviser est la seule réponse
       juste — et une personne est l'hypothèse la plus sûre. */
    assert.equal(convivesRetenus(0), 1);
    assert.equal(convivesRetenus(null), 1);
    assert.equal(convivesRetenus(undefined), 1);
    assert.equal(convivesRetenus(-3), 1);
  });

  it('LE TÉMOIN : une valeur normale passe intacte', () => {
    /* Sans ce cas, un plancher qui rendrait toujours 1 passerait le test
       ci-dessus tout en écrasant chaque repas de famille. */
    assert.equal(convivesRetenus(4), 4);
    assert.equal(convivesRetenus(1), 1);
  });
});
