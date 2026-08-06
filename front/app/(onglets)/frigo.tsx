import { SectionList, StyleSheet, View } from 'react-native';
import { useEmplacements, useMoi, useStock } from '@/api/hooks';
import type { Aliment, Emplacement, LigneStock } from '@/api/types';
import { Carte, Chargement, Chiffre, Discret, Erreur, Texte, Vide } from '@/composants/base';
import { C, E, P, couleurRole, nb } from '@/theme';

const nomDe = (v: Aliment | string) => (typeof v === 'string' ? '—' : v.nom);
const catDe = (v: Aliment | string) => (typeof v === 'string' ? 'autre' : v.categorie);

export default function Frigo() {
  const moi = useMoi();
  const stock = useStock();
  const emplacements = useEmplacements();

  if (stock.isLoading || emplacements.isLoading) return <Chargement />;
  if (stock.isError) return <Erreur message={stock.error.message} onReessayer={() => void stock.refetch()} />;

  /* L'admin lit son stock dans Grocy : cet écran ne le concerne pas. */
  if (moi.data?.sourceFrigo === 'grocy') {
    return (
      <Vide message="Tes ingrédients viennent de Grocy. Cet écran sert aux comptes qui gèrent leur stock ici." />
    );
  }

  const parEmplacement = new Map<number, LigneStock[]>();
  for (const l of stock.data ?? []) {
    const e = l.emplacement as Emplacement;
    const cle = typeof e === 'string' ? 0 : e.id;
    parEmplacement.set(cle, [...(parEmplacement.get(cle) ?? []), l]);
  }

  const sections = (emplacements.data ?? [])
    .map((e) => ({ titre: e.libelle, data: parEmplacement.get(e.id) ?? [] }))
    .filter((s) => s.data.length > 0);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(l) => String(l.id)}
      contentContainerStyle={s.page}
      refreshing={stock.isRefetching}
      onRefresh={() => void stock.refetch()}
      ListEmptyComponent={<Vide message="Ton frigo est vide. Ajoute ce que tu as sous la main." />}
      renderSectionHeader={({ section }) => (
        <Discret style={s.section}>{section.titre}</Discret>
      )}
      renderItem={({ item }) => (
        <Carte style={s.carte}>
          <View style={[s.pastille, { backgroundColor: couleurRole(catDe(item.aliment)) }]} />
          <Texte style={{ flex: 1 }} numberOfLines={1}>{nomDe(item.aliment)}</Texte>
          <Chiffre taille={18}>{nb(item.quantite)} g</Chiffre>
        </Carte>
      )}
    />
  );
}

const s = StyleSheet.create({
  page: { padding: E.m, gap: E.s, flexGrow: 1 },
  section: {
    fontFamily: P.titre, fontSize: 14, letterSpacing: 1.4,
    textTransform: 'uppercase', marginTop: E.m, marginBottom: E.xs,
  },
  carte: { flexDirection: 'row', alignItems: 'center', gap: E.m },
  pastille: { width: 4, height: 26, borderRadius: 3 },
});
