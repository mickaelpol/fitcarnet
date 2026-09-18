import { ErreurApi } from './erreurApi';

/**
 * QUAND RÉESSAYER UNE REQUÊTE.
 *
 * POURQUOI CE MODULE EXISTE — constat M11 de l'audit.
 *
 * `useMoi` portait `retry: false`, et c'est juste pour ce qu'on avait en tête :
 * un refus d'identité. Un 401 réessayé trois fois reste un 401, et l'écran de
 * connexion doit venir tout de suite.
 *
 * Mais la panne réseau arrive par le même chemin. Le client la ramène à une
 * `ErreurApi` de statut **0** — « Serveur injoignable » — et `retry: false` la
 * traitait comme un refus. Une coupure d'une seconde condamnait donc l'onglet
 * Compte à un écran d'erreur plein cadre, sans même le bouton « Se déconnecter »,
 * pendant que tous les autres écrans réessayaient deux fois.
 *
 * La règle vit ici, dans un module pur, et non en expression enfouie dans le
 * hook : c'est ce qui permet de l'éprouver sans monter React — et de l'écrire
 * une fois pour les hooks qui en auront besoin.
 */

/**
 * Deux réessais, comme la politique générale de `_layout.tsx`.
 *
 * TanStack Query décide AVANT d'incrémenter son compteur, qui part de zéro
 * (`retryer.js` : `typeof retry === "number" && failureCount < retry`). Ce
 * nombre se compare donc avec `<`, jamais avec `<=` — sinon on en ferait trois.
 */
export const REESSAIS_RESEAU = 2;

/**
 * Réessaie-t-on cette erreur ?
 *
 * Seulement la panne réseau. Un refus — 401, 403, 404, 422 — est une réponse du
 * serveur : la réessayer ne changerait que le moment où l'utilisateur le lit.
 */
export function reessayerSiReseau(tentatives: number, erreur: unknown): boolean {
  return erreur instanceof ErreurApi
    && erreur.statut === 0
    && tentatives < REESSAIS_RESEAU;
}
