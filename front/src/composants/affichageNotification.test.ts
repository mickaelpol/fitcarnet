import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  commentAfficher, ORIGINE_INVENTAIRE, ORIGINE_REPOS,
} from './affichageNotification';

/**
 * UN SEUL GESTIONNAIRE, DEUX INTENTIONS OPPOSÉES (F10).
 *
 * `Notifications.setNotificationHandler` est GLOBAL et UNIQUE : le dernier
 * appelant gagne, pour toute l'application. Deux modules l'appelaient.
 *
 *   - `alarmeRepos.ts` le posait au chargement du module, avec bannière
 *     éteinte : au premier plan, le chrono a déjà sonné tout seul, une bannière
 *     par-dessus double le signal.
 *   - `notifications.ts` le REMPLAÇAIT au premier envoi d'inventaire, avec
 *     bannière allumée, et une garde `pret` faisait que ce remplacement valait
 *     pour toujours.
 *
 * Conséquence, constatée par l'audit du 7 septembre 2026 : après le premier
 * inventaire de la session, toute fin de repos affichait une bannière au
 * premier plan. Le commentaire d'`alarmeRepos` promettait le contraire.
 *
 * La décision ne dépend plus de qui a parlé en dernier, mais de la notification
 * elle-même. Elle est ici, pure, et vérifiée.
 */

describe('comment afficher une notification arrivée au premier plan', () => {
  it('éteint tout pour une fin de repos : le chrono a déjà sonné', () => {
    assert.deepEqual(commentAfficher({ origine: ORIGINE_REPOS }), {
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
  });

  it('affiche la fin d’inventaire, sans la faire sonner', () => {
    assert.deepEqual(commentAfficher({ origine: ORIGINE_INVENTAIRE }), {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
  });

  it('un envoyeur qui n’a rien signé est AFFICHÉ, pas avalé', () => {
    /* Le défaut par défaut doit être visible. Une notification qu'on a pris la
       peine d'envoyer et que personne ne voit est plus difficile à diagnostiquer
       qu'une notification de trop — c'est très exactement la panne qui a coûté
       ce constat, à l'envers. */
    for (const inconnu of [undefined, null, {}, { origine: 'autre chose' }, 'texte']) {
      assert.equal(commentAfficher(inconnu).shouldShowBanner, true,
        `origine inconnue avalée : ${JSON.stringify(inconnu)}`);
      assert.equal(commentAfficher(inconnu).shouldPlaySound, false);
    }
  });
});
