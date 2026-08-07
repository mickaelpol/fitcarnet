/* Doit rester la premiere ligne : pose le filtre LogBox avant que
   `expo-notifications` n'emette son message au chargement. */
import './silenceExpoGo';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

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
const CANAL = 'repos2';
const CANAL_PERIME = 'repos';
const VIBRATION = [0, 300, 120, 300, 120, 300, 120, 500];

/* Ce gestionnaire n'est appelé que si la notification arrive alors que
   l'application est au premier plan — cas où le chrono a déjà sonné tout seul.
   On la rend silencieuse et invisible pour ne pas doubler le signal. */
Notifications.setNotificationHandler({
  handleNotification: () => Promise.resolve({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let preparation: Promise<boolean> | null = null;

async function preparer(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  if (Platform.OS === 'android') {
    await Notifications.deleteNotificationChannelAsync(CANAL_PERIME).catch(() => undefined);

    /* `sound` n'est PAS renseigné, et c'est délibéré : ce champ attend le nom
       d'un fichier placé dans les ressources natives de l'application. Y mettre
       « default » ferait chercher un fichier de ce nom, introuvable — canal
       muet. Absent, Android retient le son de notification du téléphone. */
    await Notifications.setNotificationChannelAsync(CANAL, {
      name: 'Fin de repos',
      importance: Notifications.AndroidImportance.HIGH,
      enableVibrate: true,
      vibrationPattern: VIBRATION,
    });
    /* Contrôlé sur l'appareil : le canal ressort en `sound: "default"`,
       `importance: 6`, `vibre: true`. */
  }

  const actuel = await Notifications.getPermissionsAsync();
  if (actuel.granted) return true;

  const demande = await Notifications.requestPermissionsAsync();

  return demande.granted;
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

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Repos terminé',
        body: 'Série suivante.',
        sound: 'default',
        vibrate: VIBRATION,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(secondes)),
        channelId: CANAL,
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
