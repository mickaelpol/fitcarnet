import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { adresseDeLApi, type Emplacement } from './adresse';
import { ErreurApi } from './erreurApi';
import { renouvelerJeton, type DepotJetons } from './renouvellement';
import { uneSeuleFois } from './uneSeuleFois';

/**
 * `window.location`, quand il existe et qu'il dit quelque chose d'utilisable.
 *
 * On passe par `globalThis` plutôt que par `window` pour ne dépendre
 * d'aucune bibliothèque de types : ce fichier est compilé aussi bien pour le
 * navigateur que pour React Native, où `window` n'existe pas.
 */
function emplacement(): Emplacement | null {
  if (Platform.OS !== 'web') return null;

  const l = (globalThis as { location?: { protocol?: unknown; origin?: unknown } }).location;
  if (typeof l?.protocol !== 'string' || typeof l.origin !== 'string') return null;

  return { protocol: l.protocol, origin: l.origin };
}

/* Voir `adresse.ts` : sur une page HTTPS, l'API est sur la même origine, et
   c'est décidé ici, à l'exécution — pas figé dans le bundle au moment du
   build web par le `.env` de la machine qui l'a lancé. */
const BASE = adresseDeLApi(process.env.EXPO_PUBLIC_API_URL, emplacement());
const CLE_JETON = 'fitcarnet.jeton';
const CLE_RAFRAICHISSEMENT = 'fitcarnet.rafraichissement';

/**
 * SecureStore n'existe pas sur le web : on retombe sur localStorage.
 *
 * Exporté parce que les réglages de l'application s'y rangent aussi. Un
 * second mécanisme de stockage à côté divergerait sur le web, où SecureStore
 * est absent : une seule porte, une seule règle.
 */
/**
 * LE STOCKAGE WEB PEUT JETER À L'ACCÈS, PAS SEULEMENT À L'APPEL.
 *
 * Constat F14, corrigé le 15 septembre 2026. Le code écrivait
 * `globalThis.localStorage?.getItem(cle)` : l'opérateur `?.` protège d'un
 * objet ABSENT, il ne protège de rien quand l'objet existe et que le seul
 * fait d'y toucher lève. C'est exactement ce que font Safari en navigation
 * privée, Firefox cookies bloqués, et tout navigateur configuré pour refuser
 * le stockage — `SecurityError` sur la lecture de la propriété elle-même.
 *
 * Ce que ça donnait : `chargerJeton()` rejetait, et personne ne rattrapait.
 * `app/_layout.tsx` laissait `pret` à faux — ÉCRAN DE CHARGEMENT INDÉFINI,
 * sans message, sans bouton. L'application ne démarrait tout simplement pas.
 *
 * Le try/catch est ICI, au point de passage obligé, et pas devant chacun des
 * appelants. `coffre` a déjà quatre consommateurs — les deux jetons, les
 * réglages, la sonnerie — et une règle recopiée devant quatre portes finit
 * par manquer devant la cinquième. C'est la leçon d'É1.
 */
function stockageWeb(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

export const coffre = {
  async lire(cle: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try { return stockageWeb()?.getItem(cle) ?? null; } catch { return null; }
    }

    return SecureStore.getItemAsync(cle);
  },
  async ecrire(cle: string, valeur: string): Promise<void> {
    if (Platform.OS === 'web') {
      /* Un échec d'écriture est avalé, et ce n'est pas anodin : la session
         ne survivra pas au rechargement. On préfère une application qui
         fonctionne le temps de la visite à une application qui refuse de
         démarrer — mais l'utilisateur n'en est pas averti, et ça mériterait
         un mot à l'écran (règle 7). Noté, non tranché. */
      try { stockageWeb()?.setItem(cle, valeur); } catch { /* stockage refusé */ }

      return;
    }
    await SecureStore.setItemAsync(cle, valeur);
  },
  async effacer(cle: string): Promise<void> {
    if (Platform.OS === 'web') {
      try { stockageWeb()?.removeItem(cle); } catch { /* stockage refusé */ }

      return;
    }
    await SecureStore.deleteItemAsync(cle);
  },
};

/* `ErreurApi` vit dans son propre fichier depuis le 18 septembre 2026 : ce
   fichier-ci importe `react-native` et `expo-secure-store`, que Node seul ne
   charge pas, et une classe de six lignes qui ne depend de rien n'a pas a
   imposer ce detour a ses tests. Reexportee ici, rien ne change pour les
   appelants. */
