import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { adresseApi } from '@/api/client';
import { useExerciceDetail } from '@/api/hooks';
import type { Exercice } from '@/api/types';
import { Bouton, Discret, Texte } from './base';
import { libelleDuMuscle } from '@/muscles/groupes';
import { enFrancais, libelle, MATERIELS, SECONDAIRES, ZONES } from '@/muscles/vocabulaire';
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
 * L'ORIGINE SOUS LAQUELLE LA VIDÉO EST DEMANDÉE, SUR MOBILE.
 *
 * YouTube identifie qui l'intègre par l'en-tête `Referer`. Une page sans
 * origine n'en envoie aucun, et le lecteur refuse : « Erreur 153, erreur de
 * configuration du lecteur vidéo », sur fond gris.
 *
 * On reprend l'origine du serveur de l'application — la même que celle du
 * site web, où la vidéo se lit sans problème. Ce n'est pas une valeur choisie
 * au hasard : c'est celle dont on SAIT qu'elle marche, puisqu'elle marche
 * déjà.
 */
const origineDeLApp = (): string => {
  try {
    return new URL(adresseApi()).origin;
  } catch {
    // `adresseApi()` peut être relative sur le web ; on n'y passe jamais ici,
    // mais une exception dans un rendu vaudrait un écran blanc.
    return 'https://carnet.mickael-pol.fr';
  }
};

/**
 * La page minimale qui porte le lecteur, pour la WebView.
 *
 * POURQUOI UNE PAGE PLUTÔT QUE L'URL DIRECTE.
 *
 * La WebView chargeait `https://www.youtube.com/embed/…` comme document
 * principal. Il n'y avait alors PAS de page qui intègre : YouTube ne recevait
 * aucun `Referer`, ne pouvait identifier personne, et rendait l'erreur 153.
 * Le navigateur, lui, n'avait jamais ce problème — sa page vient du site, avec
 * une origine.
 *
 * `baseUrl` donne cette origine à la WebView : le document est alors traité
 * comme venant de là, et l'`iframe` porte enfin un `Referer`. `referrerpolicy`
 * s'assure qu'il n'est pas raboté en chemin.
 *
 * L'identifiant est sûr par construction : `identifiantYoutube` ne rend que
 * onze caractères de `[\w-]`. Rien d'autre n'est interpolé ici.
 */
const pageLecteur = (id: string) => `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:transparent;overflow:hidden">
<iframe id="v" src="${lecteur(id)}"
        style="border:0;width:100%;height:100%;display:block;position:absolute;inset:0"
        referrerpolicy="strict-origin"
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen></iframe>
<script>
/* AU RETOUR DU PLEIN ÉCRAN, ON FORCE UN REDESSIN.
 *
 * Sur Android, sortir du plein écran laissait le petit lecteur NOIR. La
 * WebView détache la surface vidéo pour la donner à sa vue plein écran, et ne
 * la remet pas en place au retour : la vidéo tourne toujours — le son
 * continue — mais plus rien ne s'affiche.
 *
 * ON NE REMONTE SURTOUT PAS L'IFRAME. Un \`display:none\` suivi d'un
 * \`block\`, ou une réécriture de \`src\`, remettrait la vidéo au début. Ce
 * qu'on veut, c'est précisément qu'elle CONTINUE là où elle en était.
 *
 * \`translateZ(0)\` puis retrait force le navigateur à composer une nouvelle
 * couche graphique sans toucher au document : il repeint, la surface se
 * rattache, la lecture n'est pas interrompue. Le retrait attend deux frames —
 * dans la même, les deux écritures seraient regroupées et le navigateur ne
 * verrait aucun changement à appliquer.
 */
(function () {
  var v = document.getElementById('v');
  function reveiller() {
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    v.style.transform = 'translateZ(0)';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { v.style.transform = ''; });
    });
  }
  document.addEventListener('fullscreenchange', reveiller);
  /* La WebView système d'Android reste sur le préfixe WebKit : sans cette
     seconde ligne, l'événement n'arrive jamais et le correctif ne fait rien
     du tout — silencieusement, ce qui est le pire des cas. */
  document.addEventListener('webkitfullscreenchange', reveiller);
})();
</script>
</body></html>`;

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
                    source={{ html: pageLecteur(id), baseUrl: origineDeLApp() }}
                    /* Le document vient d'un `html` et non d'une URL : sans
                       cette liste, la WebView peut refuser de charger
                       l'iframe vers youtube.com. */
                    originWhitelist={['*']}
                    style={{ flex: 1, backgroundColor: 'transparent' }}
                    allowsFullscreenVideo
                    /* COMPOSITION MATÉRIELLE, IMPOSÉE.
                       Second volet du correctif de l'écran noir : par défaut
                       la WebView laisse Android choisir, et le passage en
                       plein écran puis le retour la laissent volontiers sur
                       une couche logicielle qui ne réaffiche plus la vidéo.
                       Le script de la page force le redessin, celle-ci fait
                       qu'il y ait quelque chose à redessiner. */
                    androidLayerType="hardware"
                    javaScriptEnabled
                    domStorageEnabled
                    /* Sans ça, iOS ouvre la vidéo en plein écran dès la
                       lecture, hors de la fiche. */
                    allowsInlineMediaPlayback
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
              {/* TRADUIT ICI, PAS EN BASE.
                  La base garde le vocabulaire du catalogue importé — `upper
                  legs`, `hip flexors` — pour qu'un prochain import n'ait pas à
                  se battre avec nos libellés. Le français ne vit que du côté
                  de l'écran, et un mot qu'on n'a pas traduit s'affiche tel
                  quel : on le voit, donc on peut le corriger.

                  Le muscle ciblé passe par `libelleDuMuscle`, qui parle des
                  vignettes du filtre : la fiche et le filtre nomment ainsi la
                  même chose du même mot. */}
              {complet.partieCorps !== null && complet.partieCorps !== undefined && (
                <Ligne cle="Zone" valeur={libelle(ZONES, complet.partieCorps)} />
              )}
              {complet.muscleCible !== null && complet.muscleCible !== undefined && (
                <Ligne
                  cle="Muscle ciblé"
                  valeur={libelleDuMuscle(complet.muscleCible) ?? complet.muscleCible}
                />
              )}
              {complet.musclesSecondaires !== null && complet.musclesSecondaires !== undefined && (
                <Ligne
                  cle="Aussi sollicités"
                  valeur={enFrancais(SECONDAIRES, complet.musclesSecondaires)}
                />
              )}
              {complet.equipement !== null && complet.equipement !== undefined && (
                <Ligne cle="Matériel" valeur={libelle(MATERIELS, complet.equipement)} />
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
