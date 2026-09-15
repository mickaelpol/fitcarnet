import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Query, QueryClient } from '@tanstack/react-query';
import * as Application from 'expo-application';

/**
 * CE QUI SURVIT À LA FERMETURE DE L'APPLICATION.
 *
 * Sans ça, chaque démarrage à froid retélécharge tout : les 1338 exercices,
 * les aliments, les emplacements, les séances — y compris quand rien n'a
 * bougé depuis la veille. Dans une salle mal couverte, c'est l'attente
 * devant un écran vide, exactement au moment où l'on veut juste noter une
 * charge.
 *
 * CE QUE ÇA NE FAIT PAS, ET IL FAUT LE DIRE : ça n'évite pas la requête.
 * Un cache côté client ne peut pas savoir que le serveur a changé — rien ne
 * l'en prévient. On affiche donc immédiatement ce qu'on avait, la question
 * part quand même en arrière-plan, et l'écran se corrige tout seul si la
 * réponse diffère. Ce qui disparaît, c'est l'ATTENTE, pas l'appel.
 */

/** La clé unique du cache sur le disque. */
const CLE = 'fitcarnet-cache-v1';

/**
 * Ce qui invalide tout le cache disque d'un coup.
 *
 * La forme des données change avec le code : un champ renommé, un groupe de
 * sérialisation scindé — comme `exercice:detail` — et le cache de la version
 * précédente décrit un monde qui n'existe plus. Le relire produirait des
 * écrans à moitié vides, sans erreur, sans rien qui dise pourquoi.
 *
 * On y attache donc la version de l'application : une nouvelle version repart
 * d'un cache vide. C'est un rechargement complet, une fois, au premier
 * démarrage après mise à jour — le prix est connu et il est petit.
 */
const EMPREINTE = `${Application.nativeApplicationVersion ?? '0'}-${Application.nativeBuildVersion ?? '0'}`;

const stockage = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: CLE,
  /* Écrire à chaque frappe userait la mémoire flash pour rien : on regroupe.
     Une seconde de retard sur le disque n'a aucune conséquence — la mémoire,
     elle, est déjà à jour, et c'est elle que l'écran lit. */
  throttleTime: 1000,
});

export const PERSISTANCE = {
  persister: stockage,
  buster: EMPREINTE,
  /* Au-delà d'une semaine sans ouvrir l'application, on repart du serveur.
     Garder plus longtemps ferait afficher, au premier coup d'œil, un état
     dont on n'a aucune raison de penser qu'il ressemble encore à la réalité. */
  maxAge: 7 * 24 * 60 * 60 * 1000,
  dehydrateOptions: {
    /* ON N'ÉCRIT SUR LE DISQUE QUE CE QUI A RÉUSSI.
       Persister une requête en erreur, c'est réafficher l'erreur au prochain
       démarrage alors que le réseau est peut-être revenu. */
    shouldDehydrateQuery: (requete: Query) => requete.state.status === 'success',
    /* AUCUNE MUTATION SUR LE DISQUE. JAMAIS.
     *
     * Par défaut TanStack déshydrate toute mutation `isPaused` — c'est-à-dire
     * mise en attente parce qu'on est hors ligne — et il en écrit l'état
     * COMPLET, `variables` comprises. Or les variables de `useConnexion` sont
     * `{ email, motDePasse }`, et celles de l'acceptation d'invitation
     * `{ nom, motDePasse }`. Tenter de se connecter dans un tunnel suffisait
     * donc à écrire le mot de passe en clair dans `fitcarnet-cache-v1`, où il
     * restait jusqu'à la prochaine purge.
     *
     * Mesuré le 15 septembre 2026 en vérifiant F8 (« cache non chiffré »).
     * Le chiffrement du cache a été REFUSÉ — la clé vivrait sur le même
     * appareil, ce qui déplace le problème et coûte à chaque lecture. Mais le
     * seul secret qui pouvait atteindre ce fichier n'avait rien à y faire :
     * on l'en sort plutôt que de chiffrer par-dessus. Les jetons, eux, sont
     * dans `expo-secure-store` et n'ont jamais transité par ici.
     *
     * Rien ne se perd : rejouer une mutation au démarrage suivant n'a de sens
     * que pour un mode hors ligne que l'application n'a pas. */
    shouldDehydrateMutation: () => false,
  },
} as const;

async function oublierLeCacheDisque(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CLE);
  } catch {
    /* Un échec d'effacement ne doit pas empêcher de se déconnecter : rester
       connecté de force serait pire que le cache qu'on n'a pas su effacer. */
  }
}

/**
 * TOUT OUBLIER : LA MÉMOIRE PUIS LE DISQUE, DANS CET ORDRE, ET EN UN SEUL
 * ENDROIT.
 *
 * À APPELER À CHAQUE DÉBUT ET À CHAQUE FIN DE SESSION, ET CE N'EST PAS UNE
 * PRÉCAUTION THÉORIQUE. `queryClient.clear()` ne vide que la mémoire ; sans
 * l'effacement du disque, les séances, les objectifs et le frigo du compte
 * précédent resteraient écrits en clair sur le téléphone, et la personne
 * suivante qui se connecte les verrait s'afficher avant que ses propres données
 * n'arrivent.
 *
 * L'ORDRE EST LA MOITIÉ DE LA CORRECTION, ET IL A ÉTÉ MESURÉ (F9, 15 septembre
 * 2026). Le persister regroupe ses écritures : `asyncThrottle` retient la
 * dernière jusqu'à une seconde. Une écriture programmée avant la purge
 * s'exécute donc APRÈS elle, et recrée la clé. Reproduit avec les vraies
 * bibliothèques :
 *
 *   - `clear()` PUIS effacement → ce qui est réécrit 2 s plus tard est vide
 *     (`{"queries":[]}`), parce que la photo déshydratée est prise au moment de
 *     l'événement, et que `clear()` en émet un ;
 *   - effacement SEUL → le compte entier — nom, adresse e-mail, séances — est
 *     réécrit sur le disque deux secondes après la purge.
 *
 * L'invariant tenait jusqu'ici à la main, aux TROIS endroits qui purgent
 * (connexion, déconnexion, fin de session forcée). C'est exactement la forme du
 * « jumeau oublié » : trois portes, un contrôle recopié, et la quatrième porte
 * qui l'oubliera. Il n'y a plus qu'une fonction, et `oublierLeCacheDisque`
 * n'est plus exportée pour qu'on ne puisse pas la rappeler toute seule.
 */
export async function purgerLeCache(qc: QueryClient): Promise<void> {
  qc.clear();
  await oublierLeCacheDisque();
}
