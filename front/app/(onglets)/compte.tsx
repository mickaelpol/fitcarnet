import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useDeconnexion, useMoi } from '@/api/hooks';
import { Bouton, Carte, Discret, Texte } from '@/composants/base';
import { CadreCompte } from '@/composants/cadreCompte';
import { BandeauMaj } from '@/composants/bandeauMaj';
import { MesComplements } from '@/composants/complements';
import { EtatMaj } from '@/composants/etatMaj';
import { C, E, P, T } from '@/theme';

export default function Compte() {
  const router = useRouter();
  const { data, isPending, isError, error, refetch } = useMoi();
  const deconnecter = useDeconnexion();

  /* CET ECRAN N'A PLUS DE `return` PRECOCE, ET C'EST TOUT L'OBJET D'E14.
     Il en avait deux — un pour l'attente, un pour l'erreur — et le bouton
     « Se déconnecter » vivait quarante lignes plus bas, donc apres eux. Une
     panne de `/api/moi` retirait ainsi la seule sortie de la session.
     `CadreCompte` decide ce qu'il montre ; la sortie, elle, n'est plus sous
     aucune condition. Voir `src/composants/cadreCompte.tsx` et son test.

     `isPending` ET NON `isLoading`, DEPUIS QUE `useMoi` CONNAIT LA SESSION.
     `isLoading` vaut `isPending && isFetching` : quand `useMoi` est desactive
     — le temps que `useConnecte` lise le coffre, a chaque montage — rien ne
     part sur le reseau, donc `isFetching` est faux, donc `isLoading` AUSSI.
     L'ecran passait alors ses deux gardes avec `data` indefini et affichait le
     tiret et « Gérés dans l'onglet Mon frigo » comme un fait. Une information
     fausse presentee calmement est pire qu'une erreur — on la croit.
     `isPending` dit « je n'ai pas de donnee », sans rien supposer de ce qui
     circule. Relevee par la revue le 15 septembre 2026. */
  const etat = isPending ? 'attente' : isError ? 'erreur' : 'pret';

  return (
    <CadreCompte
      etat={etat}
      messageErreur={isError ? error.message : ''}
      onReessayer={() => void refetch()}
      onDeconnexion={() => { void deconnecter().then(() => router.replace('/connexion')); }}
    >
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

      {/* PAS DE CARTE D'AVERTISSEMENT ICI, ET C'EST UN RETRAIT ASSUME.
          Il y en avait une, et elle disait exactement ce que dit le bandeau
          qui coiffe desormais TOUS les ecrans, celui-ci compris : sur cet
          onglet, le message apparaissait donc deux fois a dix centimetres
          d'ecart. Repeter n'insiste pas, ca dilue — et ca faisait deux textes
          a tenir a jour pour une seule idee.
          Le bouton ci-dessous reste, lui, en permanence : changer son mot de
          passe est un geste normal, pas une reparation. */}
      <Bouton variante="contour" onPress={() => router.push('/mot-de-passe')}>
        Changer mon mot de passe
      </Bouton>

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

    </CadreCompte>
  );
}

const s = StyleSheet.create({
  etiquette: {
    fontSize: T.minuscule, letterSpacing: 1, textTransform: 'uppercase',
    color: C.discret, marginBottom: E.xs,
  },
  separateur: { height: 1, backgroundColor: C.ligne, marginVertical: E.m },
});
