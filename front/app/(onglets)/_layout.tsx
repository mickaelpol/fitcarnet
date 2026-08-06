import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { C, P } from '@/theme';

/** Icônes textuelles : aucune dépendance, et lisibles sur tous les fonds. */
const Icone = ({ signe, actif }: { signe: string; actif: boolean }) => (
  <Text style={{ fontSize: 17, color: actif ? C.vif : C.discret }}>{signe}</Text>
);

export default function Onglets() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.fond },
        headerTintColor: C.encre,
        headerTitleStyle: { fontFamily: P.titre, fontSize: 21, letterSpacing: 1 },
        tabBarStyle: {
          backgroundColor: C.fond, borderTopColor: C.ligne, height: 62, paddingTop: 6,
        },
        tabBarActiveTintColor: C.vif,
        tabBarInactiveTintColor: C.discret,
        tabBarLabelStyle: { fontFamily: P.texte, fontSize: 11 },
        sceneStyle: { backgroundColor: C.fond },
      }}
    >
      <Tabs.Screen
        name="seances"
        options={{
          title: 'Séances',
          tabBarIcon: ({ focused }) => <Icone signe="◼" actif={focused} />,
        }}
      />
      <Tabs.Screen
        name="modeles"
        options={{
          title: 'Modèles',
          tabBarIcon: ({ focused }) => <Icone signe="◫" actif={focused} />,
        }}
      />
      <Tabs.Screen
        name="repas"
        options={{
          title: 'Repas',
          tabBarIcon: ({ focused }) => <Icone signe="◕" actif={focused} />,
        }}
      />
      <Tabs.Screen
        name="frigo"
        options={{
          title: 'Mon frigo',
          tabBarIcon: ({ focused }) => <Icone signe="▤" actif={focused} />,
        }}
      />
      <Tabs.Screen
        name="compte"
        options={{
          title: 'Compte',
          tabBarIcon: ({ focused }) => <Icone signe="●" actif={focused} />,
        }}
      />
    </Tabs>
  );
}
