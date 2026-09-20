import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { peutPrendreLeRelais } from './plafonner';
import type { Aliment } from './types';

/**
 * « CE CANDIDAT PEUT-IL PRENDRE LE RELAIS ? »
 *
 * La question était posée DEUX fois : par `choisirReleve` dans `plafonner.ts`,
 * pour DÉCIDER, et à la main dans `app/(onglets)/repas.tsx`, pour PROPOSER.
 * L'écran promettait pourtant en majuscules, dans son propre commentaire :
 *
 *     « LES MÊMES RÈGLES QUE LE CALCUL, PAS DES RÈGLES PARALLÈLES »
 *
 * Rien ne le garantissait. Les deux coïncidaient — vérifié — donc pas de
 * défaut actif ; mais le jour où l'une gagne un critère, l'écran propose un
 * relais que le calcul refuse : on appuie, et rien ne change, sans un mot pour
 * dire pourquoi. Fusionnées le 20 septembre 2026 (palier 0).
 */

const aliment = (id: number, categorie: Aliment['categorie']): Aliment =>
  ({ id, nom: `A${id}`, categorie, kcal100: 100, prot100: 10, gluc100: 10, lip100: 5, ratio: 1 } as Aliment);

const RIEN = new Set<number | string>();
const EN_STOCK = () => 500;

describe('le candidat au relais', () => {
  it('convient quand les trois conditions sont réunies', () => {
    assert.equal(
      peutPrendreLeRelais(aliment(1, 'prot'), ['proteine'], RIEN, EN_STOCK), true);
  });

  it('refuse un rôle que l\'épuisé n\'autorise pas', () => {
    /* Remplacer un féculent par une huile changerait le repas, pas la
       quantité. */
    assert.equal(
      peutPrendreLeRelais(aliment(1, 'huile'), ['proteine'], RIEN, EN_STOCK), false);
  });

  it('refuse un aliment DÉJÀ au menu du repas', () => {
    /* Il ne peut pas tenir deux lignes à la fois : le calcul le refuserait
       ensuite, et l'écran aurait proposé un choix sans effet. */
    assert.equal(
      peutPrendreLeRelais(aliment(1, 'prot'), ['proteine'], new Set([1]), EN_STOCK), false);
  });

  it('refuse un aliment sans stock', () => {
    /* Proposer ce qu'on n'a pas est la faute la plus visible de toutes : on
       compose un repas qu'on ne peut pas cuisiner. */
    assert.equal(
      peutPrendreLeRelais(aliment(1, 'prot'), ['proteine'], RIEN, () => 0), false);
  });

  it('un candidat absent n\'est pas une erreur', () => {
    /* `choisirReleve` interroge un choix manuel qui peut ne pas exister. */
    assert.equal(peutPrendreLeRelais(undefined, ['proteine'], RIEN, EN_STOCK), false);
  });

  it('LE TÉMOIN : les trois conditions comptent VRAIMENT', () => {
    /* Sans ce cas, une fonction qui rendrait toujours `true` passerait le
       premier test, et une qui rendrait toujours `false` passerait les
       quatre suivants. */
    const cas = [
      peutPrendreLeRelais(aliment(1, 'prot'), ['proteine'], RIEN, EN_STOCK),
      peutPrendreLeRelais(aliment(2, 'leg'), ['proteine'], RIEN, EN_STOCK),
      peutPrendreLeRelais(aliment(3, 'prot'), ['proteine'], new Set([3]), EN_STOCK),
      peutPrendreLeRelais(aliment(4, 'prot'), ['proteine'], RIEN, () => 0),
    ];

    assert.deepEqual(cas, [true, false, false, false]);
  });
});
