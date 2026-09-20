import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Exercice, SeanceExercice, Serie } from '@/api/types';
import { Bouton, Carte, Champ, Chiffre, Discret, Texte } from './base';
import { ChronoEffort, mmss } from './chronoSerie';
import { Confirmer } from './confirmer';
import { DisqueRM, PaliersRM } from './disqueRM';
import { ModaleExercice } from './modaleExercice';
import { Sparkline } from './sparkline';
import { ChoixMode } from './choixMode';
import { LigneSerie } from './serie';
import { performanceDe, REPS_MAX_POUR_1RM, tempsTotal } from '@/calcul/performance';
import { apercuDerniereFois } from '@/calcul/blocSeance';
import { C, E, N, P, R, T, TOUCHE, nb } from '@/theme';

const serieVide = (ordre: number): Serie => ({
  ordre, reps: null, poids: null, secondes: null, faite: false,
  repsCible: null, poidsCible: null, secondesCible: null,
});


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

  /* L'aperçu de ce que le bouton va appliquer — « 12×25 · 12×27,5 » — vit dans
     `calcul/blocSeance.ts` depuis le 16 septembre 2026. Écrit ici, il ne
     regardait que `reps` et `poids` : en « Tenue », où les séries ne portent
     que des secondes, la liste était vide, l'aperçu valait `''`, et le
     raccourci n'apparaissait JAMAIS — pour un mode entier, sans un signal.
     Dans un `.tsx`, aucun test ne pouvait l'atteindre. */
  const apercu = apercuDerniereFois(derniereFois, nb);

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
                  <Discret style={{ fontSize: T.petit, color: C.vif }}>i</Discret>
                </View>
              </Pressable>
            )}
          </View>
          <Discret style={{ fontSize: T.petit }}>
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
          {/* Le sélecteur vit dans `choixMode.tsx` depuis le 16 septembre 2026 :
              l'éditeur de modèle le partage désormais. Le raccourci « dernière
              fois » reste dans la même rangée, pour passer à la ligne avec les
              modes quand la largeur manque. */}
          <ChoixMode
            mode={mode}
            onChange={(m) => onChange({ ...bloc, mode: m })}
            suite={apercu !== '' ? (
              <Pressable
                onPress={rechargerDerniereFois}
                style={s.appliquer}
                accessibilityLabel="Recharger les valeurs de la dernière séance"
              >
                <Discret style={{ color: C.vif, fontSize: T.petit }} numberOfLines={1}>
                  ↓ {apercu}
                </Discret>
              </Pressable>
            ) : undefined}
          />

          {/* « for time » : un temps global au-dessus du détail des séries.
              À défaut, on récupère le temps déjà saisi sur les séries — c'est
              ainsi que les séances antérieures conservent leur chrono. */}
          {mode === 'chrono' && (
            <View style={s.total}>
              <ChronoEffort
                cible={{ ...cibleBase, serieOrdre: null }}
                secondes={tempsTotal(bloc)}
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
                  <Chiffre taille={N.petit} couleur={C.encre}>{perf.reps}</Chiffre>
                  <Discret style={{ fontSize: T.minuscule }}>RÉPÉTITIONS</Discret>
                </View>
              )}
              {perf.volume > 0 && (
                <View style={s.mesure}>
                  <Chiffre taille={N.petit} couleur={C.encre}>{perf.volume}</Chiffre>
                  <Discret style={{ fontSize: T.minuscule }}>KG SOULEVÉS</Discret>
                </View>
              )}
              {perf.secondes !== null && (
                <View style={s.mesure}>
                  <Chiffre taille={N.petit} couleur={C.encre}>{mmss(perf.secondes)}</Chiffre>
                  <Discret style={{ fontSize: T.minuscule }}>TEMPS</Discret>
                </View>
              )}
            </View>
          )}

          {perf.seriesLongues > 0 && (
            <Discret style={{ fontSize: T.petit, lineHeight: 16 }}>
              {/* LE PLAFOND VIENT DE `performance.ts`, il ne se retape pas —
                  palier 0, 20 septembre 2026. C'est exactement le motif
                  « douze caractères » de la règle 5 : le jour où le plafond
                  bouge, cette phrase continuerait d'annoncer 15 pendant que
                  le calcul écarterait à un autre seuil. `disqueRM.tsx:196`
                  faisait déjà bien, ici non. */}
              {perf.seriesLongues} série{perf.seriesLongues > 1 ? 's' : ''} de plus de
              {' '}{REPS_MAX_POUR_1RM} répétitions : comptée{perf.seriesLongues > 1 ? 's' : ''} dans le volume,
              mais écartée{perf.seriesLongues > 1 ? 's' : ''} du 1RM — au-delà, on mesure
              l'endurance et non la force.
            </Discret>
          )}

          <Pressable onPress={() => setNotesOuvertes(!notesOuvertes)} style={s.replier}>
            <Discret style={{ fontSize: T.petit }}>
              {notesOuvertes ? '▲' : '▼'} Notes
            </Discret>
            {!notesOuvertes && aDesNotes && (
              <View style={s.puce}>
                <Discret style={{ fontSize: T.minuscule, color: C.vif }} numberOfLines={1}>
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
              <Discret style={{ fontSize: T.normal }}>Retirer l'exercice</Discret>
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
  appliquer: {
    paddingHorizontal: E.m, minHeight: 38, borderRadius: R.s, borderWidth: 1,
    borderColor: C.vifBord, alignItems: 'center', justifyContent: 'center',
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
    flex: 1, backgroundColor: C.vifFond, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  pied: { flexDirection: 'row', alignItems: 'center', gap: E.s },
  ajouterSerie: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.ligne, borderRadius: R.s, flex: 1,
  },
});
