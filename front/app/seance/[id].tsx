import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  useDerniereFois, useExercices, useHistorique, useModeles,
  useRecordsAnterieurs, useSeanceVersModele, useSupprimerSeance,
} from '@/api/hooks';
import { TYPES_SEANCE, couleurDuType } from '@/calcul/typesSeance';
import type { Exercice } from '@/api/types';
import { avancementDe, blocDepuisExercice, blocsDepuisModele } from '@/calcul/blocSeance';
import { Bouton, Carte, Chargement, Discret, Erreur, Texte } from '@/composants/base';
import { ChoixDansListe } from '@/composants/choixAliment';
import { Confirmer } from '@/composants/confirmer';
import { ChronoRepos } from '@/composants/chrono';
import { ModaleCalculateurRM } from '@/composants/calculateurRM';
import { BandeauMesure } from '@/composants/bandeauMesure';
import { lireFormat } from '@/calcul/blocSeance';
import { CarteExercice } from '@/composants/exerciceSeance';
import { ListeDeplacable } from '@/composants/listeDeplacable';
import { libelleEtat } from '@/composants/sauvegardeAuto';
import { useSeanceEditable } from '@/composants/useSeanceEditable';
import { C, E, P, R, T, TOUCHE } from '@/theme';
import { idDe } from '@/api/types';


export default function DetailSeance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  /* L'état de la séance, sa sauvegarde automatique et les mesures déposées
     par le chronomètre sont partis dans ce hook le 15 septembre 2026, et la
     logique PURE qui les accompagnait dans `calcul/blocSeance.ts` — rang 12
     du lot 6 de l'audit. Trois règles métier vivaient en clair ici, où aucun
     test ne pouvait les atteindre : `tsconfig.tests.json` n'inclut que
     `src/`, donc un test posé dans `app/` n'est jamais exécuté, sans le
     moindre signal. Elles sont désormais éprouvées dans blocSeance.test.ts. */
  const {
    seance, setSeance, nouvelle, seanceApi, etat, motif, enregistrerMaintenant,
  } = useSeanceEditable(id);

  const exercices = useExercices();
  const modeles = useModeles();
  const supprimer = useSupprimerSeance();
  const versModele = useSeanceVersModele();

  const [choixOuvert, setChoixOuvert] = useState(false);
  const [choixModele, setChoixModele] = useState(false);
  const [relance, setRelance] = useState(0);
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);
  const [modeleCree, setModeleCree] = useState(false);
  const [calculateur, setCalculateur] = useState(false);
  const { records } = useRecordsAnterieurs(seance?.date);
  const { parExercice: derniereFois } = useDerniereFois(seance?.date);
  const historique = useHistorique();

  /* MEMOISE, PARCE QUE C'ETAIT ECRIT DANS LE JSX.
     Ce filtrage porte sur les 1338 exercices du catalogue. Pose directement
     dans les attributs de `ChoixDansListe`, il se rejouait a chaque rendu —
     donc a chaque caractere tape, et meme modale fermee. La liste elle-meme
     est virtualisee, ce n'etait donc pas un gel visible : juste 1338
     iterations offertes par frappe. */
  const elementsExercices = useMemo(
    () => (exercices.data ?? [])
      .filter((e) => seance === null || seance.type === null
        || e.groupes.length === 0 || e.groupes.includes(seance.type))
      .map((e) => ({
        /* `nomFr ?? nom`, ET C'ETAIT LE SEUL ENDROIT A NE PAS LE FAIRE.
           L'ecran de modele, la fiche, les blocs d'une seance et l'ecran de
           fusion affichaient tous le nom francais ; ce selecteur-ci, non. Il
           montrait « barbell incline bench press » la ou tout le reste de
           l'application dit « Developpe incline a la barre » — et on cherchait
           l'exercice sous un nom que plus personne n'employait ailleurs. */
        id: e.id, nom: e.nomFr ?? e.nom, detail: e.formatPrescrit ?? '',
        couleur: couleurDuType(e.groupes[0]),
        /* Le muscle visé, tel que la base l'écrit. Sa présence suffit à faire
           apparaître la rangée de vignettes dans le sélecteur — un aliment,
           lui, n'en porte pas. `?? null` et non `undefined` : un exercice sans
           muscle renseigné doit rester filtrable sous « Autre ». */
        muscle: e.muscleCible ?? null,
      })),
    [exercices.data, seance?.type],
  );

  const parId = useMemo(() => {
    const m = new Map<number, Exercice>();
    for (const e of exercices.data ?? []) m.set(e.id, e);

    return m;
  }, [exercices.data]);

  if (exercices.isLoading || (!nouvelle && seanceApi.isLoading)) return <Chargement />;
  if (!nouvelle && seanceApi.isError) {
    return <Erreur message={seanceApi.error.message} onReessayer={() => void seanceApi.refetch()} />;
  }
  /* SANS CATALOGUE, ON N'AFFICHE PAS LA SÉANCE — ET C'EST UNE CORRECTION DU
     15 SEPTEMBRE 2026.
     Seul `seanceApi.isError` était gardé ici. Quand la requête du catalogue
     échouait pendant que la séance, elle, chargeait — un tunnel de métro
     suffit —, `parId` restait VIDE : chaque bloc perdait son nom
     (`?? 'cet exercice'`), retombait sur le mode « charge »
     (`?? 'charge'`, dans `calcul/blocSeance.ts`) et le décompte de séries se
     faisait sur ce mode inventé. La séance s'affichait FAUSSE plutôt que pas
     du tout, sans un mot pour dire qu'il y avait une panne. Règle 7.
     La garde existait mot pour mot dans `app/modele/[id].tsx`, écran jumeau du
     même catalogue : le jumeau oublié, motif n° 1 de la revue.
     `src/muscles/gardeCatalogue.test.ts` tombe si elle disparaît d'ici ou du
     prochain écran qui indexera le catalogue par identifiant. */
  if (exercices.isError) {
    return <Erreur message={exercices.error.message} onReessayer={() => void exercices.refetch()} />;
  }
  if (!seance) return <Chargement />;

  const avancement = avancementDe(seance.exercices, parId);

  const ajouterExercice = (idExercice: number) => {
    const ex = parId.get(idExercice);
    if (!ex) return;

    const bloc = blocDepuisExercice(
      ex, seance.exercices.length,
      derniereFois.get(idExercice), lireFormat(ex.formatPrescrit),
    );
    setSeance({ ...seance, exercices: [...seance.exercices, bloc] });
  };

  const partirDuModele = (idModele: number) => {
    const m = (modeles.data ?? []).find((x) => x.id === idModele);
    if (!m) return;
    setSeance({
      ...seance,
      type: m.type ?? seance.type,
      exercices: blocsDepuisModele(m),
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
                {TYPES_SEANCE.map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setSeance({ ...seance, type: t })}
                    style={[
                      s.type,
                      seance.type === t && { backgroundColor: couleurDuType(t), borderColor: couleurDuType(t) },
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
              <Bouton onPress={() => enregistrerMaintenant(seance)} style={{ marginTop: E.m }}>
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
        elements={elementsExercices}
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
          couleur: couleurDuType(m.type),
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
