import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { Inter_400Regular, Inter_600SemiBold, useFonts } from '@expo-google-fonts/inter';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { chargerJeton, surSessionFinie } from '@/api/client';
import { PERSISTANCE, oublierLeCacheDisque } from '@/api/persistance';
import { useConnecte } from '@/api/session';
import { Chargement } from '@/composants/base';
import { EnTete } from '@/composants/enTete';
import { C } from '@/theme';

/**
 * Cache prudent : les données restent affichées pendant le rechargement,
 * et une salle de sport mal couverte ne vide pas l'écran.
 */
const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

export default function Racine() {
  const [polices] = useFonts({
    Inter_400Regular, Inter_600SemiBold,
    BarlowCondensed_600SemiBold, BarlowCondensed_700Bold,
  });
  const [pret, setPret] = useState(false);
  const routeur = useRouter();
  const segments = useSegments();
  const connecte = useConnecte();

  useEffect(() => { void chargerJeton().then(() => setPret(true)); }, []);

  /* --------------------------------------------------------- le portier
   *
   * TOUTE L'APPLICATION EXIGE UN COMPTE. Deux exceptions, et deux seulement :
   * l'écran de connexion, et l'acceptation d'une invitation — qu'on ouvre
   * précisément quand on n'a pas encore de compte.
   *
   * POURQUOI ÇA MANQUAIT, ET POURQUOI ÇA NE SE VOYAIT PAS.
   *
   * Sur un téléphone, on n'atteint un écran qu'en naviguant, et toute
   * navigation partait de l'aiguillage de `index.tsx`, qui vérifiait. Dans un
   * navigateur, on TAPE une adresse : `/frigo` s'ouvrait sans passer par nulle
   * part. L'API refusait bien les données — chaque requête est authentifiée —
   * mais l'écran s'affichait, vide et couvert d'erreurs rouges. Ce n'était pas
   * une fuite de données ; c'était une porte qui a l'air ouverte.
   *
   * `connecte === null` VEUT DIRE « JE NE SAIS PAS ENCORE ». Le traiter comme
   * un refus renverrait tout le monde vers la connexion à chaque démarrage, le
   * temps de lire le coffre — y compris ceux qui sont connectés. */
  const ouverteATous = segments[0] === 'connexion'
    || segments[0] === 'invitation'
    /* La racine : c'est `index.tsx` qui aiguille, et il sait déjà le faire. */
    || segments[0] === undefined;

  useEffect(() => {
    if (connecte === null || ouverteATous) return;
    if (!connecte) routeur.replace('/connexion');
  }, [connecte, ouverteATous, routeur]);

  /* Quand le renouvellement échoue — jeton révoqué, échéance dépassée — la
     session est finie pour de bon : on ramène à la connexion plutôt que de
     laisser des écrans vides derrière un message rouge. `replace` et non
     `push` : revenir en arrière sur une session morte n'a pas de sens.

     Le cache est vidé au passage, sans quoi les données du compte précédent
     réapparaîtraient une fraction de seconde à la connexion suivante. */
  useEffect(() => {
    surSessionFinie(() => {
      client.clear();
      /* `clear()` ne vide que la MÉMOIRE. Depuis que le cache est écrit sur le
         disque, l'oublier là aussi n'est plus une élégance : sans cette ligne,
         les séances et le frigo du compte précédent resteraient sur le
         téléphone et s'afficheraient à la connexion suivante. */
      void oublierLeCacheDisque();
      routeur.replace('/connexion');
    });

    return () => { surSessionFinie(null); };
  }, [routeur]);

  /* ON N'AFFICHE RIEN PLUTÔT QU'UN ÉCRAN QU'ON VA QUITTER.
   *
   * La redirection ci-dessus prend un cycle de rendu. Sans cette garde,
   * l'écran protégé s'affiche pendant ce cycle — assez pour être vu, et pour
   * lancer ses requêtes. */
  if (!polices || !pret || (connecte === false && !ouverteATous)) {
    return <View style={{ flex: 1, backgroundColor: C.fond }}><Chargement /></View>;
  }

  /* Le glisser-déposer natif de React Native exige cette enveloppe.
     Sur le web on s'en passe : elle intercepterait les clics, et le
     glisser y repose sur les attributs HTML natifs. */
  const Enveloppe = Platform.OS === 'web' ? View : GestureHandlerRootView;

  return (
    <Enveloppe style={{ flex: 1 }}>
    {/* Le cache est relu depuis le disque avant le premier rendu : au
        démarrage à froid, les écrans s'affichent avec ce qu'on savait hier
        pendant que les requêtes repartent en arrière-plan. */}
    <PersistQueryClientProvider client={client} persistOptions={PERSISTANCE}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            /* En-tête dessiné par nous : celui de react-native-screens passait
               sous la barre d'état. Voir src/composants/enTete.tsx. */
            header: (props) => <EnTete {...props} />,
            contentStyle: { backgroundColor: C.fond },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="connexion" options={{ title: 'Connexion', headerShown: false }} />
          <Stack.Screen name="(onglets)" options={{ headerShown: false }} />
          <Stack.Screen name="seance/[id]" options={{ title: 'Séance' }} />
          <Stack.Screen name="modele/[id]" options={{ title: 'Modèle' }} />
          <Stack.Screen name="objectifs" options={{ title: 'Mes objectifs' }} />
          <Stack.Screen name="reglages" options={{ title: 'Réglages de l’app' }} />
          <Stack.Screen name="admin-videos" options={{ title: 'Vidéos des exercices' }} />
          <Stack.Screen name="admin-fusion" options={{ title: 'Fusionner des exercices' }} />
          <Stack.Screen name="admin-cuissons" options={{ title: 'Façons de cuire' }} />
          <Stack.Screen name="admin-utilisateurs" options={{ title: 'Inviter quelqu’un' }} />
          {/* Ouvert SANS compte, depuis un lien : pas de flèche de retour, il
              n'y a rien derrière. C'est souvent le premier écran de
              l'application que la personne voit. */}
          <Stack.Screen
            name="invitation/[jeton]"
            options={{ title: 'Créer mon compte', headerBackVisible: false }}
          />
        </Stack>
      </SafeAreaProvider>
    </PersistQueryClientProvider>
    </Enveloppe>
  );
}
