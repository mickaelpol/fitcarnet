import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { adresseApi } from '@/api/client';
import { Bouton, Carte, Discret, Texte } from './base';
import { C, E, P, R, T } from '@/theme';

/**
 * CE QUI TOURNE VRAIMENT, ET UN BOUTON POUR CHANGER ÇA.
 *
 * POURQUOI CE PANNEAU EXISTE
 *
 * Les mises à jour JavaScript arrivent seules et sans un mot. C'est confortable
 * tant que ça marche, et insupportable dès que ça ne marche plus : on ferme
 * l'application, on la rouvre, rien ne change, et **rien nulle part ne dit
 * pourquoi**. Ni erreur, ni journal, ni numéro à comparer.
 *
 * On a perdu une soirée là-dessus. La cause tenait en une ligne — le canal
 * `production` d'Expo ne pointait sur aucune branche, donc l'application
 * demandait poliment s'il y avait du neuf et s'entendait répondre non. Aucun
 * des deux côtés ne considérait ça comme une anomalie.
 *
 * Ce panneau ne répare rien. Il rend l'invisible lisible : la version native
 * installée, la version d'exécution que l'application réclame, le canal qu'elle
 * interroge, et l'identifiant du paquet JavaScript en cours. Avec ces quatre
 * nombres, une divergence se voit en trois secondes au lieu d'une soirée.
 *
 * LE BOUTON REMPLACE « FERME ET ROUVRE DEUX FOIS ».
 *
 * Par défaut, `expo-updates` télécharge au démarrage et applique au démarrage
 * SUIVANT — deux lancements, sans que rien ne l'annonce. Ici on demande,
 * on télécharge, et on redémarre, tout de suite. Ce qui se passe est écrit à
 * l'écran à chaque étape, y compris « tu es déjà à jour », qui est une réponse
 * et pas un silence.
 */
export function EtatMaj() {
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  /* Sur le web et en développement, `expo-updates` est inerte : il n'y a pas
     de paquet à remplacer, le code vient du serveur. Afficher un panneau de
     mise à jour y serait un mensonge poli. */
  if (Platform.OS === 'web' || !Updates.isEnabled) return null;

  const chercher = () => {
    setOccupe(true);
    setMessage('Recherche…');

    void Updates.checkForUpdateAsync()
      .then(async (r) => {
        if (!r.isAvailable) {
          setMessage('Tu es déjà à jour.');

          return;
        }
        setMessage('Mise à jour trouvée, téléchargement…');
        await Updates.fetchUpdateAsync();
        setMessage('Redémarrage…');
        await Updates.reloadAsync();
      })
      .catch((e: unknown) => {
        /* ON MONTRE L'ERREUR TELLE QUELLE. Hors ligne, canal mal relié, serveur
           injoignable : les causes diffèrent et le message d'Expo les nomme.
           Le remplacer par « une erreur est survenue » rendrait ce panneau
           aussi muet que ce qu'il vient corriger. */
        setMessage(e instanceof Error ? e.message : 'Vérification impossible.');
      })
      .finally(() => setOccupe(false));
  };

  return (
    <Carte style={{ gap: E.xs }}>
      <Texte style={{ fontFamily: P.fort }}>Version de l’application</Texte>

      {/* L'ADRESSE DU SERVEUR, EN PREMIER.
          Elle est figée dans l'APK au moment du build, par le profil EAS
          utilisé. Un APK construit avec le profil `local` parle à
          `192.168.1.118` — injoignable hors du réseau de la maison — et
          l'application affiche exactement la même erreur que si le téléphone
          était hors ligne. Une ligne ici tranche en deux secondes. */}
      <Ligne nom="Serveur" valeur={adresseApi()} />
      <Ligne nom="Application" valeur={Updates.createdAt === null ? 'installée' : 'mise à jour'} />
      <Ligne nom="Version d’exécution" valeur={Updates.runtimeVersion ?? '—'} />
      <Ligne nom="Canal" valeur={Updates.channel ?? 'aucun'} />
      <Ligne
        nom="Paquet JavaScript"
        /* `updateId` est null quand l'application tourne sur le JavaScript
           embarqué dans l'APK — c'est-à-dire quand AUCUNE mise à jour n'a
           jamais été appliquée. C'est l'information la plus utile du lot. */
        valeur={Updates.updateId === null ? 'celui de l’APK' : Updates.updateId.slice(0, 8)}
      />
      {Updates.createdAt !== null && (
        <Ligne
          nom="Publié le"
          valeur={Updates.createdAt.toLocaleDateString('fr-FR', {
            day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
          })}
        />
      )}

      <Bouton variante="contour" onPress={chercher} desactive={occupe}>
        {occupe ? 'Patiente…' : 'Chercher une mise à jour'}
      </Bouton>

      {message !== null && (
        <Discret style={s.message}>{message}</Discret>
      )}
    </Carte>
  );
}

const Ligne = ({ nom, valeur }: { nom: string; valeur: string }) => (
  <View style={s.ligne}>
    <Discret style={{ flex: 1 }}>{nom}</Discret>
    <Texte style={s.valeur} numberOfLines={1}>{valeur}</Texte>
  </View>
);

const s = StyleSheet.create({
  ligne: { flexDirection: 'row', alignItems: 'center', gap: E.s },
  valeur: { fontSize: T.petit, color: C.attenue },
  message: {
    fontSize: T.petit,
    color: C.vif,
    backgroundColor: C.vifFond,
    borderRadius: R.s,
    padding: E.s,
  },
});
