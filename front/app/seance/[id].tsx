import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  useDerniereFois, useEnregistrerSeance, useExercices, useHistorique, useModeles,
  useRecordsAnterieurs, useSeance, useSeanceVersModele, useSupprimerSeance,
} from '@/api/hooks';
import type { Exercice, Seance, SeanceExercice } from '@/api/types';
import { Bouton, Carte, Chargement, Discret, Erreur, Texte } from '@/composants/base';
import { ChoixDansListe } from '@/composants/choixAliment';
import { Confirmer } from '@/composants/confirmer';
import { ChronoRepos } from '@/composants/chrono';
import { ModaleCalculateurRM } from '@/composants/calculateurRM';
import { BandeauMesure } from '@/composants/bandeauMesure';
import { abonnerMesure, appliquerResultats, prendreResultats } from '@/composants/etatMesure';
import { CarteExercice, lireFormat } from '@/composants/exerciceSeance';
import { ListeDeplacable } from '@/composants/listeDeplacable';
import { libelleEtat, useSauvegardeAuto } from '@/composants/sauvegardeAuto';
import { C, E, P, R, T, TOUCHE } from '@/theme';

const TYPES = ['Push', 'Pull', 'Legs'] as const;
const COULEUR: Record<string, string> = { Push: C.prot, Pull: C.fec, Legs: C.leg };

const aujourdhui = () => new Date().toISOString().slice(0, 10);
const iri = (v: Exercice | string) => (typeof v === 'string' ? v : v['@id']);
const idDe = (v: Exercice | string) =>
  typeof v === 'string' ? Number(v.split('/').pop()) : v.id;

/**
 * Recopie le seul identifiant qui compte : celui de la séance.
 *
 * Sans lui, l'enregistrement suivant repartirait sur un POST et créerait une
 * deuxième séance. On ne remplace pas l'état par la réponse : ce qui a été
 * tapé pendant les deux secondes et demie d'attente serait perdu.
 *
 * Les identifiants des exercices et des séries ne sont PAS recopiés, et c'est
 * volontaire. Ils ne figurent que dans le groupe `seance:lire` — le front ne
 * les renvoie jamais, l'API remplace la collection entière à chaque écriture.
 * Ils ne servaient donc qu'à fabriquer les clés de liste, où les greffer
 * faisait passer une ligne de « n0 » à « 12 » : React la remontait, et le
 * champ en cours de saisie perdait le focus au beau milieu d'une frappe.
 */
const avecIdentifiantSeance = (locale: Seance, distante: Seance): Seance =>
  (locale.id === undefined ? { ...locale, id: distante.id } : locale);

