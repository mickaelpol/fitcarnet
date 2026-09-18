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

      {/* `=== true` ET NON `?.` SEUL : `motDePasseFaible` est facultatif, et un
          APK installé il y a des mois parle à l'API d'aujourd'hui sans que le
          champ existe. `undefined` veut dire « je ne sais pas », donc on
          n'affiche rien — surtout pas un avertissement rouge inventé.

          LE TON : on informe, on ne gronde pas. Les règles ont durci le
          18 septembre 2026 ; ce compte a été créé avant, son mot de passe est
          resté valable, et rien n'est bloqué. Mettre quelqu'un dehors pour une
          règle qui n'existait pas quand il a choisi son mot de passe serait le
          punir d'une décision qui n'est pas la sienne. */}
      {data?.motDePasseFaible === true && (
        <Carte style={s.alerte}>
          <Discret style={s.etiquette}>Mot de passe</Discret>
          <Texte>Ton mot de passe ne suit plus les règles actuelles.</Texte>
          {/* ON NE RECOPIE PAS LES EXIGENCES ICI. Les nommer une seconde fois
              ferait un second endroit à corriger le jour où elles rebougent —
              c'est exactement ce qui a laissé l'écran d'invitation promettre
              « 10 caractères » après le durcissement. L'écran de changement
              les affiche, et il les tient de `src/calcul/motDePasse.ts`. */}
          <Discret style={s.alerteTexte}>
            Elles ont changé le 18 septembre 2026, et le tien a été choisi
            avant. Il reste valable —{' '}
            <Texte style={s.alerteFort}>rien n’est bloqué</Texte>, tu peux
            continuer à t’en servir. Si tu veux en choisir un autre, l’écran de
            changement dit ce qu’on demande aujourd’hui.
          </Discret>
          <Bouton
            variante="contour"
            onPress={() => router.push('/mot-de-passe')}
            style={{ marginTop: E.s }}
          >
            Choisir un nouveau mot de passe
          </Bouton>
        </Carte>
      )}

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
  alerte: { backgroundColor: C.erreurFond, borderColor: C.erreur },
  alerteTexte: { fontSize: T.petit, lineHeight: 18, marginTop: E.xs },
  alerteFort: { fontFamily: P.fort, fontSize: T.petit },
});
