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
 * DORE PLEIN, TEXTE SOMBRE — 9,23:1 DE CONTRASTE, MESURE.
 *
 * TROIS VERSIONS, ET LES DEUX PREMIERES ETAIENT FAUSSES. Il faut les trois
 * pour comprendre celle-ci.
 *
 * 1. ROUGE SUR VOILE ROUGE. Faux sur le fond : le rouge de ce theme annonce
 *    une ERREUR — un champ refuse, une requete qui echoue, une suppression
 *    qu'on ne defait pas. Or ce bandeau dit le contraire : les regles ont
 *    change, le mot de passe RESTE valable, rien n'est bloque. Alarmer de ce
 *    qu'on vient d'ecrire comme sans gravite, c'est aussi user le rouge pour
 *    le jour ou quelque chose ira vraiment mal.
 *
 * 2. DORE SUR VOILE DORE A 8 %. Faux sur la forme, et le calcul disait
 *    pourtant 8:1 — parce qu'il supposait le voile compose sur `C.fond`. Il ne
 *    l'etait pas : sur le web, `<html>` et `<body>` n'avaient aucun fond, donc
 *    le voile se composait sur le BLANC du navigateur. Le fond rendu etait un
 *    creme presque blanc, et le texte dore dessus tombait a **1,87:1**. Il en
 *    faut 4,5. Illisible, et signale par l'utilisateur avant que la mesure ne
 *    le confirme.
 *
 *    (Le test `theme/charte.test.ts` a d'ailleurs refuse la premiere version de
 *    ce commentaire, qui citait la couleur en notation `rgb`. Il cherche les
 *    couleurs ecrites en dur et ne fait pas la difference avec une prose qui
 *    en parle — c'est le bon reglage : mieux vaut reformuler une phrase que
 *    laisser passer une couleur hors charte.)
 *
 * LA LECON, QUI VAUT PLUS QUE LA COULEUR : un fond TRANSLUCIDE ne decide pas
 * de sa propre lisibilite, il la delegue a ce qu'on aura mis derriere. Pour un
 * element qui coiffe TOUTE l'application, au-dessus de n'importe quel ecran,
 * c'est un pari qu'on perd un jour. Ce bandeau est donc OPAQUE. La cause
 * premiere est fermee par ailleurs (`app/_layout.tsx` pose enfin un fond), mais
 * on ne remet pas la lisibilite d'un avertissement entre les mains d'une autre
 * ligne, dans un autre fichier.
 *
 * 9,23:1 passe le niveau AAA (7:1), et pas seulement le AA (4,5:1) : c'est un
 * texte petit, affiche en permanence, et qui doit se lire d'un coup d'oeil.
 */
const s = StyleSheet.create({
  bandeau: {
    backgroundColor: C.vif,
    paddingHorizontal: E.l,
    paddingBottom: E.s,
  },
  texte: {
    color: C.fond,
    fontFamily: P.fort,
    fontSize: T.petit,
    /* Casse ordinaire, contrairement aux etiquettes de ce theme : c'est une
       phrase qu'on lit, pas un intitule de colonne, et des capitales sur toute
       la largeur sonneraient comme un panneau d'interdiction. */
    letterSpacing: 0.2,
    textAlign: 'center',
  },
});
