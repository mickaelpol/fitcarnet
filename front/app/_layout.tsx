import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { Inter_400Regular, Inter_600SemiBold, useFonts } from '@expo-google-fonts/inter';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { chargerJeton, surSessionFinie } from '@/api/client';
import { useMoi } from '@/api/hooks';
import { PERSISTANCE, purgerLeCache } from '@/api/persistance';
import { useConnecte } from '@/api/session';
import { Chargement } from '@/composants/base';
import { EnTete } from '@/composants/enTete';
import { C } from '@/theme';

/**
 * Cache prudent : les données restent affichées pendant le rechargement,
 * et une salle de sport mal couverte ne vide pas l'écran.
 */
const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

/* --------------------------------------------------- le portier d'administration
 *
 * UN SEUL ENDROIT, ET NON QUATRE — 15 septembre 2026.
 *
 * Les quatre écrans `admin-*.tsx` portaient chacun leur propre garde, recopié
 * quatre fois, et déjà dans DEUX orthographes différentes :
 * `!moi.data?.roles?.includes('ROLE_ADMIN')` sur trois d'entre eux,
 * `... !== true` sur le quatrième. C'est exactement le motif de défaut dominant
 * du projet — une règle recopiée devant chaque porte finit par manquer devant
 * la cinquième. Le contrôle vit désormais au point de passage obligé : le
 * prochain écran `admin-*` naîtra protégé, sans que personne y pense.
 *
 * CE QUE ÇA CORRIGE EN PLUS DU LIEN. Le lien de l'onglet Compte était déjà
 * conditionné au rôle, mais un lien caché ne protège rien : sur le web on TAPE
 * l'adresse. `admin-utilisateurs` montait alors ses hooks AVANT son garde et
 * lançait `/api/invitations` et `/api/comptes` — deux 403, relancés deux fois
 * chacun par la politique de réessai. L'écran n'est plus monté du tout.
 *
 * LES QUATRE GARDES D'ÉCRAN RESTENT, MAIS PAS POUR LA RAISON D'ABORD ÉCRITE
 * ICI. On lisait « ils couvrent le cas où `/moi` répond depuis un cache périmé
 * pendant que le portier hésite » : c'est faux, et la revue l'a relevé le jour
 * même. Les quatre écrans lisent la MÊME requête `['moi']` par le MÊME hook,
 * au même instant — ils ne peuvent pas contredire ce portier-ci. Et comme
 * `children` n'est monté que si `admin === true`, ils sont aujourd'hui
 * strictement inatteignables.
 *
 * On les garde quand même, et c'est un choix : le jour où ce portier serait
 * déplacé, remplacé ou contourné par une refonte du routage, ils redeviennent
 * la seule barrière côté écran. Ils ne coûtent rien. Mais qu'on ne s'y trompe
 * pas — ils ne protègent rien aujourd'hui. La vraie
 * protection, elle, n'est ni ici ni là-bas : elle est côté API, où les dix-huit
 * portes d'administration sont fermées — six par `#[IsGranted('ROLE_ADMIN')]`,
 * les autres par `security:` dans leur `#[ApiResource]`. L'inventaire vit dans
 * `api/tests/Security/SurfaceAdministrationTest.php`, et il est vérifié dans
 * les deux sens. Un compte curieux appelle l'API directement, sans jamais
 * passer par cet écran : ce portier-ci est du confort, pas une garantie.
 *
 * `moi.isPending` VEUT DIRE « JE NE SAIS PAS ENCORE », et surtout pas « non ».
 * Rediriger pendant la lecture renverrait l'administrateur lui-même hors de
 * ses écrans à chaque démarrage à froid. Tant qu'on ne sait pas, on n'affiche
 * rien — même choix que le portier de session juste en dessous. */
function PortierAdmin({ children }: { children: ReactNode }) {
  const segments = useSegments();
  const routeur = useRouter();
  /* `useMoi` est une requête React Query : ce composant DOIT vivre sous le
     fournisseur, ce que `Racine` ne fait pas — d'où un composant séparé. */
  const moi = useMoi();

  /* Le préfixe du fichier fait foi, pas une liste : `app/admin-fusion.tsx`
     donne le segment `admin-fusion`. Une liste écrite à la main serait un
     cinquième endroit à tenir à jour, et c'est le problème qu'on ferme. */
  const ecranDAdministration = (segments[0] ?? '').startsWith('admin-');
  const admin = moi.data?.roles?.includes('ROLE_ADMIN') === true;

  useEffect(() => {
    if (!ecranDAdministration || moi.isPending || admin) return;
    /* `replace` et non `push` : revenir en arrière sur un écran interdit
       n'a pas de sens, et le remettrait dans la pile. */
    routeur.replace('/(onglets)/compte');
  }, [ecranDAdministration, moi.isPending, admin, routeur]);

  if (ecranDAdministration && !admin) {
    return <View style={{ flex: 1, backgroundColor: C.fond }}><Chargement /></View>;
  }

  return <>{children}</>;
}

