import { Pressable, StyleSheet, View } from 'react-native';
import { Discret } from './base';
import { C, E, P, R, T, TOUCHE } from '@/theme';

/**
 * UNE LISTE DE CASES À COCHER, EN PUCES.
 *
 * POURQUOI PAS UN MENU DÉROULANT. Un déroulant cache ses options : pour savoir
 * si « Fléchisseurs de hanche » existe, il faut l'ouvrir, et pour en cocher
 * quatre, l'ouvrir quatre fois. Ici tout est visible d'un coup et un appui
 * suffit par terme. Ça coûte de la hauteur — c'est pour ça que ça vit dans un
 * éditeur qui défile, et pas dans une carte de liste.
 *
 * LES PUCES NE SONT PAS DE LARGEUR ÉGALE, contrairement à celles des modes et
 * des groupes juste au-dessus. Trois puces se partagent une ligne ; vingt-cinq
 * de largeur imposée donneraient cinq lignes de mots tronqués. Chacune prend
 * donc la place de son mot, et la rangée passe à la ligne.
 *
 * `multiple` DÉCIDE DU GESTE, PAS SEULEMENT DU RÉSULTAT. En simple, un second
 * appui sur la même puce l'enlève : sans ça, une zone cochée par erreur ne
 * pourrait plus être décochée du tout.
 */
export function ChoixPuces({
  options, choisis, onChanger, multiple = false, etiquettePour,
}: {
  options: readonly { cle: string; label: string }[];
  choisis: readonly string[];
  onChanger: (cles: string[]) => void;
  multiple?: boolean;
  /** ce que lit une synthèse vocale ; le libellé seul ne dit pas sur quoi on agit */
  etiquettePour?: (label: string) => string;
}) {
  const basculer = (cle: string) => {
    if (choisis.includes(cle)) {
      onChanger(choisis.filter((c) => c !== cle));

      return;
    }
    /* En multiple on garde l'ordre des OPTIONS, pas celui des appuis : deux
       sélections identiques donnent alors deux chaînes identiques, et l'écran
       ne croit pas à une modification parce qu'on a coché dans un autre sens. */
    if (multiple) {
      const suite = [...choisis, cle];
      onChanger(options.filter((o) => suite.includes(o.cle)).map((o) => o.cle));

      return;
    }
    onChanger([cle]);
  };

  return (
    <View style={s.rangee}>
      {options.map((o) => {
        const actif = choisis.includes(o.cle);

        return (
          <Pressable
            key={o.cle}
            onPress={() => basculer(o.cle)}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: actif, selected: actif }}
            accessibilityLabel={etiquettePour ? etiquettePour(o.label) : o.label}
            style={[s.puce, actif && s.puceActive]}
          >
            <Discret
              numberOfLines={1}
              style={actif
                ? { color: C.fond, fontFamily: P.fort, fontSize: T.petit }
                : { fontSize: T.petit }}
            >
              {o.label}
            </Discret>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  rangee: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  puce: {
    minHeight: TOUCHE,
    borderRadius: R.s,
    borderWidth: 1,
    borderColor: C.ligne,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: E.s,
  },
  puceActive: { backgroundColor: C.vif, borderColor: C.vif },
});
