import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { amorcerSession } from '@/api/client';
import { Chargement } from '@/composants/base';
import { C } from '@/theme';

/** Aiguillage au démarrage : connecté ou non. */
export default function Depart() {
  const [jeton, setJeton] = useState<string | null | undefined>(undefined);

  /* `amorcerSession` comme `_layout.tsx` et `session.ts` — M5. Il est
     mémoïsé : appelé par les trois, il ne part qu'une fois. `chargerJeton`
     marchait ici par accident, parce que `Racine` attend son propre amorçage
     avant de monter cet écran ; dépendre d'un ordre de montage est ce qui
     casse au premier déplacement de code. */
  useEffect(() => { void amorcerSession().then(setJeton, () => setJeton(null)); }, []);

  if (jeton === undefined) {
    return <View style={{ flex: 1, backgroundColor: C.fond }}><Chargement /></View>;
  }

  return <Redirect href={jeton ? '/(onglets)/seances' : '/connexion'} />;
}
