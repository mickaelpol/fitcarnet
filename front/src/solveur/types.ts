/** Macronutriments pour 100 g dans l'état de référence de l'aliment. */
export interface Aliment {
  id: number | string;
  nom: string;
  categorie: 'prot' | 'fec' | 'leg' | 'ole' | 'huile' | 'lait' | 'fruit' | 'autre';
  kcal100: number;
  prot100: number;
  gluc100: number;
  lip100: number;
  /**
   * Fibres pour 100 g, convention européenne : elles ne sont PAS comprises
   * dans `gluc100`. Facultatif — absentes, elles valent zéro.
   *
   * Elles n'entrent dans aucune cible, mais servent à comparer une
   * prescription exprimée en glucides TOTAUX. Voir `Options.glucidesTotaux`.
   */
  fibres100?: number;
  /** féculents : cuit/sec (riz 3) · protéines : cuit/cru (0,85 poisson, 0,75 volaille) */
  ratio: number;
  /** état auquel se rapportent les valeurs ci-dessus */
  etatReference: 'cru' | 'cuit';
}

export interface Cibles {
  kcal: number;
  prot: number;
  gluc: number;
  lip: number;
}

export interface Macros {
  kcal: number;
  prot: number;
  gluc: number;
  lip: number;
}

/**
 * Un ingrédient dont la quantité est imposée : légume du plan, huile, ou
 * surtout un RESTE à écouler.
 *
 * `unite` dit dans quel état la quantité est saisie :
 *   - 'cuit' : « il me reste 100 g de riz cuit », « 90 g de saumon cuit »
 *   - 'cru'  : « je vais cuire 120 g de saumon », « 40 g de riz sec »
 * Par défaut, l'état de référence de l'aliment.
 */
export interface Fixe {
  aliment: Aliment;
  grammes: number;
  unite?: 'cru' | 'cuit';
}

/**
 * Les aliments dont la quantité reste ajustable. Chacun est rattaché à la macro
 * qu'il pilote. Les trois sont facultatifs : avec moins de trois, le calcul se
 * fait quand même sur les macros couvertes, et l'écart sur les autres est
 * rapporté au lieu de bloquer.
 */
export interface Variables {
  proteine?: Aliment;
  glucide?: Aliment;
  lipide?: Aliment;
}

export interface Options {
  /** pas d'arrondi appliqué à chaque variable, en grammes */
  arrondi?: { proteine?: number; glucide?: number; lipide?: number };
  /** tolérance d'écart acceptée, par macro */
  tolerance?: Partial<Macros>;
  /**
   * La cible en glucides comprend-elle les fibres ?
   *
   * Les plans nord-américains — USDA, MyFitnessPal, Fitlog — écrivent un
   * « Total Carbohydrate » qui INCLUT les fibres ; les étiquettes françaises
   * et cette application les comptent à part. Viser 61,8 g de glucides
   * européens quand la prescription dit 61,8 g de glucides totaux revient à
   * en manger huit de trop.
   *
   * Activé, le calcul compare la cible à `glucides + fibres` de chaque
   * aliment. Rien d'autre ne change : ni les données saisies, qui restent
   * européennes, ni les autres macros, qui ne dépendent d'aucune convention.
   *
   * Les fibres utilisées sont les VRAIES, celles des aliments — pas celles
   * que le plan d'origine déclare, souvent incomplètes.
   */
  glucidesTotaux?: boolean;
}

export type Gravite = 'info' | 'avertissement' | 'blocage';

export interface Diagnostic {
  gravite: Gravite;
  code: string;
  message: string;
}

export interface Quantite {
  aliment: Aliment;
  /** ce qu'on pèse AVANT cuisson : sec pour les féculents, cru pour les viandes */
  aCuire: number;
  /** ce qu'on pose dans l'assiette, tout cuit */
  assiette: number;
  /** true si la quantité était imposée (reste à écouler, légume du plan…) */
  impose: boolean;
}

export interface Resultat {
  /** true si toutes les macros tombent dans la tolérance après arrondi */
  ok: boolean;
  quantites: Quantite[];
  /** macros réellement obtenues, calculées sur les quantités ARRONDIES */
  macros: Macros;
  cibles: Cibles;
  ecarts: Macros;
  diagnostics: Diagnostic[];
}
