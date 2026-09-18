/**
 * LE GARDE D'ERREUR DES ÉCRANS — un seul, pour toutes leurs requêtes.
 *
 * LA PANNE, ET SA DATE. Constat M6 de l'audit de septembre 2026, corrigé le
 * 18 septembre 2026. Quatre écrans testaient `isError` sur UNE de leurs
 * requêtes et jamais sur les voisines, puis retombaient sur un
 * `return <Chargement />` inconditionnel :
 *
 *   - `app/modele/[id].tsx` ne lisait pas `modeles.isError` : /modeles en
 *     panne, `modele` restait `null` et la roue tournait pour toujours ;
 *   - `app/(onglets)/repas.tsx` ne lisait pas `cibles.isError` : sans cibles,
 *     `demandes` est vide, le solveur ne tourne pas et l'écran ne propose
 *     RIEN sans dire pourquoi — l'écran le plus sensible de l'application ;
 *   - `app/admin-utilisateurs.tsx` ne lisait pas `comptes.isError`.
 *
 * Il suffisait d'un tunnel de métro : une requête passe, sa voisine non.
 *
 * CE MODULE EST UN `.ts` ET NON `base.tsx`, ALORS QUE L'AUDIT L'Y PLAÇAIT.
 * Un test de `src/` qui importerait une valeur depuis un `.tsx` tire React
 * Native derrière lui et meurt en erreur de syntaxe Flow À L'EXÉCUTION, pas
 * au typage (voir l'en-tête de `tsconfig.tests.json`). Une règle qu'on ne
 * peut pas éprouver est une règle qui dérive : elle vit donc ici, nue.
 */

/**
 * Le minimum qu'on lit d'une requête pour savoir si l'écran peut être JUSTE.
 * Compatible avec `UseQueryResult` de TanStack Query sans en dépendre.
 */
export interface RequeteObservee {
  readonly isError: boolean;
  readonly error: { readonly message: string } | null;
  readonly refetch: () => unknown;
}

/** De quoi remplir `<Erreur message=… onReessayer=… />`, et rien de plus. */
export interface PanneRequete {
  readonly message: string;
  readonly reessayer: () => void;
}

/**
 * ON DIT QU'ON NE SAIT PAS, ON NE SE TAIT PAS. `isError` vrai avec un `error`
 * nul ou vide arrive (une erreur sans message, une doublure mal faite) :
 * rendre `null` dans ce cas ramènerait exactement le défaut corrigé, l'écran
 * repartant sur son `<Chargement />` sans fin.
 */
const SANS_MESSAGE = 'Le chargement a échoué, sans message d’erreur.';

/**
 * La première des requêtes qui est en panne, prête à afficher — ou `null` si
 * aucune ne l'est.
 *
 * ORDRE DES GARDES, À NE PAS INVERSER. Cette fonction ne regarde PAS
 * `isLoading` : « en attente » n'est ni « en panne » ni « pas de données ».
 * L'écran garde donc son `if (…isLoading) return <Chargement />` AVANT de
 * l'appeler, sinon chaque ouverture afficherait une panne inventée.
 *
 * On passe les requêtes par ordre d'importance : deux pannes simultanées
 * doivent toujours donner le même message, pas un clignotement.
 */
export function premiereErreur(...requetes: readonly RequeteObservee[]): PanneRequete | null {
  const enPanne = requetes.filter((r) => r.isError);
  if (enPanne.length === 0) return null;

  /* `enPanne` n'est jamais vide ici — la garde au-dessus l'a établi. Le `?.`
     ne comble donc rien : il dit que si la première panne venait à manquer,
     on retombe sur `SANS_MESSAGE`, c'est-à-dire sur l'aveu qu'on n'a pas de
     message — jamais sur un message inventé (M13, 18 septembre 2026). */
  const message = enPanne[0]?.error?.message.trim();

  return {
    message: message === undefined || message === '' ? SANS_MESSAGE : message,
    /* TOUTES les pannes sont relancées, pas seulement celle qu'on affiche :
       sinon « Réessayer » remplace un message d'erreur par un autre message
       d'erreur, et l'utilisateur en conclut que rien ne marche. */
    reessayer: () => { for (const requete of enPanne) requete.refetch(); },
  };
}
