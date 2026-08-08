import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Bouton, Carte, Champ, Discret, Texte } from './base';
import { C, E, P, R, T, TOUCHE } from '@/theme';

interface Element { id: number; nom: string; detail?: string; couleur?: string }

/**
 * Sélecteur avec recherche, insensible à la casse et aux accents.
 * Une liste déroulante native devient inutilisable au-delà de vingt entrées.
 */
export function ChoixDansListe({
  visible, titre, elements, onChoisir, onFermer,
}: {
  visible: boolean;
  titre: string;
  elements: Element[];
  onChoisir: (id: number) => void;
  onFermer: () => void;
}) {
  const [recherche, setRecherche] = useState('');

  const fermer = () => { setRecherche(''); onFermer(); };

  const sansAccent = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const filtres = useMemo(() => {
    const q = sansAccent(recherche.trim());
    if (!q) return elements;

    return elements.filter((e) => sansAccent(e.nom).includes(q));
  }, [elements, recherche]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onFermer}>
      {/* le fond ferme au tap ; la feuille l'absorbe pour ne pas se fermer
          quand on tape à l'intérieur */}
      <Pressable style={s.fond} onPress={fermer}>
        <Pressable style={s.feuille} onPress={(e) => e.stopPropagation()}>
          <Texte style={s.titre}>{titre}</Texte>
          <Champ
            valeur={recherche}
            onChange={setRecherche}
            placeholder="Rechercher…"
          />
          <FlatList
            data={filtres}
            keyExtractor={(e) => String(e.id)}
            style={{ marginTop: E.s }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Discret style={{ padding: E.l, textAlign: 'center' }}>Aucun résultat.</Discret>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { onChoisir(item.id); setRecherche(''); onFermer(); }}
                style={({ pressed }) => [s.ligne, pressed && { opacity: 0.7 }]}
              >
                {item.couleur !== undefined && (
                  <View style={[s.pastille, { backgroundColor: item.couleur }]} />
                )}
                <View style={{ flex: 1 }}>
                  <Texte numberOfLines={1}>{item.nom}</Texte>
                  {item.detail !== undefined && item.detail !== '' && (
                    <Discret style={{ fontSize: T.petit }}>{item.detail}</Discret>
                  )}
                </View>
              </Pressable>
            )}
          />
          <Bouton variante="contour" onPress={fermer}>Annuler</Bouton>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  fond: { flex: 1, backgroundColor: C.voile, justifyContent: 'flex-end' },
  feuille: {
    backgroundColor: C.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    padding: E.m, paddingBottom: E.xl, maxHeight: '82%', width: '100%',
    maxWidth: 560, alignSelf: 'center', gap: E.s,
  },
  titre: { fontFamily: P.titre, fontSize: T.grand, letterSpacing: 1, textTransform: 'uppercase' },
  ligne: {
    flexDirection: 'row', alignItems: 'center', gap: E.m, minHeight: TOUCHE + 6,
    paddingHorizontal: E.s, borderBottomWidth: 1, borderBottomColor: C.ligne,
  },
  pastille: { width: 4, height: 26, borderRadius: 3 },
});
