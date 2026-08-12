import { useEffect, useMemo, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View,
} from 'react-native';
import { useExerciceDetail, useExercices, useMajExercice, useMoi } from '@/api/hooks';
import type { Exercice } from '@/api/types';
import { Bouton, Carte, Champ, Chargement, Discret, Erreur, Texte, Vide } from '@/composants/base';
import { identifiantYoutube, ModaleExercice } from '@/composants/modaleExercice';
import { C, E, P, R, T, TOUCHE } from '@/theme';

/**
 * GESTION DES EXERCICES — tout ce qu'on peut corriger sur un exercice.
 *
 * Cet écran ne servait qu'aux vidéos et aux noms français. Le reste du
 * contenu — zone, muscles, matériel, exécution — arrivait du catalogue importé,
 * en anglais, et rien ne permettait d'y toucher. Quant aux exercices ajoutés à
 * la main, ils naissaient sans aucune de ces données et le restaient : leur
 * fiche n'affichait jamais que le titre et le format.
 *
 * LES DEUX SORTES D'EXERCICES SONT TRAITEES PAREIL, et c'est le point. Un
 * exercice importé et un exercice personnel sont deux lignes de la même table ;
 * distinguer ce qu'on a le droit de corriger sur l'un et sur l'autre serait une
 * règle de plus à retenir, sans rien protéger.
 *
 * UN EXERCICE A LA FOIS, DANS UN EDITEUR SEPARE. Déplier huit champs dans
 * chaque carte d'une liste de 1338 entrées rendrait le défilement impraticable,
 * et ferait porter à l'écran un brouillon par exercice et par champ. Ici la
 * liste reste une liste ; l'édition est un geste à part, qu'on ouvre et qu'on
 * ferme.
 */

/** Les champs modifiables, dans l'ordre où ils apparaissent sur la fiche. */
const CHAMPS = [
  { cle: 'nomFr', etiquette: 'Nom français' },
  { cle: 'videoUrl', etiquette: 'Lien YouTube' },
  { cle: 'partieCorps', etiquette: 'Zone' },
  { cle: 'muscleCible', etiquette: 'Muscle ciblé' },
  { cle: 'musclesSecondaires', etiquette: 'Aussi sollicités' },
  { cle: 'equipement', etiquette: 'Matériel' },
  { cle: 'formatPrescrit', etiquette: 'Format prescrit' },
  { cle: 'instructions', etiquette: 'Exécution', long: true },
] as const;

type CleModifiable = (typeof CHAMPS)[number]['cle'];
type Brouillon = Record<CleModifiable, string>;

type Filtre = 'a_completer' | 'sans_video' | 'sans_nom_fr' | 'perso' | 'tous';

const FILTRES: { cle: Filtre; libelle: string }[] = [
  { cle: 'a_completer', libelle: 'À compléter' },
  { cle: 'sans_video', libelle: 'Sans vidéo' },
  { cle: 'sans_nom_fr', libelle: 'À traduire' },
  { cle: 'perso', libelle: 'Les miens' },
  { cle: 'tous', libelle: 'Tous' },
];

const sansAccent = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------------------------------------------------------------- éditeur

/**
 * L'éditeur d'UN exercice.
 *
 * Il va chercher la fiche complète : depuis que les textes longs ne voyagent
 * plus avec la collection, `exercices.data` ne contient ni l'exécution, ni les
 * muscles, ni le matériel. Les éditer à partir de la liste écrirait donc du
 * vide par-dessus des données existantes — silencieusement.
 */
