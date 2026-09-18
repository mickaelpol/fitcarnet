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

/**
 * LE DORE, ET PAS LE ROUGE — corrige le 18 septembre 2026, sur remarque.
 *
 * Ce n'est pas qu'une question de gout. Le rouge de ce theme annonce une
 * ERREUR : un champ refuse, une requete qui a echoue, une suppression qui ne
 * se defait pas. Or ce bandeau dit le contraire de tout ca — les regles ont
 * change, ton mot de passe RESTE valable, rien n'est bloque. Le peindre en
 * rouge, c'etait alarmer de ce qu'on venait d'ecrire comme sans gravite, et
 * user le rouge pour le jour ou quelque chose ira vraiment mal.
 *
 * `vif` est la couleur d'accent de l'application — celle des boutons, des
 * onglets actifs, des chiffres qui comptent. Elle attire l'oeil sans crier, et
 * ses voiles existaient deja : `vifVoile` et `vifBord` ont ete rassembles
 * precisement pour ne plus ecrire « le dore, mais discret » en rgba() a chaque
 * ecran.
 *
 * `vifVoile` (8 %) ET NON `vifFond` (12 %) : ce bandeau coiffe l'application
 * en permanence jusqu'a ce qu'on agisse. Un aplat qu'on voit tout le temps
 * doit etre plus leger qu'un encadre qu'on voit une fois.
 */
const s = StyleSheet.create({
  bandeau: {
    backgroundColor: C.vifVoile,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.vifBord,
    paddingHorizontal: E.l,
    paddingBottom: E.s,
  },
  texte: {
    color: C.vif,
    fontFamily: P.fort,
    fontSize: T.petit,
    /* Les etiquettes de ce theme sont en capitales espacees ; ici on garde la
       casse ordinaire. C'est une phrase qu'on lit, pas un intitule de colonne,
       et des capitales sur toute la largeur sonneraient comme un panneau
       d'interdiction. */
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});
