import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Habitudes, ModeCuisson, PlanEnregistre } from '@/calcul/cuisson';
import {
  api, definirJeton, definirRafraichissement, lireRafraichissement, membres,
} from './client';
import type {
  Aliment, Cible, Emplacement, Exercice, LigneStock, Modele, MonFrigo,
  Seance, Serie, Utilisateur,
} from './types';

/* ---------- authentification ---------- */

export function useConnexion() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (identifiants: { email: string; motDePasse: string }) => {
      const r = await api<{ token: string; jetonRafraichissement?: string }>('/connexion', {
        methode: 'POST', corps: identifiants, sansJeton: true,
      });
      await definirJeton(r.token);
      /* Le serveur joint un jeton de rafraîchissement : c'est LUI qui tient
         la session ouverte. Le jeton d'accès, lui, ne dure qu'une heure. */
      if (r.jetonRafraichissement) await definirRafraichissement(r.jetonRafraichissement);

      return r;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

/**
 * Se déconnecter pour de bon.
 *
 * Effacer les jetons du téléphone ne suffit pas : tant que la ligne existe en
 * base, une copie du jeton de rafraîchissement rouvrirait la session. On
 * prévient donc le serveur d'abord — et on efface quand même si l'appel
 * échoue, sans quoi une coupure de réseau interdirait de se déconnecter.
 */
export function useDeconnexion() {
  const qc = useQueryClient();

  return async () => {
    const cle = await lireRafraichissement();
    if (cle !== null) {
      try {
        await api<void>('/deconnexion', {
          methode: 'POST', corps: { jetonRafraichissement: cle }, sansJeton: true,
        });
      } catch {
        // hors ligne : le jeton reste en base jusqu'à son échéance, tant pis
      }
    }
    await Promise.all([definirJeton(null), definirRafraichissement(null)]);
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

/* ---------- les cuissons habituelles ---------- */

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

/* ---------- plans de batch cooking conservés ---------- */

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

export const useCibles = () =>
  useQuery({
    queryKey: ['cibles'],
    queryFn: async () => membres(await api<{ member: Cible[] }>('/cibles')),
  });

/**
 * Les quatre macros d'une cible sont des DECIMAL : elles s'écrivent en
 * chaînes, comme partout ailleurs. Voir `versDecimales` plus haut — c'est la
 * même règle, oubliée ici, et l'API répondait « The type of the "kcal"
 * attribute must be "string", "integer" given ».
 */
const cibleEnEcriture = (c: Partial<Cible> & { repas: string }): Record<string, unknown> => {
  const sortie: Record<string, unknown> = { ...c };
  for (const macro of ['kcal', 'prot', 'gluc', 'lip'] as const) {
    const v = c[macro];
    if (typeof v === 'number') sortie[macro] = String(v);
  }

  return sortie;
};

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

/* ---------- inviter quelqu'un ---------- */

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
