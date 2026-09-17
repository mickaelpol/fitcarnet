/* ---------- le frigo, ses aliments et ses inventaires ---------- */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '../client';
import {
  prevenirFinInventaire, preparerLesNotifications,
} from '@/composants/notifications';
import type { Aliment, MonFrigo } from '../types';
import { type AlimentEcriture, versDecimales } from './decimales';

/**
 * Le frigo de l'utilisateur, quelle que soit sa provenance.
 *
 * Un seul appel, une seule forme : Grocy pour l'administrateur, la base
 * pour les autres. Le calculateur et l'écran « Mon frigo » ne connaissent
 * que celui-ci.
 */
export const useMonFrigo = () =>
  useQuery({
    queryKey: ['mon-frigo'],
    queryFn: () => api<MonFrigo>('/mon-frigo'),
    // le stock bouge à chaque repas : on ne le garde pas longtemps
    staleTime: 2 * 60 * 1000,
  });

/** Produits Grocy sans valeurs nutritionnelles : invisibles au calculateur. */
export const useFrigoIncomplets = (actif: boolean) =>
  useQuery({
    queryKey: ['mon-frigo', 'incomplets'],
    queryFn: () => api<{
      produits: {
        reference: string;
        nom: string;
        /** champs sans lesquels l'aliment ne peut PAS servir au calcul */
        manquants: string[];
        /** champs souhaitables — les fibres — dont l'absence fausse en silence */
        souhaites?: string[];
      }[];
    }>('/mon-frigo/incomplets'),
    enabled: actif,
  });

/** Fixe la quantité d'un aliment. Sans effet pour les comptes lisant Grocy. */
export function useDefinirStock() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (v: { alimentId: number; quantite: number; emplacementId?: number }) =>
      api<{ ok: boolean }>('/mon-frigo/stock', { methode: 'POST', corps: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mon-frigo'] }),
  });
}

/**
 * Écrit les valeurs nutritionnelles d'un aliment du frigo.
 * Réservé aux comptes lisant Grocy ; l'API répond 409 pour les autres.
 */
export function useEnregistrerAliment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (v: {
      /**
       * Vide pour une CRÉATION : le produit n'existe pas encore dans Grocy et
       * l'API l'y pose avant d'écrire ses valeurs. Renseignée, elle désigne
       * un produit existant dont on corrige les valeurs.
       */
      reference: string;
      /** obligatoire à la création, ignoré ensuite — Grocy est maître du nom */
      nom?: string;
      categorie: string;
      kcal100: number;
      prot100: number;
      gluc100: number;
      lip100: number;
      fibres100: number | null;
      ratio: number;
      peseeAvant: number | null;
      peseeApres: number | null;
    }) => api<{ ok: boolean; reference: string }>(
      '/mon-frigo/aliment', { methode: 'POST', corps: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mon-frigo'] }),
  });
}

/**
 * Crée un aliment. Son propriétaire est posé par l'API depuis le jeton,
 * jamais transmis d'ici.
 */
export function useCreerAliment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (v: AlimentEcriture) =>
      api<Aliment>('/aliments', { methode: 'POST', corps: versDecimales(v) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mon-frigo'] });
    },
  });
}

/** Corrige un aliment. L'API refuse si ce n'est pas le sien. */
export function useMajAliment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...v }: AlimentEcriture & { id: number }) =>
      api<Aliment>(`/aliments/${id}`, { methode: 'PATCH', corps: versDecimales(v) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mon-frigo'] });
    },
  });
}

/**
 * Supprime un aliment. L'API répond 409 s'il est encore dans un frigo :
 * il faut d'abord mettre sa quantité à zéro.
 */
export function useSupprimerAliment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api<null>(`/aliments/${id}`, { methode: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['mon-frigo'] });
    },
  });
}

/**
 * Pose la quantité d'un seul produit Grocy, tout de suite.
 *
 * SÉPARÉE DE `useEnvoyerInventaire`, ET C'EST LE POINT.
 *
 * Les deux partageaient une mutation. Un inventaire qui échouait déclenchait
 * donc la bannière écrite pour la création — « L'aliment a bien été créé, mais
 * sa quantité n'a pas pu être posée » — chez quelqu'un qui n'avait rien créé.
 * Deux gestes, deux mutations : chaque message ne peut plus parler que de son
 * propre geste.
 */
export function useDefinirQuantiteGrocy() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (ligne: { reference: string; quantite: number }) =>
      api<{ ok: true }>('/mon-frigo/quantite', { methode: 'POST', corps: ligne }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mon-frigo'] }),
  });
}

export type EchecInventaire = { reference: string; motif: string };

/** Ce que le serveur dit du dernier inventaire de ce compte. */
export type SuiviInventaire = {
  id?: number;
  statut: 'aucun' | 'en_attente' | 'en_cours' | 'termine' | 'echoue';
  total?: number;
  traites?: number;
  echecs?: EchecInventaire[];
  finiLe?: string | null;
};