export { ErreurApi } from './erreurApi';

let jeton: string | null = null;
let rafraichissement: string | null = null;
let jetonsCharges = false;

async function chargerLesDeux(): Promise<void> {
  if (jetonsCharges) return;

  const [duDisque, rafraichissementDuDisque] = await Promise.all([
    coffre.lire(CLE_JETON),
    coffre.lire(CLE_RAFRAICHISSEMENT),
  ]);

  /* CE QUI A ÉTÉ ÉCRIT PENDANT LA LECTURE GAGNE — constat M10.
     L'affectation était faite directement sur le résultat de l'`await`, donc
     APRÈS une attente pendant laquelle une connexion ou une déconnexion a pu
     passer. Le disque écrasait alors le jeton neuf par l'ancien, ou défaisait
     une fin de session. `definirJeton` et `definirRafraichissement` posent
     `jetonsCharges` à `true` sans attendre : il suffit de le relire ici.
     La fenêtre était étroite — les trois appelants sont au montage — mais
     rien ne la fermait, et une session qui se rouvre toute seule ne se
     diagnostique pas. */
  if (jetonsCharges) return;

  jeton = duDisque;
  rafraichissement = rafraichissementDuDisque;
  jetonsCharges = true;
}

export async function chargerJeton(): Promise<string | null> {
  await chargerLesDeux();

  return jeton;
}

/* ------------------------------------------------- qui écoute la session */

/**
 * ON PRÉVIENT QUAND LE JETON CHANGE.
 *
 * Le portier de `app/_layout.tsx` doit renvoyer vers la connexion À L'INSTANT
 * où la session tombe, et laisser entrer à l'instant où elle s'ouvre. Sans ce
 * signal, il faudrait interroger le coffre en boucle, ou attendre le prochain
 * changement d'écran — c'est-à-dire laisser un écran protégé affiché après
 * une déconnexion.
 */
const abonnesJeton = new Set<(connecte: boolean) => void>();

export function abonnerJeton(f: (connecte: boolean) => void): () => void {
  abonnesJeton.add(f);

  return () => { abonnesJeton.delete(f); };
}

const prevenirJeton = (): void => {
  for (const f of abonnesJeton) f(jeton !== null && jeton !== '');
};

export async function definirJeton(valeur: string | null): Promise<void> {
  jeton = valeur;
  jetonsCharges = true;
  if (valeur === null) await coffre.effacer(CLE_JETON);
  else await coffre.ecrire(CLE_JETON, valeur);
  prevenirJeton();
}

export async function definirRafraichissement(valeur: string | null): Promise<void> {
  rafraichissement = valeur;
  jetonsCharges = true;
  if (valeur === null) await coffre.effacer(CLE_RAFRAICHISSEMENT);
  else await coffre.ecrire(CLE_RAFRAICHISSEMENT, valeur);
}

export async function lireRafraichissement(): Promise<string | null> {
  await chargerLesDeux();

  return rafraichissement;
}

/* ------------------------------------------------------- fin de session */

let prevenirSessionFinie: (() => void) | null = null;

/**
 * Ce que l'application fait quand la session est bel et bien terminée :
 * revenir à l'écran de connexion. Branché une fois, dans `app/_layout.tsx`.
 *
 * Le client HTTP ne connaît pas la navigation, et ne doit pas la connaître —
 * il vit aussi dans les tests, où aucun routeur n'existe.
 */
export function surSessionFinie(quoi: (() => void) | null): void {
  prevenirSessionFinie = quoi;
}

async function terminerSession(): Promise<void> {
  await Promise.all([definirJeton(null), definirRafraichissement(null)]);
  prevenirSessionFinie?.();
}

/* --------------------------------------------------- renouvellement */

/* La décision vit dans `renouvellement.ts`, sans dépendance à React Native,
   donc éprouvée. Ce fichier ne fournit plus que le coffre et le réseau réels :
   le seul endroit où la session morte pouvait revenir est désormais couvert
   par huit tests. */
const depotJetons: DepotJetons = {
  lireRafraichissement,
  definirJeton,
  definirRafraichissement,
  terminerSession,
};

