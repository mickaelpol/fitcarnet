import './silenceExpoGo';
import * as Notifications from 'expo-notifications';

import { commentAfficher } from './affichageNotification';

/**
 * LE SEUL ENDROIT DU PROJET QUI APPELLE `setNotificationHandler`.
 *
 * Ce module ne s'importe que pour son effet : `import
 * './gestionnaireNotifications';`. Il est importé par les DEUX modules qui
 * envoient des notifications, `alarmeRepos.ts` et `notifications.ts`, pour que
 * le gestionnaire soit posé quel que soit l'écran par lequel on est entré —
 * l'inventaire du frigo sans jamais lancer de chrono, ou l'inverse.
 *
 * IL Y EN AVAIT DEUX, ET C'EST LE CONSTAT F10 (audit du 7 septembre 2026).
 * `alarmeRepos` posait le sien au chargement du module, `notifications` le
 * remplaçait au premier envoi d'inventaire. Comme le gestionnaire est global et
 * unique, chaque fin de repos affichait ensuite une bannière au premier plan,
 * ce que le commentaire d'`alarmeRepos` s'engageait justement à ne pas faire.
 *
 * La décision, elle, vit dans `affichageNotification.ts` : sans dépendance à
 * `expo-notifications`, donc éprouvée par un test.
 */
Notifications.setNotificationHandler({
  handleNotification: (notification) =>
    Promise.resolve(commentAfficher(notification.request.content.data)),
});
