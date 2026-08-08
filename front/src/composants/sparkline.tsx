import { StyleSheet, View } from 'react-native';
import { Discret } from './base';
import { C, E, T, nb } from '@/theme';

/**
 * Courbe de progression, dessinée sans dépendance graphique : chaque point
 * devient une barre dont la hauteur est proportionnelle à la valeur.
 *
 * Le disque coloré dit la tendance depuis la dernière fois ; cette courbe
 * montre la FORME de la progression — un palier, une remontée, un pic isolé.
 * Les deux se complètent.
 */
export function Sparkline({
  valeurs, unite = 'kg', hauteur = 34, libelle,
}: {
  /** du plus ancien au plus récent */
  valeurs: number[];
  unite?: string;
  hauteur?: number;
  libelle?: string;
}) {
  const points = valeurs.filter((v) => Number.isFinite(v) && v > 0);
  if (points.length < 2) return null;

  const mini = Math.min(...points);
  const maxi = Math.max(...points);
  const amplitude = maxi - mini;

  /* Amplitude nulle : tout est au même niveau, on dessine une ligne médiane
     plutôt que des barres pleines qui suggéreraient une progression. */
  const proportion = (v: number) => (amplitude === 0 ? 0.5 : (v - mini) / amplitude);

  const dernier = points[points.length - 1]!;
  const premier = points[0]!;
  const evolution = dernier - premier;

  return (
    <View style={s.bloc}>
      {libelle !== undefined && <Discret style={s.libelle}>{libelle}</Discret>}

      <View style={[s.courbe, { height: hauteur }]}>
        {points.map((v, i) => {
          const dernierPoint = i === points.length - 1;
          const h = Math.max(3, proportion(v) * (hauteur - 6) + 3);

          return (
            <View
              key={i}
              style={[
                s.barre,
                {
                  height: h,
                  backgroundColor: dernierPoint
                    ? (evolution > 0 ? C.ok : evolution < 0 ? C.erreur : C.vif)
                    : C.ligne,
                },
              ]}
            />
          );
        })}
      </View>

      <View style={s.pied}>
        <Discret style={s.borne}>{nb(mini)}</Discret>
        <Discret style={[s.evolution, {
          color: evolution > 0 ? C.ok : evolution < 0 ? C.erreur : C.attenue,
        }]}>
          {evolution > 0 ? '+' : ''}{nb(evolution)} {unite} sur {points.length} séances
        </Discret>
        <Discret style={s.borne}>{nb(maxi)}</Discret>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bloc: { gap: 3 },
  libelle: { fontSize: T.minuscule, letterSpacing: 0.8, textTransform: 'uppercase' },
  courbe: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 3,
    backgroundColor: C.surface2, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 3,
  },
  barre: { flex: 1, borderRadius: 2, minWidth: 3 },
  pied: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  borne: { fontSize: T.minuscule, fontVariant: ['tabular-nums'] },
  evolution: { fontSize: T.minuscule, fontVariant: ['tabular-nums'] },
});
