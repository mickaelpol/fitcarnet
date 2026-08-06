import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080/api';
const CLE_JETON = 'fitcarnet.jeton';

/* SecureStore n'existe pas sur le web : on retombe sur localStorage. */
const coffre = {
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

export async function chargerJeton(): Promise<string | null> {
  if (jeton === null) jeton = await coffre.lire(CLE_JETON);

  return jeton;
}

export async function definirJeton(valeur: string | null): Promise<void> {
  jeton = valeur;
  if (valeur === null) await coffre.effacer(CLE_JETON);
  else await coffre.ecrire(CLE_JETON, valeur);
}

interface Options {
  methode?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  corps?: unknown;
  /** certains appels (connexion) n'ont pas encore de jeton */
  sansJeton?: boolean;
}

/**
 * Appel à l'API. Les erreurs remontent sous forme d'ErreurApi avec le
 * message renvoyé par le serveur, jamais un « [object Object] ».
 */
export async function api<T>(chemin: string, options: Options = {}): Promise<T> {
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

  if (reponse.status === 204) return undefined as T;

  const texte = await reponse.text();
  const donnees: unknown = texte ? JSON.parse(texte) : null;

  if (!reponse.ok) {
    const d = donnees as { detail?: string; message?: string; 'hydra:description'?: string } | null;
    const message = d?.detail ?? d?.['hydra:description'] ?? d?.message
      ?? (reponse.status === 401 ? 'Identifiants incorrects.' : `Erreur ${reponse.status}`);
    throw new ErreurApi(reponse.status, message);
  }

  return donnees as T;
}

/** Les collections d'API Platform arrivent sous « member ». */
export const membres = <T>(collection: { member?: T[] } | null): T[] => collection?.member ?? [];
