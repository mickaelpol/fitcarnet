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
 * Partout ailleurs — l'application native, le web de développement en
 * `http://localhost:8081` — on garde `EXPO_PUBLIC_API_URL`. Là, l'API est
 * réellement sur une autre origine que la page, et personne ne peut le
 * deviner.
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
): string {
  if (emplacement !== null && emplacement.protocol === 'https:') {
    /* Une barre finale sur `origin` donnerait `https://x//api`. Certains
       serveurs l'acceptent, Caddy renvoie une redirection, et le préflight
       CORS d'un POST ne survit pas à une redirection. */
    return `${emplacement.origin.replace(/\/+$/, '')}/api`;
  }

  return configuree !== undefined && configuree !== '' ? configuree : PAR_DEFAUT;
}
