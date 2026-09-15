import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  useAppliquerOrdre, useEnregistrerModele, useExercices, useModeles, useSupprimerModele,
} from '@/api/hooks';
import type { Exercice, Modele, ModeleExercice } from '@/api/types';
import { Bouton, Carte, Champ, Chargement, Discret, Erreur, Texte } from '@/composants/base';
import { ChoixDansListe } from '@/composants/choixAliment';
import { Confirmer } from '@/composants/confirmer';
import { lireFormat } from '@/composants/exerciceSeance';
import { ListeDeplacable } from '@/composants/listeDeplacable';
import { C, E, P, R, T, TOUCHE, nb } from '@/theme';
import { idDe } from '@/api/types';

const TYPES = ['Push', 'Pull', 'Legs'] as const;
const COULEUR: Record<string, string> = { Push: C.prot, Pull: C.fec, Legs: C.leg };

export default function DetailModele() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const nouveau = id === 'nouveau';
  const router = useRouter();

  const modeles = useModeles();
  const exercices = useExercices();
  const enregistrer = useEnregistrerModele();
  const ordre = useAppliquerOrdre();
  const supprimer = useSupprimerModele();

  const [modele, setModele] = useState<Modele | null>(null);
  const [choix, setChoix] = useState(false);
  const [retirer, setRetirer] = useState<number | null>(null);
  const [ordreChange, setOrdreChange] = useState(false);
  const [propager, setPropager] = useState(false);
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);

  useEffect(() => {
    if (modele !== null) return;
    if (nouveau) {
      setModele({ nom: null, type: null, exercices: [] });
    } else {
      const m = (modeles.data ?? []).find((x) => x.id === Number(id));
      if (m) setModele(m);
    }
  }, [nouveau, modeles.data, id, modele]);

  const parId = useMemo(() => {
    const m = new Map<number, Exercice>();
    for (const e of exercices.data ?? []) m.set(e.id, e);

    return m;
  }, [exercices.data]);

  /* Meme motif que dans l'ecran de seance : ce filtrage des 1338 exercices
     etait pose dans le JSX, donc rejoue a chaque rendu, modale fermee
     comprise. */
  const elementsExercices = useMemo(
    () => (exercices.data ?? [])
      .filter((e) => modele === null || modele.type === null
        || e.groupes.length === 0 || e.groupes.includes(modele.type))
      .map((e) => ({
        id: e.id, nom: e.nomFr ?? e.nom, detail: e.formatPrescrit ?? '',
        couleur: COULEUR[e.groupes[0] ?? ''] ?? C.ligne,
        /* Voir l'écran de séance : c'est ce champ qui fait apparaître les
           vignettes de muscles. `?? null` pour que les exercices sans muscle
           renseigné restent atteignables sous « Autre ». */
        muscle: e.muscleCible ?? null,
      })),
    [exercices.data, modele?.type],
  );

  if (exercices.isLoading || modeles.isLoading) return <Chargement />;
  if (exercices.isError) {
    return <Erreur message={exercices.error.message} onReessayer={() => void exercices.refetch()} />;
  }
  if (!modele) return <Chargement />;

  const ajouter = (idExercice: number) => {
    const ex = parId.get(idExercice);
    if (!ex) return;
    const f = lireFormat(ex.formatPrescrit);
    const bloc: ModeleExercice = {
      exercice: ex['@id'],
      ordre: modele.exercices.length,
      mode: ex.modeDefaut,
      notes: null,
      series: Array.from({ length: f?.series ?? 3 }, (_, i) => ({
        ordre: i, repsCible: f?.reps ?? null, poidsCible: null, secondesCible: null,
      })),
    };
    setModele({ ...modele, exercices: [...modele.exercices, bloc] });
  };

  const majBloc = (i: number, b: ModeleExercice) =>
    setModele({ ...modele, exercices: modele.exercices.map((x, j) => (j === i ? b : x)) });

  /** Le modèle fait autorité : son ordre pourra être appliqué aux séances. */
  const reordonner = (liste: ModeleExercice[]) => {
    setModele({ ...modele, exercices: liste.map((x, k) => ({ ...x, ordre: k })) });
    setOrdreChange(true);
  };

  const sauver = () => {
    enregistrer.mutate(modele, {
      onSuccess: (m) => {
        setModele(m);
        if (nouveau && m.id !== undefined) {
          router.replace(`/modele/${m.id}`);

          return;
        }
        if (ordreChange && m.id !== undefined) {
          // on compte d'abord : réécrire l'historique mérite une confirmation
          ordre.mutate({ id: m.id, appliquer: false }, {
            onSuccess: (r) => { if (r.seancesConcernees > 0) setPropager(true); },
          });
        }
      },
    });
  };

  const carte = (bloc: ModeleExercice, i: number, poignee: ReactNode) => {
    const ex = parId.get(idDe(bloc.exercice));

    return (
      <Carte style={{ gap: E.s }}>
        <View style={s.tete}>
          <View style={{ flex: 1 }}>
            <Texte style={{ fontFamily: P.fort }} numberOfLines={1}>
              {ex?.nomFr ?? ex?.nom ?? '—'}
            </Texte>
            <Discret style={{ fontSize: T.petit }} numberOfLines={1}>
              {bloc.series.length} série{bloc.series.length > 1 ? 's' : ''}
              {ex?.formatPrescrit ? ` · ${ex.formatPrescrit}` : ''}
            </Discret>
          </View>
          {poignee}
        </View>

        {bloc.series.map((serie, j) => (
          <View key={j} style={s.serie}>
            <Discret style={{ width: 22 }}>{j + 1}</Discret>
            <Champ
              valeur={serie.repsCible === null ? '' : String(serie.repsCible)}
              onChange={(v) => majBloc(i, {
                ...bloc,
                series: bloc.series.map((x, k) => (k === j
                  ? { ...x, repsCible: v === '' ? null : parseInt(v, 10) || 0 } : x)),
              })}
              placeholder="—" unite="rép" numerique style={{ flex: 1 }}
            />
            <Champ
              valeur={serie.poidsCible === null ? '' : nb(serie.poidsCible)}
              onChange={(v) => majBloc(i, {
                ...bloc,
                series: bloc.series.map((x, k) => (k === j
                  ? { ...x, poidsCible: v === '' ? null : parseFloat(v.replace(',', '.')) || 0 } : x)),
              })}
              placeholder="—" unite="kg" numerique style={{ flex: 1 }}
            />
            <Pressable
              onPress={() => majBloc(i, {
                ...bloc,
                series: bloc.series.filter((_, k) => k !== j).map((x, k) => ({ ...x, ordre: k })),
              })}
              style={s.sup}
            >
              <Discret style={{ fontSize: T.grand }}>×</Discret>
            </Pressable>
          </View>
        ))}

        <View style={{ flexDirection: 'row', gap: E.s }}>
          <Bouton
            variante="discret"
            onPress={() => majBloc(i, {
              ...bloc,
              series: [...bloc.series, {
                ordre: bloc.series.length, repsCible: null, poidsCible: null, secondesCible: null,
              }],
            })}
            style={s.ajouterSerie}
          >
            + Série
          </Bouton>
          <Bouton variante="discret" onPress={() => setRetirer(i)}>
            <Discret style={{ fontSize: T.normal }}>Retirer</Discret>
          </Bouton>
        </View>
      </Carte>
    );
  };

  const entete = (
    <Carte style={{ gap: E.m, marginBottom: E.s }}>
      <Champ
        etiquette="Nom du modèle"
        valeur={modele.nom ?? ''}
        onChange={(v) => setModele({ ...modele, nom: v || null })}
        placeholder="Push lourd, Pull volume…"
      />
      <View style={s.types}>
        {TYPES.map((t) => (
          <Pressable
            key={t}
            onPress={() => setModele({ ...modele, type: t })}
            style={[
              s.type,
              modele.type === t && { backgroundColor: COULEUR[t], borderColor: COULEUR[t] },
            ]}
          >
            <Texte style={[s.typeTexte, modele.type === t && { color: C.fond }]}>{t}</Texte>
          </Pressable>
        ))}
      </View>
      {modele.exercices.length > 1 && (
        <Discret style={{ fontSize: T.petit, lineHeight: 16 }}>
          Touche ⠿ pour saisir un exercice, puis l'endroit où le déposer.
          Les flèches ▲▼ le déplacent d'un cran.
          L'ordre du modèle pourra ensuite être appliqué à tes séances.
        </Discret>
      )}
    </Carte>
  );

  const pied = (
    <View style={{ gap: E.s, marginTop: E.s }}>
      <Bouton variante="discret" onPress={() => setChoix(true)} style={s.ajouter}>
        + Ajouter un exercice
      </Bouton>

      <Bouton onPress={sauver} desactive={enregistrer.isPending}>
        {enregistrer.isPending ? 'Enregistrement…' : 'Enregistrer le modèle'}
      </Bouton>

      {enregistrer.isError && (
        <Discret style={{ color: C.erreur }}>{enregistrer.error.message}</Discret>
      )}
      {enregistrer.isSuccess && !propager && (
        <Discret style={{ color: C.ok, textAlign: 'center' }}>Enregistré.</Discret>
      )}
      {ordre.isSuccess && ordre.data.seancesModifiees > 0 && (
        <Discret style={{ color: C.ok, textAlign: 'center' }}>{ordre.data.message}</Discret>
      )}

      {!nouveau && modele.id !== undefined && (
        <Bouton
          variante="discret"
          onPress={() => setConfirmerSuppression(true)}
          style={{ marginTop: E.l }}
        >
          <Discret style={{ color: C.erreur }}>Supprimer le modèle</Discret>
        </Bouton>
      )}
      {supprimer.isError && (
        <Discret style={{ color: C.erreur }}>{supprimer.error.message}</Discret>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <ListeDeplacable
        elements={modele.exercices}
        cle={(b, i) => String(b.id ?? `n${i}`)}
        rendu={carte}
        onReordonner={reordonner}
        entete={entete}
        pied={pied}
        etiquette={(b) => parId.get(idDe(b.exercice))?.nomFr
          ?? parId.get(idDe(b.exercice))?.nom ?? 'cet exercice'}
      />

      <ChoixDansListe
        visible={choix}
        titre="Ajouter un exercice"
        elements={elementsExercices}
        onChoisir={ajouter}
        onFermer={() => setChoix(false)}
      />

      <Confirmer
        visible={retirer !== null}
        titre="Retirer cet exercice ?"
        message="Il sera retiré du modèle avec ses séries cibles."
        libelle="Retirer"
        onConfirmer={() => {
          if (retirer !== null) {
            setModele({
              ...modele,
              exercices: modele.exercices
                .filter((_, j) => j !== retirer)
                .map((x, j) => ({ ...x, ordre: j })),
            });
          }
          setRetirer(null);
        }}
        onAnnuler={() => setRetirer(null)}
      />

      <Confirmer
        visible={confirmerSuppression}
        titre="Supprimer ce modèle ?"
        message={`${modele.nom ?? modele.type ?? 'Ce modèle'} et ses `
          + `${modele.exercices.length} exercice(s) seront supprimés. `
          + 'Tes séances passées ne sont pas touchées.'}
        onConfirmer={() => {
          setConfirmerSuppression(false);
          if (modele.id !== undefined) {
            supprimer.mutate(modele.id, { onSuccess: () => router.back() });
          }
        }}
        onAnnuler={() => setConfirmerSuppression(false)}
      />

      <Confirmer
        visible={propager}
        titre="Appliquer cet ordre à tes séances ?"
        message={`${ordre.data?.seancesConcernees ?? 0} séance(s) adopteraient l'ordre de ce `
          + 'modèle, y compris les anciennes. Seul l\'affichage change : aucune série, '
          + 'aucune charge n\'est modifiée.'}
        libelle="Appliquer"
        onConfirmer={() => {
          setPropager(false);
          setOrdreChange(false);
          if (modele.id !== undefined) ordre.mutate({ id: modele.id, appliquer: true });
        }}
        onAnnuler={() => { setPropager(false); setOrdreChange(false); }}
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
  tete: { flexDirection: 'row', alignItems: 'center', gap: E.xs, minHeight: TOUCHE },
  serie: { flexDirection: 'row', alignItems: 'center', gap: E.s },
  sup: { width: 32, minHeight: TOUCHE, alignItems: 'center', justifyContent: 'center' },
  ajouterSerie: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.ligne, borderRadius: R.s, flex: 1,
  },
  ajouter: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.ligne,
    borderRadius: R.m, minHeight: TOUCHE + 4,
  },
});
