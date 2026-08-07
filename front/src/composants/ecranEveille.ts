import { useEffect } from 'react';
import { AppState } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

/**
 * Maintient l'écran allumé tant que `actif` est vrai.
 *
 * Sans ça, le téléphone se verrouille dans la poche pendant un temps de repos
 * et on rate la fin du décompte. Mais un verrou oublié est pire que pas de
 * verrou : le téléphone ne se verrouille plus jamais et l'utilisateur ne
 * comprend pas pourquoi. Deux protections, pour deux fuites réelles.
 *
 * LA COURSE. `activateKeepAwakeAsync` est asynchrone, `deactivateKeepAwake`
 * ne l'est pas. Un composant démonté juste après son démarrage relâchait
 * AVANT que la prise n'aboutisse : le verrou survivait à ce qui l'avait
 * demandé, sans plus personne pour le rendre. Le drapeau `relache` referme
 * cette fenêtre.
 *
 * L'ARRIÈRE-PLAN. Les onglets d'expo-router restent montés : passer de la
 * séance au frigo ne démonte rien. Un chronomètre d'effort, qui ne s'arrête
 * jamais tout seul, gardait donc l'écran allumé indéfiniment pendant qu'on
 * consultait autre chose. On rend le verrou dès que l'application quitte le
 * premier plan, et on le reprend au retour si la mesure court toujours.
 */
export function useEcranEveille(actif: boolean, etiquette: string): void {
  useEffect(() => {
    if (!actif) return;

    let relache = false;

    /* Relâcher une étiquette déjà rendue lève selon les versions : l'échec
       est sans conséquence, on ne veut simplement pas qu'il remonte. */
    const rendre = () => {
      try {
        const r: unknown = deactivateKeepAwake(etiquette);
        if (r instanceof Promise) void r.catch(() => undefined);
      } catch { /* déjà relâché */ }
    };

    const prendre = () => {
      void activateKeepAwakeAsync(etiquette)
        .then(() => { if (relache) rendre(); })
        .catch(() => undefined);
    };

    prendre();

    const abonnement = AppState.addEventListener('change', (etat) => {
      if (etat === 'active') { prendre(); } else { relache = false; rendre(); }
    });

    return () => {
      relache = true;
      abonnement.remove();
      rendre();
    };
  }, [actif, etiquette]);
}
