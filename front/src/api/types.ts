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
  fibres100: number | null;
  ratio: number;
  /** pesées ayant servi à mesurer le ratio ; null s'il vient d'une valeur courante */
  peseeAvant: number | null;
  peseeApres: number | null;
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
  /**
   * La cible en glucides comprend-elle les fibres ?
   *
   * Vrai pour un plan nord-américain, faux pour la convention européenne.
   * Une quantité sans son unité est un bug qui attend son heure.
   */
  glucidesTotaux?: boolean;
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
  source: 'perso' | 'import';

  /* ABSENTS DE LA LISTE, PRESENTS SUR LA FICHE — d'où le « ? ».
     Ces quatre champs ne servent que dans `ModaleExercice`, ouverte pour UN
     exercice à la fois. Les livrer pour les 1338 entrées du catalogue à chaque
     chargement revient à transporter des centaines de kilooctets de texte que
     personne n'affiche. Côté API ils sont passés dans le groupe
     `exercice:detail`, servi par `GET /api/exercices/{id}` uniquement.

     Le « ? » n'est pas décoratif : sans lui, TypeScript affirmerait que ces
     champs existent toujours, et le premier accès sans garde échouerait à
     l'exécution sans que rien ne l'ait signalé à la compilation. */
  equipement?: string | null;
  muscleCible?: string | null;
  musclesSecondaires?: string | null;
  instructions?: string | null;
}

/**
 * L'identifiant d'un exercice, qu'il arrive en IRI (`/api/exercices/7`) ou en
 * objet complet.
 *
 * API Platform sérialise la même relation des deux façons selon les groupes de
 * la route : `exercice` est un objet sur la fiche d'une séance, une chaîne dans
 * la collection. Le ternaire qui tranche était recopié CINQ fois — constat D10
 * de l'audit de septembre 2026 : `app/seance/[id].tsx`, `app/modele/[id].tsx`
 * et trois fois dans `api/hooks.ts`. Cinq copies d'une conversion, c'est cinq
 * endroits où la forme non prévue passera un jour en silence, et un `NaN` qui
 * ne dit pas d'où il vient.
 *
 * ÉTAT AU 15 SEPTEMBRE 2026 : trois copies restent, et elles attendent.
 * `calcul/historiqueSeances.ts:26` en garde une, privée, qui a absorbé deux des
 * cinq au passage de l'extraction ; `app/seance/[id].tsx:26` et
 * `app/modele/[id].tsx:18` gardent les leurs. Les trois doivent importer
 * celle-ci — ce sont trois lignes, hors du périmètre du découpage des hooks.
 */
export const idDe = (v: Exercice | string): number =>
  typeof v === 'string' ? Number(v.split('/').pop()) : v.id;

/**
 * L'autre moitie du meme ternaire : l'IRI plutot que l'identifiant.
 *
 * `useSeanceVersModele` en a besoin — l'API veut « /api/exercices/7 » et non
 * 7 — et `app/seance/[id].tsx` en portait sa propre copie. Deux copies d'un
 * ternaire de deux lignes ne sont pas un drame ; deux copies qui divergent
 * font pointer un modele sur le mauvais exercice, et personne ne le voit
 * avant la seance suivante. Rassemblees le 15 septembre 2026.
 */
export const iriDe = (v: Exercice | string): string =>
  typeof v === 'string' ? v : v['@id'];

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

/**
 * Une consigne de complément, rattachée à un moment de repas.
 *
 * Ce n'est pas une prise : l'objet ne dit pas « pris ce matin », il dit
 * « avec le repas du matin, 5 g de créatine ». Il vaut tous les jours.
 */
export interface Complement {
  '@id'?: string;
  id: number;
  nom: string;
  /* En chaîne : c'est un DECIMAL côté API, et il refuse un nombre. */
  quantite: string;
  unite: string;
  repas: 'R1' | 'R2' | 'R3' | 'R4';
}

export interface Utilisateur {
  /* FACULTATIF, ET C'EST LA VÉRITÉ. `@id` est fabriqué par API Platform : la
     collection `/utilisateurs` le porte, `/moi` non — c'est un contrôleur
     ordinaire qui sérialise l'entité. Aucun écran ne lit ce champ sur un
     utilisateur ; le déclarer obligatoire n'aurait rien protégé, seulement
     obligé à en inventer un. */
  '@id'?: string;
  id: string;
  email: string;
  nom: string;
  roles: string[];
  sourceFrigo: 'base' | 'grocy';
}

/**
 * Un aliment tel que le renvoie /api/mon-frigo, quelle que soit sa source.
 * Grocy pour l'administrateur, la table « aliment » pour les autres — le
 * front ne fait pas la différence.
 */
export interface AlimentDisponible {
  /** « grocy:12 » ou « base:47 » : la source est dans la référence */
  reference: string;
  nom: string;
  categorie: 'prot' | 'fec' | 'leg' | 'ole' | 'huile' | 'lait' | 'fruit' | 'autre';
  kcal100: number;
  prot100: number;
  gluc100: number;
  lip100: number;
  fibres100: number | null;
  ratio: number;
  /** quantité réellement disponible, exprimée dans l'unité ci-dessous */
  stock: number;
  /**
   * Unité du stock. « g » pour tout ce que le calculateur sait traiter — les
   * macros sont pour 100 g. Une autre valeur (« Pieces », « Litres ») signale
   * un produit que le solveur ne peut pas utiliser tel quel.
   */
  unite: string;
  /**
   * Combien de grammes vaut une unité de stock : 1 au gramme, 1000 au
   * kilogramme, 55 pour un œuf dont la conversion est déclarée dans Grocy.
   * `null` quand elle est inconnue — un litre ou un pack n'ont pas de poids,
   * et l'aliment ne peut pas entrer dans un calcul de macros.
   */
  grammesParUnite: number | null;
  emplacement: string | null;
  peseeAvant: number | null;
  peseeApres: number | null;
  /**
   * D'où vient le rendement retenu.
   *
   * `mesure` : l'utilisateur a pesé son aliment cru puis cuit, et c'est SON
   * chiffre qui est utilisé — aucun import ne peut plus l'écraser, la règle
   * s'applique à la lecture. `table` : faute de pesée, on prend la valeur de
   * référence.
   */
  provenanceRatio: 'mesure' | 'table';
}

export interface MonFrigo {
  source: 'grocy' | 'base';
  aliments: AlimentDisponible[];
  /** message expliquant pourquoi la liste est vide, le cas échéant */
  probleme: string | null;
}
