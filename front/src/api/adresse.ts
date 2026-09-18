/**
 * OÙ EST L'API ?
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * L'adresse de l'API était figée dans le bundle au moment de la
 * construction, par `EXPO_PUBLIC_API_URL`. Sur le web, ça veut dire que le
 * `front/dist` publié sur le NAS portait l'adresse qui traînait dans le
 * `.env` de la machine qui avait lancé `npm run build:web`. En l'occurrence
 * `http://192.168.1.118:8080/api`, c'est-à-dire l'adresse d'un poste de
 * développement — et le navigateur refusait, à juste titre :
 *
 *     Mixed Content: The page at 'https://carnet.mickael-pol.fr/connexion'
 *     was loaded over HTTPS, but requested an insecure resource
 *     'http://192.168.1.118:8080/api/connexion'
 *
 * La panne est silencieuse jusqu'à la première connexion, et elle revient à
 * CHAQUE build web fait depuis une machine dont le `.env` n'est pas le bon.
 * Un fait — « voici l'API » — écrit dans un endroit qui n'a rien à voir avec
 * l'endroit où il est vrai.
 *
 * LA RÈGLE
 *
 * Sur une page servie en **HTTPS**, l'API est sur la MÊME origine. Ce n'est
 * pas une convention arbitraire : c'est comme ça que le NAS sert le projet —
 * un seul FrankenPHP, le front à la racine et l'API sous `/api`. Et c'est de
 * toute façon la seule réponse possible, puisqu'une page HTTPS ne peut pas
 * appeler une adresse en clair.
 *
 * Décidé À L'EXÉCUTION, pas à la construction : le même `dist` fonctionne
 * derrière n'importe quel domaine, et changer de domaine ne demande plus de
 * reconstruire quoi que ce soit.
 *
 * **LA RÈGLE A ÉTÉ ÉLARGIE LE 18 SEPTEMBRE 2026, ET CE QUI PRÉCÈDE NE DIT PLUS
 * QUE LA MOITIÉ.** Elle ne portait que sur le HTTPS ; un bundle construit
 * ouvert sur `http://localhost:8080` appelait donc l'adresse figée à la
 * construction. Tant que la session tenait dans un en-tête, ça marchait — mais
 * depuis M5 elle est dans un cookie `SameSite=Strict`, et deux hôtes
 * différents sont DEUX SITES : le cookie ne partait jamais, et le moindre
 * rechargement déconnectait.
 *
 * Le protocole n'était pas la bonne question. La vraie est : **ce bundle a-t-il
 * été servi par le serveur qui sert l'API ?** Oui pour tout bundle construit
 * (Caddy sert les deux, en développement comme en production), non pour le
 * serveur de développement d'Expo. C'est ce que dit le paramètre
 * `serveurDeDeveloppement` plus bas — et c'est lui qui décide désormais, pas
 * le schéma.
 *
 * Reste vrai : l'application native n'a pas d'emplacement du tout, et garde
 * `EXPO_PUBLIC_API_URL`.
 */

/** Ce qu'on retient de `window.location`, et rien de plus. */
export interface Emplacement {
  /** `'https:'` ou `'http:'`, deux-points compris — c'est ce que rend le navigateur */
  protocol: string;
  /** `'https://carnet.mickael-pol.fr'`, sans barre finale */
  origin: string;
}

/** Ce que l'application utilise quand elle ne sait rien : le WSL de dev. */
export const PAR_DEFAUT = 'http://localhost:8080/api';

export function adresseDeLApi(
  configuree: string | undefined,
  /** `null` hors du web, ou quand le navigateur ne dit rien d'exploitable */
  emplacement: Emplacement | null,
  /**
   * Ce bundle est-il celui du SERVEUR DE DÉVELOPPEMENT d'Expo ?
   *
   * C'est la seule question qui sépare vraiment les deux situations du web, et
   * le schéma n'y répondait qu'à moitié :
   *
   *   - `npm run web` sert le bundle sur `:8081` et **ne sert pas l'API**. La
   *     page et l'API sont alors réellement à deux endroits, et
   *     `EXPO_PUBLIC_API_URL` est la seule façon de savoir où aller.
   *   - un bundle **construit** (`npm run build:web`) est servi par Caddy, qui
   *     sert aussi l'API — en développement comme en production. L'API est
   *     donc sur l'origine de la page, quel que soit le schéma.
   *
   * Hors du web, sans objet : `emplacement` vaut `null` et on n'arrive jamais
   * jusqu'ici.
   */
  serveurDeDeveloppement = false,
): string {
  /* SUIVRE LA PAGE, ET PAS LA VARIABLE DE CONSTRUCTION — sauf sur le serveur
     de développement d'Expo, seul cas où la page ne sert pas l'API.

     LA RÈGLE NE PORTAIT QUE SUR LE HTTPS, ET ÇA A COÛTÉ UNE DÉCONNEXION À
     CHAQUE RECHARGEMENT — 18 septembre 2026. Un bundle construit ouvert sur
     `http://localhost:8080` appelait l'adresse figée à la construction,
     `http://192.168.1.118:8080/api`. Tant que la session tenait dans
     `localStorage`, ça marchait : deux origines, mais le jeton voyageait dans
     un en-tête. Depuis M5 il est dans un cookie `SameSite=Strict`, et
     `localhost` et `192.168.1.118` sont DEUX SITES — le navigateur ne l'envoie
     jamais. La connexion réussissait, aucun cookie n'était posé, et le moindre
     rechargement déconnectait. Mesuré dans Chromium, pas supposé.

     Le HTTPS reste couvert : une page HTTPS ne peut de toute façon pas appeler
     une adresse en clair, et un bundle construit est le seul qu'on y serve. */
  if (emplacement !== null && !serveurDeDeveloppement) {
    /* Une barre finale sur `origin` donnerait `https://x//api`. Certains
       serveurs l'acceptent, Caddy renvoie une redirection, et le préflight
       CORS d'un POST ne survit pas à une redirection. */
    return `${emplacement.origin.replace(/\/+$/, '')}/api`;
  }

  return configuree !== undefined && configuree !== '' ? configuree : PAR_DEFAUT;
}
