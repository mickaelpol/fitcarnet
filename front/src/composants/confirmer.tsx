import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Bouton, Texte } from './base';
import { C, E, P, R, T } from '@/theme';

/**
 * Confirmation avant une suppression. Volontairement modale : une suppression
 * accidentelle en pleine séance ferait perdre des données irrécupérables.
 */
export function Confirmer({
  visible, titre, message, libelle = 'Supprimer', onConfirmer, onAnnuler,
}: {
  visible: boolean;
  titre: string;
  message?: string;
  libelle?: string;
  onConfirmer: () => void;
  onAnnuler: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onAnnuler}>
      <Pressable style={s.fond} onPress={onAnnuler}>
        <Pressable style={s.boite} onPress={(e) => e.stopPropagation()}>
          <Texte style={s.titre}>{titre}</Texte>
          {message !== undefined && <Texte style={s.message}>{message}</Texte>}

          <View style={s.actions}>
            <Bouton variante="contour" onPress={onAnnuler} style={{ flex: 1 }}>
              Annuler
            </Bouton>
            <Pressable onPress={onConfirmer} style={s.danger}>
              <Texte style={s.dangerTexte}>{libelle}</Texte>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  fond: {
    flex: 1, backgroundColor: C.voile,
    alignItems: 'center', justifyContent: 'center', padding: E.l,
  },
  boite: {
    backgroundColor: C.surface, borderColor: C.ligne, borderWidth: 1,
    borderRadius: R.l, padding: E.l, gap: E.m, width: '100%', maxWidth: 420,
  },
  titre: { fontFamily: P.titre, fontSize: T.grand, letterSpacing: 0.8, textTransform: 'uppercase' },
  message: { color: C.attenue, fontSize: T.normal, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: E.s, marginTop: E.xs },
  danger: {
    flex: 1, minHeight: 44, borderRadius: R.s, backgroundColor: C.erreur,
    alignItems: 'center', justifyContent: 'center',
  },
  dangerTexte: { color: C.blanc, fontFamily: P.fort, fontSize: T.moyen },
});
