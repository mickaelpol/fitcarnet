/* ---------- plans de batch cooking conservés ---------- */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlanEnregistre } from '@/calcul/cuisson';
import { api, membres } from '../client';

export interface PlanRepas {
  id: number;
  libelle: string;
  creeLe: string;
  /**
   * NULL tant que le plan n'est pas cuisiné.
   *
   * Tant qu'il l'est, le plan RÉSERVE son stock : les compositions suivantes
   * ne comptent plus dessus. C'est ce qui empêche deux batch cooking de
   * compter deux fois le même frigo.
   *
   * OPTIONNEL, et pas par confort : tant que l'API n'a pas vidé son cache
   * après la migration, elle ne renvoie pas ce champ du tout. Le typer
   * `string | null` était un mensonge qui a coûté une réservation entière —
   * `!== null` répondait « cuisiné » pour tous les plans. On lit toujours via
   * `estCuisine()`, jamais en comparant à `null` à la main.
   */
  cuisineLe?: string | null;
  contenu: PlanEnregistre;
}

export const usePlans = () =>
  useQuery({
    queryKey: ['plans'],
    queryFn: async () => membres(await api<{ member: PlanRepas[] }>('/plan_repas')),
  });

export function useEnregistrerPlan() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (v: { libelle: string; contenu: PlanEnregistre }) =>
      api<PlanRepas>('/plan_repas', { methode: 'POST', corps: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  });
}

export function useSupprimerPlan() {
  const qc = useQueryClient();

  return useMutation({
    /* Un instantané ne se modifie pas — sinon ce n'en est plus un. On en
       refait un, et on supprime l'ancien. */
    mutationFn: (id: number) => api<void>(`/plan_repas/${id}`, { methode: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      /* Supprimer un plan PRÉVU rend son stock : les compositions suivantes
         peuvent à nouveau compter dessus. Sans cette invalidation, le frigo
         resterait amputé à l'écran d'une réservation qui n'existe plus. */
      qc.invalidateQueries({ queryKey: ['mon-frigo'] });
    },
  });
}

/**
 * « J'AI CUISINÉ CE PLAN. »
 *
 * Un seul appel pour deux gestes qui n'en font qu'un : le frigo est
 * décrémenté de ce que le plan prend, et le plan cesse de réserver. Les
 * séparer laisserait, au moindre échec entre les deux, soit un stock baissé
 * pour un plan qui réserve encore — donc déduit deux fois —, soit un plan
 * marqué cuisiné sur un frigo intact.
 *
 * `ignores` rend les lignes qui n'ont pas pu être décrémentées : un aliment
 * sorti du frigo depuis, un produit sans poids par unité. On ne les devine
 * pas — on les dit, pour qu'elles se corrigent à la main.
 */
export function useMarquerCuisine() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api<{
      cuisineLe: string;
      deduits: number;
      ignores: { nom: string; motif: string }[];
    }>(`/plan_repas/${id}/cuisine`, { methode: 'POST', corps: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      qc.invalidateQueries({ queryKey: ['mon-frigo'] });
    },
  });
}
