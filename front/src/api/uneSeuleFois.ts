/**
 * Empêche qu'une même action parte plusieurs fois en parallèle.
 *
 * Le cas qui l'impose : au retour dans l'application, une dizaine de requêtes
 * repartent d'un coup et se heurtent toutes au même jeton périmé. Sans ce
 * garde-fou, chacune lancerait son propre renouvellement — dix appels
 * concurrents pour un seul besoin, et neuf jetons jetés aussitôt.
 *
 * Le premier appelant déclenche l'action ; les suivants reçoivent la MÊME
 * promesse. Une fois réglée, l'action redevient déclenchable : ce n'est pas
 * une mise en cache, seulement un regroupement des appels simultanés.
 */
export function uneSeuleFois<T>(action: () => Promise<T>): () => Promise<T> {
  let enCours: Promise<T> | null = null;

  return () => {
    /* Le nettoyage doit venir AVANT que la promesse partagée ne soit rendue
       aux appelants : sinon un appelant enchaîne, relance l'action, et
       retrouve l'ancienne promesse encore en place. */
    enCours ??= action().finally(() => { enCours = null; });

    return enCours;
  };
}
