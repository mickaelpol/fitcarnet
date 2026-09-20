import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { useChangerMotDePasse, useDeconnexion, useMoi } from '@/api/hooks';
/* LA JAUGE VIENT DU SERVEUR — 20 septembre 2026. `acceptable` etait le
   dernier juge local du mot de passe, tenu par `api/regles/motdepasse.json` :
   le fichier n'a plus rien a verrouiller. */
import { useJaugeMotDePasse } from '@/api/hooks/verification';
import { Bouton, Carte, Champ, Chargement, Discret, Erreur, Texte, Titre } from '@/composants/base';
import { JaugeMotDePasse } from '@/composants/jaugeMotDePasse';
import { C, E, T } from '@/theme';

/**
 * CHANGER SON MOT DE PASSE.
 *
 * TROIS CHAMPS, ET LE PREMIER N'EST PAS DÉCORATIF. Le mot de passe actuel est
 * exigé par le serveur (`UtilisateurProcessor`) : sans lui, un onglet laissé
 * ouvert dans une bibliothèque suffirait à s'approprier un compte.
 *
 * LA RÉUSSITE DÉCONNECTE, ET L'ÉCRAN DOIT LE DIRE AVANT. Le serveur révoque
 * tous les jetons de RAFRAÎCHISSEMENT du compte — y compris celui de l'appareil
 * qui fait le changement, parce qu'un jeton volé ne doit pas survivre au
 * changement de mot de passe qu'il a motivé.
 *
 * MAIS PAS LES JWT DÉJÀ ÉMIS, et le panneau de fin le dit maintenant. Un autre
 * appareil garde son jeton d'accès jusqu'à son échéance — une heure au plus —
 * et peut lire ET écrire pendant ce temps. Mesuré le 19 septembre 2026. On affiche donc un panneau qui
 * l'annonce et on attend un geste, au lieu de renvoyer vers la connexion sans
 * un mot : être éjecté juste après avoir validé ressemble à un échec, et on
 * retape alors l'ancien mot de passe en croyant que rien n'a pris.
 *
 * AUCUNE RÈGLE DE MOT DE PASSE N'EST ÉCRITE NI CALCULÉE ICI. La jauge et le
 * droit d'envoyer viennent du SERVEUR depuis le 20 septembre 2026 : il rend
 * les cinq exigences avec leurs phrases, le niveau de la barre et le mot qui
 * l'accompagne. Il n'y a plus deux écritures tenues par un fichier de règles ;
 * il n'y en a qu'une.
 *
 * Recopier « douze caractères » dans un écran, c'est se préparer à le laisser
 * derrière le jour où le chiffre bouge — ce qui est précisément arrivé à
 * l'écran d'invitation, resté sur « 10 caractères, ni majuscule ni chiffre
 * imposés » après le durcissement du 18 septembre 2026.
 */
