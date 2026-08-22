import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { adresseDeLApi, type Emplacement } from './adresse';
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
export const coffre = {
  async lire(cle: string): Promise<string | null> {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(cle) ?? null;

    return SecureStore.getItemAsync(cle);
  },
  async ecrire(cle: string, valeur: string): Promise<void> {
    if (Platform.OS === 'web') { globalThis.localStorage?.setItem(cle, valeur); return; }
    await SecureStore.setItemAsync(cle, valeur);
  },
  async effacer(cle: string): Promise<void> {
    if (Platform.OS === 'web') { globalThis.localStorage?.removeItem(cle); return; }
    await SecureStore.deleteItemAsync(cle);
  },
};

export class ErreurApi extends Error {
  constructor(public readonly statut: number, message: string) {
    super(message);
    this.name = 'ErreurApi';
  }
}

let jeton: string | null = null;
let rafraichissement: string | null = null;
let jetonsCharges = false;

async function chargerLesDeux(): Promise<void> {
  if (jetonsCharges) return;
  [jeton, rafraichissement] = await Promise.all([
    coffre.lire(CLE_JETON),
    coffre.lire(CLE_RAFRAICHISSEMENT),
  ]);
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

async function renouveler(): Promise<boolean> {
  const cle = await lireRafraichissement();
  if (cle === null) return false;

  const reponse = await fetch(`${BASE}/jeton/rafraichir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jetonRafraichissement: cle }),
  });

  /* Un refus est définitif : le jeton de rafraîchissement a été révoqué, ou
     il a passé son échéance. Une panne réseau, elle, lève une exception et
     ne passe pas par ici — on ne déconnecte personne pour une coupure. */
  if (!reponse.ok) {
    if (reponse.status === 401) await terminerSession();

    return false;
  }

  const donnees = await reponse.json() as { token?: string; jetonRafraichissement?: string };
  if (typeof donnees.token !== 'string') return false;

  await definirJeton(donnees.token);
  if (typeof donnees.jetonRafraichissement === 'string') {
    await definirRafraichissement(donnees.jetonRafraichissement);
  }

  return true;
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
    reponse = await fetch(BASE + chemin, {
      method: methode,
      headers: entetes,
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
  } catch {
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
      ?? (reponse.status === 401 ? 'Identifiants incorrects.' : `Erreur ${reponse.status}`),
  };
}

function remonter<T>(r: Reponse<T>): T {
  if (!r.ok) throw new ErreurApi(r.statut, r.message);

  return r.donnees as T;
}

/** Les collections d'API Platform arrivent sous « member ». */
export const membres = <T>(collection: { member?: T[] } | null): T[] => collection?.member ?? [];
