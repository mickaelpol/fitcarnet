/**
 * Renouveler le JWT à partir du jeton de rafraîchissement.
 *
 * POURQUOI CE MODULE EXISTE À PART DE `client.ts`.
 *
 * `client.ts` importe `expo-secure-store` et `react-native` : il ne se charge
 * pas hors d'un appareil, donc rien de ce qu'il contient ne s'éprouve. Ses
 * 342 lignes — rejeu sur 401, distinction entre panne réseau et refus serveur,
 * corps non-JSON — n'avaient aucun test, et c'est là que s'était logée la
 * session morte : le renouvellement rendait `false` sans terminer la session,
 * laissant un JWT expiré dans le coffre et l'application « connectée » à un
 * compte qu'elle ne pouvait plus servir.
 *
 * La décision est donc écrite ici, avec le coffre et `fetch` passés en
 * arguments. `client.ts` fournit les vrais ; les tests fournissent les leurs.
 *
 * @see renouvellement.test.ts
 */

/** Ce que le renouvellement a besoin de savoir faire du coffre à jetons. */
export interface DepotJetons {
  lireRafraichissement(): Promise<string | null>;
  definirJeton(valeur: string): Promise<void>;
  definirRafraichissement(valeur: string): Promise<void>;
  terminerSession(): Promise<void>;
}

/**
 * Rend `true` si un jeton neuf a été rangé.
 *
 * La session n'est terminée que dans les deux cas où elle est réellement
 * morte : plus de jeton à présenter, ou un serveur qui refuse celui qu'on a.
 * Tout le reste — coupure réseau, 503, réponse malformée — est passager, et
 * déconnecter y serait une punition pour un tunnel de métro.
 *
 * Une panne réseau ressort en exception : c'est l'appelant qui décide s'il
 * réessaie. `client.ts` la convertit en `false` via `uneSeuleFois`.
 */
export async function renouvelerJeton(
  base: string,
  depot: DepotJetons,
  requete: typeof fetch,
): Promise<boolean> {
  const cle = await depot.lireRafraichissement();

  /* PLUS DE JETON, PLUS DE SESSION — ET ON LE DIT.
     Rendre `false` en silence laissait le JWT expiré dans le coffre. Le
     portier ne teste que la présence d'une chaîne : l'application se croyait
     connectée, tous les écrans affichaient « Identifiants incorrects », et
     l'onglet Compte montrait son erreur AVANT son bouton de déconnexion —
     le seul de l'application. La porte était fermée de l'intérieur. */
  if (cle === null) {
    await depot.terminerSession();

    return false;
  }

  const reponse = await requete(`${base}/jeton/rafraichir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jetonRafraichissement: cle }),
  });

  if (!reponse.ok) {
    /* Un 401 est définitif : le jeton a été révoqué, ou il a passé son
       échéance. Les autres codes sont des pannes du serveur, pas des refus. */
    if (reponse.status === 401) await depot.terminerSession();

    return false;
  }

  const donnees = await reponse.json() as { token?: string; jetonRafraichissement?: string };

  /* Un 200 sans jeton est une faute du serveur, pas une session finie. On
     échoue sans déconnecter : le jeton de rafraîchissement reste valable et
     la tentative suivante peut réussir. */
  if (typeof donnees.token !== 'string') return false;

  await depot.definirJeton(donnees.token);
  if (typeof donnees.jetonRafraichissement === 'string') {
    await depot.definirRafraichissement(donnees.jetonRafraichissement);
  }

  return true;
}
