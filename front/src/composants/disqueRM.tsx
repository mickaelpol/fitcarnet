import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Chiffre, Discret, Texte } from './base';
import { C, E, P, R } from '@/theme';

export type Tendance = 'hausse' | 'stable' | 'baisse' | 'inconnue';

/**
 * La couleur du disque dit la PROGRESSION, pas la charge absolue.
 * Une échelle par paliers de poids ne veut rien dire d'un utilisateur à
 * l'autre : 20 kg est lourd sur des écartés, léger sur un squat.
 *
 * Seuil de 3 % : en deçà, l'écart relève du bruit — une répétition de moins
 * sur douze fait déjà 2,4 %, et une nuit courte suffit à l'expliquer.
 * Au-delà, c'est un vrai mouvement : 2,5 kg de plus sur une barre à 40 kg
 * représente 6 %.
 */
export const SEUIL = 0.03;

export function tendanceDe(actuel: number, precedent: number | null): Tendance {
  if (precedent === null || precedent <= 0) return 'inconnue';
  const ecart = (actuel - precedent) / precedent;
  if (ecart > SEUIL) return 'hausse';
  if (ecart < -SEUIL) return 'baisse';

  return 'stable';
}

export const COULEUR_TENDANCE: Record<Tendance, string> = {
  hausse: '#3d9a5c',    // vert : tu progresses
  stable: '#e3b23c',    // jaune : tu tiens
  baisse: '#d8352a',    // rouge : tu recules
  inconnue: '#5d646e',  // gris : pas de point de comparaison
};

const SIGNE: Record<Tendance, string> = {
  hausse: '▲', stable: '=', baisse: '▼', inconnue: '',
};

/** Répétitions théoriquement possibles à ce pourcentage du 1RM (Epley inversé). */
const repsAu = (pourcent: number): number =>
  Math.max(1, Math.round((100 / pourcent - 1) / 0.0333));

const PALIERS = [90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40];

export function DisqueRM({
  valeur, precedent = null, unite = '1RM kg', onPress, ouvert,
}: {
  valeur: number;
  /** meilleur 1RM des séances antérieures, pour situer la progression */
  precedent?: number | null;
  unite?: string;
  onPress?: () => void;
  ouvert?: boolean;
}) {
  const tendance = tendanceDe(valeur, precedent);
  const couleur = COULEUR_TENDANCE[tendance];
  const ecart = precedent !== null && precedent > 0 ? valeur - precedent : null;

  const libelle = {
    hausse: 'en progression', stable: 'stable',
    baisse: 'en baisse', inconnue: 'première fois',
  }[tendance];

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityLabel={`1RM ${valeur} kg, ${libelle}`}
    >
      <View style={[s.disque, { borderColor: couleur }]}>
        <Chiffre taille={17} couleur={C.encre}>{
          Math.abs(valeur - Math.round(valeur)) < 0.05 ? Math.round(valeur) : valeur.toFixed(1)
        }</Chiffre>
        <Discret style={s.unite}>{unite}</Discret>
      </View>

      {ecart !== null && Math.abs(ecart) >= 0.05 && (
        <Discret style={[s.ecart, { color: couleur }]}>
          {SIGNE[tendance]} {ecart > 0 ? '+' : ''}{Math.abs(ecart) < 10 ? ecart.toFixed(1) : Math.round(ecart)} kg
        </Discret>
      )}
      {tendance === 'inconnue' && <Discret style={s.ecart}>1re fois</Discret>}
      {tendance === 'stable' && ecart !== null && Math.abs(ecart) < 0.05 && (
        <Discret style={[s.ecart, { color: couleur }]}>= stable</Discret>
      )}

      {onPress !== undefined && (
        <Discret style={s.chevron}>{ouvert ? '▲' : '▼'}</Discret>
      )}
    </Pressable>
  );
}

/**
 * Table des paliers : à gauche le pourcentage du 1RM, au milieu la charge,
 * à droite les répétitions estimées. La zone 70-80 % est surlignée : c'est
 * le compromis volume / intensité.
 */
export function PaliersRM({ rm }: { rm: number }) {
  const lignes = useMemo(
    () => PALIERS.map((p) => ({
      pourcent: p,
      charge: Math.round((rm * p) / 100 / 0.5) * 0.5,
      reps: repsAu(p),
      zone: p >= 70 && p <= 80,
    })),
    [rm],
  );

  return (
    <View style={s.table}>
      <View style={s.entete}>
        <Discret style={[s.col, s.colPct]}>% du 1RM</Discret>
        <Discret style={[s.col, s.colKg]}>Charge</Discret>
        <Discret style={[s.col, s.colRep]}>Répétitions</Discret>
      </View>

      {lignes.map((l) => (
          <View key={l.pourcent} style={[s.ligne, l.zone && s.zone]}>
            <View style={[s.colPct, s.cellePct]}>
              <View style={[s.point, l.zone && { backgroundColor: C.vif }]} />
              <Texte style={{ fontFamily: P.chiffre, fontSize: 15 }}>{l.pourcent} %</Texte>
            </View>
            <Texte style={[s.col, s.colKg, s.valeur, l.zone && { color: C.vif }]}>
              {l.charge % 1 === 0 ? l.charge : l.charge.toFixed(1)} kg
            </Texte>
            <Texte style={[s.col, s.colRep, s.valeur]}>{l.reps}</Texte>
          </View>
      ))}

      <Discret style={s.note}>
        Zone surlignée : 70 à 80 % du 1RM, le compromis volume / intensité.
        Estimation d'Epley, fiable jusqu'à une quinzaine de répétitions.
      </Discret>
    </View>
  );
}

const s = StyleSheet.create({
  disque: {
    width: 62, height: 62, borderRadius: 31, borderWidth: 5,
    backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
  },
  unite: { fontSize: 8.5, letterSpacing: 0.4, marginTop: -2 },
  ecart: { fontSize: 10.5, textAlign: 'center', marginTop: 3, fontVariant: ['tabular-nums'] },
  chevron: { fontSize: 10, textAlign: 'center', marginTop: 1 },

  table: { marginTop: E.s, backgroundColor: C.surface2, borderRadius: R.s, padding: E.s },
  entete: { flexDirection: 'row', paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: C.ligne },
  ligne: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: 'rgba(47,52,61,0.5)',
  },
  zone: { backgroundColor: 'rgba(227,178,60,0.08)', borderRadius: 5 },
  col: { fontSize: 12 },
  colPct: { flex: 1.1 },
  colKg: { flex: 1, textAlign: 'right' },
  colRep: { flex: 1, textAlign: 'right' },
  cellePct: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  point: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.ligne },
  valeur: { fontFamily: P.chiffre, fontSize: 15, fontVariant: ['tabular-nums'] },
  note: { fontSize: 10.5, marginTop: E.s, lineHeight: 15 },
});
