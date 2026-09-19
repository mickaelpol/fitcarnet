import { type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, type TextInputProps, View,
  type StyleProp, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { C, E, N, P, R, T, TOUCHE } from '@/theme';

/* ---------- textes ---------- */

export const Titre = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => (
  <Text style={[s.titre, style]}>{children}</Text>
);

export const Texte = ({ children, style, numberOfLines }: {
  children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number;
}) => <Text numberOfLines={numberOfLines} style={[s.texte, style]}>{children}</Text>;

export const Discret = ({ children, style, ...props }: TextProps) => (
  <Text {...props} style={[s.discret, style]}>{children}</Text>
);

/** Chiffre mis en avant : police condensée, alignement des colonnes. */
export const Chiffre = ({ children, couleur, taille = N.normal }: {
  children: ReactNode; couleur?: string; taille?: number;
}) => (
  <Text style={[s.chiffre, { color: couleur ?? C.vif, fontSize: taille }]}>{children}</Text>
);

/* ---------- conteneurs ---------- */

export const Carte = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[s.carte, style]}>{children}</View>
);

/* ---------- actions ---------- */

interface BoutonProps {
  children: ReactNode;
  onPress: () => void;
  variante?: 'plein' | 'contour' | 'discret';
  desactive?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Bouton({ children, onPress, variante = 'plein', desactive, style }: BoutonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desactive}
      style={({ pressed }) => [
        s.bouton,
        variante === 'plein' && s.boutonPlein,
        variante === 'contour' && s.boutonContour,
        variante === 'discret' && s.boutonDiscret,
        desactive && s.boutonInactif,
        pressed && !desactive && s.boutonEnfonce,
        style,
      ]}
    >
      <Text style={[
        s.boutonTexte,
        variante === 'plein' && { color: C.fond },
        variante === 'discret' && { color: C.attenue },
        desactive && { color: C.discret },
      ]}>{children}</Text>
    </Pressable>
  );
}

/* ---------- saisie ---------- */

interface ChampProps {
  valeur: string;
  onChange: (v: string) => void;
  placeholder?: string;
  unite?: string;
  numerique?: boolean;
  motDePasse?: boolean;
  etiquette?: string;
  style?: StyleProp<ViewStyle>;
  /**
   * Texte long, sur plusieurs lignes.
   *
   * Change aussi la capitalisation automatique : `autoCapitalize="none"`
   * convient à une adresse ou à un identifiant, pas à un mode d'exécution
   * qu'on écrit en phrases. Sans ça, chaque phrase commencerait en minuscule.
   */
  multiligne?: boolean;
  /**
   * Ce que fait la touche « Entrée ».
   *
   * SUR LE WEB, LE BOUTON ÉTAIT LE SEUL CHEMIN — 18 septembre 2026. React
   * Native Web ne pose pas de vrai formulaire HTML : il n'y a donc rien à
   * soumettre, et « Entrée » ne faisait rien du tout. On remplissait son
   * adresse, son mot de passe, on appuyait sur Entrée, et il ne se passait
   * rien — sans le moindre message pour dire qu'il fallait viser le bouton.
   * C'est déjà écrit dans `presentation/tournage/capturer.mjs`, qui clique
   * le bouton pour cette raison précise.
   *
   * `onSubmitEditing` marche des deux côtés : la touche Entrée sur un
   * clavier, le bouton « Go » sur un téléphone.
   */
  onValider?: () => void;
  /**
   * « Entrée » passe au champ suivant au lieu de valider.
   *
   * LA MOITIÉ QUI MANQUAIT — relevée le 18 septembre 2026, le jour même où
   * `onValider` a été posé. Sur l'écran de connexion, les DEUX champs
   * portaient `onValider`, et `valider()` commence par
   * `if (!email.trim() || !motDePasse) return`. Depuis le champ adresse, le
   * mot de passe est vide par construction : « Entrée » ne produisait donc
   * RIEN, en silence — le défaut exact qu'on venait de corriger, réintroduit
   * un champ plus haut. Et le clavier annonçait « go », ce qui est un
   * mensonge.
   *
   * On donne au champ intermédiaire de quoi passer la main : le clavier
   * annonce « next », et la touche déplace le curseur. C'est le patron que
   * documente React Native (`improvingux`, « the return key changes from
   * focusing next input to submitting the form »).
   */
  onSuivant?: () => void;
  /**
   * Pour qu'un champ précédent puisse lui donner le curseur.
   *
   * React 19 accepte `ref` comme une prop ordinaire, mais on le nomme
   * autrement : `ref` sur un composant de fonction reste un terrain piégeux
   * d'une version à l'autre, et un nom explicite se cherche.
   */
  champRef?: React.Ref<TextInput>;
  /**
   * Ce que le gestionnaire de mots de passe doit proposer de remplir.
   *
   * `autoComplete` ET PAS `textContentType` : le second n'existe que sur iOS,
   * le premier vaut pour les trois plateformes, et la documentation React
   * Native déconseille de les poser tous les deux. Sans lui, le navigateur ne
   * propose rien sur l'écran de connexion et le mot de passe se retape à
   * chaque visite — sur le seul écran par lequel tout le monde entre.
   */
  autoComplete?: TextInputProps['autoComplete'];
  /**
   * La saisie ne désigne rien d'utilisable : le cadre se borde de rouge. On
   * MONTRE l'erreur plutôt que d'effacer ce qui a été tapé — voir `ChampNombre`.
   */
  illisible?: boolean;
}

