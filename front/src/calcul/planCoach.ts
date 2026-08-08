/**
 * Traduit un plan diététique américain en convention européenne.
 *
 * Le piège, et il a coûté cher : une table américaine — USDA, MyFitnessPal,
 * FatSecket et la plupart des applications anglophones — compte les fibres
 * DANS les glucides. Ciqual, les étiquettes françaises et toute cette
 * application les comptent à part.
 *
 * Recopier « 61,8 g de glucides » depuis un plan américain revient donc à
 * viser 61,8 g de glucides EN PLUS des fibres : huit grammes de trop par
 * repas, sans que rien ne le signale. Sur les oléagineux l'écart va jusqu'au
 * facteur quatre — 20 g d'amandes, c'est 4,3 g de glucides à l'américaine et
 * 1,1 g à l'européenne.
 *
 * Ce module ne devine rien : il retranche les fibres annoncées, et rien
 * d'autre. Si le plan d'origine sous-estime ses fibres, la conversion en
 * hérite — d'où `fibresDouteuses`.
 */

export interface PlanAmericain {
  /** kcal telles qu'imprimées sur le plan */
  kcal: number;
  prot: number;
  /** glucides TOTAUX, fibres comprises */
  glucides: number;
  lipides: number;
  /** fibres, telles qu'imprimées */
  fibres: number;
}

export interface CibleEuropeenne {
  prot: number;
  /** glucides HORS fibres : ce que vise l'application */
  gluc: number;
  lip: number;
  /** recalculées en convention européenne, fibres à 2 kcal/g */
  kcal: number;
  /** conservées pour information : elles n'entrent dans aucune cible */
  fibres: number;
  /** ce que le plan d'origine annonçait, pour comparaison */
  kcalAnnoncees: number;
}

export const KCAL_PROT = 4;
export const KCAL_GLUC = 4;
export const KCAL_FIBRES = 2;
export const KCAL_LIP = 9;

const arrondi = (v: number): number => Math.round(v * 10) / 10;

/**
 * Les fibres annoncées sont-elles crédibles ?
 *
 * Un plan qui déclare 0 g de fibres pour 200 g de haricots verts ne se
 * trompe pas de peu : il ne les a pas renseignées. Convertir sur cette base
 * laisse les glucides trop hauts, et le défaut passe inaperçu — un zéro
 * ressemble à une valeur.
 *
 * La règle est un ordre de grandeur, pas une loi : les aliments qui portent
 * des glucides en portent aussi des fibres, grossièrement un dixième. Un
 * plan qui annonce 80 g de glucides et 2 g de fibres n'a pas compté.
 *
 * Éprouvé sur un plan réel : trois repas sur quatre sont signalés, et la
 * vérification aliment par aliment leur donne raison — 3,5 g annoncés au
 * petit-déjeuner pour environ 10 g réels.
 */
export function fibresDouteuses(plan: PlanAmericain): boolean {
  return plan.glucides >= 20 && plan.fibres < plan.glucides / 10;
}

export function convertir(plan: PlanAmericain): CibleEuropeenne {
  /* Des fibres supérieures aux glucides totaux ne veulent rien dire : les
     fibres SONT une part des glucides dans cette convention. On préfère ne
     rien retrancher plutôt que de rendre un glucide négatif. */
  const fibres = Math.max(0, Math.min(plan.fibres, plan.glucides));
  const gluc = arrondi(plan.glucides - fibres);

  return {
    prot: arrondi(plan.prot),
    gluc,
    lip: arrondi(plan.lipides),
    fibres: arrondi(fibres),
    kcal: Math.round(
      KCAL_PROT * plan.prot + KCAL_GLUC * gluc
      + KCAL_FIBRES * fibres + KCAL_LIP * plan.lipides),
    kcalAnnoncees: Math.round(plan.kcal),
  };
}

/* Une détection automatique de la convention a été tentée, en comparant les
   calories annoncées à ce que donnent les deux lectures. Elle a été retirée :
   elle se trompait sur le plan réel.

   La raison est instructive. Les calories d'un plan ne sortent pas d'un
   calcul 4/4/9 — elles viennent des étiquettes, arrondies, parfois d'une
   autre base de données. Sur le petit-déjeuner du plan de référence, l'écart
   à la lecture européenne (13,5 kcal) est plus FAIBLE qu'à la lecture
   américaine (20,5 kcal), alors que le plan est américain : la comparaison
   ne mesurait que du bruit.

   Ce qui prouve vraiment la convention, c'est l'aliment : 20 g d'amandes
   valent 4,3 g de glucides à l'américaine et 1,1 g à l'européenne. Mais un
   plan ne détaille pas toujours ses aliments.

   Une question à l'utilisateur, dont l'intention ne fait aucun doute, vaut
   mieux qu'un devin qui se trompe une fois sur deux. */
