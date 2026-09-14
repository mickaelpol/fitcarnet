/* ---------- cibles nutritionnelles et compléments ---------- */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, membres } from '../client';
import type { Cible, Complement } from '../types';
import { cibleEnEcriture } from './decimales';
import { REFERENTIEL } from './referentiels';

export const useCibles = () =>
  useQuery({
    queryKey: ['cibles'],
    queryFn: async () => membres(await api<{ member: Cible[] }>('/cibles')),
  });

export function useEnregistrerCible() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (c: Partial<Cible> & { repas: string }) =>
      c['@id']
        ? api<Cible>(c['@id'].replace('/api', ''),
            { methode: 'PATCH', corps: cibleEnEcriture(c) })
        : api<Cible>('/cibles', { methode: 'POST', corps: cibleEnEcriture(c) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cibles'] }),
  });
}

/* ---------- compléments alimentaires ---------- */

/**
 * Les consignes de compléments du compte, tous repas confondus.
 *
 * UNE SEULE REQUÊTE POUR LES QUATRE REPAS, et l'écran trie ensuite. Personne
 * n'a trente compléments : quatre requêtes filtrées coûteraient quatre
 * allers-retours pour ramener, au total, six lignes.
 */
export const useComplements = () =>
  useQuery({
    queryKey: ['complements'],
    queryFn: async () => membres(await api<{ member: Complement[] }>('/complements')),
    /* Une consigne change quelques fois par an. La relire à chaque affichage
       de l'écran repas serait payer un aller-retour pour une réponse qu'on
       connaît déjà. */
    ...REFERENTIEL,
  });

/**
 * `quantite` PART EN CHAÎNE, comme les macros d'une cible — voir
 * `decimales.ts`, où la règle est écrite une fois pour toutes. C'est un
 * DECIMAL côté API : envoyer un nombre fait répondre « The type of the
 * "quantite" attribute must be "string", "integer" given ».
 */
export function useEnregistrerComplement() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (c: { nom: string; quantite: number; unite: string; repas: string }) =>
      api<Complement>('/complements', {
        methode: 'POST',
        corps: { ...c, quantite: String(c.quantite) },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['complements'] }),
  });
}

export function useSupprimerComplement() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api<null>(`/complements/${id}`, { methode: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['complements'] }),
  });
}
