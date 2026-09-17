import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { dateLocale } from './dates';

/**
 * LA DATE D'UNE SÉANCE EST CELLE DU CALENDRIER DE CELUI QUI S'ENTRAÎNE.
 *
 * Constat 04#9 de l'audit, resté ouvert jusqu'au 17 septembre 2026 :
 * `useSeanceEditable` datait une nouvelle séance avec
 * `new Date().toISOString().slice(0, 10)`, c'est-à-dire en UTC. En France,
 * une séance créée entre minuit et 1 h (2 h l'été) partait datée DE LA VEILLE
 * — au serveur, au calendrier, et dans les comparaisons de progression.
 *
 * Le fuseau est simulé par `process.env.TZ`, que Node relit à chaque calcul :
 * le test donne le même verdict sur un poste réglé en UTC.
 */
describe('dateLocale', () => {
  let fuseau: string | undefined;
  before(() => { fuseau = process.env.TZ; process.env.TZ = 'Europe/Paris'; });
  after(() => {
    if (fuseau === undefined) delete process.env.TZ;
    else process.env.TZ = fuseau;
  });

  it('une séance à 0 h 30 à Paris est datée du jour, pas de la veille', () => {
    const minuitEtDemi = new Date('2026-09-17T22:30:00Z');   // 18 septembre, 0 h 30 à Paris

    assert.equal(minuitEtDemi.toISOString().slice(0, 10), '2026-09-17',
      'le témoin : c’est bien le cas où UTC se trompe de jour');
    assert.equal(dateLocale(minuitEtDemi), '2026-09-18');
  });

  it('écrit mois et jour sur deux chiffres', () => {
    assert.equal(dateLocale(new Date(2026, 0, 5, 12)), '2026-01-05');
  });

  it('en hiver aussi, à une heure de décalage', () => {
    assert.equal(dateLocale(new Date('2026-12-31T23:15:00Z')), '2027-01-01');
  });
});
