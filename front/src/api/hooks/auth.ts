/* ---------- authentification ---------- */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api, definirJeton, definirRafraichissement, lireRafraichissement,
} from '../client';
import { purgerLeCache } from '../persistance';
import { useConnecte } from '../session';
import type { Utilisateur } from '../types';

export function useConnexion() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (identifiants: { email: string; motDePasse: string }) => {
      /* ON REPART DE RIEN, AVANT MÊME DE DEMANDER LE JETON.
       *
       * `invalidateQueries()` était ici, et c'était faux. Il marque les
       * données comme périmées mais LES LAISSE À L'ÉCRAN pendant qu'il les
       * recharge : se connecter n'effaçait donc rien. Tant que le cache ne
       * vivait qu'en mémoire, fermer l'application suffisait à le nettoyer.
       * Depuis qu'il est écrit sur le disque, les données du compte précédent
       * survivent au redémarrage — et la personne qui se connecte ensuite voit
       * le nom, les séances et le frigo de celle d'avant, jusqu'à ce que
       * chaque requête ait fini de se corriger. Sur un réseau lent, ça dure.
       *
       * Une connexion est le DÉBUT d'une session. Rien de ce qui précède ne
       * lui appartient : on ne rafraîchit pas, on efface.
       *
       * AVANT L'APPEL, ET PAS DANS `onSuccess` : entre la réponse du serveur
       * et le nettoyage il y aurait une fenêtre, courte mais réelle, où le
       * nouveau jeton cohabite avec les données de l'ancien compte. Le faire
       * d'abord supprime la fenêtre plutôt que de la raccourcir. Une connexion
       * qui échoue laisse alors un cache vide — sans conséquence, on est sur
       * l'écran de connexion. */
      await purgerLeCache(qc);

      const r = await api<{ token: string; jetonRafraichissement?: string }>('/connexion', {
        methode: 'POST', corps: identifiants, sansJeton: true,
      });
      await definirJeton(r.token);
      /* Le serveur joint un jeton de rafraîchissement : c'est LUI qui tient
         la session ouverte. Le jeton d'accès, lui, ne dure qu'une heure. */
      if (r.jetonRafraichissement) await definirRafraichissement(r.jetonRafraichissement);

      return r;
    },
  });
}

/**
 * Se déconnecter pour de bon.
 *
 * Effacer les jetons du téléphone ne suffit pas : tant que la ligne existe en
 * base, une copie du jeton de rafraîchissement rouvrirait la session. On
 * prévient donc le serveur d'abord — et on efface quand même si l'appel
 * échoue, sans quoi une coupure de réseau interdirait de se déconnecter.
 */
export function useDeconnexion() {
  const qc = useQueryClient();

  return async () => {
    const cle = await lireRafraichissement();
    if (cle !== null) {
      try {
        await api<void>('/deconnexion', {
          methode: 'POST', corps: { jetonRafraichissement: cle }, sansJeton: true,
        });
      } catch {
        // hors ligne : le jeton reste en base jusqu'à son échéance, tant pis
      }
    }
    await Promise.all([definirJeton(null), definirRafraichissement(null)]);
    /* La MÉMOIRE ET LE DISQUE, dans cet ordre — voir `purgerLeCache`. Sans le
       disque, les séances, les objectifs et le frigo de celui qui vient de
       partir resteraient sur le téléphone, et la personne suivante les verrait
       s'afficher avant l'arrivée des siennes. */
    await purgerLeCache(qc);
  };
}

/**
 * Le compte connecté.
 *
 * ON LE DEMANDE À UNE ROUTE QUI NE PEUT RENDRE QUE LUI. C'était :
 *
 *     membres(await api<{ member: Utilisateur[] }>('/utilisateurs'))[0]
 *
 * avec, en commentaire, « la collection est filtrée sur le compte courant ».
 * Elle ne l'est pas. Pour un administrateur elle rend TOUT LE MONDE, et `[0]`
 * prend le premier de la liste — sans ordre garanti. Le 14 août 2026, un
 * second compte est apparu avec un identifiant qui précédait celui de
 * l'administrateur : l'application lui a affiché le nom et les droits de
 * quelqu'un d'autre, et lui a fermé ses propres écrans d'administration. Pour
 * tous les autres comptes, cette même collection répond 403 : leur onglet
 * Compte n'a jamais pu s'afficher.
 *
 * On demandait « qui suis-je » à une route qui répond « qui existe ». La
 * bonne réponse dépendait alors du nombre de comptes et de l'ordre des
 * lignes — deux choses étrangères à la question.
 */
/*
 * `enabled` ET PAS SEULEMENT `retry: false` — 15 septembre 2026.
 *
 * Ce hook partait meme deconnecte. Sur l'ecran de connexion, le tout premier
 * ecran de l'application, un `GET /api/moi` sans jeton repondait 401 et posait
 * une erreur rouge dans la console du navigateur. Releve par
 * `presentation/tournage/verifier-ecrans.mjs`, seul temoin capable de le voir :
 * aucun test unitaire ne monte l'application dans un vrai navigateur.
 *
 * SEPT appelants — le portier d'administration de `app/_layout.tsx`,
 * `etatMaj`, l'onglet Compte et les QUATRE ecrans `admin-*` — et deux d'entre
 * eux vivent a la racine, donc sur TOUS les ecrans, connexion comprise. La
 * garde va donc ici, au point de passage obligé, et non devant chaque
 * appelant : une regle recopiee devant sept portes manquera devant la
 * huitieme.
 *
 * (Ce commentaire a d'abord annonce SIX appelants et « trois ecrans admin-* ».
 * Il avait perdu une porte au comptage, dans la phrase meme qui explique
 * qu'on finit toujours par en perdre une. Corrige le 15 septembre 2026, sur
 * signalement de la revue.)
 *
 * `connecte === true` STRICTEMENT, car `useConnecte` rend trois valeurs et
 * `null` veut dire « je ne sais pas encore », pas « oui ». Interroger pendant
 * la lecture du coffre, c'est repartir pour un 401.
 *
 * CE QUE `enabled: false` FAIT DE `isPending` : il le laisse a `true`, pour
 * toujours. Les appelants doivent traiter « en attente » comme « je ne sais
 * pas », jamais comme « pas administrateur » — c'est deja ce que fait le
 * portier de `_layout.tsx`, et c'est pour cela qu'un compte deconnecte n'y
 * arrive jamais : `Racine` affiche son chargement avant de le monter.
 */
export const useMoi = () => {
  const connecte = useConnecte();

  return useQuery({
    queryKey: ['moi'],
    queryFn: () => api<Utilisateur>('/moi'),
    enabled: connecte === true,
    retry: false,
  });
};
