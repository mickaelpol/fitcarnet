import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, Share, StyleSheet, Text, View,
} from 'react-native';

import {
  useActiverCompte, useComptes, useInvitations, useInviter, useMoi,
  useRevoquerInvitation, useSupprimerCompte, type Compte, type InvitationVue,
} from '@/api/hooks';
import { Bouton, Carte, Champ, Chargement, Discret, Erreur, Texte, Vide } from '@/composants/base';
import { premiereErreur } from '@/composants/etatRequetes';
import { Confirmer } from '@/composants/confirmer';
import { C, E, P, R, T } from '@/theme';
import { contenuEnMots, enumeration } from '@/calcul/contenuCompte';

/**
 * ÉCRAN D'ADMINISTRATION : inviter quelqu'un.
 *
 * TU SAISIS UNE ADRESSE, TU OBTIENS UN LIEN, TU L'ENVOIES COMME TU VEUX.
 *
 * La personne suit le lien et choisit elle-même son nom et son mot de passe.
 * Le compte n'existe qu'une fois le lien accepté.
 *
 * POURQUOI PAS CRÉER LE COMPTE ET DONNER UN MOT DE PASSE
 *
 * Parce qu'il faudrait l'inventer, le transmettre, et espérer qu'il soit
 * changé. Trois occasions de fuite pour un secret qui n'est pas le tien. Ici
 * le mot de passe n'existe qu'au moment où son propriétaire le tape — tu ne
 * l'as jamais vu, et il n'y a rien à « faire changer plus tard ».
 *
 * POURQUOI PAS UN ENVOI AUTOMATIQUE PAR COURRIEL
 *
 * Il faudrait un serveur de messagerie, sa configuration, et accepter qu'un
 * message sur trois parte en indésirables sans que personne ne l'apprenne.
 * Un envoi raté est une panne muette : tu crois avoir invité, la personne n'a
 * rien reçu, et vous attendez tous les deux. Un lien affiché à l'écran, on
 * **voit** qu'on l'a copié.
 *
 * LE LIEN N'EST AFFICHÉ QU'UNE FOIS, ET CE N'EST PAS UN OUBLI. Le serveur
 * n'en garde qu'une empreinte — comme un mot de passe. Une sauvegarde qui
 * fuite ne donne donc aucun compte. Si tu perds le lien, tu réinvites : ça
 * remplace l'ancien, qui meurt à l'instant.
 */
