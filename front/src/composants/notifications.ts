/* Pose LE gestionnaire de notifications, celui de toute l'application. Ce
   module en posait un SECOND, qui écrasait celui de l'alarme de repos : voir
   `gestionnaireNotifications.ts` (F10). */
import './gestionnaireNotifications';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { C } from '@/theme';
import { ORIGINE_INVENTAIRE } from './affichageNotification';

/**
 * PRÉVENIR QUAND L'APPLICATION N'EST PLUS DEVANT LES YEUX.
 *
 * Un inventaire part vers Grocy et met jusqu'à une minute. Pendant ce
 * temps-là, personne ne reste à regarder une barre de progression : on pose le
 * téléphone, on range les courses, on passe à autre chose. L'écran du frigo
 * affiche bien l'avancement — encore faut-il le regarder.
 *
 * ON NE NOTIFIE QUE SI L'APPLICATION N'EST PAS AU PREMIER PLAN, et c'est la
 * règle qui rend ce fichier acceptable. Quand l'écran est sous les yeux, la
 * bannière dit déjà tout ; une notification par-dessus est du bruit, et du
 * bruit répété apprend à ignorer les vraies.
 *
 * TOUT ÉCHOUE EN SILENCE, VOLONTAIREMENT. Permission refusée, module absent,
 * canal impossible à créer : une notification est un CONFORT. La perdre ne
 * doit jamais faire échouer l'inventaire, qui est le vrai travail. C'est le
 * seul endroit du projet où j'avale une erreur sans la dire — parce que la
 * dire coûterait plus cher que ce qu'elle signale.
 */

/** Le canal Android. Son nom s'affiche dans les réglages du téléphone. */
const CANAL = 'inventaire';

/* Le module n'existe pas sur le web : `expo-notifications` y expose des
   fonctions qui lèvent. On tranche une fois ici plutôt qu'à chaque appel. */
const possible = Platform.OS !== 'web';

let pret = false;

/**
 * Demande la permission, au moment où elle a un sens.
 *
 * APPELÉE QUAND ON ENVOIE UN INVENTAIRE, pas au démarrage de l'application.
 * Une demande de permission au lancement arrive avant que la personne ait vu à
 * quoi elle sert : elle se refuse par réflexe, et Android ne la redemandera
 * plus jamais. Demandée juste après « Enregistrer 23 corrections », elle
 * répond à une question qu'on vient de se poser.
 *
 * @returns true si l'on pourra notifier
 */
export async function preparerLesNotifications(): Promise<boolean> {
  if (!possible) return false;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    const accorde = status === 'granted'
      ? true
      : (await Notifications.requestPermissionsAsync()).status === 'granted';

    if (!accorde) return false;

    if (!pret) {
      /* LE GESTIONNAIRE N'EST PLUS POSÉ ICI, ET C'EST LA CORRECTION DE F10, DU
         15 SEPTEMBRE 2026. Ces lignes appelaient `setNotificationHandler` avec
         « afficher même au premier plan » — une règle juste pour l'inventaire,
         mais le gestionnaire est GLOBAL ET UNIQUE : elle écrasait celle de
         l'alarme de repos, et la garde `pret` faisait que c'était pour de bon.
         Après le premier inventaire de la session, chaque fin de repos posait
         donc une bannière au premier plan par-dessus le chrono qui sonnait
         déjà. Les deux règles vivent maintenant ensemble dans
         `affichageNotification.ts`, et ce module SIGNE ce qu'il envoie. */

      if (Platform.OS === 'android') {
        /* Obligatoire depuis Android 8 : sans canal, la notification est
           postée et n'apparaît jamais. Le nom est en clair parce qu'il se
           lit dans les réglages du téléphone, pas dans le code. */
        await Notifications.setNotificationChannelAsync(CANAL, {
          name: 'Inventaire du frigo',
          importance: Notifications.AndroidImportance.DEFAULT,
          lightColor: C.vif,
        });
      }

      pret = true;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * L'inventaire est terminé.
 *
 * Le texte porte le CHIFFRE, pas un « c'est fait ». Une notification qui dit
 * seulement que quelque chose s'est terminé oblige à ouvrir l'application pour
 * savoir quoi — elle déplace le travail au lieu de l'éviter.
 */
export async function prevenirFinInventaire(
  corriges: number,
  echecs: number,
): Promise<void> {
  if (!possible) return;

  /* L'ÉCRAN EST DEVANT LES YEUX : la bannière du frigo dit déjà tout. */
  if (AppState.currentState === 'active') return;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: echecs === 0 ? 'Inventaire appliqué' : 'Inventaire terminé, avec des refus',
        body: echecs === 0
          ? `${corriges} correction${corriges > 1 ? 's' : ''} enregistrée${corriges > 1 ? 's' : ''}.`
          : `${corriges} corrigée${corriges > 1 ? 's' : ''}, ${echecs} refusée${echecs > 1 ? 's' : ''}. Ouvre le frigo pour voir lesquelles.`,
        ...(Platform.OS === 'android' ? { channelId: CANAL } : {}),
        /* La signature : c'est elle qui autorise la bannière au premier plan,
           là où une fin de repos l'interdit. */
        data: { origine: ORIGINE_INVENTAIRE },
      },
      /* `null` : tout de suite. Un déclencheur daté passerait par le
         planificateur du système, qui peut le décaler de plusieurs minutes. */
      trigger: null,
    });
  } catch {
    /* voir l'en-tête du fichier */
  }
}
