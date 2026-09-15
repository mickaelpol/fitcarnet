/**
 * QUE FAIT-ON D'UNE NOTIFICATION QUI ARRIVE ALORS QUE L'APPLICATION EST DEVANT
 * LES YEUX ?
 *
 * `Notifications.setNotificationHandler` est GLOBAL et UNIQUE. Il n'y a pas un
 * gestionnaire par module : il y en a un, et le dernier qui parle gagne pour
 * toute l'application.
 *
 * Deux modules parlaient (constat F10, audit du 7 septembre 2026) :
 * `alarmeRepos.ts` posait le sien au chargement, bannière éteinte ;
 * `notifications.ts` le remplaçait au premier envoi d'inventaire, bannière
 * allumée, définitivement. Après ce premier inventaire, chaque fin de repos
 * affichait donc une bannière au premier plan — alors que le commentaire
 * d'`alarmeRepos` expliquait précisément pourquoi il ne fallait pas.
 *
 * Aucun des deux n'avait tort sur son propre cas : le chrono qui sonne déjà
 * n'a pas besoin d'une bannière, et l'inventaire qui se termine si. Ce qui
 * manquait, c'est que la décision regarde LA NOTIFICATION plutôt que l'ordre
 * de chargement des modules. Elle est ici, une fois, et sans dépendance :
 * `gestionnaireNotifications.ts` la branche, ce fichier la décide.
 */

/** Marque posée dans `content.data` par celui qui envoie la notification. */
export const ORIGINE_REPOS = 'repos';
export const ORIGINE_INVENTAIRE = 'inventaire';

/** Ce que `expo-notifications` attend d'un gestionnaire, champ pour champ. */
export interface Affichage {
  shouldShowBanner: boolean;
  shouldShowList: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
}

/**
 * @param donnees le `content.data` de la notification, tel qu'il revient du
 *   système — c'est-à-dire n'importe quoi : il a fait l'aller-retour par
 *   Android, et une notification programmée par une version précédente de
 *   l'application peut très bien n'avoir aucune marque.
 */
export function commentAfficher(donnees: unknown): Affichage {
  const origine = (donnees as { origine?: unknown } | null | undefined)?.origine;

  /* LA FIN DE REPOS NE S'AFFICHE PAS AU PREMIER PLAN. Si l'application est
     devant les yeux, le chrono a déjà sonné tout seul : la bannière doublerait
     le signal. C'est le seul cas où l'on éteint tout. */
  if (origine === ORIGINE_REPOS) {
    return {
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    };
  }

  /* Tout le reste s'affiche — y compris ce qui n'est pas signé.
     C'est nous qui décidons de ne pas notifier quand l'écran du frigo est
     ouvert (`prevenirFinInventaire` teste `AppState`), pas le système ; laisser
     le système filtrer par-dessus mettrait la règle à deux endroits. Et un
     envoyeur futur qui oublie sa marque verra une notification de trop, ce qui
     se diagnostique — plutôt qu'un silence, qui ne se diagnostique pas.
     Jamais de son : les deux sonneries de l'application sont jouées par
     l'application elle-même. */
  return {
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  };
}