export function Champ({
  valeur, onChange, placeholder, unite, numerique, motDePasse, etiquette, style,
  multiligne, illisible, onValider, onSuivant, champRef, autoComplete,
}: ChampProps) {
  /* UN SEUL DES DEUX AGIT, ET « SUIVANT » PASSE EN PREMIER : un champ qui
     donne la main n'est pas un champ qui valide. Les poser tous les deux est
     une erreur d'écriture, pas un cas à arbitrer en silence. */
  const surEntree = onSuivant ?? onValider;
  return (
    <View style={[s.champBloc, style]}>
      {etiquette !== undefined && <Text style={s.etiquette}>{etiquette}</Text>}
      <View style={[s.champCadre, multiligne === true && s.champCadreLong, illisible === true && s.champIllisible]}>
        <TextInput
          value={valeur}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={C.discret}
          keyboardType={numerique ? 'decimal-pad' : 'default'}
          secureTextEntry={motDePasse}
          autoCapitalize={multiligne === true ? 'sentences' : 'none'}
          autoComplete={autoComplete}
          multiline={multiligne}
          ref={champRef}
          onSubmitEditing={surEntree}
          /* Le clavier annonce ce que la touche va FAIRE : « next » quand elle
             donne la main au champ suivant, « go » quand elle valide. Sans
             rien des deux, on ne touche à rien. */
          returnKeyType={surEntree === undefined ? undefined : (onSuivant === undefined ? 'go' : 'next')}
          /* TROIS CAS, ET LE DÉFAUT DE REACT NATIVE EST LE BON DANS UN SEUL.
             La documentation (`textinput.md`) est explicite :

               champ d'une ligne   : `undefined` vaut `'blurAndSubmit'`
               champ multiligne    : `undefined` vaut `'newline'`
               `'submit'`          : envoie l'événement SANS retirer le focus

             1. UN CHAMP QUI PASSE LA MAIN NE DOIT PAS PERDRE LE FOCUS.
                C'était le cas : `onSuivant` laissait `undefined`, donc
                `blurAndSubmit`. Sur Android, « Entrée » depuis l'adresse
                fermait le clavier, puis `focus()` le rouvrait — un
                clignotement, et un enchaînement qui repose sur une course
                entre le blur natif et le `focus()`. L'exemple officiel
                (`improvingux.md`) met d'ailleurs `blurOnSubmit={false}` sur ce
                champ-là, dont `'submit'` est l'équivalent moderne.
                Relevé par `revue-pile` le 19 septembre 2026, en confrontant ce
                composant à sa documentation.
             2. UN CHAMP MULTILIGNE QUI VALIDE doit dire `blurAndSubmit`, sans
                quoi « Entrée » insère un saut de ligne et `onValider` ne part
                jamais — en silence, c'est-à-dire le défaut du 18 septembre
                réintroduit. Aucun appelant ne combine `multiligne` et
                `onValider` aujourd'hui ; cette ligne fait que le premier qui le
                fera obtiendra ce qu'il demande.
             3. PARTOUT AILLEURS, le défaut de React Native convient. */
          submitBehavior={
            onSuivant !== undefined
              ? 'submit'
              : (multiligne === true && onValider !== undefined ? 'blurAndSubmit' : undefined)
          }
          style={[s.champ, numerique && s.champNombre, multiligne === true && s.champLong]}
        />
        {unite !== undefined && <Text style={s.unite}>{unite}</Text>}
      </View>
    </View>
  );
}