export default function MotDePasse() {
  const router = useRouter();
  const moi = useMoi();
  const changer = useChangerMotDePasse();
  const deconnecter = useDeconnexion();

  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');

  /* LE SERVEUR JUGE LE MOT DE PASSE, cet écran l'affiche. La jauge et le
     droit d'envoyer viennent de lui : il n'y a plus deux écritures de la
     même règle, donc plus rien à tenir aligné. */
  const { jauge, perime: jaugePerimee } = useJaugeMotDePasse(nouveau);
  const [confirmation, setConfirmation] = useState('');

  /* « Entrée » descend d'un champ, puis valide sur le dernier. Sur le web,
     React Native Web ne pose aucun vrai formulaire HTML : sans ces trois
     liens, la touche Entrée ne ferait rien du tout, en silence. */
  const champNouveau = useRef<TextInput>(null);
  const champConfirmation = useRef<TextInput>(null);

  /* LE PANNEAU DE RÉUSSITE PASSE AVANT LES GARDES DE `useMoi`, et l'ordre
     compte : les sessions viennent d'être révoquées. Une relecture de `/moi`
     qui échouerait ensuite remplacerait le « c'est fait » par un écran rouge,
     et donnerait à un changement réussi l'allure d'une panne. */
  if (changer.isSuccess) {
    return (
      <ScrollView contentContainerStyle={s.page}>
        <Titre>C’est fait</Titre>
        <Carte style={{ gap: E.s }}>
          <Texte>Ton mot de passe a été remplacé.</Texte>
          {/* CE TEXTE A ÉTÉ CORRIGÉ LE 19 SEPTEMBRE 2026, ET C'EST UNE
              QUESTION DE RÈGLE 7, PAS DE STYLE.

              Il disait : « si quelqu'un avait mis la main sur l'une d'elles,
              elle ne sert plus à rien ». C'est faux pendant une heure, et
              `verification-fonctionnalites` l'a prouvé en faisant écrire un
              second appareil APRÈS le changement — `POST /api/seances` → 201.

              Le serveur révoque les jetons de RAFRAÎCHISSEMENT ; le JWT déjà
              émis, lui, vit son heure. La protection est donc réelle mais
              DIFFÉRÉE : l'appareil d'en face ne peut plus se prolonger, et
              s'éteint à l'expiration. Promettre l'immédiat sur un écran de
              sécurité, c'est exactement le chiffre faux de la règle 7 — la
              personne croit le danger écarté et ne fait pas le geste suivant.

              On dit donc la vérité, avec son délai.

              ET LE RECOURS QU'IL PROPOSAIT ÉTAIT FAUX — corrigé quelques
              heures plus tard le même jour. Il disait « désactive puis
              réactive le compte depuis l'écran d'administration ». Ce geste
              n'existe dans AUCUN des cas où cette phrase s'affiche :

                - un compte ordinaire n'a pas d'écran d'administration
                  (`_layout.tsx` renvoie tout segment `admin-*` ailleurs) ;
                - un administrateur ne peut pas se désactiver lui-même —
                  `ProtectionDuCompte.php:41` refuse : « la requête suivante
                  serait refusée, y compris celle qui te réactiverait » ; et
                  `admin-utilisateurs.tsx` ne lui montre même pas de bouton sur
                  sa propre ligne.

              Renvoyer vers une porte fermée quelqu'un qui croit être attaqué
              est pire que ne rien proposer : il perd le temps qu'il croyait
              gagner. On dit ce qui existe vraiment. */}
          <Discret style={s.aide}>
            Les sessions de tes autres appareils ne peuvent plus se prolonger :
            elles s’arrêteront d’elles-mêmes dans l’heure qui vient.
            Reconnecte-toi avec ton nouveau mot de passe. Si tu crains une
            intrusion et que tu veux couper sans attendre cette heure, il n’y a
            pas de bouton pour le faire : demande à un administrateur de
            désactiver ton compte un instant — la coupure est alors immédiate,
            dès la requête suivante.
          </Discret>
          <Bouton
            onPress={() => {
              void deconnecter().then(() => router.replace('/connexion'));
            }}
          >
            Se reconnecter
          </Bouton>
        </Carte>
      </ScrollView>
    );
  }

  /* `isPending` ET NON `isLoading` : `useMoi` est désactivé le temps que la
     session soit lue, et pendant ce temps `isLoading` vaut faux sans qu'on
     ait la moindre donnée. L'écran passait alors sa garde avec `data`
     indéfini — relevé sur l'onglet Compte le 15 septembre 2026. Ici, cela
     donnerait un formulaire dont le bouton n'a pas d'identifiant à envoyer. */
  if (moi.isPending) return <Chargement />;
  if (moi.isError) return <Erreur message={moi.error.message} onReessayer={() => void moi.refetch()} />;

  const id = moi.data?.id;

  /* On ne signale la différence qu'une fois la confirmation commencée :
     gronder quelqu'un qui n'a pas fini de taper, c'est le gronder de taper. */
  const differe = confirmation !== '' && confirmation !== nouveau;
  /* Remettre le même mot de passe n'est pas une faute, c'est un geste inutile.
     On le dit tout de suite plutôt que d'attendre le refus du serveur. */
  const identique = nouveau !== '' && nouveau === actuel;

  const pret = actuel !== '' && nouveau !== '' && confirmation !== ''
    && (jauge?.acceptable ?? false)
    && nouveau === confirmation
    && !identique;

  const valider = () => {
    if (!pret || changer.isPending || id === undefined) return;
    changer.mutate({ id, actuel, nouveau });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.page}>
        <Discret style={s.aide}>
          Ton mot de passe actuel est demandé d’abord : c’est lui qui prouve que
          c’est bien toi devant l’écran, et non un onglet resté ouvert.
        </Discret>

        <Carte style={{ gap: E.s }}>
          <Champ
            valeur={actuel}
            onChange={setActuel}
            motDePasse
            autoComplete="current-password"
            etiquette="Mot de passe actuel"
            onSuivant={() => champNouveau.current?.focus()}
          />

          <Champ
            valeur={nouveau}
            onChange={setNouveau}
            motDePasse
            autoComplete="new-password"
            etiquette="Nouveau mot de passe"
            champRef={champNouveau}
            onSuivant={() => champConfirmation.current?.focus()}
          />
          <JaugeMotDePasse valeur={nouveau} jauge={jauge} perime={jaugePerimee} />

          {identique && (
            <Discret style={[s.aide, { color: C.erreur }]}>
              Ce mot de passe est déjà le tien.
            </Discret>
          )}

          <Champ
            valeur={confirmation}
            onChange={setConfirmation}
            motDePasse
            autoComplete="new-password"
            etiquette="Confirmer le nouveau mot de passe"
            champRef={champConfirmation}
            illisible={differe}
            onValider={valider}
          />
          {differe && (
            <Discret style={[s.aide, { color: C.erreur }]}>
              Les deux ne sont pas identiques.
            </Discret>
          )}

          <Bouton onPress={valider} desactive={!pret || changer.isPending}>
            {changer.isPending ? 'Changement…' : 'Changer mon mot de passe'}
          </Bouton>

          {/* Le message vient du serveur et il est utile : ce qui manque au
              nouveau mot de passe, ou le refus de l'actuel. On l'affiche tel
              quel plutôt que de le remplacer par un « une erreur est
              survenue » qui n'apprend rien. */}
          {changer.isError && (
            <Discret style={[s.aide, { color: C.erreur }]}>{changer.error.message}</Discret>
          )}
        </Carte>

        {/* « TOUT DE SUITE » ÉTAIT FAUX ICI AUSSI — relevé le 19 septembre
            2026, quatre-vingt-dix lignes sous la phrase qu'on venait de
            corriger pour la même raison. Le jumeau oublié, appliqué à un
            texte.

            `useChangerMotDePasse` ne fait qu'un `PATCH` : il ne touche pas à
            la session locale. En repartant par la flèche de retour au lieu du
            bouton « Se reconnecter », on reste connecté — exactement comme les
            autres appareils, et pour la même heure. */}
        <Discret style={s.aide}>
          En validant, ta session d’ici ne pourra plus se prolonger non plus :
          reconnecte-toi avec ton nouveau mot de passe. Tes autres appareils
          s’arrêteront d’eux-mêmes dans l’heure qui vient.
        </Discret>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  page: { padding: E.m, gap: E.s },
  aide: { fontSize: T.petit, lineHeight: 18 },
});
