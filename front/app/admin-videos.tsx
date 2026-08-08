import { useMemo, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View,
} from 'react-native';
import { useExercices, useMajExercice, useMoi } from '@/api/hooks';
import type { Exercice } from '@/api/types';
import { Bouton, Carte, Champ, Chargement, Discret, Erreur, Texte, Vide } from '@/composants/base';
import { identifiantYoutube, ModaleExercice } from '@/composants/modaleExercice';
import { C, E, P, R, T, TOUCHE } from '@/theme';

type Filtre = 'sans_video' | 'avec_video' | 'sans_nom_fr' | 'perso' | 'tous';

const FILTRES: { cle: Filtre; libelle: string }[] = [
  { cle: 'sans_video', libelle: 'Sans vidéo' },
  { cle: 'avec_video', libelle: 'Avec vidéo' },
  { cle: 'sans_nom_fr', libelle: 'À traduire' },
  { cle: 'perso', libelle: 'Les miens' },
  { cle: 'tous', libelle: 'Tous' },
];

/**
 * Écran d'administration : renseigner les vidéos du catalogue.
 *
 * Outil de peuplement, destiné à être retiré une fois la base remplie.
 * Les données produites, elles, vivent dans la table « exercice » et
 * suivent les sauvegardes ordinaires.
 */