export default function AdminUtilisateurs() {
  const moi = useMoi();
  const invitations = useInvitations();
  const inviter = useInviter();
  const revoquer = useRevoquerInvitation();
  const comptes = useComptes();
  const activer = useActiverCompte();
  const supprimer = useSupprimerCompte();
  const [aSupprimer, setASupprimer] = useState<Compte | null>(null);

  const [email, setEmail] = useState('');
  const [copie, setCopie] = useState(false);
  const [aRevoquer, setARevoquer] = useState<InvitationVue | null>(null);

  /**
   * RENVOYER UN LIEN — constat 02#17, 18 septembre 2026.
   *
   * « La personne a perdu le lien » est le geste le plus courant de cet
   * écran, et il fallait le faire à l'aveugle : retrouver l'adresse dans la
   * liste, la retaper à l'identique en haut, et espérer ne pas se tromper
   * d'une lettre — auquel cas on créait une SECONDE invitation, pour une
   * adresse voisine, au lieu de remplacer la première.
   *
   * AUCUNE ROUTE NOUVELLE, ET C'EST DÉLIBÉRÉ. `POST /api/invitations`
   * remplace déjà l'invitation en attente de cette adresse, dans la même
   * transaction : c'est exactement « renvoyer ». Une route `…/relancer`
   * aurait été un second chemin d'écriture pour la même intention — et ce
   * projet sait ce que coûte un jumeau qu'on oublie de corriger.
   *
   * ON REMONTE EN HAUT, parce que le lien s'affiche là où les liens
   * s'affichent. Le fabriquer sans le montrer serait pire que de ne rien
   * faire : l'admin croirait avoir renvoyé, et l'ancien lien serait mort.
   */
  const vue = useRef<ScrollView>(null);
  const renvoyer = (i: InvitationVue) => {
    setEmail(i.email);
    setCopie(false);
    /* ON REMONTE DANS LES DEUX CAS — relevé en revue le 18 septembre 2026.
       Le `scrollTo` n'était que dans `onSuccess`, et le SEUL endroit qui
       affiche `inviter.isError` est la carte « Inviter quelqu'un », tout en
       haut. Un refus — l'adresse a entre-temps obtenu un compte, une panne
       réseau, un 500 — réactivait donc le bouton sans que rien ne bouge à
       l'écran : l'admin en concluait que le bouton ne marche pas, ou pire,
       qu'il avait renvoyé. Un échec doit se voir au moins autant qu'une
       réussite. */
    const remonter = () => vue.current?.scrollTo({ y: 0, animated: true });
    inviter.mutate(i.email, {
      onSuccess: () => { setEmail(''); remonter(); },
      onError: remonter,
    });
  };

  /**
   * PARTAGER, ET NON COPIER — parce que copier coûtait un module natif.
   *
   * `expo-clipboard` aurait demandé un nouvel APK sur chaque téléphone, pour
   * un bouton d'écran d'administration. `Share` est dans React Native depuis
   * toujours : il ouvre la feuille de partage du système, d'où le lien part
   * directement vers WhatsApp, un SMS ou un courriel. C'est même le geste
   * qu'on voulait faire — copier n'était qu'une étape avant de l'envoyer.
   *
   * Sur le web, cette feuille n'existe pas : on écrit dans le presse-papiers
   * du navigateur, qui lui est disponible sans rien installer.
   */
  const partager = (adresse: string) => {
    if (Platform.OS === 'web') {
      const presse = (globalThis as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } })
        .navigator?.clipboard;
      if (presse?.writeText !== undefined) {
        void presse.writeText(adresse).then(() => setCopie(true));
      }

      return;
    }
    void Share.share({ message: adresse }).then(() => setCopie(true));
  };

  if (moi.isLoading || invitations.isLoading || comptes.isLoading) return <Chargement />;

  /* /moi EN PANNE N'EST PAS UN REFUS DE DROITS — 18 septembre 2026, meme
     famille que M6. Ce garde etait APRES celui du role : une coupure reseau
     faisait donc repondre « reservé à l'administrateur » a un administrateur.
     Un ecran qui ment sur la cause envoie chercher au mauvais endroit. */
  const panneDuCompte = premiereErreur(moi);
  if (panneDuCompte) {
    return <Erreur message={panneDuCompte.message} onReessayer={panneDuCompte.reessayer} />;
  }

  if (moi.data?.roles?.includes('ROLE_ADMIN') !== true) {
    return <Vide message="Cet écran est réservé à l'administrateur." />;
  }
  /* LA LISTE DES COMPTES EN PANNE PASSAIT INAPERÇUE — constat M6, corrigé le
     18 septembre 2026. `comptes.isError` n'était lu nulle part : /comptes en
     échec, `comptes.data ?? []` rendait une liste vide et l'écran affichait
     un panneau « Comptes » désert, comme si personne n'était inscrit. Sur un
     écran qui sert à désactiver ou supprimer des comptes, c'est le genre de
     vide qui fait recommencer une invitation déjà faite.
     UN SEUL GARDE POUR LES DEUX, après le garde de chargement et jamais
     avant : « en attente » n'est pas « en panne ». */
  const panne = premiereErreur(invitations, comptes);
  if (panne) return <Erreur message={panne.message} onReessayer={panne.reessayer} />;

  const liste = invitations.data ?? [];
  const enAttente = liste.filter((i) => i.statut === 'en_attente');
  const lien = inviter.data?.lien;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView ref={vue} contentContainerStyle={s.page}>
        <Discret style={s.aide}>
          Tu invites une adresse, l’application fabrique un lien, et tu
          l’envoies comme tu veux — message, courriel, de vive voix. La personne
          choisit elle-même son nom et son mot de passe.
        </Discret>

        <Carte style={{ gap: E.s }}>
          <Texte style={{ fontFamily: P.fort }}>Inviter quelqu’un</Texte>
          <Champ
            valeur={email}
            onChange={(v) => { setEmail(v); setCopie(false); }}
            placeholder="prenom@exemple.fr"
            etiquette="Adresse électronique"
          />
          <Discret style={s.aide}>
            Cette adresse sera celle du compte, et la personne invitée ne pourra
            pas en changer : le lien ne vaut que pour elle.
          </Discret>

          <Bouton
            onPress={() => inviter.mutate(email.trim(), {
              onSuccess: () => { setEmail(''); setCopie(false); },
            })}
            desactive={email.trim() === '' || inviter.isPending}
          >
            {inviter.isPending ? 'Création…' : 'Créer le lien'}
          </Bouton>

          {inviter.isError && (
            <Discret style={[s.aide, { color: C.erreur }]}>{inviter.error.message}</Discret>
          )}
        </Carte>

        {/* LE LIEN, UNE SEULE FOIS.
            Il reste affiché tant qu'on ne quitte pas l'écran, et il disparaît
            à la prochaine invitation. On le dit, plutôt que de le laisser
            découvrir. */}
        {lien !== undefined && (
          <Carte style={s.lienCarte}>
            <Texte style={{ fontFamily: P.fort }}>
              Lien pour {inviter.data?.email}
            </Texte>
            {/* `selectable` : la sélection manuelle reste possible partout,
                même si le partage échoue ou n'existe pas. Un lien qu'on ne
                peut ni copier ni sélectionner serait un lien inutile. */}
            <Text selectable style={s.lien}>{lien}</Text>
            <Bouton onPress={() => partager(lien)}>
              {copie
                ? 'Envoyé ✓'
                : Platform.OS === 'web' ? 'Copier le lien' : 'Envoyer le lien'}
            </Bouton>
            <Discret style={s.aide}>
              Valable {inviter.data?.dureeJours} jours. Il ne sera plus affiché
              après cet écran : le serveur n’en garde qu’une empreinte, comme un
              mot de passe. Perdu, il suffit de réinviter la même adresse —
              l’ancien lien meurt aussitôt.
            </Discret>
          </Carte>
        )}

        <Texte style={s.titre}>
          {enAttente.length === 0
            ? 'Aucune invitation en attente'
            : `${enAttente.length} invitation${enAttente.length > 1 ? 's' : ''} en attente`}
        </Texte>

        {liste.length === 0 && (
          <Vide message="Personne n’a encore été invité." />
        )}

        {liste.map((i) => (
          <Carte key={i.id} style={{ gap: E.xs }}>
            <View style={s.ligne}>
              <Texte style={{ flex: 1 }} numberOfLines={1}>{i.email}</Texte>
              <Etat statut={i.statut} />
            </View>

            <Discret style={s.aide}>
              {i.statut === 'acceptee' && `Compte créé${i.nomInvite !== null ? ` — ${i.nomInvite}` : ''}, le ${jour(i.accepteLe)}.`}
              {i.statut === 'en_attente' && `Invitée le ${jour(i.creeLe)}, valable jusqu’au ${jour(i.expireLe)}.`}
              {i.statut === 'perimee' && `Invitée le ${jour(i.creeLe)}, périmée depuis le ${jour(i.expireLe)}.`}
            </Discret>

            {i.statut !== 'acceptee' && (
              <View style={s.ligne}>
                <Bouton
                  variante="contour"
                  onPress={() => renvoyer(i)}
                  desactive={inviter.isPending}
                  style={{ flex: 1 }}
                >
                  Renvoyer un lien
                </Bouton>
                <Bouton variante="contour" onPress={() => setARevoquer(i)} style={{ flex: 1 }}>
                  Révoquer
                </Bouton>
              </View>
            )}

            {i.statut === 'en_attente' && (
              <Discret style={[s.aide, { color: C.attenue }]}>
                Renvoyer fabrique un lien neuf et tue celui d’avant, même s’il a
                déjà été transmis.
              </Discret>
            )}
          </Carte>
        ))}

        {revoquer.isError && (
          <Discret style={[s.aide, { color: C.erreur }]}>{revoquer.error.message}</Discret>
        )}

        {/* ---------------------------------------------------------- */}

        <Texte style={s.titre}>Comptes</Texte>
        <Discret style={s.aide}>
          Désactiver est <Texte style={{ color: C.vif }}>réversible</Texte> : le
          carnet reste intact et la personne le retrouve à la réactivation.
          Supprimer ne l’est pas — séances, modèles, plans, objectifs,
          compléments, aliments, stock et exercices personnels partent avec le
          compte.
        </Discret>

        {(comptes.data ?? []).map((c) => (
          <Carte key={c.id} style={{ gap: E.xs }}>
            <View style={s.ligne}>
              <Texte style={{ flex: 1, fontFamily: P.fort }} numberOfLines={1}>
                {c.nom}
              </Texte>
              {c.admin && (
                <Texte style={[s.pastille, { color: C.prot, backgroundColor: C.ligneVoile }]}>
                  Admin
                </Texte>
              )}
              {!c.actif && (
                <Texte style={[s.pastille, { color: C.erreur, backgroundColor: C.erreurFond }]}>
                  Désactivé
                </Texte>
              )}
            </View>

            <Discret style={s.aide} numberOfLines={1}>{c.email}</Discret>
            <Discret style={s.aide}>
              {contenuEnMots(c.contenu).join(' · ')}
            </Discret>

            {/* SON PROPRE COMPTE N'A PAS DE BOUTONS.
                Le serveur refuse de toute façon — se bloquer soi-même
                verrouille la porte de l'intérieur, la requête suivante serait
                refusée, y compris celle qui réactiverait. Autant ne pas
                proposer un geste qui ne peut pas aboutir. */}
            {c.moi ? (
              <Discret style={[s.aide, { color: C.attenue }]}>
                C’est ton compte. Rien à faire ici : un administrateur ne peut
                ni se désactiver ni se supprimer lui-même.
              </Discret>
            ) : (
              <View style={s.ligne}>
                <Bouton
                  variante="contour"
                  onPress={() => activer.mutate({ id: c.id, actif: !c.actif })}
                  desactive={activer.isPending}
                  style={{ flex: 1 }}
                >
                  {c.actif ? 'Désactiver' : 'Réactiver'}
                </Bouton>
                <Bouton
                  variante="contour"
                  onPress={() => setASupprimer(c)}
                  style={{ flex: 1 }}
                >
                  Supprimer
                </Bouton>
              </View>
            )}
          </Carte>
        ))}

        {activer.isError && (
          <Discret style={[s.aide, { color: C.erreur }]}>{activer.error.message}</Discret>
        )}
        {supprimer.isError && (
          <Discret style={[s.aide, { color: C.erreur }]}>{supprimer.error.message}</Discret>
        )}
      </ScrollView>

      <Confirmer
        visible={aRevoquer !== null}
        titre={`Révoquer l’invitation de ${aRevoquer?.email ?? ''} ?`}
        message="Le lien cesse de fonctionner immédiatement, même s’il a déjà été transmis. Aucun compte n’est supprimé : cette invitation n’en a pas encore créé."
        onConfirmer={() => {
          if (aRevoquer !== null) revoquer.mutate(aRevoquer.id);
          setARevoquer(null);
        }}
        onAnnuler={() => setARevoquer(null)}
      />

      {/* ON DIT CE QU'ON DÉTRUIT, EN NOMBRES.
          « Supprimer ? Oui / Non » qui ne dit pas ce qu'on détruit n'est pas
          une question, c'est un piège. */}
      <Confirmer
        visible={aSupprimer !== null}
        titre={`Supprimer le compte de ${aSupprimer?.nom ?? ''} ?`}
        message={aSupprimer === null ? '' : [
          `${enumeration(contenuEnMots(aSupprimer.contenu))} `,
          'seront effacés définitivement. Rien ne se restaure sans une sauvegarde. ',
          'Si tu veux seulement lui retirer l’accès, désactive plutôt : le carnet est conservé.',
        ].join('')}
        onConfirmer={() => {
          if (aSupprimer !== null) supprimer.mutate(aSupprimer.id);
          setASupprimer(null);
        }}
        onAnnuler={() => setASupprimer(null)}
      />
    </KeyboardAvoidingView>
  );
}

