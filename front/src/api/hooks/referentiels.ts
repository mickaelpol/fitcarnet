/* ---------- référentiels : ils changent rarement, on les garde longtemps ---------- */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, membres } from '../client';
import type { AlimentReference, Exercice } from '../types';

/**
 * Les réglages de cache d'un référentiel.
 *
 * Exporté pour les cuissons et les compléments, qui en sont aussi : ce sont
 * des tables qu'on relit quelques fois par an. Le chiffre est ici et nulle
 * part ailleurs — deux durées de vie divergentes pour « la même sorte de
 * donnée » sont invisibles jusqu'au jour où l'une des deux est périmée.
 */
export const REFERENTIEL = { staleTime: 30 * 60 * 1000, gcTime: 24 * 60 * 60 * 1000 };

export const useExercices = () =>
  useQuery({
    queryKey: ['exercices'],
    // le catalogue dépasse 1 300 entrées : une fenêtre trop courte masquerait
    // les exercices personnels, classés après les importés
    queryFn: async () => membres(await api<{ member: Exercice[] }>('/exercices?itemsPerPage=2000')),
    ...REFERENTIEL,
  });

/**
 * La fiche complète d'UN exercice.
 *
 * La collection ci-dessus ne transporte plus les textes longs — instructions,
 * muscles sollicités, matériel : ils ne servent que dans la fiche, ouverte un
 * exercice à la fois, et les livrer pour les 1338 entrées coûtait des
 * centaines de kilooctets à chaque chargement de l'application.
 *
 * Un aller-retour de plus à l'ouverture d'une fiche, donc — mais un seul, et
 * mis en cache aussi longtemps que le reste du référentiel : rouvrir la même
 * fiche ne redemande rien.
 */
export const useExerciceDetail = (id?: number) =>
  useQuery({
    queryKey: ['exercice', id],
    queryFn: () => api<Exercice>(`/exercices/${id}`),
    enabled: id !== undefined,
    ...REFERENTIEL,
  });

/* `useEmplacements` A ÉTÉ SUPPRIMÉ, MÊME GESTE QUE `useStock` (voir `frigo.ts`).
   Il lisait `/emplacements` et aucun écran ne l'appelait — vérifié par `grep`
   sur `app/` et `src/` le 15 septembre 2026, occurrence unique = la
   déclaration, constat F12 de l'audit. Aucune mutation n'invalidait sa clé
   `['emplacements']` : le premier écran qui s'en serait servi aurait affiché
   une liste figée pendant vingt-quatre heures sans que rien ne le signale.
   Le regroupement par emplacement du frigo passe par `grouperParEmplacement`
   (`calcul/frigo.ts`), qui lit ce que `useMonFrigo` rend déjà. */

/** Modification d'un exercice du catalogue : réservée à l'administrateur. */
export function useMajExercice() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (e: { id: number } & Partial<Exercice>) =>
      api<Exercice>(`/exercices/${e.id}`, { methode: 'PATCH', corps: e }),
    onSuccess: (_reponse, envoye) => {
      void qc.invalidateQueries({ queryKey: ['exercices'] });
      /* ET LA FICHE, pas seulement la liste. Depuis que les textes longs ne
         voyagent plus avec la collection, ils vivent dans une entrée de cache
         distincte : sans cette ligne, on corrigerait une instruction, la liste
         se rafraîchirait, et rouvrir la fiche afficherait l'ancienne version
         pendant trente minutes — le temps du `staleTime` du référentiel. */
      void qc.invalidateQueries({ queryKey: ['exercice', envoye.id] });
    },
  });
}

/** Fusionne deux exercices : l'ancien est remplacé partout, puis supprimé. */
export function useFusionExercices() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (ids: { ancienId: number; nouveauId: number }) =>
      api<{ message: string; seancesModifiees: number; modelesModifies: number }>(
        '/exercices/fusion', { methode: 'POST', corps: ids },
      ),
    onSuccess: (_reponse, ids) => {
      qc.invalidateQueries({ queryKey: ['exercices'] });
      qc.invalidateQueries({ queryKey: ['seances'] });
      qc.invalidateQueries({ queryKey: ['modeles'] });
      /* LA FICHE D'UNE SÉANCE, PAS SEULEMENT LA LISTE. Une fusion réécrit
         l'exercice pointé par chaque bloc : la fiche ouverte ensuite
         montrerait l'ancien pendant trente minutes. `['seance']` attrape
         toutes les fiches d'un coup — la clé complète est `['seance', id]`,
         et React Query compare par préfixe. */
      qc.invalidateQueries({ queryKey: ['seance'] });
      /* L'ANCIEN EXERCICE N'EXISTE PLUS : on RETIRE sa fiche au lieu de
         l'invalider. Invalider veut dire « redemande-la » — or elle rendrait
         404. Le nouveau, lui, a pu absorber une vidéo ou un nom français : on
         le redemande vraiment. */
      qc.removeQueries({ queryKey: ['exercice', ids.ancienId] });
      qc.invalidateQueries({ queryKey: ['exercice', ids.nouveauId] });
    },
  });
}

/**
 * LE SÉLECTEUR « ÇA RESSEMBLE À… » : rattacher un aliment au catalogue CIQUAL.
 *
 * Posé le 20 septembre 2026, premier pas du chantier « quitter Grocy ». Le
 * rattachement dit ce que l'aliment EST — pas ce qu'il vaut : les macros
 * restent celles lues sur le paquet.
 *
 * LA RECHERCHE VIT SUR LE SERVEUR, et pas ici. 3 484 aliments, une recherche
 * par ressemblance (`pg_trgm`) pour rattraper les fautes de frappe : descendre
 * la table dans l'application pour l'y parcourir coûterait des centaines de
 * kilooctets et refuserait toujours « colomiers » pour « Coulommiers ».
 *
 * CE N'EST PAS UN RÉFÉRENTIEL au sens du cache ci-dessus. Une recherche est
 * une question, pas une table : chaque saisie a sa propre clé, et les garder
 * une journée entière remplirait le cache de questions qu'on ne repose jamais.
 * Cinq minutes suffisent à rendre instantané un aller-retour dans le champ.
 */
export const useAlimentsReference = (recherche: string) =>
  useQuery({
    queryKey: ['aliments-reference', recherche.trim().toLowerCase()],
    queryFn: async () => (await api<{ aliments: AlimentReference[] }>(
      `/aliments-reference?q=${encodeURIComponent(recherche.trim())}`)).aliments,
    /* Le serveur ne cherche pas en dessous de deux caractères — il rendrait
       des centaines de lignes à chaque frappe. On ne l'appelle donc pas. */
    enabled: recherche.trim().length >= 2,
    staleTime: 5 * 60 * 1000,
  });
