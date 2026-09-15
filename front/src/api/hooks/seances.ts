/* ---------- séances, historique et modèles ---------- */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
/* Les réductions d'historique vivent dans `calcul/`, éprouvées : la formule
   d'Epley était recopiée ici DEUX fois, dont une sans son plafond, et l'écran
   de séance comparait les deux. */
import { historiqueParExercice, recordsAnterieurs } from '@/calcul/historiqueSeances';
import { api, membres } from '../client';
import { idDe, type Modele, type Seance } from '../types';
import { modeleEnEcriture, nombreEnTexte, seanceEnEcriture } from './decimales';

export const useSeances = () =>
  useQuery({
    queryKey: ['seances'],
    queryFn: async () => membres(await api<{ member: Seance[] }>('/seances?order[date]=desc')),
  });

/**
 * Meilleur 1RM atteint AVANT une date donnée, par exercice.
 * Sert à colorer le disque : progression, stagnation ou recul.
 */
export function useRecordsAnterieurs(dateExclue?: string) {
  const seances = useSeances();

  /* MEMOISE, ET C'EST L'ECRAN DE SEANCE QUI L'EXIGE.
     Ce calcul parcourt TOUT l'historique. Ecrit dans le corps de la fonction,
     il se rejouait a chaque rendu — donc a chaque caractere tape dans un champ
     de poids ou de repetitions, puisque `seance/[id].tsx` consomme ce hook et
     se re-rend a chaque frappe. Trois hooks de ce fichier faisaient pareil :
     trois balayages complets de l'historique par touche.
     Le cout ne se voit pas aujourd'hui ; il grandit avec l'anciennete du
     compte, ce qui est la pire forme de lenteur — celle qui arrive trop
     lentement pour qu'on sache quand elle a commence. */
  const records = useMemo(
    () => recordsAnterieurs(seances.data ?? [], dateExclue),
    [seances.data, dateExclue]);

  return { records, pret: !seances.isLoading };
}

/**
 * Ce qui a été fait la dernière fois, exercice par exercice.
 *
 * Sert à préremplir une nouvelle séance : on veut retrouver ses charges et
 * ses répétitions réelles, pas le format théorique du plan. C'est ce qui
 * permet de viser « la même chose, en un peu mieux ».
 */
export function useDerniereFois(dateExclue?: string) {
  const seances = useSeances();

  // Memoise pour la meme raison que `useRecordsAnterieurs`, et il y a un tri
  // en plus : sans cela, l'historique entier est re-trie a chaque frappe.
  const parExercice = useMemo(() => {
    const acc = new Map<number, { reps: number | null; poids: number | null; secondes: number | null }[]>();

    const triees = [...(seances.data ?? [])]
      .filter((s) => dateExclue === undefined || s.date.slice(0, 10) < dateExclue.slice(0, 10))
      .sort((a, b) => b.date.localeCompare(a.date));

    for (const s of triees) {
      for (const bloc of s.exercices) {
        const idExercice = idDe(bloc.exercice);
        if (acc.has(idExercice)) continue;   // la plus récente d'abord
        const series = bloc.series
          .filter((x) => x.reps !== null || x.poids !== null || x.secondes !== null)
          .map((x) => ({ reps: x.reps, poids: x.poids, secondes: x.secondes }));
        if (series.length > 0) acc.set(idExercice, series);
      }
    }
    return acc;
  }, [seances.data, dateExclue]);

  return { parExercice, pret: !seances.isLoading };
}

/**
 * Historique de progression par exercice : une valeur par séance, du plus
 * ancien au plus récent. Sert à dessiner les courbes.
 *
 * Le 1RM n'existe que pour les séries courtes ; pour un « for time » ou un
 * exercice d'endurance, c'est le VOLUME qui raconte la progression.
 */
export function useHistorique() {
  const seances = useSeances();

  // Le plus lourd des trois : il construit deux séries de points par exercice,
  // en réallouant un tableau à chaque ajout. Memoise pour la meme raison.
  const { rm, volume } = useMemo(
    () => historiqueParExercice(seances.data ?? []),
    [seances.data]);

  return { rm, volume, pret: !seances.isLoading };
}