export default function AdminVideos() {
  const moi = useMoi();
  const exercices = useExercices();
  const maj = useMajExercice();

  const [filtre, setFiltre] = useState<Filtre>('sans_video');
  const [recherche, setRecherche] = useState('');
  const [apercu, setApercu] = useState<Exercice | undefined>(undefined);
  /* Un brouillon par exercice ET par champ : on saisit sans envoyer à chaque
     frappe, et on n'enregistre que ce qui a réellement changé. */
  const [brouillons, setBrouillons] = useState<Record<string, string>>({});
  const cle = (id: number, champ: 'videoUrl' | 'nomFr') => `${id}:${champ}`;

  const sansAccent = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const liste = useMemo(() => {
    const q = sansAccent(recherche.trim());
    const tous = exercices.data ?? [];

    return tous
      .filter((e) => {
        if (filtre === 'sans_video') return !e.videoUrl;
        if (filtre === 'avec_video') return Boolean(e.videoUrl);
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

  const total = (exercices.data ?? []).length;
  const avecVideo = (exercices.data ?? []).filter((e) => Boolean(e.videoUrl)).length;
  const avecNomFr = (exercices.data ?? []).filter((e) => Boolean(e.nomFr)).length;

  const enregistrer = (ex: Exercice, champ: 'videoUrl' | 'nomFr', valeur: string) => {
    const propre = valeur.trim();
    maj.mutate(
      { id: ex.id, [champ]: propre === '' ? null : propre },
      {
        onSuccess: () => {
          const suite = { ...brouillons };
          delete suite[cle(ex.id, champ)];
          setBrouillons(suite);
        },
      },
    );
  };

  const annuler = (id: number, champ: 'videoUrl' | 'nomFr') => {
    const suite = { ...brouillons };
    delete suite[cle(id, champ)];
    setBrouillons(suite);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: C.fond }}
    >
      <View style={s.tete}>
        <Discret style={{ fontSize: T.normal }}>
          {avecVideo} vidéo{avecVideo > 1 ? 's' : ''} · {avecNomFr} nom{avecNomFr > 1 ? 's' : ''}
          {' '}traduit{avecNomFr > 1 ? 's' : ''} · {total} exercices
        </Discret>
        <View style={s.jauge}>
          <View style={[s.jaugeRemplie, { width: `${Math.round((avecVideo / total) * 100)}%` }]} />
        </View>

        <Champ valeur={recherche} onChange={setRecherche} placeholder="Rechercher un exercice…" />

        <View style={s.filtres}>
          {FILTRES.map((f) => (
            <Pressable
              key={f.cle}
              onPress={() => setFiltre(f.cle)}
              style={[s.filtre, filtre === f.cle && s.filtreActif]}
            >
              <Discret
                numberOfLines={1}
                style={filtre === f.cle ? { color: C.fond, fontFamily: P.fort, fontSize: T.petit } : { fontSize: T.petit }}
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
        renderItem={({ item }) => {
          const video = brouillons[cle(item.id, 'videoUrl')] ?? item.videoUrl ?? '';
          const nomFr = brouillons[cle(item.id, 'nomFr')] ?? item.nomFr ?? '';
          const videoValide = video === '' || identifiantYoutube(video) !== null;
          const videoModifiee = video !== (item.videoUrl ?? '');
          const nomModifie = nomFr !== (item.nomFr ?? '');

          return (
            <Carte style={{ gap: E.s }}>
              <View style={s.ligneNom}>
                <View style={{ flex: 1 }}>
                  <Texte style={{ fontFamily: P.fort }} numberOfLines={1}>
                    {item.nomFr ?? item.nom}
                  </Texte>
                  <Discret style={{ fontSize: T.petit }} numberOfLines={1}>
                    {item.source === 'perso' ? '★ ' : ''}
                    {item.nomFr !== null && item.nomFr !== undefined ? `${item.nom} · ` : ''}
                    {item.partieCorps ?? '—'}
                  </Discret>
                </View>
                {item.videoUrl !== null && item.videoUrl !== undefined && (
                  <Pressable onPress={() => setApercu(item)} style={s.oeil}>
                    <Discret style={{ fontSize: T.moyen }}>▶</Discret>
                  </Pressable>
                )}
              </View>

              <Champ
                etiquette="Lien YouTube"
                valeur={video}
                onChange={(v) => setBrouillons({ ...brouillons, [cle(item.id, 'videoUrl')]: v })}
                placeholder="https://www.youtube.com/watch?v=…"
              />
              {!videoValide && (
                <Discret style={{ color: C.erreur, fontSize: T.petit }}>
                  Ce lien n'est pas reconnu comme une vidéo YouTube.
                </Discret>
              )}
              {videoModifiee && videoValide && (
                <View style={{ flexDirection: 'row', gap: E.s }}>
                  <Bouton
                    onPress={() => enregistrer(item, 'videoUrl', video)}
                    desactive={maj.isPending}
                    style={{ flex: 1 }}
                  >
                    Enregistrer la vidéo
                  </Bouton>
                  <Bouton variante="contour" onPress={() => annuler(item.id, 'videoUrl')}>
                    Annuler
                  </Bouton>
                </View>
              )}

              <Champ
                etiquette="Nom français"
                valeur={nomFr}
                onChange={(v) => setBrouillons({ ...brouillons, [cle(item.id, 'nomFr')]: v })}
                placeholder={item.nom}
              />
              {nomModifie && (
                <View style={{ flexDirection: 'row', gap: E.s }}>
                  <Bouton
                    onPress={() => enregistrer(item, 'nomFr', nomFr)}
                    desactive={maj.isPending}
                    style={{ flex: 1 }}
                  >
                    Enregistrer le nom
                  </Bouton>
                  <Bouton variante="contour" onPress={() => annuler(item.id, 'nomFr')}>
                    Annuler
                  </Bouton>
                </View>
              )}
            </Carte>
          );
        }}
      />

      <ModaleExercice
        exercice={apercu}
        visible={apercu !== undefined}
        onFermer={() => setApercu(undefined)}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  tete: {
    padding: E.m, gap: E.s, borderBottomWidth: 1, borderBottomColor: C.ligne,
  },
  jauge: { height: 5, backgroundColor: C.surface2, borderRadius: 99, overflow: 'hidden' },
  jaugeRemplie: { height: '100%', backgroundColor: C.ok, borderRadius: 99 },
  filtres: { flexDirection: 'row', gap: 5 },
  filtre: {
    flex: 1, minHeight: 38, borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
    backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 2,
  },
  filtreActif: { backgroundColor: C.vif, borderColor: C.vif },
  page: { padding: E.m, gap: E.s, paddingBottom: E.xl },
  ligneNom: { flexDirection: 'row', alignItems: 'center', gap: E.s },
  oeil: {
    width: 40, minHeight: TOUCHE, alignItems: 'center', justifyContent: 'center',
    borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
  },
});
