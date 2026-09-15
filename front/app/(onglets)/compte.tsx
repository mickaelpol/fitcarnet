import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useDeconnexion, useMoi } from '@/api/hooks';
import { Bouton, Carte, Chargement, Discret, Erreur, Texte } from '@/composants/base';
import { BandeauMaj } from '@/composants/bandeauMaj';
import { MesComplements } from '@/composants/complements';
import { EtatMaj } from '@/composants/etatMaj';
import { C, E, P, T } from '@/theme';

export default function Compte() {
  const router = useRouter();
  const { data, isPending, isError, error, refetch } = useMoi();
  const deconnecter = useDeconnexion();

  /* `isPending` ET NON `isLoading`, DEPUIS QUE `useMoi` CONNAIT LA SESSION.
     `isLoading` vaut `isPending && isFetching` : quand `useMoi` est desactive
     — le temps que `useConnecte` lise le coffre, a chaque montage — rien ne
     part sur le reseau, donc `isFetching` est faux, donc `isLoading` AUSSI.
     L'ecran passait alors les deux gardes avec `data` indefini et affichait le
     tiret et « Gérés dans l'onglet Mon frigo » comme un fait : exactement la
     panne decrite juste en dessous, revenue par la porte de derriere en
     ajoutant `enabled` a `useMoi`. Relevee par la revue le 15 septembre 2026,
     le jour meme. `isPending` dit « je n'ai pas de donnee », sans rien
     supposer de ce qui circule. */
  if (isPending) return <Chargement />;

  /* UN ECHEC DOIT SE VOIR, ET IL NE SE VOYAIT PAS.
     Seul `isLoading` etait lu. Reseau coupe ou session expiree, l'ecran
     s'affichait quand meme : un nom remplace par un tiret, une adresse vide,
     et surtout « Gérés dans l'onglet Mon frigo » affiche comme un fait alors
     que rien n'avait ete recu. Une information fausse presentee calmement est
     pire qu'une erreur — on la croit. Tous les autres ecrans utilisent deja ce
     composant. */
  if (isError) {
    return <Erreur message={error.message} onReessayer={() => void refetch()} />;
  }

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

      {/* JUSTE SOUS LES OBJECTIFS, ET C'EST LEUR PLACE.
          Un complément se rattache à un moment de repas, exactement comme une
          cible macro, et les deux se règlent dans la même séance : on s'assoit
          une fois pour dire ce qu'on vise et ce qu'on prend. */}
      <MesComplements />

      <Bouton variante="contour" onPress={() => router.push('/reglages')}>
        Réglages de l’app
      </Bouton>

      {/* La mise à jour vit ICI et non en haut de chaque écran : elle
          concerne quelques fois par an, et un bandeau permanent au-dessus du
          calculateur volerait de la place à ce qu'on vient faire. L'onglet
          Compte est l'endroit où l'on va quand on s'occupe de
          l'application elle-même. */}
      <BandeauMaj url={process.env.EXPO_PUBLIC_MAJ_URL} />

      {/* Ce que le bandeau ne dit pas : ce qui tourne AUJOURD'HUI. Le bandeau
          ne parle que d'un APK à installer ; les mises à jour JavaScript, elles,
          arrivent sans un mot — et quand elles n'arrivent pas, rien ne le dit
          non plus. Ce panneau donne les numéros et un bouton. */}
      <EtatMaj />

      {data?.roles?.includes('ROLE_ADMIN') === true && (
        <>
          <Discret style={[s.etiquette, { marginTop: E.l }]}>Administration</Discret>
          <Bouton variante="contour" onPress={() => router.push('/admin-exercices')}>
            Gestion des exercices
          </Bouton>
          <Bouton variante="contour" onPress={() => router.push('/admin-fusion')}>
            Fusionner des exercices
          </Bouton>
          <Bouton variante="contour" onPress={() => router.push('/admin-cuissons')}>
            Façons de cuire
          </Bouton>
          <Bouton variante="contour" onPress={() => router.push('/admin-utilisateurs')}>
            Inviter quelqu’un
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
