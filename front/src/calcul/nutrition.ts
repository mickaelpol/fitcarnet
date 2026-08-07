/**
 * Contrôles de cohérence nutritionnelle.
 *
 * Convention EUROPÉENNE, celle des étiquettes françaises et de Ciqual :
 * les fibres sont comptées SÉPARÉMENT des glucides, à 2 kcal/g. Une table
 * américaine les inclut dans les glucides — sur des amandes, l'écart va de
 * 4,8 g à 21,5 g pour 100 g. Mélanger les deux fausse tout.
 */

export const KCAL_PROTEINES = 4;
export const KCAL_GLUCIDES = 4;
export const KCAL_FIBRES = 2;
export const KCAL_LIPIDES = 9;

export interface Macros {
  kcal: number;
  prot: number;
  gluc: number;
  lip: number;
  /** facultatif : sans elles, le contrôle perd sa fiabilité */
  fibres?: number | null;
}

export type Verdict = 'coherent' | 'ecart' | 'incoherent' | 'indecidable';

export interface Controle {
  verdict: Verdict;
  /** calories déduites des macros saisies */
  calculees: number;
  /** écart relatif, en pourcentage */
  ecart: number;
  message: string;
}

/** Au-delà, l'écart ne s'explique plus par des arrondis. */
const TOLERANCE = 0.08;
const TOLERANCE_SANS_FIBRES = 0.2;

/**
 * Les calories saisies correspondent-elles aux macros saisies ?
 *
 * C'est le seul garde-fou automatique possible : il attrape une virgule
 * mal placée, un champ oublié, ou des sucres additionnés aux glucides.
 */
export function controler(m: Macros): Controle {
  const fibresConnues = m.fibres !== null && m.fibres !== undefined;
  const fibres = fibresConnues ? (m.fibres as number) : 0;

  const calculees =
    KCAL_PROTEINES * m.prot +
    KCAL_GLUCIDES * m.gluc +
    KCAL_FIBRES * fibres +
    KCAL_LIPIDES * m.lip;

  if (m.kcal <= 0) {
    return {
      verdict: 'indecidable',
      calculees,
      ecart: 0,
      message: `Ces macros représentent ${Math.round(calculees)} calories.`,
    };
  }

  const ecart = (calculees - m.kcal) / m.kcal;
  const seuil = fibresConnues ? TOLERANCE : TOLERANCE_SANS_FIBRES;
  const absolu = Math.abs(ecart);

  if (absolu <= seuil) {
    return {
      verdict: 'coherent',
      calculees,
      ecart: ecart * 100,
      message: fibresConnues
        ? 'Les valeurs sont cohérentes entre elles.'
        : 'Cohérent, mais sans les fibres le contrôle reste approximatif.',
    };
  }

  /* Sans fibres renseignées, un écart NÉGATIF est normal sur un aliment
     qui en contient : les calories annoncées incluent leur apport, pas le
     calcul. Inutile d'alarmer sur ce cas-là. */
  if (!fibresConnues && ecart < 0) {
    return {
      verdict: 'ecart',
      calculees,
      ecart: ecart * 100,
      message:
        `Le calcul donne ${Math.round(calculees)} calories contre ${Math.round(m.kcal)} annoncées. ` +
        "C'est normal si l'aliment contient des fibres — renseigne-les pour lever le doute.",
    };
  }

  return {
    verdict: absolu > 0.3 ? 'incoherent' : 'ecart',
    calculees,
    ecart: ecart * 100,
    message:
      `Le calcul donne ${Math.round(calculees)} calories contre ${Math.round(m.kcal)} annoncées, ` +
      `soit ${ecart > 0 ? '+' : ''}${Math.round(ecart * 100)} %. ` +
      (absolu > 0.3
        ? 'Vérifie tes saisies : une valeur semble erronée.'
        : 'Vérifie les glucides — les sucres en font partie, ils ne s\u2019ajoutent pas.'),
  };
}

/* ------------------------------------------------------------ kilojoules */

/** 1 kcal = 4,184 kJ. Facteur du règlement INCO. */
export const KJ_PAR_KCAL = 4.184;

/**
 * Plafond physique pour 100 g : rien n'est plus dense que la matière grasse
 * pure, à 9 kcal par gramme. Au-delà, la valeur saisie ne peut pas être des
 * calories.
 */
export const KCAL_MAX_100G = 900;

export interface SoupconKilojoules {
  /** la valeur saisie, telle quelle */
  saisi: number;
  /** ce qu'elle vaudrait une fois convertie */
  converti: number;
  /** ce qui a déclenché le soupçon */
  motif: 'plafond' | 'rapport';
}

/**
 * La valeur saisie ressemble-t-elle à des kilojoules ?
 *
 * Les étiquettes européennes affichent les kJ AVANT les kcal : « 1473 kJ /
 * 352 kcal ». Recopier la première ligne multiplie les calories par 4,18 sans
 * que rien ne le signale, et l'aliment ressort quatre fois trop riche du
 * solveur.
 *
 * Deux détections complémentaires :
 *  - le PLAFOND fonctionne sans macros saisies, mais rate les aliments peu
 *    caloriques : 50 kcal en kJ font 209, ce qui reste plausible ;
 *  - le RAPPORT aux macros attrape n'importe quel niveau, mais exige qu'elles
 *    soient renseignées.
 *
 * Aucune n'est infaillible : un aliment sans macros et sous 900 passera entre
 * les mailles. C'est un garde-fou, pas une garantie.
 */
