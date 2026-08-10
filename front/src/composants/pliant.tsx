import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Discret, Texte } from './base';
import { C, E, P, R, T, TOUCHE } from '@/theme';

/**
 * UN ENCART QUI SE PLIE.
 *
 * Une semaine de repas, c'est sept jours de quatre lignes : vingt-huit blocs
 * empilés sur un écran de téléphone, et plus rien de lisible. Le pliage n'est
 * donc pas un ornement, c'est ce qui rend l'écran utilisable au-delà d'un
 * jour.
 *
 * Deux règles, tenues par le composant plutôt que par chaque appelant :
 *
 *   - **replié, un encart dit toujours l'essentiel.** Le titre et le résumé
 *     restent visibles ; on n'ouvre que pour AGIR, jamais pour savoir. Un
 *     pliage qui oblige à ouvrir sept jours pour retrouver lequel manque n'a
 *     rien simplifié.
 *   - **la zone de pli fait toute la largeur.** On la vise au pouce sans
 *     regarder, et elle respecte la hauteur minimale de la charte.
 */
export function Pliant({
  titre, resume, ouvert, onBascule, aDroite, children, teinte,
}: {
  titre: string;
  /** ce qui reste lisible une fois replié — l'essentiel, pas un décor */
  resume?: string;
  ouvert: boolean;
  onBascule: () => void;
  /** contenu accroché à droite du titre, visible plié comme déplié */
  aDroite?: ReactNode;
  children: ReactNode;
  /** fond discret pour distinguer un niveau de pliage du suivant */
  teinte?: 'jour' | 'repas';
}) {
  return (
    <View style={[
      s.cadre,
      teinte === 'jour' && s.cadreJour,
      ouvert && s.cadreOuvert,
    ]}
    >
      <View style={s.tete}>
        <Pressable
          onPress={onBascule}
          style={s.zone}
          accessibilityRole="button"
          accessibilityState={{ expanded: ouvert }}
          accessibilityLabel={`${ouvert ? 'Replier' : 'Déplier'} ${titre}`}
        >
          {/* Le chevron pivote plutôt que de changer de glyphe : l'œil suit
              un mouvement, il ne relit pas un caractère. */}
          <Texte style={[s.chevron, ouvert && s.chevronOuvert]}>›</Texte>
          <View style={{ flex: 1 }}>
            <Texte style={s.titre}>{titre}</Texte>
            {resume !== undefined && resume !== '' && (
              <Discret style={s.resume} numberOfLines={1}>{resume}</Discret>
            )}
          </View>
        </Pressable>
        {aDroite}
      </View>

      {ouvert && <View style={s.corps}>{children}</View>}
    </View>
  );
}

const s = StyleSheet.create({
  cadre: {
    borderRadius: R.l,
    borderWidth: 1,
    borderColor: C.ligne,
    backgroundColor: C.surface,
    overflow: 'hidden',
  },
  cadreJour: { backgroundColor: C.surface2 },
  cadreOuvert: { borderColor: C.discret },
  tete: { flexDirection: 'row', alignItems: 'center', paddingRight: E.s },
  zone: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: E.s,
    minHeight: TOUCHE,
    paddingHorizontal: E.m,
    paddingVertical: E.xs,
  },
  chevron: {
    fontSize: T.grand,
    color: C.attenue,
    width: T.normal,
    textAlign: 'center',
  },
  chevronOuvert: { transform: [{ rotate: '90deg' }] },
  titre: { fontFamily: P.fort },
  resume: { fontSize: T.petit },
  corps: {
    paddingHorizontal: E.m,
    paddingBottom: E.m,
    paddingTop: E.xs,
    gap: E.xs,
  },
});
