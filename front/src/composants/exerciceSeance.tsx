import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Exercice, SeanceExercice, Serie } from '@/api/types';
import { Bouton, Carte, Champ, Chiffre, Discret, Texte } from './base';
import { ChronoEffort, mmss } from './chronoSerie';
import { Confirmer } from './confirmer';
import { DisqueRM, PaliersRM } from './disqueRM';
import { ModaleExercice } from './modaleExercice';
import { Sparkline } from './sparkline';
import { LigneSerie } from './serie';
import { performanceDe } from '@/calcul/performance';
import { C, E, P, R, TOUCHE, nb } from '@/theme';

const MODES = [
  { cle: 'charge' as const, court: 'Charge' },
  { cle: 'iso' as const, court: 'Tenue' },
  { cle: 'chrono' as const, court: 'Chrono' },
];

const serieVide = (ordre: number): Serie => ({
  ordre, reps: null, poids: null, secondes: null, faite: false,
  repsCible: null, poidsCible: null, secondesCible: null,
});

/** « 4 s × 12 rép » -> { series: 4, reps: 12 } */
export function lireFormat(f: string | null): { series: number; reps: number } | null {
  if (!f) return null;
  const m = /(\d+)\s*s\s*[×x]\s*(\d+)\s*r[ée]p/i.exec(f);

  return m ? { series: Number(m[1]), reps: Number(m[2]) } : null;
}

export { rmDesSeries as rmEstime } from '@/calcul/performance';