export function soupconKilojoules(m: Macros): SoupconKilojoules | null {
  if (!(m.kcal > 0)) return null;

  const converti = Math.round((m.kcal / KJ_PAR_KCAL) * 10) / 10;

  if (m.kcal > KCAL_MAX_100G) {
    return { saisi: m.kcal, converti, motif: 'plafond' };
  }

  const { calculees } = controler(m);
  if (calculees <= 0) return null;

  /* Le rapport doit serrer 4,184 de près. Au-delà de 10 % d'écart, c'est
     une autre erreur de saisie, et proposer une conversion l'aggraverait. */
  const rapport = m.kcal / calculees;
  if (Math.abs(rapport - KJ_PAR_KCAL) / KJ_PAR_KCAL <= 0.1) {
    return { saisi: m.kcal, converti, motif: 'rapport' };
  }

  return null;
}

/* ---------------------------------------------------------------- ratio */

export interface ChoixRatio {
  cle: string;
  libelle: string;
  exemple: string;
  valeur: number;
}

/**
 * Ratio = poids obtenu après cuisson, à partir de 100 g avant cuisson.
 * Les féculents absorbent l'eau (ratio > 1), les viandes en perdent (< 1).
 */
export const RATIOS_GUIDES: ChoixRatio[] = [
  { cle: 'inchange', libelle: 'Le poids ne change pas',
    exemple: 'légumes, fruits, laitages, oléagineux', valeur: 1 },
  { cle: 'cereales', libelle: 'Riz, pâtes, quinoa, semoule',
    exemple: '100 g secs → environ 230 g cuits', valeur: 2.3 },
  { cle: 'legumineuses', libelle: 'Lentilles, pois chiches, haricots secs',
    exemple: '100 g secs → environ 250 g cuits', valeur: 2.5 },
  { cle: 'viande', libelle: 'Viande, volaille',
    exemple: '100 g crus → environ 75 g cuits', valeur: 0.75 },
  { cle: 'poisson', libelle: 'Poisson',
    exemple: '100 g crus → environ 85 g cuits', valeur: 0.85 },
];

/** Depuis deux pesées : « j'avais 100 g secs, j'ai obtenu 230 g cuits ». */
export function ratioDepuisPesees(avant: number, apres: number): number | null {
  if (!(avant > 0) || !(apres > 0)) return null;

  return Math.round((apres / avant) * 100) / 100;
}

/**
 * D'où vient le ratio ? Un chiffre mesuré n'a pas le même statut qu'une
 * valeur courante choisie dans une liste — l'utilisateur doit pouvoir
 * les distinguer six mois plus tard.
 */
export function provenanceRatio(
  avant: number | null | undefined,
  apres: number | null | undefined,
): string | null {
  if (!avant || !apres || avant <= 0 || apres <= 0) return null;

  return `mesuré : ${nombreCourt(avant)} g avant cuisson → ${nombreCourt(apres)} g après`;
}

const nombreCourt = (v: number): string =>
  Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);

/** Formulation en clair, pour que l'utilisateur vérifie la vraisemblance. */
export function expliquerRatio(ratio: number): string {
  if (Math.abs(ratio - 1) < 0.01) return 'Le poids ne change pas à la cuisson.';
  if (ratio > 1) {
    return `100 g avant cuisson donnent ${Math.round(ratio * 100)} g une fois cuits.`;
  }

  return `100 g avant cuisson donnent ${Math.round(ratio * 100)} g une fois cuits `
    + `(perte d'eau).`;
}

/** Le ratio est-il vraisemblable ? Au-delà, c'est une erreur de saisie. */
export function ratioVraisemblable(ratio: number): boolean {
  return ratio >= 0.4 && ratio <= 5;
}

/* ---------------------------------------------- état de référence */

/**
 * Les macros valent-elles pour le produit cru ou cuit ?
 *
 * Sur un emballage, c'est toujours l'état TEL QUE VENDU : sec pour le riz,
 * cru pour la viande. On le déduit de la catégorie plutôt que de poser une
 * question de plus, tout en laissant l'utilisateur corriger.
 */
export function etatParDefaut(categorie: string): 'cru' | 'cuit' {
  return ['prot', 'fec'].includes(categorie) ? 'cru' : 'cuit';
}

export const CATEGORIES = [
  { cle: 'prot',  libelle: 'Protéine',   exemple: 'viande, poisson, œufs' },
  { cle: 'fec',   libelle: 'Glucide',    exemple: 'riz, pâtes, pain, pommes de terre' },
  { cle: 'leg',   libelle: 'Légume',     exemple: 'haricots verts, brocoli, salade' },
  { cle: 'fruit', libelle: 'Fruit',      exemple: 'pomme, banane, fraises' },
  { cle: 'ole',   libelle: 'Oléagineux', exemple: 'amandes, noix, beurre de cacahuète' },
  { cle: 'huile', libelle: 'Matière grasse', exemple: 'huile, beurre' },
  { cle: 'lait',  libelle: 'Laitage',    exemple: 'skyr, fromage blanc, fromage' },
  { cle: 'autre', libelle: 'Autre',      exemple: 'condiment, boisson' },
] as const;