export default function DetailSeance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const nouvelle = id === 'nouvelle';
  const router = useRouter();

  const seanceApi = useSeance(nouvelle ? undefined : Number(id));
  const exercices = useExercices();
  const modeles = useModeles();
  const enregistrer = useEnregistrerSeance();
  const supprimer = useSupprimerSeance();
  const versModele = useSeanceVersModele();

  const [seance, setSeance] = useState<Seance | null>(null);
  const [choixOuvert, setChoixOuvert] = useState(false);
  const [choixModele, setChoixModele] = useState(false);
  const [relance, setRelance] = useState(0);
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);
  const [modeleCree, setModeleCree] = useState(false);
  const [calculateur, setCalculateur] = useState(false);
  const { records } = useRecordsAnterieurs(seance?.date);
  const { parExercice: derniereFois } = useDerniereFois(seance?.date);
  const historique = useHistorique();

  /* La séance s'enregistre toute seule deux secondes et demie après la
     dernière modification. Tant qu'elle n'a pas d'identifiant, on ne
     déclenche rien : c'est le premier enregistrement qui la crée. */
  const { etat, motif } = useSauvegardeAuto(
    seance,
    async (s) => {
      const enregistree = await enregistrer.mutateAsync(s);

      /* On greffe l'identifiant sur l'état LOCAL, sans naviguer.
         Auparavant on remplaçait la route par /seance/{id} : l'écran se
         remontait et relisait la séance depuis l'API. Tout ce qui avait été
         saisi pendant les deux secondes et demie d'attente — une série
         ajoutée, une charge tapée — était jeté avec l'ancien état, sans que
         rien ne le signale. C'est ce qui donnait l'impression de changer de
         page et de retrouver l'exercice vidé de ses séries. */
      setSeance((courante) => (courante === null
        ? enregistree
        : avecIdentifiantSeance(courante, enregistree)));
    },
    { actif: seance !== null && seance.exercices.length > 0 },
  );

  /* Le chronomètre d'effort ne connaît pas la séance : il dépose le temps
     mesuré, et c'est ici — seul endroit qui détient l'état — qu'on l'écrit.
     Ce détour est ce qui permet à une mesure de survivre au changement de
     mode, qui démonte le composant où elle s'affichait. */
  useEffect(() => abonnerMesure(() => {
    const resultats = prendreResultats();
    if (resultats.length === 0) return;

    setSeance((courante) => (courante === null
      ? courante
      : { ...courante, exercices: appliquerResultats(courante.exercices, resultats) }));
  }), []);

  useEffect(() => {
    if (nouvelle && seance === null) {
      setSeance({ date: aujourdhui(), type: null, exercices: [] });
    } else if (!nouvelle && seanceApi.data && seance === null) {
      setSeance(seanceApi.data);
    }
  }, [nouvelle, seanceApi.data, seance]);

  const parId = useMemo(() => {
    const m = new Map<number, Exercice>();
    for (const e of exercices.data ?? []) m.set(e.id, e);

    return m;
  }, [exercices.data]);

  if (exercices.isLoading || (!nouvelle && seanceApi.isLoading)) return <Chargement />;
  if (!nouvelle && seanceApi.isError) {
    return <Erreur message={seanceApi.error.message} onReessayer={() => void seanceApi.refetch()} />;
  }
  if (!seance) return <Chargement />;

  /* Un exercice « for time » n'a qu'un temps total : ses lignes
     supplémentaires ne comptent pas comme des séries. */
  const avancement = seance.exercices.reduce(
    (acc, b) => {
      const mode = b.mode ?? parId.get(idDe(b.exercice))?.modeDefaut ?? 'charge';
      const series = mode === 'chrono' ? b.series.slice(0, 1) : b.series;

      return {
        faites: acc.faites + series.filter((s) => s.faite).length,
        total: acc.total + series.length,
      };
    },
    { faites: 0, total: 0 },
  );

  const ajouterExercice = (idExercice: number) => {
    const ex = parId.get(idExercice);
    if (!ex) return;

    /* On reprend ce qui a été FAIT la dernière fois : mêmes charges, mêmes
       répétitions. C'est le point de départ utile — le format prescrit ne
       sert que la première fois, faute de mieux. */
    const passe = derniereFois.get(idExercice);
    const f = lireFormat(ex.formatPrescrit);

    const series = passe !== undefined
      ? passe.map((x, i) => ({
          ordre: i, reps: null, poids: null, secondes: null, faite: false,
          repsCible: x.reps, poidsCible: x.poids, secondesCible: x.secondes,
        }))
      : Array.from({ length: f?.series ?? 3 }, (_, i) => ({
          ordre: i, reps: null, poids: null, secondes: null, faite: false,
          repsCible: f?.reps ?? null, poidsCible: null, secondesCible: null,
        }));
    const bloc: SeanceExercice = {
      exercice: ex['@id'], ordre: seance.exercices.length,
      mode: ex.modeDefaut, notes: null, secondesTotal: null, series,
    };
    setSeance({ ...seance, exercices: [...seance.exercices, bloc] });
  };

  /* Partir d'un modèle : on copie ses exercices, ses cibles deviennent
     les objectifs affichés en filigrane pendant la saisie. */
  const partirDuModele = (idModele: number) => {
    const m = (modeles.data ?? []).find((x) => x.id === idModele);
    if (!m) return;
    setSeance({
      ...seance,
      type: m.type ?? seance.type,
      exercices: m.exercices.map((me, i) => ({
        exercice: iri(me.exercice as Exercice | string),
        ordre: i,
        mode: me.mode,
        notes: null,
        secondesTotal: null,
        series: me.series.map((ms, j) => ({
          ordre: j, reps: null, poids: null, secondes: null, faite: false,
          repsCible: ms.repsCible, poidsCible: ms.poidsCible, secondesCible: ms.secondesCible,
        })),
      })),
    });
  };

  /* Même règle que la sauvegarde automatique : on ne remplace pas la route.
     Un remontage jetterait la saisie en cours. */
  const enregistrerSeance = () => {
    enregistrer.mutate(seance, {
      onSuccess: (s) => {
        setSeance((courante) => (courante === null ? s : avecIdentifiantSeance(courante, s)));
      },
    });
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Une mesure peut tourner alors que son champ n'est plus affiché :
          le bandeau la garde sous les yeux, où qu'on soit dans la séance. */}
      <BandeauMesure />

      {/* La liste occupe la place restante, la barre de chrono garde la sienne
          en bas. La contrainte vit ici et non dans ListeDeplacable : ce
          composant sert aussi aux modèles, où rien ne le suit. */}
      <View style={{ flex: 1 }}>
      <ListeDeplacable
        elements={seance.exercices}
        cle={(b, i) => String(b.id ?? `n${i}`)}
        etiquette={(b) => parId.get(idDe(b.exercice))?.nomFr
          ?? parId.get(idDe(b.exercice))?.nom ?? 'cet exercice'}
        onReordonner={(liste) => setSeance({
          ...seance, exercices: liste.map((x, j) => ({ ...x, ordre: j })),
        })}
        entete={(
          <View style={{ gap: E.s, marginBottom: E.s }}>
        {/* ---- type et avancement ---- */}
            <Carte style={{ gap: E.m }}>
              <View style={s.types}>
                {TYPES.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setSeance({ ...seance, type: t })}
                    style={[
                      s.type,
                      seance.type === t && { backgroundColor: COULEUR[t], borderColor: COULEUR[t] },
                    ]}
                  >
                    <Texte style={[
                      s.typeTexte,
                      seance.type === t && { color: C.fond },
                    ]}>{t}</Texte>
                  </Pressable>
                ))}
              </View>

              {etat !== 'repos' && (
                <View style={s.etat}>
                  <View style={[s.point, {
                    backgroundColor: etat === 'enregistre' ? C.ok
                      : etat === 'erreur' ? C.erreur : C.vif,
                  }]} />
                  <Discret style={{ fontSize: T.petit }}>{libelleEtat(etat)}</Discret>
                </View>
              )}

              {/* Le motif, en clair. Sans lui, une seance qui ne s'enregistre
                  pas se perd en silence et rien n'indique quoi corriger. */}
              {etat === 'erreur' && motif !== null && (
                <Discret style={{ color: C.erreur, fontSize: T.petit, lineHeight: 16 }}>
                  {motif}
                </Discret>
              )}

              {avancement.total > 0 && (
                <View>
                  <View style={s.jauge}>
                    <View style={[s.jaugeRemplie, {
                      width: `${Math.round((avancement.faites / avancement.total) * 100)}%`,
                      backgroundColor: avancement.faites === avancement.total ? C.vif : C.ok,
                    }]} />
                  </View>
                  <Discret style={{ fontSize: T.petit, marginTop: 5 }}>
                    {avancement.faites}/{avancement.total} séries
                  </Discret>
                </View>
              )}

              {seance.exercices.length === 0 && (modeles.data ?? []).length > 0 && (
                <Bouton variante="contour" onPress={() => setChoixModele(true)}>
                  ▶ Partir d'un modèle
                </Bouton>
              )}
            </Carte>
          </View>
        )}
        pied={(
          <View style={{ gap: E.s, marginTop: E.s }}>
        <Bouton variante="discret" onPress={() => setChoixOuvert(true)} style={s.ajouter}>
              + Ajouter un exercice
            </Bouton>

            {seance.exercices.length > 0 && (
              <Bouton
                variante="contour"
                onPress={() => versModele.mutate(seance, { onSuccess: () => setModeleCree(true) })}
                desactive={versModele.isPending}
                style={{ marginTop: E.m }}
              >
                {versModele.isPending ? 'Création…' : '★ Enregistrer comme modèle'}
              </Bouton>
            )}

            {modeleCree && (
              <Discret style={{ color: C.ok, marginTop: E.s, textAlign: 'center' }}>
                Modèle créé. Tu le retrouves dans l'onglet Modèles.
              </Discret>
            )}
            {versModele.isError && (
              <Discret style={{ color: C.erreur, marginTop: E.s }}>{versModele.error.message}</Discret>
            )}

            {etat === 'erreur' && (
              <Bouton onPress={enregistrerSeance} style={{ marginTop: E.m }}>
                Réessayer l'enregistrement
              </Bouton>
            )}

            {!nouvelle && seance.id !== undefined && (
              <Bouton
                variante="discret"
                onPress={() => setConfirmerSuppression(true)}
                style={{ marginTop: E.l }}
              >
                <Discret style={{ color: C.erreur }}>Supprimer la séance</Discret>
              </Bouton>
            )}
          </View>
        )}
        rendu={(bloc, i, poignee) => (
          <CarteExercice
            bloc={bloc}
            poignee={poignee}
            exercice={parId.get(idDe(bloc.exercice))}
            recordAnterieur={records.get(idDe(bloc.exercice)) ?? null}
            derniereFois={derniereFois.get(idDe(bloc.exercice))}
            historiqueRm={historique.rm.get(idDe(bloc.exercice))}
            historiqueVolume={historique.volume.get(idDe(bloc.exercice))}
            onChange={(b) => setSeance({
              ...seance, exercices: seance.exercices.map((x, j) => (j === i ? b : x)),
            })}
            onSupprimer={() => setSeance({
              ...seance,
              exercices: seance.exercices.filter((_, j) => j !== i).map((x, j) => ({ ...x, ordre: j })),
            })}
            onSerieCochee={() => setRelance((r) => r + 1)}
          />
        )}
      />
      </View>

      <ChronoRepos relance={relance} onCalculateur={() => setCalculateur(true)} />

      <ModaleCalculateurRM
        visible={calculateur}
        nomExercice={seance.type ?? 'Séance'}
        rmConnu={null}
        onFermer={() => setCalculateur(false)}
      />

      <ChoixDansListe
        visible={choixOuvert}
        titre="Ajouter un exercice"
        elements={(exercices.data ?? [])
          .filter((e) => seance.type === null || e.groupes.length === 0 || e.groupes.includes(seance.type))
          .map((e) => ({
            id: e.id, nom: e.nom, detail: e.formatPrescrit ?? '',
            couleur: COULEUR[e.groupes[0] ?? ''] ?? C.ligne,
          }))}
        onChoisir={ajouterExercice}
        onFermer={() => setChoixOuvert(false)}
      />

      <Confirmer
        visible={confirmerSuppression}
        titre="Supprimer cette séance ?"
        message={`${seance.type ?? 'Séance'} du ${seance.date.slice(0, 10)} · `
          + `${avancement.total} série(s). Cette action est définitive.`}
        onConfirmer={() => {
          setConfirmerSuppression(false);
          supprimer.mutate(seance.id!, { onSuccess: () => router.back() });
        }}
        onAnnuler={() => setConfirmerSuppression(false)}
      />

      <ChoixDansListe
        visible={choixModele}
        titre="Partir d'un modèle"
        elements={(modeles.data ?? []).map((m) => ({
          id: m.id!, nom: m.nom ?? m.type ?? 'Modèle',
          detail: `${m.exercices.length} exercice${m.exercices.length > 1 ? 's' : ''}`,
          couleur: COULEUR[m.type ?? ''] ?? C.ligne,
        }))}
        onChoisir={partirDuModele}
        onFermer={() => setChoixModele(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  types: { flexDirection: 'row', gap: E.s },
  type: {
    flex: 1, minHeight: TOUCHE, borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
    backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
  },
  typeTexte: { fontFamily: P.chiffre, fontSize: T.grand, textTransform: 'uppercase', color: C.attenue },
  etat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  point: { width: 7, height: 7, borderRadius: 4 },
  jauge: { height: 6, backgroundColor: C.surface2, borderRadius: 99, overflow: 'hidden' },
  jaugeRemplie: { height: '100%', borderRadius: 99 },
  ajouter: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.ligne,
    borderRadius: R.m, minHeight: TOUCHE + 4,
  },
});
