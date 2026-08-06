import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { Inter_400Regular, Inter_600SemiBold, useFonts } from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { chargerJeton } from '@/api/client';
import { Chargement } from '@/composants/base';
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

  useEffect(() => { void chargerJeton().then(() => setPret(true)); }, []);

  if (!polices || !pret) {
    return <View style={{ flex: 1, backgroundColor: C.fond }}><Chargement /></View>;
  }

  /* Le glisser-déposer natif de React Native exige cette enveloppe.
     Sur le web on s'en passe : elle intercepterait les clics, et le
     glisser y repose sur les attributs HTML natifs. */
  const Enveloppe = Platform.OS === 'web' ? View : GestureHandlerRootView;

  return (
    <Enveloppe style={{ flex: 1 }}>
    <QueryClientProvider client={client}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: C.fond },
            headerTintColor: C.encre,
            headerTitleStyle: { fontFamily: 'BarlowCondensed_700Bold', fontSize: 21 },
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
          <Stack.Screen name="admin-videos" options={{ title: 'Vidéos des exercices' }} />
          <Stack.Screen name="admin-fusion" options={{ title: 'Fusionner des exercices' }} />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
    </Enveloppe>
  );
}