/**
 * DÉPOSE un inventaire. Ne l'applique pas.
 *
 * L'envoi était synchrone : l'écran attendait pendant que le serveur poussait
 * les lignes vers Grocy une à une. Le 14 août 2026, PHP s'est arrêté à 30 s au
 * milieu d'un inventaire de quarante lignes — Grocy avait déjà appliqué une
 * partie, et rien ne le disait. Depuis, la requête ne fait que déposer : elle
 * répond en quelques dizaines de millisecondes.
 *
 * Ce qu'on suit ensuite, c'est `useSuiviInventaire`, pas cette mutation. Son
 * `isSuccess` ne veut plus dire « c'est fait », il veut dire « c'est parti ».
 */
export function useEnvoyerInventaire() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (lignes: { reference: string; quantite: number }[]) => {
      /* LA PERMISSION SE DEMANDE ICI, ET NULLE PART AILLEURS.
         Juste après « Enregistrer 23 corrections » : la question du système
         arrive alors qu'on vient de lancer quelque chose qui va durer, et
         elle a un sens évident. Demandée au démarrage de l'application, elle
         se refuse par réflexe — et Android ne la repose jamais.

         On n'attend pas la réponse pour envoyer : `void`. Le dépôt de
         l'inventaire ne doit pas dépendre d'une boîte de dialogue. */
      void preparerLesNotifications();

      return api<{ id: number; total: number }>(
        '/mon-frigo/inventaire', { methode: 'POST', corps: { lignes } });
    },
    /* On réveille le suivi tout de suite : sans ça l'écran attendrait le
       prochain battement pour montrer que quelque chose se passe. */
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventaire-suivi'] }),
  });
}

/**
 * Où en est le dernier inventaire.
 *
 * INTERROGÉ EN PERMANENCE, PAS SEULEMENT APRÈS UN ENVOI. On peut avoir fermé
 * l'application, verrouillé le téléphone, changé d'onglet : au retour, le
 * résultat doit être là. C'est toute la différence entre un envoi dont on
 * connaît le sort et un envoi dont on l'a manqué.
 *
 * Le battement s'arrête de lui-même dès que le lot est fini — inutile de
 * réveiller le réseau toutes les deux secondes pour relire un résultat qui ne
 * bougera plus.
 */
export function useSuiviInventaire(actif = true) {
  const qc = useQueryClient();
  const dernierStatut = useRef<string | null>(null);

  const suivi = useQuery({
    queryKey: ['inventaire-suivi'],
    queryFn: () => api<SuiviInventaire>('/mon-frigo/inventaire/dernier'),
    enabled: actif,
    refetchInterval: (requete) => {
      const s = requete.state.data?.statut;

      return s === 'en_attente' || s === 'en_cours' ? 2000 : false;
    },
    /* SANS CETTE LIGNE, LA NOTIFICATION NE PARTIRAIT JAMAIS.
       React Query suspend ses rafraîchissements périodiques dès que la fenêtre
       perd le focus — donc au moment précis où l'on quitte l'écran, c'est-à-dire
       le seul moment où prévenir a un intérêt. On n'apprendrait la fin de
       l'inventaire qu'en revenant, ce que la bannière fait déjà.

       Le coût est borné : une requête toutes les deux secondes, et seulement
       tant qu'un lot tourne. Le battement s'arrête de lui-même à « terminé ». */
    refetchIntervalInBackground: true,
    /* Ce chiffre bouge sous nos pieds : le garder en cache entre deux écrans
       ferait afficher un avancement périmé le temps d'un aller-retour. */
    staleTime: 0,
    gcTime: 60_000,
  });

  /* LE FRIGO N'EST RELU QU'AU PASSAGE À « TERMINÉ », UNE SEULE FOIS.
     Le relire à chaque battement ajouterait une lecture Grocy de plusieurs
     secondes toutes les deux secondes — sur le serveur même qui est en train
     d'appliquer l'inventaire. C'est exactement la file d'attente qu'on vient
     de supprimer. */
  const statut = suivi.data?.statut ?? null;
  const traites = suivi.data?.traites ?? 0;
  const nbEchecs = suivi.data?.echecs?.length ?? 0;

  useEffect(() => {
    const avant = dernierStatut.current;
    dernierStatut.current = statut;

    /* `avant === null` : PREMIER PASSAGE, on ne sait pas d'où l'on vient.
       Sans cette garde, ouvrir le frigo trois jours après un inventaire
       déclencherait une notification pour un travail fini depuis longtemps. */
    if (avant === null || avant === statut) return;

    if (statut === 'termine' || statut === 'echoue') {
      void qc.invalidateQueries({ queryKey: ['mon-frigo'] });
      /* Ne notifie que si l'application n'est pas au premier plan — la règle
         vit dans `prevenirFinInventaire`, pas ici, pour qu'elle reste vraie
         partout où on l'appellera un jour. */
      void prevenirFinInventaire(traites - nbEchecs, nbEchecs);
    }
  }, [statut, traites, nbEchecs, qc]);

  return suivi;
}

/* `useStock` A ÉTÉ SUPPRIMÉ. Il lisait `/stocks`, n'était appelé par aucun
   écran, et surtout aucune mutation n'invalidait sa clé `['stock']` : le
   premier écran qui s'en serait servi aurait affiché un stock figé sans que
   rien ne le signale. Le frigo passe par `useMonFrigo`, que toutes les
   écritures invalident. */
