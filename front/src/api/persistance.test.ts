import assert from 'node:assert/strict';
import Module from 'node:module';
import { describe, it } from 'node:test';

/**
 * CE QUI A LE DROIT D'ÊTRE ÉCRIT SUR LE DISQUE, ET DANS QUEL ORDRE ON L'EFFACE.
 *
 * Deux constats de l'audit de septembre 2026 se rejoignent ici :
 *
 *   - F8 « cache TanStack Query non chiffré sur disque ». Le chiffrement est
 *     refusé — la clé vivrait sur le même appareil que le cache, ce qui déplace
 *     le problème sans le résoudre. Mais en vérifiant CE QUI Y TRANSITE
 *     réellement, on trouve autre chose : les MUTATIONS. TanStack déshydrate par
 *     défaut toute mutation `isPaused`, c'est-à-dire mise en attente parce que
 *     le navigateur est hors ligne, et il en écrit l'état COMPLET — `variables`
 *     comprises. Or `useConnexion` prend `{ email, motDePasse }` en variables, et
 *     l'acceptation d'invitation `{ nom, motDePasse }`. Se tromper de mot de
 *     passe dans un tunnel, et le mot de passe part en clair dans
 *     `fitcarnet-cache-v1`. C'est le seul secret qui pouvait atteindre ce
 *     fichier : les jetons, eux, vivent dans `expo-secure-store`.
 *
 *   - F9 « réécriture différée du cache après purge ». Vérifié le 15 septembre
 *     2026 avec les vraies bibliothèques : `asyncThrottle` retient bien une
 *     écriture jusqu'à une seconde, et elle s'exécute APRÈS l'effacement. Ce
 *     qu'elle réécrit est vide — mais seulement parce que `clear()` a précédé,
 *     et que la photo déshydratée est prise au moment de l'événement. Sans le
 *     `clear()`, la même expérience réécrit le compte entier deux secondes après
 *     la purge. L'invariant tenait à la main, aux TROIS endroits qui purgent.
 *     Il tient maintenant dans une seule fonction, et ce fichier le vérifie.
 */

/* ------------------------------------------------------------------------ */
/* FAIRE ENTRER persistance.ts DANS node                                      */
/*                                                                            */
/* Le module importe AsyncStorage (module natif) et expo-application (qui lit */
/* le manifeste de l'application). On les remplace au chargement, comme le    */
/* fait client.test.ts. Le reste — les options de déshydratation, la purge —  */
/* est le vrai code.                                                          */
/* ------------------------------------------------------------------------ */

/** Ce que le « disque » a reçu, dans l'ordre. C'est lui qui prouve F9. */
const journal: string[] = [];
const disque = new Map<string, string>();

const faussAsyncStorage = {
  getItem: async (cle: string): Promise<string | null> => disque.get(cle) ?? null,
  setItem: async (cle: string, valeur: string): Promise<void> => {
    journal.push('setItem');
    disque.set(cle, valeur);
  },
  removeItem: async (cle: string): Promise<void> => {
    journal.push('removeItem');
    disque.delete(cle);
  },
};

const doublures = new Map<string, unknown>([
  /* `__esModule` : sans lui, l'interopérabilité CommonJS de TypeScript enveloppe
     la doublure une seconde fois et `AsyncStorage.removeItem` est `undefined`.
     Le `catch` de `oublierLeCacheDisque` avalerait alors l'erreur, et le test
     passerait pour de mauvaises raisons. */
  ['@react-native-async-storage/async-storage',
    { __esModule: true, default: faussAsyncStorage }],
  ['expo-application', { nativeApplicationVersion: '1.4.0', nativeBuildVersion: '42' }],
]);

type Chargeur = (requete: string, parent: unknown, ...reste: unknown[]) => unknown;
const interne = Module as unknown as { _load: Chargeur };
const chargeurDeNode = interne._load;
interne._load = function charger(this: unknown, requete, parent, ...reste): unknown {
  return doublures.get(requete) ?? chargeurDeNode.call(this, requete, parent, ...reste);
};

const persistance = require('./persistance') as typeof import('./persistance');
const { QueryClient, dehydrate, onlineManager } = require('@tanstack/react-query') as
  typeof import('@tanstack/react-query');

/* ------------------------------------------------------------------------ */

describe('ce qui a le droit d’être écrit sur le disque', () => {
  it('n’écrit que les requêtes qui ont réussi', () => {
    const qc = new QueryClient();
    qc.setQueryData(['seances'], [{ id: 1 }]);
    const enPanne = qc.getQueryCache().build(qc, { queryKey: ['cibles'] });
    enPanne.setState({ status: 'error', error: new Error('503'), fetchStatus: 'idle' });

    const clefs = dehydrate(qc, persistance.PERSISTANCE.dehydrateOptions)
      .queries.map((r) => r.queryHash);

    assert.deepEqual(clefs, ['["seances"]'],
      'une requête en erreur réaffichée au démarrage suivant ferait croire à une panne passée');
  });

  it('n’écrit AUCUNE mutation, pas même une mutation en attente de réseau', async () => {
    /* Hors ligne : exactement l'état d'un navigateur en mode avion, ou d'un
       téléphone dans un tunnel. TanStack met alors la mutation en pause au lieu
       de l'exécuter — et une mutation en pause est déshydratée par défaut. */
    onlineManager.setOnline(false);
    try {
      const qc = new QueryClient();
      const connexion = qc.getMutationCache().build(qc, {
        mutationKey: ['connexion'],
        mutationFn: async () => ({ token: 'jwt' }),
      });
      void connexion.execute({ email: 'moi@exemple.fr', motDePasse: 'MonMotDePasse!' })
        .catch(() => { /* elle ne partira jamais : on est hors ligne */ });
      await new Promise((fini) => { setTimeout(fini, 20); });
      assert.equal(connexion.state.isPaused, true, 'le scénario n’a pas eu lieu');

      const ecrit = dehydrate(qc, persistance.PERSISTANCE.dehydrateOptions);

      assert.deepEqual(ecrit.mutations, [],
        'le mot de passe tapé serait écrit en clair dans fitcarnet-cache-v1');
      assert.ok(!JSON.stringify(ecrit).includes('MonMotDePasse'),
        'aucun mot de passe ne doit pouvoir atteindre le disque');
    } finally {
      onlineManager.setOnline(true);
    }
  });
});

describe('purger le cache', () => {
  it('vide la MÉMOIRE avant d’effacer le DISQUE', async () => {
    journal.length = 0;
    const ordre: string[] = [];
    const qc = {
      clear: (): void => { ordre.push('clear'); journal.push('clear'); },
    } as unknown as import('@tanstack/react-query').QueryClient;

    await persistance.purgerLeCache(qc);

    assert.deepEqual(journal, ['clear', 'removeItem'],
      'effacer le disque avant de vider la mémoire laisse l’écriture différée '
      + 'du persister réécrire le compte entier jusqu’à une seconde plus tard');
    assert.deepEqual(ordre, ['clear']);
  });

  it('se déconnecte quand même si l’effacement du disque échoue', async () => {
    const casse = { clear: (): void => {} } as unknown as
      import('@tanstack/react-query').QueryClient;
    const avant = faussAsyncStorage.removeItem;
    faussAsyncStorage.removeItem = async (): Promise<void> => {
      throw new Error('stockage plein');
    };
    try {
      /* Rester connecté de force serait pire que le cache qu'on n'a pas su
         effacer : la promesse doit tenir. */
      await persistance.purgerLeCache(casse);
    } finally {
      faussAsyncStorage.removeItem = avant;
    }
  });
});
