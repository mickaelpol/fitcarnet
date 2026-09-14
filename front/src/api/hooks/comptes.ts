/* ---------- inviter quelqu'un, et administrer les comptes ---------- */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';

/**
 * UNE INVITATION, VUE DE L'ÉCRAN D'ADMINISTRATION.
 *
 * Le jeton n'est PAS là, et il ne peut pas y être : le serveur n'en garde
 * qu'une empreinte. Le lien n'existe qu'une fois, dans la réponse à sa
 * création — s'il est perdu, on en refait un.
 */
export interface InvitationVue {
  id: number;
  email: string;
  creeLe: string;
  expireLe: string;
  accepteLe: string | null;
  /** le nom que la personne s'est choisi, une fois le compte créé */
  nomInvite: string | null;
  statut: 'en_attente' | 'acceptee' | 'perimee';
}

export const useInvitations = () =>
  useQuery({
    queryKey: ['invitations'],
    queryFn: async () =>
      (await api<{ invitations: InvitationVue[] }>('/invitations')).invitations,
  });

/**
 * Invite une adresse. La réponse porte le lien — **la seule fois**.
 *
 * Inviter une adresse déjà invitée REMPLACE l'invitation en attente : c'est
 * le geste qu'on fait quand le lien a été perdu. L'ancien meurt à l'instant
 * où le nouveau naît, sans quoi deux liens valides circuleraient pour la
 * même personne.
 */
export function useInviter() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (email: string) =>
      api<{ email: string; lien: string; expireLe: string; dureeJours: number }>(
        '/invitations', { methode: 'POST', corps: { email } },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations'] }),
  });
}

export function useRevoquerInvitation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api<{ revoquee: boolean }>(`/invitations/${id}`, { methode: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations'] }),
  });
}

/**
 * Ce lien vaut-il encore quelque chose ?
 *
 * `sansJeton` : cet écran est ouvert par quelqu'un qui n'a pas de compte —
 * c'est tout l'objet. Envoyer un en-tête d'autorisation périmé, traînant
 * d'une session précédente sur le même navigateur, ferait répondre 401 au
 * pare-feu avant même d'atteindre le contrôleur.
 *
 * `retry: false` : un lien mort est mort. Réessayer trois fois ne ferait
 * qu'allonger l'attente devant un écran qui dira non.
 */
export const useInvitation = (jeton: string | undefined) =>
  useQuery({
    queryKey: ['invitation', jeton],
    enabled: jeton !== undefined && jeton !== '',
    retry: false,
    queryFn: () =>
      api<{ email: string; expireLe: string }>(`/invitation/${jeton ?? ''}`, { sansJeton: true }),
  });

export function useAccepterInvitation(jeton: string | undefined) {
  return useMutation({
    mutationFn: (v: { nom: string; motDePasse: string }) =>
      api<{ cree: boolean; email: string; nom: string }>(
        `/invitation/${jeton ?? ''}`, { methode: 'POST', corps: v, sansJeton: true },
      ),
  });
}

/* ---------- les comptes, vus par l'administrateur ---------- */

/**
 * UN COMPTE, ET CE QU'IL CONTIENT.
 *
 * Les compteurs ne sont pas décoratifs : ce sont eux qui rendent la
 * suppression pensable. « Supprimer Marie » ne veut rien dire ; « supprimer
 * Marie et ses 34 séances » se décide.
 */
export interface Compte {
  id: string;
  email: string;
  nom: string;
  roles: string[];
  admin: boolean;
  actif: boolean;
  sourceFrigo: string;
  creeLe: string;
  /** ce compte est celui de l'administrateur qui regarde l'écran */
  moi: boolean;
  contenu: { seances: number; series: number; modeles: number; plans: number };
}

export const useComptes = () =>
  useQuery({
    queryKey: ['comptes'],
    queryFn: async () => (await api<{ comptes: Compte[] }>('/comptes')).comptes,
  });

/**
 * Désactiver ou réactiver.
 *
 * Désactiver coupe aussi les sessions en cours, côté serveur : sans ça, le
 * jeton de rafraîchissement prolongerait la session pendant des semaines et
 * le blocage n'aurait d'effet qu'à la prochaine déconnexion volontaire —
 * c'est-à-dire jamais.
 */
export function useActiverCompte() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (v: { id: string; actif: boolean }) =>
      api<{ actif: boolean }>(`/comptes/${v.id}/actif`, {
        methode: 'POST', corps: { actif: v.actif },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comptes'] }),
  });
}

/** Supprimer. Emporte séances, séries, plans, cibles et habitudes. */
export function useSupprimerCompte() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api<{ supprime: boolean; email: string }>(`/comptes/${id}`, { methode: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comptes'] });
      /* Une invitation acceptée pointe vers ce compte : la liste des
         invitations affiche son nom, qui vient de disparaître. */
      qc.invalidateQueries({ queryKey: ['invitations'] });
    },
  });
}
