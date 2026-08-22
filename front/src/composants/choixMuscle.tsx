import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AUTRE, GROUPES } from '@/muscles/groupes';
import { Discret } from './base';
import { Picto } from './picto';
import { C, E, P, R, T, TOUCHE } from '@/theme';

/** La taille du dessin dans une vignette. En dessous, le muscle ne se lit plus. */
const DESSIN = 46;

/**
 * LE LIBELLÉ : SA TAILLE, ET LA HAUTEUR DE SA LIGNE.
 *
 * `T.petit` et non `T.minuscule` : onze pixels sont faits pour un en-tête de
 * colonne qu'on lit une fois, pas pour quinze mots qu'on compare d'un coup
 * d'œil en cherchant le bon.
 *
 * LA HAUTEUR DE LIGNE EST CE QUI ALIGNE LES QUINZE. Sans elle, chaque
 * vignette laisse son texte se dimensionner seul — et « Autre », qui porte un
 * point d'interrogation là où les autres ont un `<Svg>`, ne tombe pas au même
 * endroit : sur le web un SVG est un élément EN LIGNE, il traîne l'espace d'un
 * jambage sous sa ligne de base.
 *
 * 1,5 fois la taille, ET AUCUNE HAUTEUR FIXE. J'avais écrit `height: LIGNE`
 * avec un facteur 1,3 : les jambages des « p » et des « q » se faisaient
 * couper net — « Quadriceps » se lisait « adricep ». Une hauteur de ligne
 * suffit à aligner ; une hauteur de boîte, elle, tranche dans le texte.
 */
const LIGNE = Math.round(T.petit * 1.5);

/* ----------------------------------------------------------------------
 * LA HAUTEUR DE LA RANGÉE EST UNE SOMME, PAS UNE ESTIMATION.
 *
 * Elle a été fausse deux fois, et de la même façon : j'écrivais
 * `DESSIN + LIGNE + E.xs * 4` en comptant les marges de tête. Il en manquait
 * six pixels — la bordure de la vignette et l'écart entre le dessin et son
 * libellé. Comme la rangée a une hauteur IMPOSÉE, elle ne déborde pas : elle
 * COUPE. Et ce qu'elle coupe, c'est le bas du texte, donc les jambages des
 * « p » et des « q ». « Quadriceps » devenait « adricep ».
 *
 * Chaque terme est donc nommé, et RÉUTILISÉ dans les styles plus bas. Changer
 * une valeur ici change la mise en page et la hauteur du même geste ; les
 * deux ne peuvent plus se contredire.
 * -------------------------------------------------------------------- */

/** Marge verticale de la rangée, au-dessus et au-dessous des vignettes. */
const MARGE = E.xs;
/** Le trait qui entoure une vignette. */
const BORDURE = 1;
/** L'air entre ce trait et le contenu. */
const RESPIRE = E.xs;
/** Entre le dessin et son libellé. */
const ECART = E.xs;

const HAUTEUR = 2 * MARGE + 2 * BORDURE + 2 * RESPIRE + DESSIN + ECART + LIGNE;

/**
 * CHOISIR UNE ZONE PLUTÔT QUE TAPER UN MOT.
 *
 * Le catalogue compte 1338 exercices. Les faire défiler n'a jamais été une
 * option, et écrire « pectoraux » suppose de savoir comment l'application les
 * nomme — `pectorals`, en l'occurrence, puisque le catalogue est importé en
 * anglais. Une silhouette ne demande pas de vocabulaire.
 *
 * QUINZE VIGNETTES SUR UNE LIGNE QUI DÉFILE, et j'ai hésité avec une grille.
 * La grille prend la moitié de l'écran ; on choisit un muscle POUR ENSUITE
 * regarder la liste, et une liste repoussée sous la ligne de flottaison rend
 * le filtre inutile. Le défilement horizontal coûte un geste d'exploration,
 * il rend la moitié de l'écran.
 *
 * UN SEUL GROUPE À LA FOIS. Cumuler « pectoraux OU triceps » paraît plus
 * puissant : en pratique on cherche un exercice pour UN muscle, et deux
 * vignettes actives se lisent mal. Le second appui remplace le premier ; le
 * même appui deux fois enlève le filtre.
 */