export const useSeance = (id?: number) =>
  useQuery({
    queryKey: ['seance', id],
    queryFn: () => api<Seance>(`/seances/${id}`),
    enabled: id !== undefined,
  });

/**
 * Une séance s'écrit d'un bloc : exercices et séries compris.
 * C'est ce qui évite la dizaine d'appels qu'imposeraient des ressources
 * imbriquées — décisif en salle avec une connexion médiocre.
 */
export function useEnregistrerSeance() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (s: Seance) =>
      s.id
        ? api<Seance>(`/seances/${s.id}`, { methode: 'PATCH', corps: seanceEnEcriture(s) })
        : api<Seance>('/seances', { methode: 'POST', corps: seanceEnEcriture(s) }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['seances'] });
      if (s.id) qc.invalidateQueries({ queryKey: ['seance', s.id] });
    },
  });
}

/**
 * Transforme une séance en modèle : les valeurs réalisées deviennent des
 * objectifs. Sert à conserver une séance improvisée qu'on voudra refaire.
 */
export function useSeanceVersModele() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (seance: Seance) => {
      const modele = {
        nom: seance.type ?? 'Modèle',
        type: seance.type,
        exercices: seance.exercices.map((bloc, i) => ({
          exercice: typeof bloc.exercice === 'string' ? bloc.exercice : bloc.exercice['@id'],
          ordre: i,
          mode: bloc.mode,
          notes: null,
          series: bloc.series.map((s, j) => ({
            ordre: j,
            // ce qui a été fait devient l'objectif ; à défaut, l'objectif d'origine
            repsCible: s.reps ?? s.repsCible,
            poidsCible: nombreEnTexte(s.poids ?? s.poidsCible),
            secondesCible: s.secondes ?? s.secondesCible,
          })),
        })),
      };

      return api<Modele>('/modeles', { methode: 'POST', corps: modele });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modeles'] }),
  });
}

export function useSupprimerSeance() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api<void>(`/seances/${id}`, { methode: 'DELETE' }),
    onSuccess: (_reponse, id) => {
      qc.invalidateQueries({ queryKey: ['seances'] });
      /* ON RETIRE, ON N'INVALIDE PAS. La fiche de cette séance restait en
         cache vingt-quatre heures. Y revenir — un lien, un retour arrière —
         affichait une séance supprimée, complète et crédible. L'invalider
         serait pire encore : elle serait redemandée, et le 404 s'afficherait
         comme une panne alors que c'est le résultat attendu. */
      qc.removeQueries({ queryKey: ['seance', id] });
    },
  });
}

export const useModeles = () =>
  useQuery({
    queryKey: ['modeles'],
    queryFn: async () => membres(await api<{ member: Modele[] }>('/modeles')),
  });

/**
 * Applique l'ordre d'un modèle à ses séances.
 * Sans « appliquer », l'appel se contente de compter celles qui suivraient.
 */
export function useSupprimerModele() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api<void>(`/modeles/${id}`, { methode: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modeles'] }),
  });
}

export function useAppliquerOrdre() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, appliquer }: { id: number; appliquer: boolean }) =>
      api<{ message: string; seancesConcernees: number; seancesModifiees: number }>(
        `/modeles/${id}/appliquer-ordre`, { methode: 'POST', corps: { appliquer } },
      ),
    onSuccess: (_, v) => {
      if (v.appliquer) {
        qc.invalidateQueries({ queryKey: ['seances'] });
        qc.invalidateQueries({ queryKey: ['seance'] });
      }
    },
  });
}

export function useEnregistrerModele() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (m: Modele) =>
      m.id
        ? api<Modele>(`/modeles/${m.id}`, { methode: 'PATCH', corps: modeleEnEcriture(m) })
        : api<Modele>('/modeles', { methode: 'POST', corps: modeleEnEcriture(m) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modeles'] }),
  });
}
