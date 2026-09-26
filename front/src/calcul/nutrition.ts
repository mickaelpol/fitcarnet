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

/**
 * LES CALORIES QUE DÉCRIVENT DES GRAMMES — la seule écriture de la somme
 * d'Atwater dans le front (règle 5), convention européenne : fibres à
 * `KCAL_FIBRES`, comptées à part des glucides.
 *
 * `fibres` absent ou `null` compte pour zéro gramme. Ce n'est PAS une réponse à
 * « combien de fibres ? » : c'est à l'appelant de savoir s'il les connaît, et
 * de le dire à l'écran s'il ne les connaît pas. Voir `formuleUnique.test.ts`,
 * qui refuse toute autre écriture.
 */
export const kcalDesGrammes = (
  m: { prot: number; gluc: number; lip: number; fibres?: number | null },
): number =>
  KCAL_PROTEINES * m.prot +
  KCAL_GLUCIDES * m.gluc +
  KCAL_FIBRES * (m.fibres ?? 0) +
  KCAL_LIPIDES * m.lip;


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

/* `ratioDepuisPesees` ET `provenanceRatio` VIVAIENT ICI, et l'éditeur
   d'aliment en était le seul lecteur : il calculait le rendement qu'il
   envoyait ensuite à l'API, qui le croyait. Ils sont sur le serveur depuis le
   26 septembre 2026 — `api/src/Service/RendementExplique.php` — et l'écran
   n'envoie plus que les deux pesées brutes (feature
   `macros-editeur-vide-pas-zero`). Ne pas les réécrire ici. */

/**
 * EN DEÇÀ DE CET ÉCART, ON DIT QUE LE POIDS NE CHANGE PAS.
 *
 * Constante depuis le 20 septembre 2026 (palier 0), parce qu'elle était écrite
 * deux fois avec DEUX VALEURS différentes : `0.01` ici, et une égalité stricte
 * `ratio === 1` dans `composants/ligneFrigo.tsx`. Un aliment à 1,002 — ce
 * qu'une vraie pesée donne très vite, 500 g avant et 501 g après — était donc
 * « inchangé » dans l'éditeur et « 100 g → 100 g » dans le frigo : un
 * changement affiché qui n'en était pas un.
 *
 * 1 % : en dessous, c'est la précision de la balance, pas la cuisson.
 */
export const POIDS_INCHANGE = 0.01;

/** Le poids ne bouge-t-il pas assez pour qu'on en parle ? */
const inchange = (ratio: number): boolean => Math.abs(ratio - 1) < POIDS_INCHANGE;

/* `expliquerRatio` — la phrase longue de l'éditeur — est parti au serveur le
   26 septembre 2026 avec le reste du rendement
   (`RendementExplique::explication`). Il y garde son jumeau déclaré de
   `POIDS_INCHANGE`, et `ratioDit.test.ts` refuse que les deux divergent. */

/**
 * Le rendement en trois mots, pour une case de tableau.
 *
 * Le frigo déplie ses macros dans une grille où une phrase ne rentre pas. Ce
 * qui compte : la phrase longue, écrite par le serveur, bascule au MÊME seuil
 * — `ratioDit.test.ts` compare les deux `POIDS_INCHANGE`.
 */
export const resumeRatio = (ratio: number): string =>
  (inchange(ratio) ? 'poids inchangé' : `100 g → ${Math.round(ratio * 100)} g`);

/* `ratioVraisemblable` VIVAIT ICI, et il répondait « 0,4 à 5 » — sans jamais
   regarder la catégorie de l'aliment. Deux conséquences, trouvées le même jour
   par deux agents de contrôle, le 16 septembre 2026 :

     - une vraie mesure d'épinard (500 g crus → 160 g cuits, soit 0,32) était
       REFUSÉE par l'éditeur, avec un message affirmant qu'elle n'était pas
       vraisemblable — alors que la bande des légumes la déclare légitime ;
     - un féculent à 0,8 était ACCEPTÉ, puis rejeté par la contrainte `CHECK` de
       la base : l'utilisateur recevait un HTTP 500 portant le SQL brut.

   La règle vit désormais sur le SERVEUR, dans
   `api/src/Service/RendementPlausible.php::sens`, sous le nom
   `rendementPossible`, au même endroit que les bandes de rendement, et elle dit
   exactement ce que disent l'API (`RendementPlausible::sens`) et la base
   (`aliment_ratio_sens`) : un féculent absorbe de l'eau, une protéine et un
   légume en perdent. Ne pas la réécrire ici. */

/* `etatParDefaut()` vivait ici. Il répondait à « ces macros valent-elles pour
   le produit cru ou cuit ? » — une question que l'application ne pose plus,
   parce qu'elle n'a plus qu'une seule réponse possible : le produit tel qu'on
   le pèse. Voir l'en-tête de `solveur/types.ts`. */

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