/* --------------------------------------------------------- le délai de garde
 *
 * `fetch` N'A AUCUN DÉLAI PAR DÉFAUT, et ce client n'en posait aucun jusqu'au
 * 15 septembre 2026. Une connexion acceptée puis muette — proxy inverse
 * bloqué, NAS en veille, Wi-Fi de salle captif — laissait la promesse en
 * suspens pour toujours. Chaque écran restait sur son rond qui tourne : ni
 * erreur, ni « Réessayer », puisque React Query attend encore la première
 * réponse. Sur l'onglet Compte, c'était la déconnexion qui devenait
 * inaccessible (É14) ; `cadreCompte.tsx` soigne l'écran, ceci soigne la cause.
 *
 * TRENTE SECONDES, ET L'API EST TENUE DE RÉPONDRE AVANT. Elle appelle Grocy
 * pendant la requête — `/mon-frigo`, `/mon-frigo/aliment`, `/mon-frigo/quantite`,
 * `/plan_repas/{id}/cuisine`. Ces appels sont bornés côté serveur à VINGT
 * secondes (`FrigoGrocy::DUREE_MAX_S`) : un Grocy bloqué produit donc le 502
 * « Grocy est injoignable… » de l'API, avec le vrai diagnostic, et non ce délai
 * de garde qui ne saurait dire que « le serveur ne répond pas ». Ce commentaire
 * a d'abord affirmé que l'API n'appelait rien de lent : c'était faux, et la
 * revue l'a relevé le jour même.
 *
 * LE RENOUVELLEMENT PASSE PAR ICI AUSSI, et c'est le plus important des deux :
 * `uneSeuleFois` fait attendre TOUTES les requêtes derrière un seul
 * `/jeton/rafraichir`. Muet, il les figeait toutes d'un coup. */
const DELAI_DE_GARDE_MS = 30_000;
let delaiDeGarde = DELAI_DE_GARDE_MS;

/** Pour les tests : raccourcir le délai, puis le rendre en appelant sans argument. */
export function definirDelaiDeGarde(ms: number = DELAI_DE_GARDE_MS): void {
  delaiDeGarde = ms;
}

/** Le délai est dépassé : aucune réponse complète n'est arrivée à temps. */
class DelaiDepasse extends Error {}

async function fetchAvecDelai(url: string, options: RequestInit = {}): Promise<Response> {
  const controleur = new AbortController();
  const minuteur = setTimeout(() => { controleur.abort(); }, delaiDeGarde);

  try {
    const reponse = await fetch(url, { ...options, signal: controleur.signal });

    /* LE CORPS AUSSI, DANS LE MÊME DÉLAI. Un `fetch` de navigateur résout dès
       les EN-TÊTES ; le corps arrive ensuite. Annuler le minuteur à ce moment-là
       laissait `text()` et `json()` attendre sans limite — une connexion qui
       décroche au milieu d'une longue liste, et l'écran tournait pour toujours.
       Relevé par la revue le 15 septembre 2026. On lit donc tout ici, puis on
       rend une réponse déjà complète : ses lecteurs n'attendent plus rien. */
    const texte = await reponse.text();
    const sansCorps = reponse.status === 204 || reponse.status === 205 || reponse.status === 304;

    return new Response(sansCorps ? null : texte, {
      status: reponse.status,
      statusText: reponse.statusText,
      headers: reponse.headers,
    });
  } catch (e) {
    /* On ne croit pas le TYPE de l'erreur, qui varie d'un moteur à l'autre
       (`AbortError` sur le web, message libre sous Hermes) : on regarde si
       c'est NOTRE minuteur qui a coupé. */
    if (controleur.signal.aborted) throw new DelaiDepasse();
    throw e;
  } finally {
    /* Sans ce `clearTimeout`, chaque requête réussie laisserait un minuteur
       de trente secondes vivant derrière elle. */
    clearTimeout(minuteur);
  }
}

async function renouveler(): Promise<boolean> {
  return renouvelerJeton(BASE, depotJetons, (url, options) => fetchAvecDelai(String(url), options));
}

/* Une panne de réseau lève une exception : on la ramène à « pas renouvelé »
   plutôt qu'à une déconnexion. Seul un refus franc du serveur ferme la
   session, et c'est `renouveler` qui s'en charge. */
const renouvelerUneSeuleFois = uneSeuleFois(
  async (): Promise<boolean> => renouveler().catch(() => false));

interface Options {
  /* PUT sert aux écritures qui REMPLACENT par clé naturelle — les cuissons
     habituelles. Rejouées deux fois, elles donnent le même état ; un POST
     empilerait, ou échouerait sur l'index unique dès la deuxième fois. */
  methode?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  corps?: unknown;
  /** certains appels (connexion, renouvellement) n'ont pas encore de jeton */
  sansJeton?: boolean;
}

