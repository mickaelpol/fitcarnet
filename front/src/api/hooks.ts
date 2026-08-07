import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, definirJeton, membres } from './client';
import type {
  Aliment, Cible, Emplacement, Exercice, LigneStock, Modele, MonFrigo,
  Seance, Serie, Utilisateur,
} from './types';

/* ---------- authentification ---------- */

export function useConnexion() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (identifiants: { email: string; motDePasse: string }) => {
      const r = await api<{ token: string }>('/connexion', {
        methode: 'POST', corps: identifiants, sansJeton: true,
      });
      await definirJeton(r.token);

      return r;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useDeconnexion() {
  const qc = useQueryClient();

  return async () => {
    await definirJeton(null);
    qc.clear();
  };
}

export const useMoi = () =>
  useQuery({
    queryKey: ['moi'],
    // /utilisateurs renvoie une COLLECTION filtrée sur le compte courant :
    // on en extrait l'unique membre, sinon « data.roles » est indéfini
    queryFn: async () => membres(await api<{ member: Utilisateur[] }>('/utilisateurs'))[0],
    retry: false,
  });

/* ---------- référentiels : ils changent rarement, on les garde longtemps ---------- */

const REFERENTIEL = { staleTime: 30 * 60 * 1000, gcTime: 24 * 60 * 60 * 1000 };

export const useAliments = () =>
  useQuery({
    queryKey: ['aliments'],
    queryFn: async () => membres(await api<{ member: Aliment[] }>('/aliments?itemsPerPage=500')),
    ...REFERENTIEL,
  });

export const useExercices = () =>
  useQuery({
    queryKey: ['exercices'],
    // le catalogue dépasse 1 300 entrées : une fenêtre trop courte masquerait
    // les exercices personnels, classés après les importés
    queryFn: async () => membres(await api<{ member: Exercice[] }>('/exercices?itemsPerPage=2000')),
    ...REFERENTIEL,
  });

export const useEmplacements = () =>
  useQuery({
    queryKey: ['emplacements'],
    queryFn: async () => membres(await api<{ member: Emplacement[] }>('/emplacements')),
    ...REFERENTIEL,
  });

/** Modification d'un exercice du catalogue : réservée à l'administrateur. */
export function useMajExercice() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (e: { id: number } & Partial<Exercice>) =>
      api<Exercice>(`/exercices/${e.id}`, { methode: 'PATCH', corps: e }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercices'] }),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exercices'] });
      qc.invalidateQueries({ queryKey: ['seances'] });
      qc.invalidateQueries({ queryKey: ['modeles'] });
    },
  });
}

/* ---------- données personnelles ---------- */

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
    queryFn: () => api<{ produits: { reference: string; nom: string; manquants: string[] }[] }>(
      '/mon-frigo/incomplets'),
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
      reference: string;
      categorie: string;
      kcal100: number;
      prot100: number;
      gluc100: number;
      lip100: number;
      fibres100: number | null;
      ratio: number;
      peseeAvant: number | null;
      peseeApres: number | null;
    }) => api<{ ok: boolean }>('/mon-frigo/aliment', { methode: 'POST', corps: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mon-frigo'] }),
  });
}

/** Ce qu'un aliment de la base attend en écriture. */
export interface AlimentEcriture {
  nom: string;
  categorie: string;
  kcal100: number;
  prot100: number;
  gluc100: number;
  lip100: number;
  fibres100: number | null;
  ratio: number;
  etatReference: 'cru' | 'cuit';
  peseeAvant: number | null;
  peseeApres: number | null;
}

/**
 * Les décimaux partent en CHAÎNES, et c'est voulu.
 *
 * Doctrine mappe ces colonnes en DECIMAL, que son extracteur de types déclare
 * `string` — et cet extracteur passe avant la réflexion PHP dans la chaîne de
 * `property_info`. Le dénormaliseur refuse donc un nombre : « The type of the
 * "kcal100" attribute must be "string", "double" given ».
 *
 * En lecture l'API renvoie bien des nombres, puisque la normalisation appelle
 * les accesseurs typés `float`. L'asymétrie est réelle mais tient dans cette
 * seule fonction : le reste de l'application ne manipule que des nombres.
 */
const versDecimales = (v: AlimentEcriture): Record<string, unknown> => ({
  ...v,
  kcal100: String(v.kcal100),
  prot100: String(v.prot100),
  gluc100: String(v.gluc100),
  lip100: String(v.lip100),
  fibres100: v.fibres100 === null ? null : String(v.fibres100),
  ratio: String(v.ratio),
  peseeAvant: v.peseeAvant === null ? null : String(v.peseeAvant),
  peseeApres: v.peseeApres === null ? null : String(v.peseeApres),
});

/**
 * Crée un aliment. Le propriétaire et la confidentialité sont posés par
 * l'API depuis le jeton, jamais transmis d'ici.
 */
export function useCreerAliment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (v: AlimentEcriture) =>
      api<Aliment>('/aliments', { methode: 'POST', corps: versDecimales(v) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['aliments'] });
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
      void qc.invalidateQueries({ queryKey: ['aliments'] });
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
      void qc.invalidateQueries({ queryKey: ['aliments'] });
      void qc.invalidateQueries({ queryKey: ['mon-frigo'] });
    },
  });
}