export function CarteExercice({
  bloc, exercice, poignee, recordAnterieur = null, derniereFois,
  historiqueRm, historiqueVolume, onChange, onSupprimer, onSerieCochee,
}: {
  bloc: SeanceExercice;
  exercice: Exercice | undefined;
  /** poignée de réordonnancement, fournie par la liste */
  poignee?: ReactNode;
  /** meilleur 1RM des séances précédentes, pour situer la progression */
  recordAnterieur?: number | null;
  /** ce qui a été fait la dernière fois sur cet exercice */
  derniereFois?: { reps: number | null; poids: number | null; secondes: number | null }[];
  /** 1RM séance par séance, du plus ancien au plus récent */
  historiqueRm?: number[];
  /** volume séance par séance, seul indicateur valable en série longue */
  historiqueVolume?: number[];
  onChange: (b: SeanceExercice) => void;
  onSupprimer: () => void;
  onSerieCochee: () => void;
}) {
  const [ouvert, setOuvert] = useState(true);
  const [paliers, setPaliers] = useState(false);
  const [aSupprimer, setASupprimer] = useState<number | null>(null);
  const [supprimerExercice, setSupprimerExercice] = useState(false);
  const [fiche, setFiche] = useState(false);
  const [notesOuvertes, setNotesOuvertes] = useState(false);
  const aDesNotes = (bloc.notes ?? '').trim() !== '';
  const mode = bloc.mode ?? exercice?.modeDefaut ?? 'charge';
  const perf = performanceDe(bloc, mode);
  /* Avant l'introduction du temps global, le chrono était stocké sur la
     première série : on le récupère pour ne rien perdre. */
  const tempsHerite = bloc.series.reduce((n, x) => n + (x.secondes ?? 0), 0) || null;
  const rm = perf.rm;
  const visibles = bloc.series;

  /* Ce qui identifie une mesure lancée depuis cette carte. L'IRI accompagne la
     position : réordonner la séance pendant une mesure déplace les positions,
     l'exercice, lui, ne change pas. */
  const cibleBase = {
    blocOrdre: bloc.ordre,
    exerciceIri: typeof bloc.exercice === 'string' ? bloc.exercice : bloc.exercice['@id'],
    libelle: exercice?.nomFr ?? exercice?.nom ?? 'Exercice',
  };
  const faites = visibles.filter((s) => s.faite).length;

  const majSerie = (i: number, s: Serie) =>
    onChange({ ...bloc, series: bloc.series.map((x, j) => (j === i ? s : x)) });

  const ajouterSerie = () =>
    onChange({ ...bloc, series: [...bloc.series, serieVide(bloc.series.length)] });

  const supprimerSerie = (i: number) =>
    onChange({
      ...bloc,
      series: bloc.series.filter((_, j) => j !== i).map((s, j) => ({ ...s, ordre: j })),
    });

  /**
   * Recharge ce qui a été fait la dernière fois : mêmes répétitions, mêmes
   * charges, en objectifs. Utile si on a effacé une ligne par erreur.
   *
   * Le format prescrit du coach ne dit que « 4 séries × 12 » — jamais la
   * charge. Il ne sert donc que la toute première fois, et la reprise
   * automatique s'en charge déjà à l'ajout de l'exercice.
   */
  const rechargerDerniereFois = () => {
    if (derniereFois === undefined || derniereFois.length === 0) return;
    onChange({
      ...bloc,
      series: derniereFois.map((x, i) => ({
        ...serieVide(i),
        repsCible: x.reps, poidsCible: x.poids, secondesCible: x.secondes,
      })),
    });
  };

  /** Aperçu de ce que le bouton va appliquer : « 12×25 · 12×27,5 ». */
  const apercuDerniereFois = (derniereFois ?? [])
    .filter((x) => x.reps !== null || x.poids !== null)
    .map((x) => {
      if (x.reps !== null && x.poids !== null) return `${x.reps}×${nb(x.poids)}`;
      if (x.reps !== null) return `${x.reps} rép`;

      return x.poids !== null ? `${nb(x.poids)} kg` : '';
    })
    .filter(Boolean)
    .slice(0, 4)
    .join(' · ');

  return (
    <Carte style={s.carte}>
      <Pressable onPress={() => setOuvert(!ouvert)} style={s.tete}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Texte style={{ fontFamily: P.fort, flexShrink: 1 }} numberOfLines={1}>
              {exercice?.nomFr ?? exercice?.nom ?? 'Exercice'}
            </Texte>
            {exercice && (
              <Pressable
                onPress={() => setFiche(true)}
                hitSlop={8}
                accessibilityLabel="Comment faire cet exercice"
              >
                <View style={s.info}>
                  <Discret style={{ fontSize: 11, color: C.vif }}>i</Discret>
                </View>
              </Pressable>
            )}
          </View>
          <Discret style={{ fontSize: 12 }}>
            {faites}/{visibles.length} série{visibles.length > 1 ? 's' : ''}
            {exercice?.formatPrescrit ? ` · ${exercice.formatPrescrit}` : ''}
          </Discret>
        </View>
        {rm !== null && (
          <DisqueRM
            valeur={rm}
            precedent={recordAnterieur}
            onPress={() => setPaliers(!paliers)}
            ouvert={paliers}
          />
        )}
        <Discret style={{ marginLeft: E.s }}>{ouvert ? '▲' : '▼'}</Discret>
      </Pressable>

      {poignee !== undefined && <View style={s.poignee}>{poignee}</View>}

      {/* table des paliers, dépliée au tap sur le disque */}
      {rm !== null && paliers && <PaliersRM rm={rm} />}

      {ouvert && (
        <View style={{ gap: E.s }}>
          <View style={s.modes}>
            {MODES.map((m) => (
              <Pressable
                key={m.cle}
                /* Plus rien n'empêche la bascule : la mesure vit dans
                   `etatMesure` et continue de tourner, visible dans le bandeau
                   en haut de l'écran. */
                onPress={() => onChange({ ...bloc, mode: m.cle })}
                style={[s.mode, mode === m.cle && s.modeActif]}
              >
                <Discret style={mode === m.cle ? { color: C.encre } : undefined}>{m.court}</Discret>
              </Pressable>
            ))}
            {apercuDerniereFois !== '' && (
              <Pressable
                onPress={rechargerDerniereFois}
                style={s.appliquer}
                accessibilityLabel="Recharger les valeurs de la dernière séance"
              >
                <Discret style={{ color: C.vif, fontSize: 12 }} numberOfLines={1}>
                  ↓ {apercuDerniereFois}
                </Discret>
              </Pressable>
            )}
          </View>

          {/* « for time » : un temps global au-dessus du détail des séries.
              À défaut, on récupère le temps déjà saisi sur les séries — c'est
              ainsi que les séances antérieures conservent leur chrono. */}
          {mode === 'chrono' && (
            <View style={s.total}>
              <ChronoEffort
                cible={{ ...cibleBase, serieOrdre: null }}
                secondes={bloc.secondesTotal ?? tempsHerite}
                onEffacer={() => onChange({ ...bloc, secondesTotal: null })}
                etiquette="Temps total de l'exercice"
              />
            </View>
          )}

          {visibles.map((serie, i) => (
            <LigneSerie
              key={i}
              serie={serie}
              mode={mode}
              index={i}
              cible={{ ...cibleBase, serieOrdre: serie.ordre }}
              onChange={(s2) => majSerie(i, s2)}
              onSupprimer={() => setASupprimer(i)}
              onCochee={onSerieCochee}
            />
          ))}

          {/* La courbe dit la forme de la progression ; le disque, sa tendance.
              En série longue le 1RM n'a pas de sens : c'est le volume qui parle. */}
          {(historiqueRm ?? []).length > 1 && mode === 'charge' && (
            <Sparkline valeurs={historiqueRm!} unite="kg" libelle="Progression du 1RM" />
          )}
          {(historiqueVolume ?? []).length > 1 && mode !== 'charge' && (
            <Sparkline valeurs={historiqueVolume!} unite="kg" libelle="Volume soulevé" />
          )}

          {/* Ce que l'effort a vraiment produit, quand il y a de quoi le dire. */}
          {(perf.volume > 0 || perf.seriesLongues > 0) && (
            <View style={s.bilan}>
              {perf.reps > 0 && (
                <View style={s.mesure}>
                  <Chiffre taille={17} couleur={C.encre}>{perf.reps}</Chiffre>
                  <Discret style={{ fontSize: 9.5 }}>RÉPÉTITIONS</Discret>
                </View>
              )}
              {perf.volume > 0 && (
                <View style={s.mesure}>
                  <Chiffre taille={17} couleur={C.encre}>{perf.volume}</Chiffre>
                  <Discret style={{ fontSize: 9.5 }}>KG SOULEVÉS</Discret>
                </View>
              )}
              {perf.secondes !== null && (
                <View style={s.mesure}>
                  <Chiffre taille={17} couleur={C.encre}>{mmss(perf.secondes)}</Chiffre>
                  <Discret style={{ fontSize: 9.5 }}>TEMPS</Discret>
                </View>
              )}
            </View>
          )}

          {perf.seriesLongues > 0 && (
            <Discret style={{ fontSize: 11, lineHeight: 16 }}>
              {perf.seriesLongues} série{perf.seriesLongues > 1 ? 's' : ''} de plus de
              15 répétitions : comptée{perf.seriesLongues > 1 ? 's' : ''} dans le volume,
              mais écartée{perf.seriesLongues > 1 ? 's' : ''} du 1RM — au-delà, on mesure
              l'endurance et non la force.
            </Discret>
          )}

          <Pressable onPress={() => setNotesOuvertes(!notesOuvertes)} style={s.replier}>
            <Discret style={{ fontSize: 12 }}>
              {notesOuvertes ? '▲' : '▼'} Notes
            </Discret>
            {!notesOuvertes && aDesNotes && (
              <View style={s.puce}>
                <Discret style={{ fontSize: 10.5, color: C.vif }} numberOfLines={1}>
                  ✎ {bloc.notes}
                </Discret>
              </View>
            )}
          </Pressable>

          {notesOuvertes && (
            <Champ
              valeur={bloc.notes ?? ''}
              onChange={(v) => onChange({ ...bloc, notes: v || null })}
              placeholder="cramé, augmenter la semaine prochaine…"
            />
          )}

          <View style={s.pied}>
            <Bouton variante="discret" onPress={ajouterSerie} style={s.ajouterSerie}>
              + Série
            </Bouton>
            <Bouton variante="discret" onPress={() => setSupprimerExercice(true)}>
              <Discret style={{ fontSize: 12.5 }}>Retirer l'exercice</Discret>
            </Bouton>
          </View>
        </View>
      )}

      <ModaleExercice
        exercice={exercice}
        visible={fiche}
        onFermer={() => setFiche(false)}
      />

      <Confirmer
        visible={aSupprimer !== null}
        titre="Supprimer cette série ?"
        message={`Série ${(aSupprimer ?? 0) + 1} de ${exercice?.nom ?? 'cet exercice'}. Cette action est définitive.`}
        onConfirmer={() => { if (aSupprimer !== null) supprimerSerie(aSupprimer); setASupprimer(null); }}
        onAnnuler={() => setASupprimer(null)}
      />

      <Confirmer
        visible={supprimerExercice}
        titre="Retirer cet exercice ?"
        message={`${exercice?.nom ?? 'Cet exercice'} et ses ${visibles.length} série(s) seront retirés de la séance.`}
        libelle="Retirer"
        onConfirmer={() => { setSupprimerExercice(false); onSupprimer(); }}
        onAnnuler={() => setSupprimerExercice(false)}
      />
    </Carte>
  );
}

