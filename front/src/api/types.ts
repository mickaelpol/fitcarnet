/** Reflets des ressources exposées par l'API. */

export interface Aliment {
  '@id': string;
  id: number;
  nom: string;
  categorie: 'prot' | 'fec' | 'leg' | 'ole' | 'huile' | 'lait' | 'fruit' | 'autre';
  kcal100: number;
  prot100: number;
  gluc100: number;
  lip100: number;
  ratio: number;
  etatReference: 'cru' | 'cuit';
  codeBarres: string | null;
}

export interface Emplacement {
  '@id': string;
  id: number;
  code: string;
  libelle: string;
  ordre: number;
}

export interface LigneStock {
  '@id': string;
  id: number;
  aliment: Aliment | string;
  emplacement: Emplacement | string;
  quantite: number;
  peremption: string | null;
}

export interface Cible {
  '@id': string;
  id: number;
  repas: 'R1' | 'R2' | 'R3' | 'R4';
  kcal: number;
  prot: number;
  gluc: number;
  lip: number;
}

export interface Exercice {
  '@id': string;
  id: number;
  nom: string;
  /** nom français facultatif ; à défaut, « nom » est affiché */
  nomFr: string | null;
  nomAffiche?: string;
  formatPrescrit: string | null;
  modeDefaut: 'charge' | 'iso' | 'chrono';
  groupes: string[];
  videoUrl: string | null;
  partieCorps: string | null;
  equipement: string | null;
  muscleCible: string | null;
  musclesSecondaires: string | null;
  instructions: string | null;
  source: 'perso' | 'import';
}

export interface Serie {
  id?: number;
  ordre: number;
  reps: number | null;
  poids: number | null;
  secondes: number | null;
  faite: boolean;
  repsCible: number | null;
  poidsCible: number | null;
  secondesCible: number | null;
}

export interface SeanceExercice {
  id?: number;
  exercice: Exercice | string;
  ordre: number;
  mode: 'charge' | 'iso' | 'chrono' | null;
  notes: string | null;
  /** temps global d'un « for time » : les séries en dessous détaillent l'effort */
  secondesTotal: number | null;
  series: Serie[];
  rmEstime?: number | null;
}

export interface Seance {
  '@id'?: string;
  id?: number;
  date: string;
  type: 'Push' | 'Pull' | 'Legs' | null;
  modele?: string | null;
  exercices: SeanceExercice[];
  avancement?: { faites: number; total: number };
}

export interface ModeleSerie {
  id?: number;
  ordre: number;
  repsCible: number | null;
  poidsCible: number | null;
  secondesCible: number | null;
}

export interface ModeleExercice {
  id?: number;
  exercice: Exercice | string;
  ordre: number;
  mode: 'charge' | 'iso' | 'chrono' | null;
  notes: string | null;
  series: ModeleSerie[];
}

export interface Modele {
  '@id'?: string;
  id?: number;
  nom: string | null;
  type: 'Push' | 'Pull' | 'Legs' | null;
  partage: boolean;
  exercices: ModeleExercice[];
}

export interface Utilisateur {
  '@id': string;
  id: string;
  email: string;
  nom: string;
  roles: string[];
  sourceFrigo: 'base' | 'grocy';
}