/**
 * L'adresse que cette application interroge, telle qu'elle a ete figee.
 *
 * Exportee pour etre AFFICHEE. Sur un telephone, rien ne permet autrement de
 * savoir si l'APK installe parle au NAS ou a une adresse de developpement :
 * dans les deux cas on voit « impossible de charger ».
 */
export const adresseApi = (): string => BASE;

/**
 * Appel à l'API. Les erreurs remontent sous forme d'ErreurApi avec le
 * message renvoyé par le serveur, jamais un « [object Object] ».
 *
 * Un jeton périmé ne remonte pas jusqu'à l'écran : on le renouvelle et on
 * rejoue l'appel, une seule fois. Auparavant, l'application gardait le jeton
 * mort, se croyait connectée, et affichait « Expired JWT Token » en rouge
 * sur chaque onglet — la navigation marchait, plus rien ne chargeait.
 */
export async function api<T>(chemin: string, options: Options = {}): Promise<T> {
  const premier = await appeler<T>(chemin, options);
  if (premier.statut !== 401 || options.sansJeton === true) {
    return remonter(premier);
  }

  if (!await renouvelerUneSeuleFois()) {
    return remonter(premier);
  }

  return remonter(await appeler<T>(chemin, options));
}

interface Reponse<T> {
  statut: number;
  ok: boolean;
  donnees: T | null;
  message: string;
}

