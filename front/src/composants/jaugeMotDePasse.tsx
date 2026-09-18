import { StyleSheet, View } from 'react-native';

import {
  DIT, EXIGENCES, MOT_DE_LA_FORCE, force, manquements, type Force,
} from '@/calcul/motDePasse';
import { C, E, P, R, T } from '@/theme';
import { Discret, Texte } from './base';

/**
 * CE QU'IL MANQUE À CE MOT DE PASSE, PENDANT QU'ON LE TAPE.
 *
 * DEUX CHOSES, ET LA SECONDE COMPTE PLUS QUE LA PREMIÈRE.
 *
 * La barre dit où on en est. La LISTE dit quoi faire. Beaucoup de sites
 * n'affichent que la barre : on voit « faible » en rouge sans savoir ce qui
 * manque, on ajoute un « 1 » à la fin, ça passe au vert, et c'est ainsi qu'on
 * obtient « Motdepasse1! ». Nommer les cinq exigences et cocher celles qui
 * sont remplies transforme une note en marche à suivre.
 *
 * ON AFFICHE TOUT DE SUITE LES CINQ, cochées ou non — et pas seulement ce qui
 * manque. Une liste qui rétrécit pendant qu'on tape fait bouger le reste de
 * l'écran sous les doigts ; et voir la liste complète avant de commencer, c'est
 * savoir où l'on va.
 *
 * LA BARRE NE PEUT PAS MENTIR : `force()` est construite SUR les exigences —
 * tant qu'il en manque une, elle ne dépasse pas « Presque ». Le test partagé
 * `motDePassePartage.test.ts` refuse toute jauge qui encouragerait un mot de
 * passe que l'API rejette.
 *
 * RIEN NE S'AFFICHE SUR UN CHAMP VIDE. Accueillir quelqu'un par cinq croix
 * rouges avant qu'il ait tapé une lettre, c'est le gronder d'être arrivé.
 */
export function JaugeMotDePasse({ valeur }: { valeur: string }) {
  if (valeur === '') return null;

  const niveau = force(valeur);
  const manque = new Set(manquements(valeur));

  return (
    <View style={s.bloc}>
      <View style={s.barre}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[s.segment, i < SEGMENTS[niveau] && { backgroundColor: COULEUR[niveau] }]}
          />
        ))}
      </View>

      <Texte style={[s.mot, { color: COULEUR[niveau] }]}>{MOT_DE_LA_FORCE[niveau]}</Texte>

      {EXIGENCES.map((exigence) => {
        const remplie = !manque.has(exigence);

        return (
          <Discret
            key={exigence}
            style={[s.ligne, remplie ? { color: C.ok } : { color: C.attenue }]}
          >
            {/* Un caractère, pas une icône : aucune dépendance, lisible par un
                lecteur d'écran, et identique sur les trois plateformes. */}
            {remplie ? '✓' : '·'}  {DIT[exigence]}
          </Discret>
        );
      })}
    </View>
  );
}

/** Combien de segments s'allument. Quatre, comme les quatre paliers nommés. */
const SEGMENTS: Record<Force, number> = {
  vide: 0, faible: 1, moyen: 2, bon: 3, solide: 4,
};

/**
 * `vif` (le doré) pour « Bon » et non `ok` (le vert) : le vert est réservé à
 * « c'est fait », et « bon » veut dire « ça passera », pas « bravo ». Le vert
 * arrive avec « Solide », qui est la seule des quatre notes qu'on félicite.
 */
const COULEUR: Record<Force, string> = {
  vide: C.ligne,
  faible: C.erreur,
  moyen: C.lip,
  bon: C.vif,
  solide: C.ok,
};

const s = StyleSheet.create({
  bloc: { gap: E.xs, marginTop: E.s },
  barre: { flexDirection: 'row', gap: E.xs },
  segment: {
    flex: 1, height: 4, borderRadius: R.s, backgroundColor: C.ligne,
  },
  mot: { fontFamily: P.fort, fontSize: T.petit },
  ligne: { fontSize: T.petit },
});
