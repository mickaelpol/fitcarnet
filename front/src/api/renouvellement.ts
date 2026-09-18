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
  /**
   * LE WEB NE VOIT PAS SON PROPRE JETON DE RAFRAÎCHISSEMENT — constat M5.
   *
   * Il est dans un cookie `HttpOnly` que le navigateur envoie tout seul et
   * qu'aucun script ne peut lire. Ici, `lireRafraichissement()` rend donc
   * `null` alors que la session est parfaitement vivante — et c'est
   * exactement le cas que la règle d'en dessous doit distinguer de « plus de
   * session ».
   *
   * Sur le téléphone, faux : le jeton vit dans `expo-secure-store`, adossé
   * au trousseau du système, et on le lit normalement.
   */
  sessionParCookie: boolean;
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
     le seul de l'application. La porte était fermée de l'intérieur.

     SAUF SUR LE WEB, OÙ L'ABSENCE NE PROUVE PLUS RIEN — constat M5. Le jeton
     y est dans un cookie `HttpOnly` : `null` veut dire « je ne peux pas le
     voir », pas « il n'y en a pas ». Terminer la session ici déconnecterait
     le web À CHAQUE rechargement de page, puisque c'est précisément l'état
     dans lequel il démarre — et l'application ne s'ouvrirait plus jamais. On
     laisse donc le serveur trancher : lui voit le cookie, ou pas, et son 401
     ferme la session trois lignes plus bas. */
  if (cle === null && !depot.sessionParCookie) {
    await depot.terminerSession();

    return false;
  }

  const reponse = await requete(`${base}/jeton/rafraichir`, {
    method: 'POST',
    /* `include` ET PAS LA VALEUR PAR DÉFAUT. En production la page et l'API
       partagent l'origine, et `same-origin` suffirait ; en développement,
       `expo start --web` sert la page sur `localhost:8081` et l'API répond
       sur `:8080` — deux origines, et le cookie ne partirait pas. Le serveur
       accompagne avec `allow_credentials` (voir `nelmio_cors.yaml`). */
    credentials: depot.sessionParCookie ? 'include' : 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    /* LE JETON RESTE DANS LE CORPS QUAND ON EN A UN, MÊME EN MODE COOKIE, et
       ce n'est utile qu'une fois : c'est la BASCULE. Un navigateur qui
       portait encore l'ancien jeton dans `localStorage` l'envoie une dernière
       fois, le serveur lui pose un cookie en échange, et personne n'a eu à
       se reconnecter le jour de la mise à jour. Ensuite `cle` vaut `null` et
       seul le cookie parle. */
    body: JSON.stringify({
      ...(depot.sessionParCookie ? { cookieDeSession: true } : {}),
      ...(cle === null ? {} : { jetonRafraichissement: cle }),
    }),
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
  /* EN MODE COOKIE LE SERVEUR N'EN RENVOIE PLUS — c'est tout l'objet de M5 :
     ce qui arrive dans le corps est lisible par un script. Cette branche ne
     sert donc plus qu'au téléphone, et le `typeof` la garde fermée sur le
     web même si un serveur d'une version antérieure en remettait un. */
  if (typeof donnees.jetonRafraichissement === 'string' && !depot.sessionParCookie) {
    await depot.definirRafraichissement(donnees.jetonRafraichissement);
  }

  return true;
}
