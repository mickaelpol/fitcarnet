import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Query } from '@tanstack/react-query';
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
  },
} as const;

/**
 * Efface le cache du disque.
 *
 * À APPELER À CHAQUE FIN DE SESSION, ET CE N'EST PAS UNE PRÉCAUTION THÉORIQUE.
 * `queryClient.clear()` ne vide que la mémoire. Sans la ligne ci-dessous, les
 * séances, les objectifs et le frigo du compte précédent resteraient écrits en
 * clair sur le téléphone, et la personne suivante qui se connecte les verrait
 * s'afficher avant que ses propres données n'arrivent.
 */
export async function oublierLeCacheDisque(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CLE);
  } catch {
    /* Un échec d'effacement ne doit pas empêcher de se déconnecter : rester
       connecté de force serait pire que le cache qu'on n'a pas su effacer. */
  }
}