/* ---------- états ---------- */

export const Chargement = ({ texte }: { texte?: string }) => (
  <View style={s.centre}>
    <ActivityIndicator color={C.vif} />
    {texte !== undefined && <Discret style={{ marginTop: E.m }}>{texte}</Discret>}
  </View>
);

export const Erreur = ({ message, onReessayer }: { message: string; onReessayer?: () => void }) => (
  <View style={s.centre}>
    <Text style={s.erreur}>{message}</Text>
    {onReessayer && (
      <Bouton variante="contour" onPress={onReessayer} style={{ marginTop: E.m }}>Réessayer</Bouton>
    )}
  </View>
);

export const Vide = ({ message }: { message: string }) => (
  <View style={s.centre}><Discret>{message}</Discret></View>
);

const s = StyleSheet.create({
  titre: {
    color: C.encre, fontFamily: P.titre, fontSize: T.geant,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  texte: { color: C.encre, fontFamily: P.texte, fontSize: T.moyen },
  discret: { color: C.attenue, fontFamily: P.texte, fontSize: T.normal },
  chiffre: { fontFamily: P.chiffre, fontVariant: ['tabular-nums'] },

  carte: {
    backgroundColor: C.surface, borderColor: C.ligne, borderWidth: 1,
    borderRadius: R.m, padding: E.m,
  },

  bouton: {
    minHeight: TOUCHE, borderRadius: R.s, paddingHorizontal: E.l,
    alignItems: 'center', justifyContent: 'center',
  },
  boutonPlein: { backgroundColor: C.vif },
  boutonContour: { borderWidth: 1, borderColor: C.ligne, backgroundColor: C.surface2 },
  boutonDiscret: { backgroundColor: 'transparent' },
  boutonInactif: { opacity: 0.4 },
  boutonEnfonce: { opacity: 0.75 },
  boutonTexte: { color: C.encre, fontFamily: P.fort, fontSize: T.moyen },

  champBloc: { gap: E.xs },
  etiquette: {
    color: C.discret, fontFamily: P.texte, fontSize: T.minuscule,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  champCadre: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface2, borderColor: C.ligne, borderWidth: 1,
    borderRadius: R.s, paddingHorizontal: E.m, minHeight: TOUCHE + 2,
  },
  champCadreLong: { alignItems: 'flex-start', minHeight: 140 },
  champIllisible: { borderColor: C.erreur },
  champ: { flex: 1, color: C.encre, fontFamily: P.texte, fontSize: T.moyen, paddingVertical: E.s },
  /* `textAlignVertical` pour Android : sans lui, le texte d'un champ
     multiligne se centre verticalement au lieu de commencer en haut. */
  champLong: { minHeight: 120, textAlignVertical: 'top', lineHeight: 21 },
  champNombre: { fontFamily: P.fort, fontSize: T.grand },
  unite: { color: C.discret, fontFamily: P.texte, fontSize: T.normal, marginLeft: E.xs },

  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: E.xl, gap: E.s },
  erreur: { color: C.erreur, fontFamily: P.texte, fontSize: T.normal, textAlign: 'center' },
});
