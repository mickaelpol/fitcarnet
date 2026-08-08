import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { uneSeuleFois } from './uneSeuleFois';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080/api';
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

export async function definirJeton(valeur: string | null): Promise<void> {
  jeton = valeur;
  jetonsCharges = true;
  if (valeur === null) await coffre.effacer(CLE_JETON);
  else await coffre.ecrire(CLE_JETON, valeur);
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
  methode?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  corps?: unknown;
  /** certains appels (connexion, renouvellement) n'ont pas encore de jeton */
  sansJeton?: boolean;
}

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

  const reponse = await fetch(BASE + chemin, {
    method: methode,
    headers: entetes,
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });

  if (reponse.status === 204) {
    return { statut: 204, ok: true, donnees: null, message: '' };
  }

  const texte = await reponse.text();
  const donnees: unknown = texte ? JSON.parse(texte) : null;

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
