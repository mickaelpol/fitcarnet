import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useDeconnexion, useMoi } from '@/api/hooks';
import { Bouton, Carte, Chargement, Discret, Texte } from '@/composants/base';
import { C, E, P, T } from '@/theme';

export default function Compte() {
  const router = useRouter();
  const { data, isLoading } = useMoi();
  const deconnecter = useDeconnexion();

  if (isLoading) return <Chargement />;

  return (
    <ScrollView contentContainerStyle={s.page}>
      <Carte>
        <Discret style={s.etiquette}>Compte</Discret>
        <Texte style={{ fontFamily: P.fort, fontSize: T.grand }}>{data?.nom ?? '—'}</Texte>
        <Discret>{data?.email ?? ''}</Discret>

        <View style={s.separateur} />

        <Discret style={s.etiquette}>Mes ingrédients</Discret>
        <Texte>
          {data?.sourceFrigo === 'grocy'
            ? 'Synchronisés depuis Grocy'
            : 'Gérés dans l’onglet « Mon frigo »'}
        </Texte>
      </Carte>

      <Bouton variante="contour" onPress={() => router.push('/objectifs')}>
        Mes objectifs par repas
      </Bouton>

      <Bouton variante="contour" onPress={() => router.push('/reglages')}>
        Réglages de l’app
      </Bouton>

      {data?.roles?.includes('ROLE_ADMIN') === true && (
        <>
          <Discret style={[s.etiquette, { marginTop: E.l }]}>Administration</Discret>
          <Bouton variante="contour" onPress={() => router.push('/admin-videos')}>
            Vidéos des exercices
          </Bouton>
          <Bouton variante="contour" onPress={() => router.push('/admin-fusion')}>
            Fusionner des exercices
          </Bouton>
        </>
      )}

      <Bouton
        variante="discret"
        onPress={() => { void deconnecter().then(() => router.replace('/connexion')); }}
        style={{ marginTop: E.l }}
      >
        Se déconnecter
      </Bouton>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { padding: E.m, gap: E.s },
  etiquette: {
    fontSize: T.minuscule, letterSpacing: 1, textTransform: 'uppercase',
    color: C.discret, marginBottom: E.xs,
  },
  separateur: { height: 1, backgroundColor: C.ligne, marginVertical: E.m },
});
