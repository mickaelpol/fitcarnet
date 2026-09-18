import { useRouter, useSegments } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMoi } from '@/api/hooks';
import { C, E, P, T } from '@/theme';
import { Texte } from './base';

/**
 * CE BANDEAU SE MONTRE-T-IL ? — et la question n'a qu'une réponse, ici.
 *
 * Deux endroits en dépendent : le bandeau lui-même, et la racine, qui doit
 * savoir si la barre d'état est déjà couverte pour ne pas la compter deux
 * fois. Écrire la condition aux deux endroits, c'est se garantir qu'un jour
 * l'un dira oui et l'autre non — et l'écran gagnerait alors un espace vide
 * que personne ne saurait expliquer.
 */
export function useMotDePasseASignaler(): boolean {
  const { data } = useMoi();
  const segments = useSegments();

  /* ON NE SE MONTRE PAS SUR L'ÉCRAN QUI SERT À NOUS FAIRE DISPARAÎTRE. Un
     bandeau « change ton mot de passe » affiché au-dessus du formulaire de
     changement se lit comme un reproche, et vole la place au seul écran qui
     en a besoin. */
  const surLEcranDeChangement = segments.some((s) => s === 'mot-de-passe');

  return data?.motDePasseFaible === true && !surLEcranDeChangement;
}

/**
 * LE RAPPEL QUI SUIT LA PERSONNE, PARCE QU'ELLE N'IRA PAS LE CHERCHER.
 *
 * L'avertissement ne vivait que sur l'onglet Compte. Quelqu'un qui n'y va
 * jamais — et on n'y va que pour se déconnecter ou régler quelque chose — ne
 * saurait jamais que son mot de passe ne suit plus les règles, et ne le
 * changerait donc jamais. Un avertissement qu'il faut aller chercher n'est pas
 * un avertissement.
 *
 * UNE LIGNE, EN HAUT, SUR TOUS LES ONGLETS. Pas une fenêtre modale : on ne
 * bloque pas quelqu'un qui vient noter une séance pour lui parler de son mot de
 * passe. Rien n'est urgent ici — les règles ont changé, son mot de passe reste
 * valable, et il peut continuer de s'en servir. Le ton et la place disent la
 * même chose : c'est une information, pas une alarme.
 *
 * ELLE SE TAIT DÈS QUE LE MOT DE PASSE EST CHANGÉ, parce que le serveur remet
 * le drapeau à faux au moment du changement. Il n'y a donc pas de bouton
 * « plus tard » : ce bandeau a une fin, et elle est à un geste.
 *
 * `=== true` STRICTEMENT. `motDePasseFaible` est facultatif — un APK installé
 * il y a des mois parle à l'API d'aujourd'hui sans que le champ existe.
 * `undefined` veut dire « je ne sais pas », donc on n'affiche rien : inventer
 * un avertissement est pire que de n'en pas faire.
 */
export function BandeauMotDePasse() {
  const aSignaler = useMotDePasseASignaler();
  const routeur = useRouter();
  const marges = useSafeAreaInsets();

  if (!aSignaler) return null;

  return (
    <Pressable
      onPress={() => routeur.push('/mot-de-passe')}
      style={[s.bandeau, { paddingTop: marges.top + E.s }]}
      accessibilityRole="button"
      accessibilityLabel="Ton mot de passe ne suit plus les règles. Toucher pour en choisir un autre."
    >
      <Texte style={s.texte} numberOfLines={1}>
        Ton mot de passe ne suit plus les règles — le changer ›
      </Texte>
    </Pressable>
  );
}

const s = StyleSheet.create({
  bandeau: {
    backgroundColor: C.erreurFond,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.erreur,
    paddingHorizontal: E.l,
    paddingBottom: E.s,
  },
  texte: {
    color: C.erreur,
    fontFamily: P.fort,
    fontSize: T.petit,
    textAlign: 'center',
  },
});
