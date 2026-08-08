import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Bouton, Carte, Discret, Texte } from '@/composants/base';
import { SONNERIES, jouerSonnerie, useSonnerie } from '@/composants/sonnerie';
import { C, E, P, R, T, TOUCHE } from '@/theme';

/**
 * Réglages de l'application.
 *
 * Ce qui tient à l'appareil, pas au compte : une sonnerie dépend du téléphone
 * et de son volume, pas de qui s'y connecte. Les objectifs nutritionnels ont
 * leur propre écran — ils suivent la personne, eux.
 */
export default function Reglages() {
  const [sonnerie, choisir] = useSonnerie();

  /* Le titre est declare une seule fois, dans app/_layout.tsx. Le poser aussi
     ici superposait deux en-tetes, dont l'un ignorait la zone sure et passait
     sous l'horloge et les icones de notification. */
  return (
    <>
      <ScrollView contentContainerStyle={s.page}>
        <Carte>
          <Discret style={s.etiquette}>Sonnerie de fin de repos</Discret>
          <Discret style={{ fontSize: T.petit, lineHeight: 16, marginBottom: E.s }}>
            Touche une ligne pour l'entendre. Le téléphone vibre en plus du son,
            pour les séances où il reste dans la poche.
          </Discret>

          {SONNERIES.map((son) => {
            const actif = son.cle === sonnerie;

            return (
              <Pressable
                key={son.cle}
                onPress={() => { choisir(son.cle); jouerSonnerie(son.cle); }}
                style={[s.choix, actif && s.choixActif]}
                accessibilityRole="radio"
                accessibilityState={{ selected: actif }}
              >
                <View style={{ flex: 1 }}>
                  <Texte style={{ fontSize: T.normal }}>{son.libelle}</Texte>
                  <Discret style={{ fontSize: T.petit }}>{son.description}</Discret>
                </View>
                {actif && <Texte style={{ color: C.vif }}>✓</Texte>}
              </Pressable>
            );
          })}
        </Carte>

        <Bouton variante="contour" onPress={() => jouerSonnerie(sonnerie)}>
          Réécouter la sonnerie choisie
        </Bouton>

        <Discret style={{ fontSize: T.petit, lineHeight: 16, marginTop: E.s }}>
          Ce choix est enregistré sur cet appareil. Un autre téléphone gardera
          le sien.
        </Discret>
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  page: { padding: E.m, gap: E.s },
  etiquette: {
    fontSize: T.minuscule, letterSpacing: 1, textTransform: 'uppercase',
    color: C.discret, marginBottom: E.xs,
  },
  choix: {
    flexDirection: 'row', alignItems: 'center', gap: E.s,
    minHeight: TOUCHE + 8, paddingHorizontal: E.m,
    borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
    backgroundColor: C.surface2, marginBottom: 5,
  },
  choixActif: { borderColor: C.vif },
});
