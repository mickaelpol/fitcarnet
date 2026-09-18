import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConnexion } from '@/api/hooks';
import { Bouton, Champ, Discret, Texte, Titre } from '@/composants/base';
import { C, E, T } from '@/theme';

export default function Connexion() {
  const router = useRouter();
  const connexion = useConnexion();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');

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
          onValider={valider}
        />
        <Champ
          etiquette="Mot de passe"
          valeur={motDePasse}
          onChange={setMotDePasse}
          motDePasse
          style={{ marginTop: E.m }}
          /* « Entrée » connecte, depuis les DEUX champs. Sur le web, le bouton
             etait le seul chemin : React Native Web ne pose pas de formulaire
             HTML, donc rien ne se soumettait. `valider` refuse de lui-meme un
             champ vide, comme le bouton qui se grise. */
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
