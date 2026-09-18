import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { amorcerSession } from '@/api/client';
import { useConnexion } from '@/api/hooks';
import { Bouton, Champ, Discret, Texte, Titre } from '@/composants/base';
import { C, E, T } from '@/theme';

export default function Connexion() {
  const router = useRouter();
  const connexion = useConnexion();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');

  /* « ENTRÉE » DEPUIS L'ADRESSE DONNE LA MAIN, ELLE NE VALIDE PAS.
     Les deux champs portaient `onValider`, et `valider()` sort tout de suite
     si le mot de passe est vide — ce qu'il est par construction quand on est
     encore dans le champ adresse. La touche ne faisait donc rien, sans un
     mot : le défaut qu'on venait de corriger, réintroduit un champ plus haut.
     Relevé le 18 septembre 2026 en confrontant l'écran à la documentation
     React Native, qui décrit exactement cet enchaînement. */
  const champMotDePasse = useRef<TextInput>(null);

  /* ON RETENTE L'AMORÇAGE EN ARRIVANT ICI — 18 septembre 2026, revue de M5.
     Sur le web, la session vit dans un cookie que seul le serveur voit. Si
     l'API était injoignable au chargement de la page — un NAS qui redémarre
     pendant un déploiement, quelques secondes —, l'application conclut « pas
     connecté » et envoie ici quelqu'un dont la session est parfaitement
     vivante. Il n'avait alors d'autre issue que de retaper son mot de passe.
     Cet écran est le seul endroit où l'on sait que la conclusion pourrait
     être fausse : on redemande, et si une session répond, on s'efface.
     `amorcerSession` ne retente que ce qui n'a pas été tranché — un vrai
     refus du serveur ne repart pas en boucle. */
  useEffect(() => {
    let vivant = true;
    void amorcerSession().then((j) => {
      if (vivant && j !== null && j !== '') router.replace('/(onglets)/seances');
    }, () => { /* toujours pas de session : on reste sur cet écran */ });

    return () => { vivant = false; };
  }, [router]);

  const valider = () => {
    if (!email.trim() || !motDePasse) return;
    connexion.mutate(
      { email: email.trim(), motDePasse },
      { onSuccess: () => router.replace('/(onglets)/seances') },
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: C.fond }}
    >
      <ScrollView
        contentContainerStyle={[s.page, { paddingTop: insets.top + 60 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Titre>fitcarnet</Titre>
        <Discret style={{ marginBottom: E.xl }}>
          Tes séances et tes repas, au même endroit.
        </Discret>

        <Champ
          etiquette="Adresse e-mail"
          valeur={email}
          onChange={setEmail}
          placeholder="email@exemple.com"
          autoComplete="email"
          onSuivant={() => champMotDePasse.current?.focus()}
        />
        <Champ
          etiquette="Mot de passe"
          valeur={motDePasse}
          onChange={setMotDePasse}
          motDePasse
          champRef={champMotDePasse}
          autoComplete="current-password"
          style={{ marginTop: E.m }}
          /* « Entrée » connecte, depuis CE champ — le dernier. Sur le web, le
             bouton était le seul chemin : React Native Web ne pose pas de
             formulaire HTML, donc rien ne se soumettait. `valider` refuse de
             lui-même un champ vide, comme le bouton qui se grise. */
          onValider={valider}
        />

        {connexion.isError && (
          <Texte style={{ color: C.erreur, marginTop: E.m, fontSize: T.normal }}>
            {connexion.error.message}
          </Texte>
        )}

        <Bouton
          onPress={valider}
          desactive={connexion.isPending || !email.trim() || !motDePasse}
          style={{ marginTop: E.xl }}
        >
          {connexion.isPending ? 'Connexion…' : 'Se connecter'}
        </Bouton>

        <View style={{ height: E.xl }} />
        <Discret style={{ fontSize: T.petit, textAlign: 'center' }}>
          Les comptes sont créés par l'administrateur.
        </Discret>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { paddingHorizontal: E.l, paddingBottom: E.xl, maxWidth: 460, width: '100%', alignSelf: 'center' },
});
