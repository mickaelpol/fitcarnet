import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { couleurDuType } from '@/calcul/typesSeance';
import { useSeances } from '@/api/hooks';
import type { Seance } from '@/api/types';
import { Bouton, Carte, Chargement, Chiffre, Discret, Erreur, Texte, Vide } from '@/composants/base';
import { C, E, N, P, R, T } from '@/theme';

/** L'API renvoie soit « 2026-08-02 », soit un ISO complet : on ne garde que la date. */
const jour = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);

  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
};

export default function Seances() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch, isRefetching } = useSeances();

  if (isLoading) return <Chargement texte="Chargement de tes séances…" />;
  if (isError) return <Erreur message={error.message} onReessayer={() => void refetch()} />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={data ?? []}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={s.page}
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
        ListEmptyComponent={
          <Vide message="Aucune séance pour l'instant. Commences-en une." />
        }
        renderItem={({ item }) => (
          <Ligne seance={item} onPress={() => router.push(`/seance/${item.id}`)} />
        )}
      />
      <View style={s.pied}>
        <Bouton onPress={() => router.push('/seance/nouvelle')}>+ Nouvelle séance</Bouton>
      </View>
    </View>
  );
}

function Ligne({ seance, onPress }: { seance: Seance; onPress: () => void }) {
  const av = seance.avancement ?? { faites: 0, total: 0 };
  const fini = av.total > 0 && av.faites === av.total;
  const couleur = couleurDuType(seance.type);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.75 }]}>
      <Carte style={s.carte}>
        <View style={[s.pastille, { backgroundColor: couleur }]} />
        <View style={{ flex: 1 }}>
          <Texte style={{ fontFamily: P.fort }}>{seance.type ?? 'Séance'}</Texte>
          <Discret style={{ fontSize: T.normal }}>{jour(seance.date)}</Discret>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Chiffre couleur={fini ? C.ok : C.vif} taille={N.petit}>
            {av.faites}/{av.total}
          </Chiffre>
          <Discret style={{ fontSize: T.petit }}>séries</Discret>
        </View>
      </Carte>
    </Pressable>
  );
}

const s = StyleSheet.create({
  page: { padding: E.m, gap: E.s, flexGrow: 1, paddingBottom: 80 },
  pied: {
    position: 'absolute', left: 0, right: 0, bottom: 0, padding: E.m,
    backgroundColor: C.fond, borderTopColor: C.ligne, borderTopWidth: 1,
  },
  carte: { flexDirection: 'row', alignItems: 'center', gap: E.m, borderRadius: R.m },
  pastille: { width: 4, height: 34, borderRadius: 3 },
});