function Editeur({ exercice, onFermer }: { exercice: Exercice; onFermer: () => void }) {
  const detail = useExerciceDetail(exercice.id);
  const maj = useMajExercice();
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);

  const complet = detail.data;

  /* Le brouillon ne se remplit QU'UNE FOIS la fiche arrivée, et il est remis à
     zéro si l'on change d'exercice. Le pré-remplir avec la version légère
     afficherait des champs vides que l'utilisateur croirait vides en base. */
  useEffect(() => {
    if (complet === undefined) {
      setBrouillon(null);

      return;
    }
    setBrouillon(Object.fromEntries(
      CHAMPS.map((c) => [c.cle, complet[c.cle] ?? '']),
    ) as Brouillon);
  }, [complet]);

  const modifies = useMemo(() => {
    if (brouillon === null || complet === undefined) return [];

    return CHAMPS.filter((c) => brouillon[c.cle].trim() !== (complet[c.cle] ?? ''));
  }, [brouillon, complet]);

  const video = (brouillon?.videoUrl ?? '').trim();
  const videoValide = video === '' || identifiantYoutube(video) !== null;

  const enregistrer = () => {
    if (brouillon === null) return;

    /* On n'envoie QUE ce qui a changé. Renvoyer les huit champs à chaque fois
       écraserait une modification faite ailleurs entre-temps, sans qu'on ait
       jamais voulu y toucher. */
    const corps: Partial<Exercice> = {};
    for (const c of modifies) {
      const v = brouillon[c.cle].trim();
      (corps as Record<string, string | null>)[c.cle] = v === '' ? null : v;
    }

    maj.mutate({ id: exercice.id, ...corps }, { onSuccess: onFermer });
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onFermer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.fond}
      >
        <View style={s.feuille}>
          <Texte style={s.titreEditeur} numberOfLines={2}>{exercice.nom}</Texte>
          <Discret style={{ fontSize: T.petit }}>
            {exercice.source === 'perso' ? '★ exercice personnel' : 'catalogue importé'}
          </Discret>

          {detail.isLoading || brouillon === null ? (
            <View style={{ paddingVertical: E.xl }}><Chargement /></View>
          ) : detail.isError ? (
            <Erreur
              message={detail.error.message}
              onReessayer={() => void detail.refetch()}
            />
          ) : (
            <ScrollView
              style={{ marginTop: E.m }}
              contentContainerStyle={{ gap: E.s, paddingBottom: E.m }}
              keyboardShouldPersistTaps="handled"
            >
              {CHAMPS.map((c) => (
                <Champ
                  key={c.cle}
                  etiquette={c.etiquette}
                  valeur={brouillon[c.cle]}
                  onChange={(v) => setBrouillon({ ...brouillon, [c.cle]: v })}
                  placeholder={c.cle === 'nomFr' ? exercice.nom : undefined}
                  multiligne={'long' in c ? c.long : undefined}
                />
              ))}

              {!videoValide && (
                <Discret style={{ color: C.erreur, fontSize: T.petit }}>
                  Ce lien n’est pas reconnu comme une vidéo YouTube.
                </Discret>
              )}
              {maj.isError && (
                <Discret style={{ color: C.erreur, fontSize: T.petit }}>
                  {maj.error.message}
                </Discret>
              )}
            </ScrollView>
          )}

          <View style={{ flexDirection: 'row', gap: E.s, marginTop: E.s }}>
            <Bouton
              onPress={enregistrer}
              desactive={modifies.length === 0 || !videoValide || maj.isPending}
              style={{ flex: 1 }}
            >
              {modifies.length === 0
                ? 'Aucune modification'
                : `Enregistrer (${modifies.length})`}
            </Bouton>
            <Bouton variante="contour" onPress={onFermer}>Fermer</Bouton>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ------------------------------------------------------------------ écran

