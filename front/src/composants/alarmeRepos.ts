/* Doit rester la premiere ligne : pose le filtre LogBox avant que
   `expo-notifications` n'emette son message au chargement. */
import './silenceExpoGo';
/* Pose LE gestionnaire de notifications, celui de toute l'application. Il y en
   avait deux, et le second gagnait — voir `gestionnaireNotifications.ts` (F10). */
import './gestionnaireNotifications';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ORIGINE_REPOS } from './affichageNotification';
import { chargerSonnerie, SONNERIES } from './sonnerie';

/**
 * Alarme de fin de repos portée par le SYSTÈME, pas par l'application.
 *
 * Android gèle les minuteurs JavaScript dès que l'application passe en
 * arrière-plan. Le décompte semblait continuer — il relit une heure de fin au
 * retour — mais à zéro plus aucun code ne s'exécutait : ni son, ni vibreur.
 * Ils partaient au réveil de l'application, parfois une demi-heure trop tard.
 *
 * Aucune option ne corrige ça côté JavaScript. On programme donc une
 * notification locale à l'heure de fin : c'est Android qui sonne, même
 * application fermée. Elle est annulée si le chrono est arrêté ou relancé.
 *
 * Limite assumée, constatée sur l'appareil : hors de l'application on entend
 * le son de notification du téléphone, pas la sonnerie choisie dans les
 * réglages. Un son personnalisé doit être empaqueté dans les ressources
 * natives, ce qu'Expo Go ne permet pas. Et comme Android fige un canal à sa
 * création, offrir cinq sonnneries au choix demanderait cinq canaux, un par
 * son. À faire le jour où l'application sera compilée pour de bon ; au premier
 * plan, la sonnerie choisie reste celle qu'on entend.
 */

/* Le numéro fait partie du nom, volontairement. Android FIGE un canal à sa
   création : ni le son, ni l'importance, ni la vibration ne peuvent être
   changés ensuite — seuls le nom et la description le peuvent. Corriger les
   réglages impose donc d'en créer un nouveau. L'ancien est supprimé pour ne
   pas laisser deux entrées dans les paramètres du téléphone. */
/* UN CANAL PAR SONNERIE, ET C'EST ANDROID QUI L'IMPOSE.
 *
 * Android FIGE un canal a sa creation : ni le son, ni l'importance, ni la
 * vibration ne peuvent etre changes ensuite — seuls le nom et la description
 * le peuvent, et encore. Un canal unique dont on changerait le son au gre du
 * reglage est donc impossible : le premier son choisi resterait pour toujours,
 * et le reglage mentirait en silence.
 *
 * On cree donc les cinq d'avance, un par sonnerie, et on choisit le CANAL au
 * moment de programmer l'alarme. Cinq entrees apparaissent dans les
 * parametres de notification du telephone — c'est le prix, et il est visible
 * plutot que mensonger.
 *
 * LE SUFFIXE DE VERSION FAIT PARTIE DU NOM. Corriger un reglage d'un canal
 * existant est impossible : il faut en creer un nouveau. Passer de `_1` a
 * `_2` est la seule facon, et l'ancien se supprime pour ne pas laisser deux
 * entrees dans les parametres. */
const VERSION_CANAUX = '2';
const canalDe = (sonnerie: string): string => `repos_${sonnerie}_${VERSION_CANAUX}`;

/* Tous les canaux des versions precedentes, supprimes au demarrage.
   `repos` et `repos2` jouaient le son de notification du telephone ; les
   `_1` jouaient la bonne sonnerie, mais sur le flux NOTIFICATION — donc
   muets des que le telephone passait en vibreur. */
const CANAUX_PERIMES = [
  'repos', 'repos2',
  ...['bois', 'rappel', 'harpe', 'cloche', 'gong'].map((c) => `repos_${c}_1`),
];
const VIBRATION = [0, 300, 120, 300, 120, 300, 120, 500];

/* La règle « une fin de repos ne s'affiche pas au premier plan, le chrono a
   déjà sonné tout seul » n'est plus écrite ici : elle vit dans
   `affichageNotification.ts`, avec celle de l'inventaire, parce qu'il n'y a
   qu'UN gestionnaire pour toute l'application et qu'il faut bien que les deux
   règles tiennent en même temps. Ce module se contente de SIGNER ce qu'il
   envoie, avec `ORIGINE_REPOS` (voir `programmerAlarme`). */

/**
 * CE QUE LE SYSTÈME NOUS LAISSE FAIRE, ET QUI DOIT SE VOIR.
 *
 * Sans permission de notifier, tout ce module échoue en silence : le chrono
 * tourne, on quitte l'application, et rien ne sonne jamais. C'était le cas.
 * Personne ne peut deviner que la cause est une autorisation refusée un jour,
 * dans une boîte de dialogue oubliée depuis.
 *
 * On retient donc l'état, et l'écran le dit — au moment où ça compte,
 * c'est-à-dire quand un repos est en cours.
 */
export type EtatAlarme =
  /** pas encore demandé : aucun chrono n'a été lancé depuis le démarrage */
  | 'inconnu'
  /** le système sonnera, application fermée */
  | 'prete'
  /** l'utilisateur a refusé les notifications : rien ne sonnera hors de l'app */
  | 'refusee'
  /** le web : pas de notification programmée, et ce n'est pas un problème */
  | 'indisponible';

