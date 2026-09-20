/* ---------- quitter Grocy : migrer ses aliments vers la base ---------- */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../client';
import type { AlimentAMigrer } from '../types';

/**
 * L'ÉTAT DE LA MIGRATION VIENT DU SERVEUR, PAS DE L'ÉCRAN.
 *
 * Soixante-deux aliments ne se migrent pas d'une traite : on ferme l'onglet,
 * le téléphone se verrouille, on reprend le lendemain. Un compteur tenu en
 * mémoire repartirait de zéro et ferait tout recommencer.
 *
 * `dejaEnBase` porte les noms déjà présents dans le catalogue du compte :
 * c'est ce qui permet de reprendre exactement où l'on s'était arrêté.
 */
export const useMigrationGrocy = () =>
  useQuery({
    queryKey: ['migration-grocy'],
    queryFn: () => api<{
      source: 'grocy' | 'base';
      aRattacher: AlimentAMigrer[];
      dejaEnBase: string[];
      emplacements: string[];
      probleme: string | null;
    }>('/migration-grocy'),
    /* La lecture passe par Grocy, qui met 1 à 5 s à répondre. On ne la refait
       pas à chaque retour d'écran : c'est l'écran qui dit quand rafraîchir. */
    staleTime: 5 * 60 * 1000,
  });

/**
 * Migre UN produit. Un seul, et c'est délibéré.
 *
 * Un geste unique sur soixante-deux produits échouerait en entier sur le
 * cinquante-quatrième, et personne ne saurait où il en est. Ici chaque ligne
 * répond pour elle, et rejouer une ligne déjà migrée la met à jour.
 */
export function useMigrerAliment() {
  const clients = useQueryClient();

  return useMutation({
    mutationFn: (a: Record<string, unknown>) =>
      api<{ reference: string; nom: string; stock: number }>(
        '/migration-grocy/aliment', { methode: 'POST', corps: a }),
    onSuccess: () => {
      /* On invalide l'ÉTAT, pas le frigo : tant que la bascule n'est pas
         faite, le frigo affiché reste celui de Grocy, et il n'a pas changé. */
      void clients.invalidateQueries({ queryKey: ['migration-grocy'] });
    },
  });
}

/**
 * Bascule le frigo sur la base.
 *
 * GROCY N'EST PAS TOUCHÉ : on change la source que l'application lit, rien
 * d'autre. Tout y reste, et revenir en arrière est un autre appel.
 */
export function useTerminerMigration() {
  const clients = useQueryClient();

  return useMutation({
    mutationFn: () => api<{ source: string }>('/migration-grocy/terminer', { methode: 'POST' }),
    onSuccess: () => {
      /* Là, tout change : le frigo lu, le compte, le calculateur. On repart
         d'une page blanche plutôt que de deviner ce qui reste valable. */
      void clients.invalidateQueries();
    },
  });
}
