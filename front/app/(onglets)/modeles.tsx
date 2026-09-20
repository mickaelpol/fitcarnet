import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { couleurDuType } from '@/calcul/typesSeance';
import { useModeles } from '@/api/hooks';
import { Bouton, Carte, Chargement, Discret, Erreur, Texte, Vide } from '@/composants/base';
import { C, E, P, T } from '@/theme';


export default function Modeles() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch, isRefetching } = useModeles();

  if (isLoading) return <Chargement />;
  if (isError) return <Erreur message={error.message} onReessayer={() => void refetch()} />;

  return (
    <View style={{ flex: 1 }}>
    <FlatList
      data={data ?? []}
      keyExtractor={(m) => String(m.id)}
      contentContainerStyle={s.page}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
      ListEmptyComponent={
        <Vide message="Aucun modèle. Crée-en un pour préparer tes séances à l'avance." />
      }
      renderItem={({ item }) => (
        <Pressable onPress={() => router.push(`/modele/${item.id}`)}>
          <Carte style={s.carte}>
            <View style={[s.pastille, { backgroundColor: couleurDuType(item.type) }]} />
            <View style={{ flex: 1 }}>
              <Texte style={{ fontFamily: P.fort }}>{item.nom ?? item.type ?? 'Modèle'}</Texte>
              <Discret style={{ fontSize: T.normal }}>
                {item.exercices.length} exercice{item.exercices.length > 1 ? 's' : ''}
              </Discret>
            </View>
          </Carte>
        </Pressable>
      )}
    />
    <View style={s.pied}>
      <Bouton onPress={() => router.push('/modele/nouveau')}>+ Nouveau modèle</Bouton>
    </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { padding: E.m, gap: E.s, flexGrow: 1, paddingBottom: 80 },
  pied: {
    position: 'absolute', left: 0, right: 0, bottom: 0, padding: E.m,
    backgroundColor: C.fond, borderTopColor: C.ligne, borderTopWidth: 1,
  },
  carte: { flexDirection: 'row', alignItems: 'center', gap: E.m },
  pastille: { width: 4, height: 34, borderRadius: 3 },
});
