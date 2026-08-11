import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Bouton, Discret, Texte } from './base';
import { versionInstallee } from '@/maj/installee';
import { miseAJourNecessaire, versionPubliee, type VersionPubliee } from '@/maj/version';
import { C, E, P, R, T } from '@/theme';

/**
 * « UNE NOUVELLE VERSION EST DISPONIBLE. »
 *
 * Les changements de JavaScript arrivent tout seuls et sans un mot. Ce
 * bandeau ne parle que de l'autre cas : un nouvel APK, parce que le code
 * NATIF a bougé. **Android interdit à une application d'en installer une
 * autre sans que l'utilisateur appuie sur « Installer »** — c'est une
 * protection du système, pas un oubli de conception.
 *
 * On fait donc la seule chose possible, et c'est déjà l'essentiel : savoir,
 * dire, et amener à un appui.
 *
 * IL NE SE FERME PAS. Une croix ferait qu'on l'ignore une fois, puis toujours,
 * et la version installée resterait vieille sans que personne ne s'en
 * aperçoive. Il occupe trois lignes en haut de l'écran, et il disparaît le
 * jour où la mise à jour est faite — pas avant.
 *
 * IL NE PARLE PAS QUAND IL N'A RIEN À DIRE. Hors ligne, NAS endormi, version
 * déjà à jour, ou application ouverte sur le web : rien ne s'affiche, et
 * surtout aucune erreur. Interrompre quelqu'un qui veut composer son repas
 * pour lui dire qu'on n'a pas pu vérifier une mise à jour serait absurde.
 */
export function BandeauMaj({ url }: {
  /** l'adresse du `version.json` publié à côté de l'APK */
  url: string | undefined;
}) {
  const [publiee, setPubliee] = useState<VersionPubliee | null>(null);

  useEffect(() => {
    if (url === undefined || url === '') return;
    let vivant = true;
    /* Une seule vérification, au démarrage. Interroger le serveur en boucle
       coûterait de la batterie pour découvrir, quatre-vingt-dix-neuf fois sur
       cent, qu'il ne s'est rien passé. Un APK sort quelques fois par an. */
    void versionPubliee(url).then((v) => { if (vivant) setPubliee(v); });

    return () => { vivant = false; };
  }, [url]);

  if (!miseAJourNecessaire(versionInstallee(), publiee)) return null;

  return (
    <View style={s.cadre}>
      <Texte style={s.titre}>Nouvelle version {publiee!.version}</Texte>
      <Discret style={s.aide}>
        {publiee!.notes ?? 'Des changements ont besoin d\'une nouvelle installation.'}
        {' '}Ton téléphone demandera de confirmer : c'est normal, Android
        l'impose pour toute application installée hors du Play Store.
      </Discret>
      <Bouton
        variante="contour"
        onPress={() => { void Linking.openURL(publiee!.url); }}
      >
        Télécharger et installer
      </Bouton>
    </View>
  );
}

const s = StyleSheet.create({
  cadre: {
    gap: E.xs,
    padding: E.m,
    backgroundColor: C.vifFond,
    borderBottomWidth: 1,
    borderColor: C.vifBord,
    borderRadius: R.m,
    margin: E.s,
  },
  titre: { fontFamily: P.fort },
  aide: { fontSize: T.petit, lineHeight: 17 },
});