export default function Racine() {
  const [polices] = useFonts({
    Inter_400Regular, Inter_600SemiBold,
    BarlowCondensed_600SemiBold, BarlowCondensed_700Bold,
  });
  const [pret, setPret] = useState(false);
  const routeur = useRouter();
  const segments = useSegments();
  const connecte = useConnecte();

  /* ON EST PRÊT MÊME SI LA LECTURE DU COFFRE ÉCHOUE (F14, 15 septembre 2026).
     Sur le web le coffre est `localStorage`, et il ne se contente pas d'être
     absent : en navigation privée, cookies bloqués, ou stockage refusé par une
     politique, il EXISTE et JETTE. La promesse partait alors en rejet sans
     personne pour l'attraper, `pret` restait faux, et l'écran de chargement
     ci-dessous s'affichait indéfiniment — une application qui ne démarre pas et
     ne dit pas pourquoi. Sans jeton lisible, on n'est pas connecté : le portier
     enverra vers la connexion, ce qui est au moins un écran. */
  useEffect(() => {
    void chargerJeton().then(() => setPret(true), () => setPret(true));
  }, []);

  /* --------------------------------------------------------- le portier
   *
   * TOUTE L'APPLICATION EXIGE UN COMPTE. Deux exceptions, et deux seulement :
   * l'écran de connexion, et l'acceptation d'une invitation — qu'on ouvre
   * précisément quand on n'a pas encore de compte.
   *
   * POURQUOI ÇA MANQUAIT, ET POURQUOI ÇA NE SE VOYAIT PAS.
   *
   * Sur un téléphone, on n'atteint un écran qu'en naviguant, et toute
   * navigation partait de l'aiguillage de `index.tsx`, qui vérifiait. Dans un
   * navigateur, on TAPE une adresse : `/frigo` s'ouvrait sans passer par nulle
   * part. L'API refusait bien les données — chaque requête est authentifiée —
   * mais l'écran s'affichait, vide et couvert d'erreurs rouges. Ce n'était pas
   * une fuite de données ; c'était une porte qui a l'air ouverte.
   *
   * `connecte === null` VEUT DIRE « JE NE SAIS PAS ENCORE ». Le traiter comme
   * un refus renverrait tout le monde vers la connexion à chaque démarrage, le
   * temps de lire le coffre — y compris ceux qui sont connectés. */
  const ouverteATous = segments[0] === 'connexion'
    || segments[0] === 'invitation'
    /* La racine : c'est `index.tsx` qui aiguille, et il sait déjà le faire. */
    || segments[0] === undefined;

  useEffect(() => {
    if (connecte === null || ouverteATous) return;
    if (!connecte) routeur.replace('/connexion');
  }, [connecte, ouverteATous, routeur]);

  /* Quand le renouvellement échoue — jeton révoqué, échéance dépassée — la
     session est finie pour de bon : on ramène à la connexion plutôt que de
     laisser des écrans vides derrière un message rouge. `replace` et non
     `push` : revenir en arrière sur une session morte n'a pas de sens.

     Le cache est vidé au passage, sans quoi les données du compte précédent
     réapparaîtraient une fraction de seconde à la connexion suivante. */
  useEffect(() => {
    surSessionFinie(() => {
      /* LA MÉMOIRE ET LE DISQUE, dans cet ordre : `purgerLeCache` porte les
         deux. C'était `client.clear()` suivi de l'effacement du disque, écrit à
         la main ici comme aux deux autres endroits qui purgent — trois copies
         d'un ordre dont dépend la confidentialité du cache (F9). */
      void purgerLeCache(client);
      routeur.replace('/connexion');
    });

    return () => { surSessionFinie(null); };
  }, [routeur]);

  /* ON N'AFFICHE RIEN PLUTÔT QU'UN ÉCRAN QU'ON VA QUITTER.
   *
   * La redirection ci-dessus prend un cycle de rendu. Sans cette garde,
   * l'écran protégé s'affiche pendant ce cycle — assez pour être vu, et pour
   * lancer ses requêtes. */
  if (!polices || !pret || (connecte === false && !ouverteATous)) {
    return <View style={{ flex: 1, backgroundColor: C.fond }}><Chargement /></View>;
  }

  /* Le glisser-déposer natif de React Native exige cette enveloppe.
     Sur le web on s'en passe : elle intercepterait les clics, et le
     glisser y repose sur les attributs HTML natifs. */
  const Enveloppe = Platform.OS === 'web' ? View : GestureHandlerRootView;

  return (
    <Enveloppe style={{ flex: 1 }}>
    {/* Le cache est relu depuis le disque avant le premier rendu : au
        démarrage à froid, les écrans s'affichent avec ce qu'on savait hier
        pendant que les requêtes repartent en arrière-plan. */}
    <PersistQueryClientProvider client={client} persistOptions={PERSISTANCE}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <PortierAdmin>
          <Stack
            screenOptions={{
              /* En-tête dessiné par nous : celui de react-native-screens passait
                 sous la barre d'état. Voir src/composants/enTete.tsx. */
              header: (props) => <EnTete {...props} />,
              contentStyle: { backgroundColor: C.fond },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="connexion" options={{ title: 'Connexion', headerShown: false }} />
            <Stack.Screen name="(onglets)" options={{ headerShown: false }} />
            <Stack.Screen name="seance/[id]" options={{ title: 'Séance' }} />
            <Stack.Screen name="modele/[id]" options={{ title: 'Modèle' }} />
            <Stack.Screen name="objectifs" options={{ title: 'Mes objectifs' }} />
            <Stack.Screen name="reglages" options={{ title: 'Réglages de l’app' }} />
            <Stack.Screen name="admin-exercices" options={{ title: 'Gestion des exercices' }} />
            <Stack.Screen name="admin-fusion" options={{ title: 'Fusionner des exercices' }} />
            <Stack.Screen name="admin-cuissons" options={{ title: 'Façons de cuire' }} />
            <Stack.Screen name="admin-utilisateurs" options={{ title: 'Inviter quelqu’un' }} />
            {/* Ouvert SANS compte, depuis un lien : pas de flèche de retour, il
                n'y a rien derrière. C'est souvent le premier écran de
                l'application que la personne voit. */}
            <Stack.Screen
              name="invitation/[jeton]"
              options={{ title: 'Créer mon compte', headerBackVisible: false }}
            />
          </Stack>
        </PortierAdmin>
      </SafeAreaProvider>
    </PersistQueryClientProvider>
    </Enveloppe>
  );
}
