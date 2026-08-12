import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useExerciceDetail } from '@/api/hooks';
import type { Exercice } from '@/api/types';
import { Bouton, Discret, Texte } from './base';
import { C, E, P, R, T } from '@/theme';

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
  /* LA FICHE VA CHERCHER SES PROPRES TEXTES.
     Le catalogue chargé au démarrage n'en transporte plus : instructions,
     muscles et matériel ne partent que sur `GET /api/exercices/{id}`. On les
     demande donc ici, et seulement quand la fiche s'ouvre vraiment.

     APPELÉ AVANT TOUT `return`, sans condition : un hook React doit s'exécuter
     à chaque rendu, dans le même ordre. Le mettre après le garde ci-dessous
     casserait l'application dès qu'on ouvre puis ferme une fiche. */
  const detail = useExerciceDetail(visible && exercice !== undefined ? exercice.id : undefined);

  if (!exercice) return null;

  /* Tant que la fiche n'est pas arrivée, on affiche ce qu'on a déjà : le nom,
     le format, la zone. Les blocs manquants se remplissent ensuite, sans
     écran d'attente — il n'y a rien à attendre pour la moitié du contenu. */
  const complet: Exercice = detail.data ?? exercice;

  const id = identifiantYoutube(complet.videoUrl ?? null);
  const nom = complet.nomFr ?? complet.nom;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onFermer}>
      <Pressable style={s.fond} onPress={onFermer}>
        <Pressable style={s.feuille} onPress={(e) => e.stopPropagation()}>
          <Texte style={s.titre}>{nom}</Texte>
          {complet.nomFr !== null && complet.nomFr !== undefined && (
            <Discret style={{ fontSize: T.petit, marginTop: -6 }}>{complet.nom}</Discret>
          )}

          <ScrollView style={{ marginTop: E.m }} contentContainerStyle={{ gap: E.m }}>
            {id !== null ? (
              <View style={s.video}>
                {Platform.OS === 'web' ? (
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
              {complet.partieCorps !== null && complet.partieCorps !== undefined && (
                <Ligne cle="Zone" valeur={complet.partieCorps} />
              )}
              {complet.muscleCible !== null && complet.muscleCible !== undefined && (
                <Ligne cle="Muscle ciblé" valeur={complet.muscleCible} />
              )}
              {complet.musclesSecondaires !== null && complet.musclesSecondaires !== undefined && (
                <Ligne cle="Aussi sollicités" valeur={complet.musclesSecondaires} />
              )}
              {complet.equipement !== null && complet.equipement !== undefined && (
                <Ligne cle="Matériel" valeur={complet.equipement} />
              )}
              {complet.formatPrescrit !== null && (
                <Ligne cle="Format prescrit" valeur={complet.formatPrescrit} />
              )}
            </View>

            {complet.instructions !== null && complet.instructions !== undefined
              && complet.instructions !== '' && (
              <View>
                <Discret style={s.section}>Exécution</Discret>
                <Texte style={{ fontSize: T.normal, lineHeight: 21 }}>{complet.instructions}</Texte>
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
    <Discret style={{ flex: 1, fontSize: T.normal }}>{cle}</Discret>
    <Texte style={{ flex: 2, fontSize: T.normal }}>{valeur}</Texte>
  </View>
);

const s = StyleSheet.create({
  /* Le fond occupe tout l'écran et ferme au tap ; la boîte est centrée
     verticalement, avec une marge suffisante pour qu'il reste toujours une
     zone cliquable au-dessus et en dessous. */
  fond: {
    flex: 1, backgroundColor: C.voile,
    alignItems: 'center', justifyContent: 'center', padding: E.m,
  },
  feuille: {
    backgroundColor: C.surface, borderRadius: R.l, borderWidth: 1, borderColor: C.ligne,
    padding: E.m, maxHeight: '82%', width: '100%', maxWidth: 560,
  },
  titre: { fontFamily: P.titre, fontSize: T.titre, letterSpacing: 0.8, textTransform: 'uppercase' },
  video: {
    width: '100%', aspectRatio: 16 / 9, borderRadius: 10,
    overflow: 'hidden', backgroundColor: C.ombre,
  },
  sansVideo: {
    width: '100%', aspectRatio: 16 / 9, borderRadius: 10, backgroundColor: C.surface2,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
    borderColor: C.ligne, borderStyle: 'dashed',
  },
  infos: { gap: 6 },
  ligne: { flexDirection: 'row', alignItems: 'flex-start', gap: E.s },
  section: {
    fontSize: T.minuscule, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5,
  },
});
