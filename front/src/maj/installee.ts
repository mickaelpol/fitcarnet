import Constants from 'expo-constants';

/**
 * Le `versionCode` de l'application qui tourne, ou `null` si la question n'a
 * pas de sens — sur le web, ou dans Expo Go.
 *
 * Séparé de `version.ts` pour une raison de test : ce fichier touche au
 * téléphone, donc il n'est pas exécutable hors d'un appareil. Le reste du
 * module — tout ce qui DÉCIDE — n'en dépend pas et s'éprouve en une seconde.
 *
 * `null` et non `0` : zéro serait un numéro, et « inconnu » n'en est pas un.
 * Confondre les deux ferait proposer un APK à la version web servie par le
 * NAS, qui n'a rien à en faire.
 */
export function versionInstallee(): number | null {
  const code = Constants.expoConfig?.android?.versionCode;

  return typeof code === 'number' ? code : null;
}
