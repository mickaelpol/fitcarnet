import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Bouton, Texte } from './base';
import { C, E, P, R } from '@/theme';

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
    flex: 1, backgroundColor: 'rgba(10,11,13,0.75)',
    alignItems: 'center', justifyContent: 'center', padding: E.l,
  },
  boite: {
    backgroundColor: C.surface, borderColor: C.ligne, borderWidth: 1,
    borderRadius: R.l, padding: E.l, gap: E.m, width: '100%', maxWidth: 420,
  },
  titre: { fontFamily: P.titre, fontSize: 19, letterSpacing: 0.8, textTransform: 'uppercase' },
  message: { color: C.attenue, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: E.s, marginTop: E.xs },
  danger: {
    flex: 1, minHeight: 44, borderRadius: R.s, backgroundColor: C.erreur,
    alignItems: 'center', justifyContent: 'center',
  },
  dangerTexte: { color: '#ffffff', fontFamily: P.fort, fontSize: 14.5 },
});
