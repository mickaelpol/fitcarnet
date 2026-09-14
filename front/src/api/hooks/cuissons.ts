/* ---------- les façons de cuire, et les habitudes du compte ---------- */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Habitudes, ModeCuisson } from '@/calcul/cuisson';
import { api, membres } from '../client';
import { REFERENTIEL } from './referentiels';

/*
 * LECTURE ET ÉCRITURE SONT ENSEMBLE, ENFIN.
 *
 * Dans `hooks.ts`, `useModesCuisson` (l. 532) et les trois mutations
 * d'administration (l. 679-713) étaient séparées par 140 lignes de plans de
 * batch cooking. `useSupprimerModeCuisson` invalide `['mes-cuissons']` en plus
 * de `['modes-cuisson']`, et cette dépendance-là ne se voyait pas d'un bout à
 * l'autre du fichier.
 */

/**
 * Les façons de cuire, partagées par TOUS les comptes.
 *
 * Une table et non une liste figée : le frigo a deux sources — la base pour
 * les comptes ordinaires, Grocy pour l'administrateur — et un vocabulaire
 * écrit des deux côtés finirait par diverger. Tout le monde lit, seul
 * l'administrateur ajoute.
 */
export const useModesCuisson = () =>
  useQuery({
    queryKey: ['modes-cuisson'],
    queryFn: async () => membres(await api<{ member: ModeCuisson[] }>('/mode_cuissons')),
    ...REFERENTIEL,
  });

/**
 * COMMENT CE COMPTE CUIT, D'HABITUDE.
 *
 * Sert de DÉFAUT au moment de composer : le riz est déjà à l'eau, le poulet
 * déjà à la poêle, et il ne reste qu'à changer ce qui change. Sans ça, une
 * semaine de quatre repas demandait une trentaine de choix — les mêmes que la
 * semaine dernière.
 *
 * La clé est le nom NORMALISÉ de l'aliment (`cleDHabitude`) : c'est le seul
 * identifiant que les deux frigos aient en commun. La valeur a trois états —
 * un entier, `null` pour « se mange tel quel », et la clé ABSENTE pour
 * « jamais décidé ».
 *
 * Ce n'est pas un référentiel : ça change à chaque plan, et une réponse
 * gardée une demi-heure ferait réapparaître des questions déjà réglées.
 */
export const useMesCuissons = () =>
  useQuery({
    queryKey: ['mes-cuissons'],
    queryFn: async (): Promise<Habitudes> => {
      const r = await api<{ habitudes: { aliment: string; mode: number | null }[] }>(
        '/mes-cuissons');
      const out: Habitudes = {};
      for (const h of r.habitudes) out[h.aliment] = h.mode;

      return out;
    },
  });

/**
 * Enregistre, ou remplace, des habitudes — EN UN SEUL ENVOI.
 *
 * « Les 12 autres se mangent sans cuisson » est UN geste de l'utilisateur.
 * Douze appels le feraient réussir à moitié : sept habitudes écrites, cinq
 * perdues dans une coupure, et aucun moyen de savoir lesquelles. Le serveur
 * écrit le lot dans une transaction — il passe ou il ne passe pas.
 *
 * PUT et non POST : rejoué deux fois, l'envoi donne le même état. C'est la
 * définition, et ça évite à l'écran de lire avant d'écrire pour savoir lequel
 * des deux verbes employer.
 */
export function useEnregistrerCuissons() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (habitudes: { aliment: string; mode: number | null }[]) =>
      api<{ enregistrees: number }>('/mes-cuissons', { methode: 'PUT', corps: { habitudes } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mes-cuissons'] }),
  });
}

/* ---------- modes de cuisson : écriture réservée à l'administrateur ---------- */

export function useCreerModeCuisson() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (v: { libelle: string; ordre: number }) =>
      api<ModeCuisson>('/mode_cuissons', { methode: 'POST', corps: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modes-cuisson'] }),
  });
}

export function useMajModeCuisson() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (v: { id: number } & Partial<ModeCuisson>) =>
      api<ModeCuisson>(`/mode_cuissons/${v.id}`, { methode: 'PATCH', corps: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modes-cuisson'] }),
  });
}

export function useSupprimerModeCuisson() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api<void>(`/mode_cuissons/${id}`, { methode: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['modes-cuisson'] });
      /* Supprimer un mode emporte les habitudes qui le visaient (ON DELETE
         CASCADE) : l'écran reposera la question plutôt que de pré-remplir
         « se mange tel quel », qui serait une réponse fausse. Les habitudes
         en mémoire ne valent donc plus rien. */
      qc.invalidateQueries({ queryKey: ['mes-cuissons'] });
    },
  });
}
