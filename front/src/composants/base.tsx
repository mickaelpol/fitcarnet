import { type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
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
}

export function Champ({
  valeur, onChange, placeholder, unite, numerique, motDePasse, etiquette, style,
  multiligne,
}: ChampProps) {
  return (
    <View style={[s.champBloc, style]}>
      {etiquette !== undefined && <Text style={s.etiquette}>{etiquette}</Text>}
      <View style={[s.champCadre, multiligne === true && s.champCadreLong]}>
        <TextInput
          value={valeur}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={C.discret}
          keyboardType={numerique ? 'decimal-pad' : 'default'}
          secureTextEntry={motDePasse}
          autoCapitalize={multiligne === true ? 'sentences' : 'none'}
          multiline={multiligne}
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
  champ: { flex: 1, color: C.encre, fontFamily: P.texte, fontSize: T.moyen, paddingVertical: E.s },
  /* `textAlignVertical` pour Android : sans lui, le texte d'un champ
     multiligne se centre verticalement au lieu de commencer en haut. */
  champLong: { minHeight: 120, textAlignVertical: 'top', lineHeight: 21 },
  champNombre: { fontFamily: P.fort, fontSize: T.grand },
  unite: { color: C.discret, fontFamily: P.texte, fontSize: T.normal, marginLeft: E.xs },

  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: E.xl, gap: E.s },
  erreur: { color: C.erreur, fontFamily: P.texte, fontSize: T.normal, textAlign: 'center' },
});
