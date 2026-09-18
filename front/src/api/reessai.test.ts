import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ErreurApi } from './erreurApi';
import { REESSAIS_RESEAU, reessayerSiReseau } from './reessai';

/**
 * QUAND RÉESSAYER, ET QUAND S'ARRÊTER — constat M11 de l'audit.
 *
 * `useMoi` portait `retry: false`. C'est juste pour un refus d'identité : un
 * 401 réessayé trois fois reste un 401. Mais la panne réseau arrive par le même
 * chemin — le client la ramène à une `ErreurApi` de statut **0** — et une
 * coupure d'une seconde condamnait l'onglet Compte à un écran d'erreur plein
 * cadre, sans même le bouton « Se déconnecter ».
 *
 * La règle vit ici, dans un module pur, plutôt qu'en expression enfouie dans le
 * hook : c'est la seule façon de l'éprouver sans monter React.
 */

test('une panne réseau se réessaie, jusqu’à deux fois', () => {
  const coupure = new ErreurApi(0, 'Serveur injoignable');

  assert.equal(reessayerSiReseau(0, coupure), true, 'premier échec : on réessaie');
  assert.equal(reessayerSiReseau(1, coupure), true, 'deuxième : on réessaie encore');
  assert.equal(reessayerSiReseau(2, coupure), false, 'au-delà, on rend la main');
});

test('le compte d’échecs part de zéro, comme TanStack Query le passe', () => {
  /* `retryer.js` décide avec `failureCount` AVANT de l'incrémenter, et il part
     de 0 : `retry: 2` y vaut `(n) => n < 2`. Écrire `n <= 2` donnerait donc
     trois réessais là où les autres écrans en font deux. */
  assert.equal(REESSAIS_RESEAU, 2);
  assert.equal(reessayerSiReseau(REESSAIS_RESEAU - 1, new ErreurApi(0, '')), true);
  assert.equal(reessayerSiReseau(REESSAIS_RESEAU, new ErreurApi(0, '')), false);
});

test('un refus reste un refus : on ne réessaie pas', () => {
  for (const statut of [400, 401, 403, 404, 409, 422, 500]) {
    assert.equal(
      reessayerSiReseau(0, new ErreurApi(statut, 'refus')), false,
      `un ${statut} ne doit pas être réessayé`,
    );
  }
});

test('ce qui n’est pas une ErreurApi ne se réessaie pas non plus', () => {
  assert.equal(reessayerSiReseau(0, new Error('panne quelconque')), false);
  assert.equal(reessayerSiReseau(0, 'une chaîne'), false);
  assert.equal(reessayerSiReseau(0, null), false);
  assert.equal(reessayerSiReseau(0, undefined), false);
});
