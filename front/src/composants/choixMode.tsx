import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Discret } from './base';
import { C, E, R } from '@/theme';

/** Les trois façons de travailler un exercice. La valeur part en base, le libellé s'affiche. */
export type ModeTravail = 'charge' | 'iso' | 'chrono';

export const MODES: readonly { cle: ModeTravail; court: string }[] = [
  { cle: 'charge', court: 'Charge' },
  { cle: 'iso', court: 'Tenue' },
  { cle: 'chrono', court: 'Chrono' },
];

/**
 * LE CHOIX DU MODE DE TRAVAIL — le même dans la séance et dans le modèle.
 *
 * Il ne vivait que dans `exerciceSeance.tsx`. Le 16 septembre 2026, le
 * propriétaire a relevé que son inventaire annonçait « plusieurs modes de
 * travail » sur un modèle, alors que l'écran n'en offrait aucun choix : le mode
 * y était repris du mode par défaut de l'exercice au moment de l'ajout et ne
 * pouvait plus bouger. Décision : on le rend choisissable dans le modèle aussi.
 *
 * EXTRAIT, PAS RECOPIÉ. Une seconde copie aurait divergé de la première — c'est
 * exactement ce qui s'est passé la veille avec les quatre champs de nombre, dont
 * deux portaient une lecture fausse.
 *
 * `suite` reçoit ce que l'appelant veut poser dans la MÊME rangée : l'écran de
 * séance y met son raccourci « ↓ 12×25 », qui doit passer à la ligne avec les
 * modes quand la largeur manque.
 *
 * L'ÉTAT SÉLECTIONNÉ EST ANNONCÉ, pas seulement peint : un lecteur d'écran
 * n'entend pas une couleur de fond. C'est un groupe de boutons RADIO — choisir
 * un mode parmi trois, c'est exactement cela.
 *
 * `aria-checked` EN CLAIR, ET NON `accessibilityState`. Deux écritures ont été
 * essayées le 16 septembre 2026, et toutes deux ne produisaient RIEN dans le
 * rendu : `accessibilityState={{ selected }}` sur un `role="button"`
 * (`aria-selected` n'y est pas valide), puis `accessibilityState={{ checked }}`
 * sur un `role="radio"` — que cette version de react-native-web n'émet pas non
 * plus. Constaté en lisant le HTML réellement rendu, pas en le supposant. La
 * forme `aria-*` en clair est comprise par react-native-web ET par React Native
 * 0.71 et au-delà, qui la retraduit en `accessibilityState` côté natif.
 */
export function ChoixMode({ mode, onChange, suite }: {
  mode: ModeTravail;
  onChange: (mode: ModeTravail) => void;
  suite?: ReactNode;
}) {
  return (
    <View style={s.modes} accessibilityRole="radiogroup">
      {MODES.map((m) => (
        <Pressable
          key={m.cle}
          /* Rien n'empêche la bascule : dans une séance, la mesure en cours vit
             dans `etatMesure` et continue de tourner, visible dans le bandeau. */
          onPress={() => onChange(m.cle)}
          accessibilityRole="radio"
          aria-checked={mode === m.cle}
          style={[s.mode, mode === m.cle && s.modeActif]}
        >
          <Discret style={mode === m.cle ? { color: C.encre } : undefined}>{m.court}</Discret>
        </Pressable>
      ))}
      {suite}
    </View>
  );
}

const s = StyleSheet.create({
  modes: { flexDirection: 'row', gap: 4, alignItems: 'center', flexWrap: 'wrap' },
  mode: {
    paddingHorizontal: E.m, minHeight: 38, borderRadius: R.s, borderWidth: 1,
    borderColor: C.ligne, backgroundColor: C.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  modeActif: { backgroundColor: C.ligne },
});
