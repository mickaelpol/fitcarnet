import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { Exercice } from '@/api/types';
import { Bouton, Discret, Texte } from './base';
import { C, E, P, R } from '@/theme';

/** Extrait l'identifiant d'une URL YouTube, quelle qu'en soit la forme. */
export function identifiantYoutube(url: string | null): string | null {
  if (!url) return null;
  const motifs = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for (const motif of motifs) {
    const m = motif.exec(url);
    if (m) return m[1] ?? null;
  }

  return null;
}

const lecteur = (id: string) =>
  `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`;

/**
 * Fiche d'un exercice : la vidéo de démonstration, et ce qu'il travaille.
 *
 * La vidéo reste hébergée par YouTube et jouée dans son lecteur officiel :
 * c'est le seul usage prévu par leurs conditions, et le créateur conserve
 * ses vues et ses revenus.
 */
export function ModaleExercice({
  exercice, visible, onFermer,
}: {
  exercice: Exercice | undefined;
  visible: boolean;
  onFermer: () => void;
}) {
  if (!exercice) return null;

  const id = identifiantYoutube(exercice.videoUrl ?? null);
  const nom = exercice.nomFr ?? exercice.nom;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onFermer}>
      <Pressable style={s.fond} onPress={onFermer}>
        <Pressable style={s.feuille} onPress={(e) => e.stopPropagation()}>
          <Texte style={s.titre}>{nom}</Texte>
          {exercice.nomFr !== null && exercice.nomFr !== undefined && (
            <Discret style={{ fontSize: 12, marginTop: -6 }}>{exercice.nom}</Discret>
          )}

          <ScrollView style={{ marginTop: E.m }} contentContainerStyle={{ gap: E.m }}>
            {id !== null ? (
              <View style={s.video}>
                {Platform.OS === 'web' ? (
                  // @ts-expect-error : iframe n'existe que sur le web
                  <iframe
                    src={lecteur(id)}
                    style={{ width: '100%', height: '100%', border: 0, borderRadius: 10 }}
                    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title={nom}
                  />
                ) : (
                  <WebView
                    source={{ uri: lecteur(id) }}
                    style={{ flex: 1, backgroundColor: 'transparent' }}
                    allowsFullscreenVideo
                    javaScriptEnabled
                  />
                )}
              </View>
            ) : (
              <View style={s.sansVideo}>
                <Discret style={{ textAlign: 'center' }}>
                  Aucune vidéo pour cet exercice.
                </Discret>
              </View>
            )}

            <View style={s.infos}>
              {exercice.partieCorps !== null && exercice.partieCorps !== undefined && (
                <Ligne cle="Zone" valeur={exercice.partieCorps} />
              )}
              {exercice.muscleCible !== null && exercice.muscleCible !== undefined && (
                <Ligne cle="Muscle ciblé" valeur={exercice.muscleCible} />
              )}
              {exercice.musclesSecondaires !== null && exercice.musclesSecondaires !== undefined && (
                <Ligne cle="Aussi sollicités" valeur={exercice.musclesSecondaires} />
              )}
              {exercice.equipement !== null && exercice.equipement !== undefined && (
                <Ligne cle="Matériel" valeur={exercice.equipement} />
              )}
              {exercice.formatPrescrit !== null && (
                <Ligne cle="Format prescrit" valeur={exercice.formatPrescrit} />
              )}
            </View>

            {exercice.instructions !== null && exercice.instructions !== undefined
              && exercice.instructions !== '' && (
              <View>
                <Discret style={s.section}>Exécution</Discret>
                <Texte style={{ fontSize: 14, lineHeight: 21 }}>{exercice.instructions}</Texte>
              </View>
            )}
          </ScrollView>

          <Bouton variante="contour" onPress={onFermer} style={{ marginTop: E.m }}>
            Fermer
          </Bouton>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const Ligne = ({ cle, valeur }: { cle: string; valeur: string }) => (
  <View style={s.ligne}>
    <Discret style={{ flex: 1, fontSize: 12.5 }}>{cle}</Discret>
    <Texte style={{ flex: 2, fontSize: 13.5 }}>{valeur}</Texte>
  </View>
);

const s = StyleSheet.create({
  /* Le fond occupe tout l'écran et ferme au tap ; la boîte est centrée
     verticalement, avec une marge suffisante pour qu'il reste toujours une
     zone cliquable au-dessus et en dessous. */
  fond: {
    flex: 1, backgroundColor: 'rgba(10,11,13,0.78)',
    alignItems: 'center', justifyContent: 'center', padding: E.m,
  },
  feuille: {
    backgroundColor: C.surface, borderRadius: R.l, borderWidth: 1, borderColor: C.ligne,
    padding: E.m, maxHeight: '82%', width: '100%', maxWidth: 560,
  },
  titre: { fontFamily: P.titre, fontSize: 20, letterSpacing: 0.8, textTransform: 'uppercase' },
  video: {
    width: '100%', aspectRatio: 16 / 9, borderRadius: 10,
    overflow: 'hidden', backgroundColor: '#000',
  },
  sansVideo: {
    width: '100%', aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: C.surface2,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
    borderColor: C.ligne, borderStyle: 'dashed',
  },
  infos: { gap: 6 },
  ligne: { flexDirection: 'row', alignItems: 'flex-start', gap: E.s },
  section: {
    fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5,
  },
});
