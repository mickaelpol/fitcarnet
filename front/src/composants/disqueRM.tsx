import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  paliersPour, pasConseille, REPS_MAX_POUR_1RM, type LignePalier,
} from '@/calcul/performance';
import { Chiffre, Discret, Texte } from './base';
import { C, E, N, P, R, T, nb } from '@/theme';

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
  hausse: C.ok,    // vert : tu progresses
  stable: C.vif,    // jaune : tu tiens
  baisse: C.erreur,    // rouge : tu recules
  inconnue: C.discret,  // gris : pas de point de comparaison
};

const SIGNE: Record<Tendance, string> = {
  hausse: '▲', stable: '=', baisse: '▼', inconnue: '',
};

/* La table des paliers vient de `calcul/performance.ts`, et elle n'est plus
   ici. Elle y était recopiée, VOLONTAIREMENT différente de celle du
   calculateur — 90 à 40 % contre 100 à 50 % —, et le commentaire qui
   l'accompagnait notait déjà le défaut sans l'avoir corrigé : « à 40 %,
   `repsAu` annonce 45 répétitions alors que `REPS_MAX_POUR_1RM` vaut 15 ».
   Deux tables pour la même question, et celle-ci mentait. Fusionnées dans le
   module de référence le 15 septembre 2026 (règle 5, puis règle 7). */

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
        <Chiffre taille={N.petit} couleur={C.encre}>{
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

/** « 85 % » ou, quand l'arrondi les confond, « 85–82,5 % ». */
const libellePourcents = (l: LignePalier): string => {
  const premier = l.pourcents[0];
  const dernier = l.pourcents[l.pourcents.length - 1];

  /* `paliersPour` ne produit jamais de ligne sans pourcentage — elles naissent
     du regroupement d'au moins un palier. Si une telle ligne arrivait malgré tout,
     on affiche le même tiret que `libelleReps` : « on ne sait pas ». Inventer
     « 0 % » désignerait une charge qui n'a jamais été calculée
     (M13, 18 septembre 2026). */
  if (premier === undefined || dernier === undefined) return '—';

  return premier === dernier ? `${nb(premier)} %` : `${nb(premier)}–${nb(dernier)} %`;
};

/**
 * « 5 », « 5–6 », ou un tiret cadratin.
 *
 * Le tiret n'est pas un zéro : il dit « on ne sait pas ». Sous 70 % du
 * maximum, Epley sortirait de son domaine, et un chiffre faux est pire qu'un
 * refus de répondre.
 */
const libelleReps = (l: LignePalier): string => {
  if (l.reps === null) return '—';

  return l.reps.min === l.reps.max ? String(l.reps.min) : `${l.reps.min}–${l.reps.max}`;
};

function LignePaliers({ ligne, travail }: { ligne: LignePalier; travail: boolean }) {
  return (
    <View style={s.ligne}>
      <View style={[s.colPct, s.cellePct]}>
        <View style={[s.point, travail && { backgroundColor: C.vif }]} />
        <Texte style={s.valeur}>{libellePourcents(ligne)}</Texte>
      </View>
      <Texte style={[s.col, s.colKg, s.valeur, travail && { color: C.vif }]}>
        {nb(ligne.charge)} kg
      </Texte>
      <Texte
        style={[
          s.col, s.colRep, s.valeur,
          ligne.reps === null && { color: C.discret },
        ]}
      >
        {libelleReps(ligne)}
      </Texte>
    </View>
  );
}

/**
 * LA table des paliers, telle qu'elle s'affiche — ici et dans le calculateur.
 *
 * Les deux écrans en rendaient chacun une, à partir de deux tables de
 * pourcentages différentes. Elles ont divergé, évidemment. Une seule table,
 * un seul rendu, depuis le 15 septembre 2026.
 *
 * Deux sections, et c'est le cœur du sujet : la zone de progression porte des
 * répétitions parce qu'elles sont justes, l'échauffement n'en porte pas parce
 * qu'elles seraient fausses.
 */
export function TablePaliers({ lignes }: { lignes: LignePalier[] }) {
  const travail = lignes.filter((l) => l.nature === 'travail');
  const echauffement = lignes.filter((l) => l.nature === 'echauffement');
  const confondus = lignes.some((l) => l.pourcents.length > 1);

  return (
    <View style={s.table}>
      <View style={s.entete}>
        <Discret style={[s.col, s.colPct]}>% du 1RM</Discret>
        <Discret style={[s.col, s.colKg]}>Charge</Discret>
        <Discret style={[s.col, s.colRep]}>Répétitions</Discret>
      </View>

      {travail.length > 0 && (
        <>
          <Discret style={s.section}>Zone de progression · 70 à 90 %</Discret>
          <View style={s.bloc}>
            {travail.map((l) => (
              <LignePaliers key={l.pourcents[0]} ligne={l} travail />
            ))}
          </View>
        </>
      )}

      {echauffement.length > 0 && (
        <>
          <Discret style={s.section}>Échauffement</Discret>
          {echauffement.map((l) => (
            <LignePaliers key={l.pourcents[0]} ligne={l} travail={false} />
          ))}
        </>
      )}

      <Discret style={s.note}>
        Sous 70 % du maximum, la charge est indiquée mais pas les répétitions :
        l'estimation d'Epley dépasserait {REPS_MAX_POUR_1RM} répétitions, où
        elle ne veut plus rien dire.
        {confondus
          ? ' Un intervalle de pourcentages signale des paliers que l\'arrondi confond : à cette charge, ils sont le même geste.'
          : ''}
      </Discret>
    </View>
  );
}

/** La table dépliée sous le disque, sur la carte d'exercice. */
export function PaliersRM({ rm, pas }: { rm: number; pas?: number }) {
  const effectif = pas ?? pasConseille(rm);
  const lignes = useMemo(() => paliersPour(rm, effectif), [rm, effectif]);

  return <TablePaliers lignes={lignes} />;
}

const s = StyleSheet.create({
  disque: {
    width: 62, height: 62, borderRadius: 31, borderWidth: 5,
    backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
  },
  unite: { fontSize: T.minuscule, letterSpacing: 0.4, marginTop: -2 },
  ecart: { fontSize: T.minuscule, textAlign: 'center', marginTop: 3, fontVariant: ['tabular-nums'] },
  chevron: { fontSize: T.minuscule, textAlign: 'center', marginTop: 1 },

  table: { marginTop: E.s, backgroundColor: C.surface2, borderRadius: R.s, padding: E.s },
  entete: { flexDirection: 'row', paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: C.ligne },
  ligne: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: C.ligneVoile,
  },
  bloc: { backgroundColor: C.vifVoile, borderRadius: R.s, paddingHorizontal: 6 },
  section: {
    fontSize: T.minuscule, letterSpacing: 0.6, textTransform: 'uppercase',
    marginTop: E.s, marginBottom: 2,
  },
  col: { fontSize: T.petit },
  colPct: { flex: 1.3 },
  colKg: { flex: 1, textAlign: 'right' },
  colRep: { flex: 1, textAlign: 'right' },
  cellePct: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  point: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.ligne },
  valeur: { fontFamily: P.chiffre, fontSize: T.moyen, fontVariant: ['tabular-nums'] },
  note: { fontSize: T.minuscule, marginTop: E.s, lineHeight: 15 },
});