export default function AdminExercices() {
  const moi = useMoi();
  const exercices = useExercices();

  const [filtre, setFiltre] = useState<Filtre>('a_completer');
  const [recherche, setRecherche] = useState('');
  const [edite, setEdite] = useState<Exercice | undefined>(undefined);
  const [apercu, setApercu] = useState<Exercice | undefined>(undefined);

  const liste = useMemo(() => {
    const q = sansAccent(recherche.trim());

    return (exercices.data ?? [])
      .filter((e) => {
        /* `partieCorps` sert de témoin : c'est le seul des champs de la fiche
           qui voyage encore avec la liste. Un exercice qui n'en a pas n'a rien
           d'autre non plus — c'est vrai des 20 exercices personnels comme de
           toute entrée incomplète du catalogue. */
        if (filtre === 'a_completer') return !e.partieCorps;
        if (filtre === 'sans_video') return !e.videoUrl;
        if (filtre === 'sans_nom_fr') return !e.nomFr;
        if (filtre === 'perso') return e.source === 'perso';

        return true;
      })
      .filter((e) => !q || sansAccent(`${e.nom} ${e.nomFr ?? ''}`).includes(q));
  }, [exercices.data, filtre, recherche]);

  if (moi.isLoading || exercices.isLoading) return <Chargement />;
  if (!moi.data?.roles?.includes('ROLE_ADMIN')) {
    return <Vide message="Cet écran est réservé à l'administrateur." />;
  }
  if (exercices.isError) {
    return <Erreur message={exercices.error.message} onReessayer={() => void exercices.refetch()} />;
  }

  const tous = exercices.data ?? [];
  const total = tous.length;
  const avecVideo = tous.filter((e) => Boolean(e.videoUrl)).length;
  const traduits = tous.filter((e) => Boolean(e.nomFr)).length;
  const renseignes = tous.filter((e) => Boolean(e.partieCorps)).length;

  return (
    <View style={{ flex: 1, backgroundColor: C.fond }}>
      <View style={s.tete}>
        <Discret style={{ fontSize: T.normal }}>
          {renseignes}/{total} renseignés · {traduits} traduits · {avecVideo} vidéos
        </Discret>
        <View style={s.jauge}>
          <View style={[s.jaugeRemplie, { width: `${Math.round((renseignes / total) * 100)}%` }]} />
        </View>

        <Champ valeur={recherche} onChange={setRecherche} placeholder="Rechercher un exercice…" />

        <View style={s.filtres}>
          {FILTRES.map((f) => (
            <Pressable
              key={f.cle}
              onPress={() => setFiltre(f.cle)}
              style={[s.filtre, filtre === f.cle && s.filtreActif]}
              accessibilityLabel={`Filtrer : ${f.libelle}`}
            >
              <Discret
                numberOfLines={1}
                style={filtre === f.cle
                  ? { color: C.fond, fontFamily: P.fort, fontSize: T.petit }
                  : { fontSize: T.petit }}
              >
                {f.libelle}
              </Discret>
            </Pressable>
          ))}
        </View>
      </View>

      <FlatList
        data={liste}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Vide message="Aucun exercice dans cette sélection." />}
        renderItem={({ item }) => (
          <Carte style={{ padding: 0 }}>
            <View style={s.ligne}>
              <Pressable
                onPress={() => setEdite(item)}
                style={s.zoneNom}
                accessibilityLabel={`Modifier ${item.nomFr ?? item.nom}`}
              >
                <Texte style={{ fontFamily: P.fort }} numberOfLines={1}>
                  {item.nomFr ?? item.nom}
                </Texte>
                <Discret style={{ fontSize: T.petit }} numberOfLines={1}>
                  {item.source === 'perso' ? '★ ' : ''}
                  {item.nomFr !== null && item.nomFr !== undefined ? `${item.nom} · ` : ''}
                  {item.partieCorps ?? 'à compléter'}
                </Discret>
              </Pressable>

              {/* Deux pastilles, pas une colonne de cases : ce qui manque se
                  voit d'un coup d'œil sans lire. */}
              <View style={s.pastilles}>
                <Discret style={{ fontSize: T.petit, color: item.nomFr ? C.ok : C.discret }}>
                  FR
                </Discret>
                <Discret style={{ fontSize: T.petit, color: item.videoUrl ? C.ok : C.discret }}>
                  ▶
                </Discret>
              </View>

              {item.videoUrl !== null && item.videoUrl !== undefined && (
                <Pressable
                  onPress={() => setApercu(item)}
                  style={s.oeil}
                  accessibilityLabel="Voir la fiche"
                >
                  <Discret style={{ fontSize: T.moyen }}>i</Discret>
                </Pressable>
              )}
            </View>
          </Carte>
        )}
      />

      {edite !== undefined && (
        <Editeur
          /* La clé force un éditeur NEUF par exercice : sans elle, React
             réutiliserait le composant et son brouillon d'un exercice à
             l'autre. */
          key={edite.id}
          exercice={edite}
          onFermer={() => setEdite(undefined)}
        />
      )}

      <ModaleExercice
        exercice={apercu}
        visible={apercu !== undefined}
        onFermer={() => setApercu(undefined)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  tete: { padding: E.m, gap: E.s, borderBottomWidth: 1, borderBottomColor: C.ligne },
  jauge: { height: 5, backgroundColor: C.surface2, borderRadius: 99, overflow: 'hidden' },
  jaugeRemplie: { height: '100%', backgroundColor: C.ok, borderRadius: 99 },
  filtres: { flexDirection: 'row', gap: 5 },
  filtre: {
    flex: 1, minHeight: TOUCHE, borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
    backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 2,
  },
  filtreActif: { backgroundColor: C.vif, borderColor: C.vif },
  page: { padding: E.m, gap: E.xs, paddingBottom: E.xl },

  ligne: { flexDirection: 'row', alignItems: 'center' },
  zoneNom: { flex: 1, minHeight: TOUCHE, justifyContent: 'center', padding: E.s },
  pastilles: { flexDirection: 'row', gap: E.s, paddingHorizontal: E.s },
  oeil: {
    width: 40, minHeight: TOUCHE, alignItems: 'center', justifyContent: 'center',
    borderLeftWidth: 1, borderLeftColor: C.ligne,
  },

  fond: {
    flex: 1, backgroundColor: C.voile,
    alignItems: 'center', justifyContent: 'center', padding: E.m,
  },
  feuille: {
    backgroundColor: C.surface, borderRadius: R.l, borderWidth: 1, borderColor: C.ligne,
    padding: E.m, maxHeight: '90%', width: '100%', maxWidth: 560,
  },
  titreEditeur: {
    fontFamily: P.titre, fontSize: T.titre, letterSpacing: 0.8, textTransform: 'uppercase',
  },
});
