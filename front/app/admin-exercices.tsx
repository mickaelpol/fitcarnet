import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useExercices, useMoi } from '@/api/hooks';
import type { Exercice } from '@/api/types';
import { Carte, Champ, Chargement, Discret, Erreur, Texte, Vide } from '@/composants/base';
import { premiereErreur } from '@/composants/etatRequetes';
import { ModaleEditeurExercice } from '@/composants/modaleEditeurExercice';
import { ModaleExercice } from '@/composants/modaleExercice';
import {
  aTraduire, avancementCatalogue, type Filtre, FILTRES, filtrerExercices, zonesPresentes,
} from '@/muscles/catalogueExercices';
import { libelleDuMuscle } from '@/muscles/groupes';
import { libelle, ZONES } from '@/muscles/vocabulaire';
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
 * IL NE FAIT PLUS QU'AFFICHER. Le 15 septembre 2026 il pesait 709 lignes pour
 * sept responsabilités (constat 03-front §4 de l'audit) : le filtrage et les
 * compteurs sont partis dans `src/muscles/catalogueExercices.ts`, les règles
 * de l'éditeur dans `src/muscles/editionExercice.ts`, son état dans
 * `src/composants/useEditeurExercice.ts`, son rendu dans
 * `src/composants/modaleEditeurExercice.tsx`.
 *
 * CE N'EST PAS UN RANGEMENT. `tsconfig.tests.json` n'inclut que
 * `src/**\/*.test.ts` : tout ce qui vit dans `app/` est hors de portée des
 * tests, SANS LE MOINDRE SIGNAL. Les sept règles qui décident si un
 * enregistrement écrase une valeur existante n'étaient couvertes par rien
 * tant qu'elles étaient ici.
 */
export default function AdminExercices() {
  const moi = useMoi();
  const exercices = useExercices();

  const [filtre, setFiltre] = useState<Filtre>('a_completer');
  const [recherche, setRecherche] = useState('');
  const [edite, setEdite] = useState<Exercice | undefined>(undefined);
  const [apercu, setApercu] = useState<Exercice | undefined>(undefined);

  const zonesProposees = useMemo(() => zonesPresentes(exercices.data ?? []), [exercices.data]);
  const liste = useMemo(
    () => filtrerExercices(exercices.data ?? [], filtre, recherche),
    [exercices.data, filtre, recherche],
  );
  const avancement = useMemo(() => avancementCatalogue(exercices.data ?? []), [exercices.data]);

  /* renderItem SORT DU JSX ET PASSE PAR useCallback, comme la documentation
     React Native le demande (« Optimizing FlatList Configuration »). Ecrit en
     ligne, il est recree a chaque rendu : la liste, qui compare les props pour
     savoir quoi redessiner, redessine alors toutes ses lignes visibles a chaque
     frappe dans le champ de recherche. Sur mille trois cent trente-huit
     exercices, c'est le seul ecran du projet ou cela se voit.

     Les dependances sont vides : les deux seules choses capturees sont des
     fonctions d'etat de React, stables par construction. */
  const rendreExercice = useCallback(({ item }: { item: Exercice }) => (
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
          {/* LE MUSCLE EST AFFICHÉ ICI, PAS SEULEMENT DANS LA FICHE.
              C'est lui qui décide sous quelle vignette l'exercice se
              retrouve quand on en cherche un. Un exercice qui n'en a pas
              ne sort que sous « Autre » — autant le voir dans la liste
              plutôt qu'en ouvrant les fiches une par une. */}
          <Discret style={{ fontSize: T.petit }} numberOfLines={1}>
            {item.source === 'perso' ? '★ ' : ''}
            {item.nomFr !== null && item.nomFr !== undefined ? `${item.nom} · ` : ''}
            {item.partieCorps ? libelle(ZONES, item.partieCorps) : 'zone à compléter'}
            {' · '}
            {libelleDuMuscle(item.muscleCible) ?? 'muscle à compléter'}
          </Discret>
        </Pressable>

        {/* Deux pastilles, pas une colonne de cases : ce qui manque se
            voit d'un coup d'œil sans lire. */}
        <View style={s.pastilles}>
          <Discret style={{
            fontSize: T.petit, color: aTraduire(item) ? C.discret : C.ok,
          }}>
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
  ), []);

  if (moi.isLoading || exercices.isLoading) return <Chargement />;

  /* /moi EN PANNE N'EST PAS UN REFUS DE DROITS — 18 septembre 2026, meme
     famille que M6, et meme correction que sur admin-utilisateurs.tsx : une
     coupure reseau faisait repondre « reservé à l'administrateur » a un
     administrateur. Corrige sur LES DEUX ecrans le meme jour ; en laisser un
     est exactement le jumeau oublie que ce projet connait. */
  const panneDuCompte = premiereErreur(moi);
  if (panneDuCompte) {
    return <Erreur message={panneDuCompte.message} onReessayer={panneDuCompte.reessayer} />;
  }

  if (!moi.data?.roles?.includes('ROLE_ADMIN')) {
    return <Vide message="Cet écran est réservé à l'administrateur." />;
  }
  if (exercices.isError) {
    return <Erreur message={exercices.error.message} onReessayer={() => void exercices.refetch()} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.fond }}>
      <View style={s.tete}>
        <Discret style={{ fontSize: T.normal }}>
          {avancement.renseignes}/{avancement.total} renseignés{' · '}
          {avancement.traduits}/{avancement.importes} traduits{' · '}
          {avancement.avecVideo} vidéos
        </Discret>
        <View style={s.jauge}>
          <View style={[s.jaugeRemplie, { width: `${avancement.pourcentRenseignes}%` }]} />
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
        renderItem={rendreExercice}
      />

      {edite !== undefined && (
        <ModaleEditeurExercice
          /* La clé force un éditeur NEUF par exercice : sans elle, React
             réutiliserait le composant et son brouillon d'un exercice à
             l'autre. */
          key={edite.id}
          exercice={edite}
          zones={zonesProposees}
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
});