/** Une pastille, parce qu'un statut se lit d'un coup d'œil ou ne se lit pas. */
function Etat({ statut }: { statut: InvitationVue['statut'] }) {
  const [texte, couleur, fond] = statut === 'acceptee'
    ? ['Compte créé', C.ok, C.okFond]
    : statut === 'en_attente'
      ? ['En attente', C.vif, C.vifFond]
      : ['Périmée', C.attenue, C.ligneVoile];

  return (
    <Texte style={[s.pastille, { color: couleur, backgroundColor: fond }]}>{texte}</Texte>
  );
}

/** « 11 août » — l'heure n'apprend rien ici. */
const jour = (iso: string | null): string =>
  iso === null
    ? '—'
    : new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

const s = StyleSheet.create({
  page: { padding: E.l, gap: E.m },
  titre: { fontFamily: P.fort, fontSize: T.moyen, marginTop: E.s },
  aide: { fontSize: T.petit, lineHeight: 17 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: E.s },
  lienCarte: { gap: E.s, borderColor: C.vifBord, backgroundColor: C.vifFond },
  lien: {
    fontSize: T.petit,
    color: C.vif,
    backgroundColor: C.fond,
    padding: E.s,
    borderRadius: R.s,
  },
  pastille: {
    fontSize: T.petit,
    paddingHorizontal: E.s,
    paddingVertical: 2,
    borderRadius: R.s,
    overflow: 'hidden',
  },
});