const s = StyleSheet.create({
  carte: { gap: E.s },
  tete: { flexDirection: 'row', alignItems: 'center', minHeight: TOUCHE },
  info: {
    width: 19, height: 19, borderRadius: 10, borderWidth: 1, borderColor: C.vif,
    alignItems: 'center', justifyContent: 'center',
  },
  modes: { flexDirection: 'row', gap: 4, alignItems: 'center', flexWrap: 'wrap' },
  mode: {
    paddingHorizontal: E.m, minHeight: 38, borderRadius: R.s, borderWidth: 1,
    borderColor: C.ligne, backgroundColor: C.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  modeActif: { backgroundColor: C.ligne },
  appliquer: {
    paddingHorizontal: E.m, minHeight: 38, borderRadius: R.s, borderWidth: 1,
    borderColor: 'rgba(227,178,60,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  total: {
    backgroundColor: C.surface2, borderRadius: R.s, padding: E.s,
    borderWidth: 1, borderColor: C.ligne,
  },
  bilan: {
    flexDirection: 'row', gap: E.s, backgroundColor: C.surface2,
    borderRadius: R.s, padding: E.s,
  },
  mesure: { flex: 1, alignItems: 'center' },
  poignee: { position: 'absolute', top: 4, right: 4, opacity: 0.75 },
  replier: { flexDirection: 'row', alignItems: 'center', gap: E.s, minHeight: 36 },
  puce: {
    flex: 1, backgroundColor: 'rgba(227,178,60,0.12)', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  pied: { flexDirection: 'row', alignItems: 'center', gap: E.s },
  ajouterSerie: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.ligne, borderRadius: R.s, flex: 1,
  },
});