async function appeler<T>(chemin: string, options: Options): Promise<Reponse<T>> {
  const { methode = 'GET', corps, sansJeton = false } = options;

  const entetes: Record<string, string> = {
    Accept: 'application/ld+json',
  };
  if (corps !== undefined) {
    entetes['Content-Type'] = methode === 'PATCH'
      ? 'application/merge-patch+json'
      : 'application/ld+json';
  }
  if (!sansJeton) {
    const j = await chargerJeton();
    if (j) entetes.Authorization = `Bearer ${j}`;
  }

  /* UNE PANNE RESEAU DOIT DIRE QUELLE ADRESSE A ECHOUE.
   *
   * `fetch` leve « Network request failed » — six mots qui ne disent ni le
   * serveur, ni la cause, ni quoi faire. On a cherche une soiree une erreur
   * qui venait simplement d'un APK construit avec l'adresse du poste de
   * developpement : le message etait le meme que pour un telephone hors
   * ligne. Nommer l'adresse aurait suffi.
   *
   * On ne relance pas ici : react-query reessaie deja deux fois. On traduit,
   * c'est tout. */
  let reponse: Response;
  try {
    reponse = await fetchAvecDelai(BASE + chemin, {
      method: methode,
      headers: entetes,
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
  } catch (e) {
    /* CE MESSAGE NE DÉSIGNE PAS DE COUPABLE, et c'est voulu. Sur Android,
       React Native règle OkHttp sans délai de connexion : un serveur éteint ou
       un Wi-Fi captif qui avale les paquets n'y lèvent AUCUNE erreur réseau et
       finissent ici, comme un serveur qui s'est tu. La première version disait
       « il a accepté la connexion » et envoyait l'enquête côté serveur à tort
       — relevé par la revue le 15 septembre 2026. */
    if (e instanceof DelaiDepasse) {
      return {
        statut: 0,
        ok: false,
        donnees: null,
        message: `Le serveur ne répond pas (plus de ${Math.max(1, Math.round(delaiDeGarde / 1000))} s) : `
          + `${BASE}. Réessaie dans un instant ; si ça dure, vérifie ta connexion `
          + `et que le serveur est bien allumé.`,
      };
    }

    return {
      statut: 0,
      ok: false,
      donnees: null,
      message: `Serveur injoignable : ${BASE}. Vérifie ta connexion — `
        + `et que cette adresse est bien celle attendue.`,
    };
  }

  if (reponse.status === 204) {
    return { statut: 204, ok: true, donnees: null, message: '' };
  }

  const texte = await reponse.text();

  /* TOUTE RÉPONSE N'EST PAS DU JSON, ET LE SUPPOSER A FAIT PLANTER L'APP.
   *
   * Cette ligne était `JSON.parse(texte)`, nue. Le 21 août 2026, après
   * l'installation d'un APK pendant que le NAS redéployait, l'application est
   * revenue au premier plan, a interrogé l'API, et a reçu une page d'erreur
   * HTML de Caddy. L'utilisateur a lu :
   *
   *     JSON Parse error: Unexpected character: <
   *
   * Le message ne dit rien de ce qu'il faut faire, et il remonte tel quel
   * depuis les entrailles du moteur JavaScript. Or ce cas n'a rien
   * d'exceptionnel : un conteneur qui redémarre, un proxy inverse qui répond à
   * la place du serveur, un portail Wi-Fi captif qui intercepte la requête —
   * tous rendent du HTML avec les meilleures intentions.
   *
   * ON NE DEVINE PAS, ON CONSTATE. Un corps illisible est un fait, pas une
   * exception : il devient une réponse en erreur comme une autre, avec un
   * message qui dit quoi faire. Le reste de l'application le traite déjà.
   */
  let donnees: unknown = null;
  let illisible = false;
  if (texte !== '') {
    try {
      donnees = JSON.parse(texte);
    } catch {
      illisible = true;
    }
  }

  if (illisible) {
    return {
      statut: reponse.status,
      ok: false,
      donnees: null,
      /* LE CAS LE PLUS FRÉQUENT EST TEMPORAIRE, on le dit en premier. Un
         serveur qui redémarre répond en quelques secondes ; conseiller de
         réessayer coûte un geste et règle la plupart des cas. Le code HTTP
         suit, pour les fois où ça ne suffit pas. */
      message: `Le serveur a répondu autre chose que des données (HTTP ${reponse.status}). `
        + 'Il redémarre peut-être — réessaie dans quelques secondes.',
    };
  }

  if (reponse.ok) {
    return { statut: reponse.status, ok: true, donnees: donnees as T, message: '' };
  }

  const d = donnees as { detail?: string; message?: string; 'hydra:description'?: string } | null;

  return {
    statut: reponse.status,
    ok: false,
    donnees: null,
    message: d?.detail ?? d?.['hydra:description'] ?? d?.message
      ?? repli(reponse.status, sansJeton),
  };
}

/**
 * CE QU'ON DIT QUAND LE SERVEUR, LUI, NE DIT RIEN.
 *
 * Constat M7 de l'audit de septembre 2026, corrigé le 15 septembre 2026. Le
 * repli d'un 401 était « Identifiants incorrects. » QUEL QUE SOIT le chemin
 * appelé. Sur `/connexion` c'est juste ; partout ailleurs c'est faux, et
 * pénible : la session expire, on ouvre son frigo, l'écran répond
 * « Identifiants incorrects. » — et on cherche une faute de frappe dans un mot
 * de passe qu'on n'a pas tapé.
 *
 * `sansJeton` SUFFIT À TRANCHER, et ce n'est pas une coïncidence. Vérifié dans
 * `security.yaml` le 15 septembre 2026, appel par appel :
 *
 *   - les seuls appels `sansJeton` sont `/connexion`, `/deconnexion` et
 *     `/invitation/…`, tous HORS du pare-feu JWT. `/deconnexion` répond 204
 *     quoi qu'il arrive, et `useDeconnexion` avale son erreur de toute façon ;
 *     `/invitation/` est `security: false` et son contrôleur répond 404, 409
 *     ou 422. Il ne reste que `/connexion`, où un 401 veut bel et bien dire
 *     « mot de passe faux » ;
 *   - tout le reste passe par le pare-feu `api` (`jwt: ~`), où un 401 ne peut
 *     désigner qu'un jeton absent, invalide ou périmé. Jamais des identifiants.
 *
 * Le jour où une route publique vérifiant un mot de passe s'ajoutera — une
 * réinitialisation, par exemple — c'est ici qu'il faudra revenir : elle serait
 * `sansJeton` sans être `/connexion`.
 *
 * LE TEXTE EST CELUI DE L'API, AU CARACTÈRE PRÈS. `SessionController::refus`
 * répond déjà `{"detail": "Session expiree, reconnecte-toi."}`, et ce `detail`
 * s'affiche tel quel. Deux orthographes de la même phrase selon qui a répondu
 * se liraient comme deux pannes différentes : les accents manquants sont donc
 * VOULUS ici, et non une étourderie à corriger.
 */
function repli(statut: number, sansJeton: boolean): string {
  if (statut !== 401) return `Erreur ${statut}`;

  return sansJeton ? 'Identifiants incorrects.' : 'Session expiree, reconnecte-toi.';
}

function remonter<T>(r: Reponse<T>): T {
  if (!r.ok) throw new ErreurApi(r.statut, r.message);

  return r.donnees as T;
}

/** Les collections d'API Platform arrivent sous « member ». */
export const membres = <T>(collection: { member?: T[] } | null): T[] => collection?.member ?? [];