let etat: EtatAlarme = 'inconnu';

export const etatAlarme = (): EtatAlarme => etat;

let preparation: Promise<boolean> | null = null;

async function preparer(): Promise<boolean> {
  if (Platform.OS === 'web') { etat = 'indisponible'; return false; }

  if (Platform.OS === 'android') {
    for (const perime of CANAUX_PERIMES) {
      await Notifications.deleteNotificationChannelAsync(perime).catch(() => undefined);
    }

    /* `sound` PORTE LE NOM DU FICHIER, EXTENSION COMPRISE.
     *
     * Ce champ attend une ressource presente dans `res/raw` de l'APK — celles
     * que le greffon `expo-notifications` y copie depuis `app.json`. Avant, il
     * etait laisse vide : Android retombait alors sur le son de notification
     * du telephone, et la sonnerie choisie dans les reglages n'existait qu'au
     * premier plan. C'est exactement le defaut qu'on corrige ici.
     *
     * Un nom qui ne correspond a aucune ressource ne donne PAS d'erreur : le
     * canal devient muet. D'ou l'unique source de verite qu'est `SONNERIES`. */
    for (const sonnerie of SONNERIES) {
      await Notifications.setNotificationChannelAsync(canalDe(sonnerie.cle), {
        name: `Fin de repos — ${sonnerie.libelle}`,
        importance: Notifications.AndroidImportance.HIGH,
        enableVibrate: true,
        vibrationPattern: VIBRATION,
        sound: `${sonnerie.cle}.wav`,
        /* USAGE ALARME, ET C'EST TOUTE LA DIFFERENCE EN MODE VIBREUR.
         *
         * Android coupe les sons du flux NOTIFICATION des que le telephone
         * passe en vibreur — c'est le comportement attendu de toute
         * notification, et c'est pour ca qu'on n'entendait rien. Le flux
         * ALARME, lui, n'est pas concerne : un reveil doit sonner meme
         * telephone en silencieux, sinon il ne sert a rien.
         *
         * Une fin de repos est une alarme, pas une notification : on l'a
         * demandee, on l'attend, et la manquer coute la serie suivante.
         *
         * CE QUE CA CHANGE POUR TOI : le volume suit desormais le curseur
         * ALARME du telephone, pas celui des notifications. Un son trop
         * faible se regle la, et nulle part ailleurs. */
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.ALARM,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        },
      });
    }
  }

  const actuel = await Notifications.getPermissionsAsync();
  if (actuel.granted) { etat = 'prete'; return true; }

  /* Android 13 et suivants demandent l'autorisation à l'exécution. Refusée,
     elle n'est plus jamais redemandée par le système : il faut passer par les
     paramètres du téléphone. D'où `ouvrirReglagesDuTelephone`. */
  const demande = await Notifications.requestPermissionsAsync();
  etat = demande.granted ? 'prete' : 'refusee';

  return demande.granted;
}

/**
 * Ouvre la fiche de l'application dans les paramètres Android.
 *
 * Une fois la permission refusée, `requestPermissionsAsync` ne montre plus
 * rien : redemander poliment ne sert à rien, le système a décidé. Le seul
 * chemin restant passe par les paramètres — autant y emmener directement
 * plutôt que d'expliquer où cliquer.
 */
export async function ouvrirReglagesDuTelephone(): Promise<void> {
  const { Linking } = await import('react-native');
  await Linking.openSettings().catch(() => undefined);
  /* On oublie l'état retenu : au retour, le prochain chrono redemandera au
     système plutôt que de répéter un refus qui vient peut-être d'être levé. */
  preparation = null;
  etat = 'inconnu';
}

/** La permission n'est demandée qu'une fois, au premier chrono lancé. */
const prete = (): Promise<boolean> => (preparation ??= preparer());

/**
 * Programme l'alarme dans `secondes`. Renvoie l'identifiant à annuler, ou
 * `null` si le système ne la prendra pas (web, permission refusée).
 */
export async function programmerAlarme(secondes: number): Promise<string | null> {
  if (secondes <= 0) return null;
  if (!await prete()) return null;

  /* La sonnerie choisie decide du CANAL, pas du contenu de la notification :
     sur Android c'est le canal qui porte le son. Lue ici et pas gardee, pour
     qu'un changement de reglage prenne effet au repos suivant. */
  const sonnerie = await chargerSonnerie();

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Repos terminé',
        body: 'Série suivante.',
        /* Renseigne pour iOS, qui porte le son sur la notification et non sur
           un canal. Sur Android, ce champ est ignore au profit du canal. */
        sound: `${sonnerie}.wav`,
        vibrate: VIBRATION,
        /* LA SIGNATURE, et c'est elle qui décide de l'affichage au premier
           plan : sans elle, `commentAfficher` ne saurait pas que le chrono a
           déjà sonné, et poserait une bannière de trop. */
        data: { origine: ORIGINE_REPOS },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(secondes)),
        channelId: canalDe(sonnerie),
      },
    });
  } catch {
    /* Une alarme qu'on ne peut pas poser ne doit pas casser le chrono :
       l'application sonnera au premier plan, comme avant. */
    return null;
  }
}

export async function annulerAlarme(identifiant: string | null): Promise<void> {
  if (identifiant === null) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifiant);
  } catch {
    // déjà délivrée ou déjà annulée : rien à faire
  }
}
