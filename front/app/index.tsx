import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { chargerJeton } from '@/api/client';
import { Chargement } from '@/composants/base';
import { C } from '@/theme';

/** Aiguillage au démarrage : connecté ou non. */
export default function Depart() {
  const [jeton, setJeton] = useState<string | null | undefined>(undefined);

  useEffect(() => { void chargerJeton().then(setJeton); }, []);

  if (jeton === undefined) {
    return <View style={{ flex: 1, backgroundColor: C.fond }}><Chargement /></View>;
  }

  return <Redirect href={jeton ? '/(onglets)/seances' : '/connexion'} />;
}
