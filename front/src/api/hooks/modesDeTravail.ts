import { useQuery } from '@tanstack/react-query';
import { api } from '../client';
import type { SeriesQuiComptent } from '@/calcul/blocSeance';

/**
 * COMBIEN DE SERIES COMPTENT, SELON LA FACON DONT ON TRAVAILLE.
 *
 * Servi par `GET /api/modes-de-travail`. La regle n'est ecrite qu'a un seul
 * endroit dans tout le depot : `api/src/Service/ModesDeTravail.php`.
 *
 * POURQUOI L'ECRAN A BESOIN DE LA REGLE, et pas seulement du resultat.
 * L'ecran d'une seance est autoritaire sur son etat local : on y ajoute un
 * exercice, on supprime une ligne, on bascule un mode, et le compteur
 * « 7 sur 12 » doit suivre le geste SANS aller-retour reseau, hors ligne
 * compris. Lire `seance.avancement` le figerait jusqu'au retour de la requete.
 *
 * POURQUOI PAS UN POIDS PAR SERIE — c'etait la premiere correction du
 * 21 septembre 2026, et elle etait fausse. Un poids par ligne est DERIVE du
 * mode du bloc et du rang de la ligne, les deux choses que ces gestes
 * changent : ajouter un exercice « for time » affichait 0/3 la ou le serveur
 * dirait 0/1. Une donnee indexee sur le MODE, elle, survit au geste.
 */

/** Une facon de travailler, et ce qu'elle fait compter. */
export interface ModeDeTravail {
  cle: string;
  /** Combien de series comptent dans l'avancement. `null` veut dire « toutes ». */
  seriesQuiComptent: number | null;
}

/**
 * Le catalogue, et la fonction que `avancementDe` attend.
 *
 * `staleTime: Infinity` : cette reponse ne depend d'aucune donnee de compte et
 * ne change qu'avec une version du serveur. La redemander a chaque ouverture
 * d'une seance serait un appel pour rien.
 *
 * LE REPLI COMPTE TOUTES LES SERIES tant que la reponse n'est pas arrivee —
 * premier affichage, hors ligne, panne. Mieux vaut annoncer trop a faire que
 * trop peu : un compteur qui masque du travail restant est le plus mauvais
 * des deux mensonges.
 */
export function useModesDeTravail(): {
  seriesQuiComptent: SeriesQuiComptent;
  pret: boolean;
} {
  const requete = useQuery({
    queryKey: ['modes-de-travail'],
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: ({ signal }) => api<ModeDeTravail[]>('/modes-de-travail', { signal }),
  });

  const parCle = new Map((requete.data ?? []).map((m) => [m.cle, m.seriesQuiComptent]));

  return {
    /* `?? null` couvre les deux absences d'un coup : catalogue pas encore
       charge, et mode que le serveur ne connait pas. Les deux veulent dire
       « je ne sais pas retrancher quoi que ce soit », donc « tout compte ». */
    seriesQuiComptent: (mode: string) => parCle.get(mode) ?? null,
    pret: requete.isSuccess,
  };
}
