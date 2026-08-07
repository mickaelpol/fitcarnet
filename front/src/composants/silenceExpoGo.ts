import { LogBox, Platform } from 'react-native';

/**
 * Fait taire UN message précis, et rien d'autre.
 *
 * `expo-notifications` enregistre un écouteur de jeton push au chargement du
 * module. Sous Expo Go/Android ce chemin est mort depuis le SDK 53, et la
 * bibliothèque le signale par un `console.error` — que LogBox affiche en rouge
 * plein écran alors qu'aucune erreur n'a eu lieu.
 *
 * Ce message ne concerne QUE les notifications distantes. Les notifications
 * locales — les seules que fitcarnet utilise, pour l'alarme de fin de repos —
 * restent disponibles dans Expo Go. Le message est d'ailleurs émis sous
 * `__DEV__` : il n'existera pas dans une application compilée.
 *
 * Ce module doit être importé AVANT `expo-notifications`, sinon le message est
 * déjà passé quand le filtre se pose.
 */
if (__DEV__ && Platform.OS !== 'web') {
  LogBox.ignoreLogs([/expo-notifications: Android Push notifications/]);
}
