/* ---------- authentification ---------- */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api, definirJeton, definirRafraichissement, lireRafraichissement, sessionParCookie,
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

      /* ON DIT AU SERVEUR DANS QUELLE LANGUE RÉPONDRE — constat M5.
         Sur le web, `cookieDeSession: true` : le jeton de rafraîchissement
         repart dans un cookie `HttpOnly` et NE FIGURE PAS dans la réponse.
         Sur le téléphone, rien, et la réponse garde sa forme d'avant.
         Le serveur ne devine pas d'un `User-Agent` : une déduction se trompe
         un jour, une déclaration non. */
      const r = await api<{ token: string; jetonRafraichissement?: string }>('/connexion', {
        methode: 'POST',
        corps: sessionParCookie ? { ...identifiants, cookieDeSession: true } : identifiants,
        sansJeton: true,
        avecCookieDeSession: true,
      });
      await definirJeton(r.token);
      /* Le serveur joint un jeton de rafraîchissement : c'est LUI qui tient
         la session ouverte. Le jeton d'accès, lui, ne dure qu'une heure.

         `&& !sessionParCookie` : LE JUMEAU DE `renouvellement.ts`, qui avait
         reçu cette garde et pas lui — relevé par la revue. Sur le web le
         serveur n'en renvoie plus ; mais un serveur d'une version antérieure,
         ou une bascule à moitié déployée, en renverrait un, et le ranger le
         remettrait exactement là d'où M5 vient de le sortir. La même décision
         doit être écrite aux deux endroits, ou elle n'est écrite nulle part. */
      if (r.jetonRafraichissement && !sessionParCookie) {
        await definirRafraichissement(r.jetonRafraichissement);
      }

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

    /* SUR LE WEB, ON APPELLE MÊME SANS JETON À MONTRER — constat M5, et
       c'était le piège de ce hook. La condition était `cle !== null` ; sur le
       web `cle` est TOUJOURS `null` désormais, puisque le jeton est dans un
       cookie qu'aucun script ne lit. « Se déconnecter » n'aurait donc plus
       rien prévenu au serveur : la ligne serait restée en base quatre-vingt-dix
       jours, et le cookie dans le navigateur — c'est-à-dire que se déconnecter
       n'aurait pas déconnecté. Le serveur, lui, voit le cookie : c'est lui qui
       sait quoi révoquer, et c'est lui qui efface le cookie en répondant. */
    if (cle !== null || sessionParCookie) {
      try {
        await api<void>('/deconnexion', {
          methode: 'POST',
          corps: cle !== null ? { jetonRafraichissement: cle } : {},
          sansJeton: true,
          avecCookieDeSession: true,
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
 * NEUF appelants — le portier d'administration de `app/_layout.tsx`,
 * `etatMaj`, l'onglet Compte, les QUATRE ecrans `admin-*`, et depuis le
 * 18 septembre 2026 `bandeauMotDePasse.tsx` et `app/mot-de-passe.tsx`. TROIS
 * d'entre eux vivent a la racine — le portier, le bandeau, et `SansMargeHaute`
 * a travers `useMotDePasseASignaler` —, donc sur TOUS les ecrans, connexion
 * comprise. La
 * garde va donc ici, au point de passage obligé, et non devant chaque
 * appelant : une regle recopiee devant sept portes manquera devant la
 * huitieme.
 *
 * (Ce commentaire a d'abord annonce SIX appelants et « trois ecrans admin-* » ;
 * corrige a SEPT le 15 septembre 2026. Il s'est trompe une SECONDE fois le
 * 18 septembre, en restant a sept apres l'arrivee du bandeau — les deux fois
 * dans la phrase meme qui explique qu'on finit toujours par perdre une porte.
 * Recompte le 19 septembre, sur signalement de la revue. La lecon n'est pas
 * « mieux compter » : c'est que la garde est ICI, au point de passage, et pas
 * devant chaque appelant. Le nombre exact n'a donc aucune consequence.)
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
    /* PLUS DE `retry` ICI, ET C'EST UN PROGRÈS — 18 septembre 2026.
       Constat M11 : `retry: false` était faux, parce qu'un refus d'identité et
       une panne réseau arrivent par le même chemin (le client rend la seconde
       en `ErreurApi` de statut 0), et une coupure d'une seconde condamnait cet
       onglet à un écran d'erreur plein cadre, sans même le bouton « Se
       déconnecter ». La correction d'alors posait `reessayerSiReseau` ICI, et
       ici seulement — la bonne règle derrière une seule porte sur une
       trentaine. Elle est maintenant le DÉFAUT de tout le client
       (`app/_layout.tsx`), donc cette ligne n'a plus rien à ajouter : la
       garder en ferait une seconde écriture de la même décision, c'est-à-dire
       la prochaine à diverger. */
  });
};