/**
 * Applique un inventaire. Une seule requête, en fin de saisie, avec les
 * seules lignes dont le poids réel diffère du théorique.
 */
export function useEnvoyerInventaire() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (lignes: { reference: string; quantite: number }[]) =>
      api<{ corriges: number; echecs: { reference: string; motif: string }[] }>(
        '/mon-frigo/inventaire', { methode: 'POST', corps: { lignes } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mon-frigo'] }),
  });
}

export const useStock = () =>
  useQuery({
    queryKey: ['stock'],
    queryFn: async () => membres(await api<{ member: LigneStock[] }>('/stocks?itemsPerPage=500')),
  });

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
        ? api<Cible>(c['@id'].replace('/api', ''), { methode: 'PATCH', corps: c })
        : api<Cible>('/cibles', { methode: 'POST', corps: c }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cibles'] }),
  });
}

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

  const records = new Map<number, number>();
  for (const s of seances.data ?? []) {
    if (dateExclue !== undefined && s.date.slice(0, 10) >= dateExclue.slice(0, 10)) continue;
    for (const bloc of s.exercices) {
      const idExercice = typeof bloc.exercice === 'string'
        ? Number(bloc.exercice.split('/').pop())
        : bloc.exercice.id;
      for (const serie of bloc.series) {
        if (serie.reps === null || serie.poids === null || serie.reps < 1 || serie.poids <= 0) continue;
        const rm = serie.poids * (1 + 0.0333 * serie.reps);
        const actuel = records.get(idExercice);
        if (actuel === undefined || rm > actuel) records.set(idExercice, rm);
      }
    }
  }

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

  const parExercice = new Map<number, { reps: number | null; poids: number | null; secondes: number | null }[]>();

  const triees = [...(seances.data ?? [])]
    .filter((s) => dateExclue === undefined || s.date.slice(0, 10) < dateExclue.slice(0, 10))
    .sort((a, b) => b.date.localeCompare(a.date));

  for (const s of triees) {
    for (const bloc of s.exercices) {
      const idExercice = typeof bloc.exercice === 'string'
        ? Number(bloc.exercice.split('/').pop())
        : bloc.exercice.id;
      if (parExercice.has(idExercice)) continue;   // la plus récente d'abord
      const series = bloc.series
        .filter((x) => x.reps !== null || x.poids !== null || x.secondes !== null)
        .map((x) => ({ reps: x.reps, poids: x.poids, secondes: x.secondes }));
      if (series.length > 0) parExercice.set(idExercice, series);
    }
  }

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

  const rm = new Map<number, number[]>();
  const volume = new Map<number, number[]>();

  const triees = [...(seances.data ?? [])].sort((a, b) => a.date.localeCompare(b.date));

  for (const s of triees) {
    for (const bloc of s.exercices) {
      const id = typeof bloc.exercice === 'string'
        ? Number(bloc.exercice.split('/').pop())
        : bloc.exercice.id;

      let meilleur = 0;
      let total = 0;
      for (const serie of bloc.series) {
        if (serie.reps === null || serie.poids === null) continue;
        if (serie.reps < 1 || serie.poids <= 0) continue;
        total += serie.reps * serie.poids;
        if (serie.reps <= 15) {
          const e = serie.poids * (1 + 0.0333 * serie.reps);
          if (e > meilleur) meilleur = e;
        }
      }
      if (meilleur > 0) rm.set(id, [...(rm.get(id) ?? []), Math.round(meilleur * 10) / 10]);
      if (total > 0) volume.set(id, [...(volume.get(id) ?? []), Math.round(total)]);
    }
  }

  return { rm, volume, pret: !seances.isLoading };
}

export const useSeance = (id?: number) =>
  useQuery({
    queryKey: ['seance', id],
    queryFn: () => api<Seance>(`/seances/${id}`),
    enabled: id !== undefined,
  });

/**
 * Même règle que pour les aliments : `poids` et `poidsCible` sont des DECIMAL
 * côté Doctrine, donc des `string` pour le dénormaliseur. Un nombre déclenche
 * « The type of the "poids" attribute must be "null|string", "integer" given ».
 *
 * On ne touche qu'aux séries : ni `SeanceExercice` ni `ModeleExercice` n'ont
 * de colonne décimale, et `reps` / `secondes` sont des entiers.
 */
const nombreEnTexte = (v: number | null): string | null =>
  v === null ? null : String(v);

const serieEnEcriture = (s: Serie): Record<string, unknown> => ({
  ...s,
  poids: nombreEnTexte(s.poids),
  poidsCible: nombreEnTexte(s.poidsCible),
});

const seanceEnEcriture = (s: Seance): Record<string, unknown> => ({
  ...s,
  exercices: s.exercices.map((bloc) => ({
    ...bloc,
    series: bloc.series.map(serieEnEcriture),
  })),
});

const modeleEnEcriture = (m: Modele): Record<string, unknown> => ({
  ...m,
  exercices: m.exercices.map((bloc) => ({
    ...bloc,
    series: bloc.series.map((s) => ({ ...s, poidsCible: nombreEnTexte(s.poidsCible) })),
  })),
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
        partage: false,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seances'] }),
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
