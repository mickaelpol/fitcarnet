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
  titre, resume, ouvert, onBascule, aDroite, children, teinte, apparence = 'liste',
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
  /**
   * LA MÊME CHOSE, HABILLÉE COMME SON VOISINAGE.
   *
   * `liste` — le défaut, celui de l'écran repas : titre à gauche, chevron
   * devant. C'est ce qu'il faut quand vingt-huit encarts s'empilent et qu'on
   * balaie la colonne des yeux pour trouver le bon.
   *
   * `bouton` — pour l'onglet Compte, où chaque ligne est un bouton pleine
   * largeur au texte centré. Un encart aligné à gauche au milieu d'eux se lit
   * comme un corps étranger. Les valeurs reprises ci-dessous sont CELLES de
   * `Bouton variante="contour"`, pas des valeurs approchantes : deux réglages
   * qui se ressemblent finissent toujours par diverger.
   */
  apparence?: 'liste' | 'bouton';
}) {
  const enBouton = apparence === 'bouton';

  return (
    <View style={[
      s.cadre,
      enBouton && s.cadreBouton,
      teinte === 'jour' && s.cadreJour,
      ouvert && !enBouton && s.cadreOuvert,
    ]}
    >
      <View style={s.tete}>
        <Pressable
          onPress={onBascule}
          style={[s.zone, enBouton && s.zoneBouton]}
          accessibilityRole="button"
          accessibilityState={{ expanded: ouvert }}
          accessibilityLabel={`${ouvert ? 'Replier' : 'Déplier'} ${titre}`}
        >
          {/* Le chevron pivote plutôt que de changer de glyphe : l'œil suit
              un mouvement, il ne relit pas un caractère. */}
          {/* EN APPARENCE `bouton`, LE CHEVRON SORT DU FLUX.
              Laissé dans la ligne, il décalerait le texte de sa largeur et le
              titre ne serait plus centré sur la carte mais sur ce qu'il en
              reste — un demi-centrage se voit tout de suite à côté de vrais
              boutons. Posé en absolu, il garde son rôle d'indice sans peser
              sur la mise en page. */}
          <Texte style={[
            s.chevron,
            enBouton && s.chevronBouton,
            ouvert && s.chevronOuvert,
          ]}>›</Texte>
          <View style={enBouton ? s.texteBouton : { flex: 1 }}>
            <Texte style={[s.titre, enBouton && s.titreBouton]}>{titre}</Texte>
            {resume !== undefined && resume !== '' && (
              <Discret style={[s.resume, enBouton && s.resumeBouton]} numberOfLines={1}>
                {resume}
              </Discret>
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
  /* Les trois valeurs de `Bouton variante="contour"`, à l'identique. */
  cadreBouton: { borderRadius: R.s, borderColor: C.ligne, backgroundColor: C.surface2 },
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
  zoneBouton: { paddingHorizontal: E.l, justifyContent: 'center' },
  texteBouton: { alignItems: 'center' },
  chevron: {
    fontSize: T.grand,
    color: C.attenue,
    width: T.normal,
    textAlign: 'center',
  },
  chevronOuvert: { transform: [{ rotate: '90deg' }] },
  chevronBouton: { position: 'absolute', left: E.s },
  titre: { fontFamily: P.fort },
  /* `T.moyen` et `C.encre` : la typographie exacte de `boutonTexte`. */
  titreBouton: { fontSize: T.moyen, color: C.encre, textAlign: 'center' },
  resume: { fontSize: T.petit },
  resumeBouton: { textAlign: 'center' },
  corps: {
    paddingHorizontal: E.m,
    paddingBottom: E.m,
    paddingTop: E.xs,
    gap: E.xs,
  },
});
