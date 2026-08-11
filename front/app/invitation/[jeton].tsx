import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { useAccepterInvitation, useInvitation } from '@/api/hooks';
import { Bouton, Carte, Champ, Chargement, Discret, Texte, Titre } from '@/composants/base';
import { C, E, P, T } from '@/theme';

/** Le minimum du serveur. Écrit ici aussi, pour le dire AVANT l'envoi. */
const LONGUEUR_MINIMALE = 10;

/**
 * CRÉER SON COMPTE, DEPUIS UN LIEN D'INVITATION.
 *
 * Le seul écran de l'application qu'on ouvre sans compte — c'est tout son
 * objet. Le jeton dans l'adresse tient lieu d'authentification : 32 octets
 * tirés au sort, qu'on ne devine pas, et qui ne servent qu'une fois.
 *
 * L'ADRESSE EST AFFICHÉE, PAS SAISIE. Elle vient de l'invitation, et le
 * serveur ignore celle qu'on lui enverrait. Sans ça, n'importe quel lien
 * deviendrait le droit de créer n'importe quel compte — y compris avec
 * l'adresse de quelqu'un d'autre.
 *
 * ON VÉRIFIE LE LIEN AVANT D'AFFICHER LE FORMULAIRE. Laisser quelqu'un
 * choisir un mot de passe pour apprendre à l'envoi que le lien est périmé,
 * c'est lui faire perdre son temps et lui donner l'impression que c'est de sa
 * faute.
 *
 * UN LIEN MORT NE DIT PAS POURQUOI. Inconnu, déjà utilisé, périmé : même
 * message. La nuance n'aiderait personne à agir — dans les trois cas il faut
 * redemander un lien — et elle apprendrait à un inconnu qu'un jeton donné a
 * existé.
 */
export default function AccepterInvitation() {
  const { jeton } = useLocalSearchParams<{ jeton: string }>();
  const router = useRouter();

  const invitation = useInvitation(jeton);
  const accepter = useAccepterInvitation(jeton);

  const [nom, setNom] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');

  if (invitation.isLoading) return <Chargement texte="Vérification du lien…" />;

  if (invitation.isError || invitation.data === undefined) {
    return (
      <ScrollView contentContainerStyle={s.page}>
        <Titre>Ce lien n’est plus valable</Titre>
        <Discret style={s.aide}>
          Il a peut-être déjà servi, ou il a passé sa date. Demande une nouvelle
          invitation — c’est l’affaire de quelques secondes pour la personne qui
          t’a invité.
        </Discret>
        <Bouton variante="contour" onPress={() => router.replace('/connexion')}>
          Aller à la connexion
        </Bouton>
      </ScrollView>
    );
  }

  /* Le compte existe. On ne connecte pas automatiquement : taper son mot de
     passe une première fois, tout de suite, c'est ce qui fait qu'on s'en
     souvient — et ça vérifie qu'il a bien été enregistré. */
  if (accepter.isSuccess) {
    return (
      <ScrollView contentContainerStyle={s.page}>
        <Titre>Ton compte est prêt</Titre>
        <Discret style={s.aide}>
          Connecte-toi avec {invitation.data.email} et le mot de passe que tu
          viens de choisir.
        </Discret>
        <Bouton onPress={() => router.replace('/connexion')}>Se connecter</Bouton>
      </ScrollView>
    );
  }

  const trop_court = motDePasse !== '' && motDePasse.length < LONGUEUR_MINIMALE;
  /* On ne signale la différence qu'une fois la confirmation commencée :
     alerter dès la première lettre reviendrait à crier pendant toute la
     saisie. */
  const differe = confirmation !== '' && confirmation !== motDePasse;
  const pret = nom.trim() !== ''
    && motDePasse.length >= LONGUEUR_MINIMALE
    && confirmation === motDePasse;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.page}>
        <Titre>Bienvenue sur fitcarnet</Titre>
        <Discret style={s.aide}>
          Ton compte sera créé pour <Texte style={{ color: C.vif }}>{invitation.data.email}</Texte>.
          Choisis un nom et un mot de passe : personne d’autre ne les verra.
        </Discret>

        <Carte style={{ gap: E.s }}>
          <Champ
            valeur={nom}
            onChange={setNom}
            placeholder="Mickaël"
            etiquette="Ton nom"
          />
          <Discret style={s.aide}>
            Celui qui s’affichera dans l’application. Le prénom suffit.
          </Discret>

          <Champ
            valeur={motDePasse}
            onChange={setMotDePasse}
            motDePasse
            etiquette="Mot de passe"
          />
          <Discret style={[s.aide, trop_court && { color: C.vif }]}>
            {LONGUEUR_MINIMALE} caractères au minimum. Ni majuscule ni chiffre
            imposés : une phrase dont tu te souviens vaut mieux qu’un
            « Motdepasse1! » noté sur un papier.
          </Discret>

          <Champ
            valeur={confirmation}
            onChange={setConfirmation}
            motDePasse
            etiquette="Répète-le"
          />
          {differe && (
            <Discret style={[s.aide, { color: C.vif }]}>
              Les deux ne sont pas identiques.
            </Discret>
          )}

          <Bouton
            onPress={() => accepter.mutate({ nom: nom.trim(), motDePasse })}
            desactive={!pret || accepter.isPending}
          >
            {accepter.isPending ? 'Création…' : 'Créer mon compte'}
          </Bouton>

          {accepter.isError && (
            <Discret style={[s.aide, { color: C.erreur }]}>{accepter.error.message}</Discret>
          )}
        </Carte>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { padding: E.l, gap: E.m, flexGrow: 1, justifyContent: 'center' },
  aide: { fontSize: T.petit, lineHeight: 18 },
  titre: { fontFamily: P.fort, fontSize: T.moyen },
});
