/**
 * Un aliment, décrit dans UN SEUL état : celui où on le pèse.
 *
 * Toutes les valeurs qui suivent se rapportent à 100 g de produit **tel qu'on
 * le pose sur la balance avant de cuisiner** — riz sec, viande crue, légume
 * cru, yaourt tel quel. Il n'y a pas d'autre convention, et c'est délibéré :
 * tant qu'un aliment pouvait porter ses valeurs tantôt crues tantôt cuites,
 * ses macros et son rendement décrivaient deux choses différentes et
 * pouvaient se contredire. Il fallait alors du code pour détecter la
 * contradiction, la nommer, et demander à l'utilisateur laquelle des deux
 * valeurs était la sienne. Un seul état, et la contradiction devient
 * impossible à écrire.
 *
 * La cuisson n'ajoute ni ne retire de nutriment : elle ajoute ou retire de
 * l'eau. Les macros d'une portion se comptent donc sur le poids PESÉ, jamais
 * sur le poids servi. Le rendement ci-dessous ne sert qu'à annoncer ce poids
 * servi — il ne déplace pas un gramme de macro.
 */
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
  /**
   * Poids cuit / poids pesé. Riz sec ≈ 3, poisson ≈ 0,85, volaille ≈ 0,75,
   * courgette ≈ 0,73. Vaut 1 pour tout ce qu'on ne cuit pas.
   *
   * N'entre dans AUCUN calcul de macro : il ne sert qu'à afficher le poids
   * qu'on retrouvera dans le plat. Le changer ne change pas d'un gramme ce
   * qu'il faut peser.
   */
  ratio: number;
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
 *   - 'cru'  : « je vais cuire 120 g de saumon », « 40 g de riz sec »
 *   - 'cuit' : « il me reste 100 g de riz cuit », « 90 g de saumon cuit »
 * Par défaut 'cru', comme tout le reste de l'application.
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
