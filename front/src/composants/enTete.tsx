import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Texte } from './base';
import { C, E, P, TOUCHE } from '@/theme';

/**
 * En-tête de l'application.
 *
 * L'en-tête natif de `react-native-screens` passait sous l'horloge et les
 * icônes de notification : le titre et la flèche de retour étaient illisibles.
 * Plutôt que de chercher quelle option Android le remettrait à sa place, on
 * dessine l'en-tête nous-mêmes et on applique le retrait nous-mêmes.
 *
 * `useSafeAreaInsets` est déjà ce qui positionne la barre d'onglets et la barre
 * d'envoi du frigo, toutes deux correctes : la mesure est bonne, c'est
 * l'en-tête natif qui ne s'en servait pas.
 */
export function EnTete({ options, back, navigation }: NativeStackHeaderProps) {
  const marges = useSafeAreaInsets();

  return (
    <View style={[s.barre, { paddingTop: marges.top }]}>
      <View style={s.ligne}>
        {back !== undefined ? (
          <Pressable
            onPress={() => navigation.goBack()}
            style={s.retour}
            accessibilityRole="button"
            accessibilityLabel="Retour"
            hitSlop={8}
          >
            <Texte style={s.fleche}>‹</Texte>
          </Pressable>
        ) : (
          <View style={s.retour} />
        )}

        <Texte style={s.titre} numberOfLines={1}>{options.title ?? ''}</Texte>

        {/* symétrique de la flèche : le titre reste centré */}
        <View style={s.retour} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  barre: {
    backgroundColor: C.fond,
    borderBottomWidth: 1,
    borderBottomColor: C.ligne,
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCHE + 8,
    paddingHorizontal: E.xs,
  },
  retour: {
    width: TOUCHE,
    minHeight: TOUCHE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fleche: { color: C.encre, fontSize: 30, lineHeight: 32 },
  titre: {
    flex: 1,
    textAlign: 'center',
    color: C.encre,
    fontFamily: P.titre,
    fontSize: 21,
  },
});