export function ChoixMuscle({
  choisi, onChoisir,
}: {
  /** `null` = aucun filtre, toute la liste */
  choisi: string | null;
  onChoisir: (cle: string | null) => void;
}) {
  const basculer = (cle: string) => onChoisir(choisi === cle ? null : cle);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      /* `flexShrink: 0` EST CELUI QUI COMPTE, ET J'AI COMMENCÉ PAR L'OUBLIER.
       *
       * J'avais posé `flexGrow: 0` en croyant que la rangée réclamait trop de
       * place. C'est l'inverse : elle se faisait ÉCRASER. La feuille du
       * sélecteur est une colonne à `maxHeight: 82%`, et la liste de résultats
       * en dessous veut toute la hauteur.
       *
       * Or `flexShrink` ne vaut pas la même chose des deux côtés : React
       * Native le laisse à 0 — un enfant garde sa taille — tandis que
       * react-native-web suit CSS, où le défaut est 1. Sur le web, la rangée
       * était donc comprimée à quelques pixels malgré sa hauteur ; sur le
       * téléphone, elle se serait affichée correctement. Un bug qui n'existe
       * que là où on le regarde. */
      style={{ height: HAUTEUR, flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={s.rangee}
      /* Sans ça, taper une vignette pendant que le clavier de la recherche est
         ouvert le referme d'abord et perd l'appui. */
      keyboardShouldPersistTaps="handled"
    >
      {GROUPES.map((g) => (
        <Vignette
          key={g.cle}
          label={g.label}
          actif={choisi === g.cle}
          onPress={() => basculer(g.cle)}
        >
          <Picto groupe={g} taille={DESSIN} couleur={choisi === g.cle ? C.vif : C.attenue} />
        </Vignette>
      ))}

      {/* SANS DESSIN, PARCE QU'IL N'Y EN A PAS D'HONNÊTE.
          Cardio, abducteurs, serratus, et les exercices dont le muscle n'a
          jamais été renseigné. Leur donner une silhouette au hasard serait
          mentir sur ce qu'ils contiennent ; les laisser hors du filtre les
          rendrait introuvables sans que rien ne le dise. */}
      <Vignette
        label={AUTRE.label}
        actif={choisi === AUTRE.cle}
        onPress={() => basculer(AUTRE.cle)}
      >
        <Discret style={{
          fontSize: T.grand,
          color: choisi === AUTRE.cle ? C.vif : C.attenue,
        }}>
          ?
        </Discret>
      </Vignette>
    </ScrollView>
  );
}

/**
 * UNE SEULE VIGNETTE, POUR LES QUINZE.
 *
 * « Autre » avait sa propre mise en page, recopiée à côté de celle des
 * quatorze autres. Deux structures qui doivent se ressembler mais que rien
 * n'oblige à se ressembler : son libellé s'est retrouvé quelques pixels plus
 * bas que ses voisins. Ce composant supprime la question — la boîte du dessin
 * et celle du texte sont les mêmes pour tout le monde, quel que soit ce qu'on
 * met dedans.
 */
function Vignette({
  label, actif, onPress, children,
}: {
  label: string;
  actif: boolean;
  onPress: () => void;
  /** le dessin : un `Picto`, ou n'importe quoi d'autre de la même hauteur */
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: actif }}
      accessibilityLabel={`Filtrer sur ${label}`}
      style={[s.vignette, actif && s.vignetteActive]}
    >
      {/* La boîte du dessin est imposée, et le dessin est centré dedans : un
          `<Svg>` sur le web est un élément EN LIGNE, il traînerait sinon
          l'espace d'un jambage sous sa ligne de base. */}
      <View style={s.boiteDessin}>{children}</View>

      <Discret
        style={[s.label, actif && s.labelActif]}
        numberOfLines={1}
      >
        {label}
      </Discret>
    </Pressable>
  );
}

const s = StyleSheet.create({
  rangee: { gap: E.xs, paddingVertical: MARGE, paddingHorizontal: E.xs },
  vignette: {
    /* De quoi écrire « Quadriceps » et « Adducteurs » sans les tronquer.
       Plus étroit, `numberOfLines={1}` coupait le mot au milieu — et un
       libellé coupé oblige à ouvrir pour savoir sur quoi on appuie. */
    width: TOUCHE + 44,
    alignItems: 'center',
    gap: ECART,
    paddingVertical: RESPIRE,
    borderRadius: R.s,
    borderWidth: BORDURE,
    borderColor: C.ligne,
    backgroundColor: C.surface2,
  },
  vignetteActive: { borderColor: C.vifBord, backgroundColor: C.vifFond },
  boiteDessin: {
    height: DESSIN,
    width: DESSIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: T.petit,
    lineHeight: LIGNE,
    textAlign: 'center',
  },
  labelActif: { color: C.vif, fontFamily: P.fort },
});
