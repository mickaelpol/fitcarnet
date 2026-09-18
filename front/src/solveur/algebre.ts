/**
 * Résolution exacte d'un système linéaire par élimination de Gauss
 * avec pivot partiel. Aucune itération, aucune convergence à espérer :
 * soit le système a une solution, soit il est singulier.
 */

/**
 * SEUIL RELATIF, ET C'EST TOUT L'INTÉRÊT (M4, 15 septembre 2026).
 *
 * C'était `1e-10` comparé en valeur ABSOLUE. Sur cette matrice-là, les
 * coefficients sont des macros pour 100 g — 0,07 de protéines, 0,78 de
 * glucides. Un pivot légitime y vaut 0,5 ; un pivot « nul » n'y vaut
 * jamais 1e-10 exactement, parce qu'aucune donnée alimentaire n'est ronde.
 * Le garde-fou ne se déclenchait donc que sur deux aliments STRICTEMENT
 * identiques, alors que son message annonce « ces aliments se ressemblent
 * trop ».
 *
 * Le cas mesuré : deux riz distants de 1,4 % (7,0/78,0/0,6 et 7,1/78,2/0,62)
 * plus de l'huile. Déterminant 6,4e-4, six ordres de grandeur au-dessus du
 * seuil, et `resoudre` rendait −41 109 g d'un riz contre +41 094 g de l'autre.
 * La boucle des négatifs rattrapait les quantités, mais l'écran expliquait
 * alors « le reste apporte déjà tout ce qu'il faut » quand les protéines
 * finissaient à 6,4 g pour 40 visés : le chiffre était rattrapé, la phrase
 * restait fausse.
 *
 * Un seuil absolu n'est pas une propriété du système, seulement de l'unité
 * dans laquelle on l'écrit. On compare donc le pivot à l'amplitude de SA
 * COLONNE dans la matrice d'origine : le rapport est sans dimension, et
 * changer de gramme en milligramme ne change plus le verdict.
 *
 * La valeur est mesurée, pas choisie au jugé. Sur les 134 860 pivots que
 * produit le corpus de tests du solveur, le rapport vaut soit exactement 0
 * (aliments identiques), soit au moins 0,484 — rien entre les deux. Les cas
 * limites réalistes se répartissent de part et d'autre :
 *   riz blanc / riz COMPLET, deux aliments à départager  → 2,5e-2
 *   les deux riz jumeaux ci-dessus, à refuser            → 1,0e-3
 * `5e-3` tient au milieu, à 5× de chacun.
 */
const EPSILON_RELATIF = 5e-3;

/**
 * UNE CASE ABSENTE N'EST PAS UNE DONNÉE MANQUANTE (M13, 18 septembre 2026).
 *
 * `noUncheckedIndexedAccess` a été rallumé ce jour-là, et ce fichier — qui
 * indexe une matrice à presque chaque ligne — a fourni 22 des 47 erreurs.
 * Les deux raccourcis qui les font taire mentent tous les deux :
 *
 *   `M[i]![j]!` remet exactement le typage d'avant, avec une affirmation
 *   fausse en plus ;
 *   `M[i]?.[j] ?? 0` est pire — un zéro inventé au milieu d'une élimination
 *   de Gauss ne fait pas ÉCHOUER le calcul, il le fait RÉUSSIR sur un système
 *   qui n'est pas celui qu'on a posé. `resoudre` rendrait alors des grammes
 *   plausibles, que l'utilisateur pèserait et mangerait. Règle 7 : un chiffre
 *   faux est pire qu'un refus de répondre.
 *
 * L'invariant est donc dit une fois — « une matrice arrivée ici est carrée,
 * sinon on refuse » — contrôlé à l'entrée de `resoudre`, et RELU à chaque
 * accès par les deux fonctions ci-dessous. Elles ne comblent rien : elles
 * lèvent. Une case absente après ce contrôle veut dire que la matrice a été
 * abîmée en cours de route, et il n'existe aucune valeur honnête à mettre à
 * la place.
 *
 * Ce n'est pas un chemin vivant : aucun appelant ne peut l'atteindre tant que
 * le contrôle d'entrée tient. C'est le filet qui rend l'invariant vérifiable
 * au lieu de simplement énoncé.
 */
function ligneDe(M: readonly number[][], i: number): number[] {
  const ligne = M[i];
  if (ligne === undefined) throw new Error(`Matrice mal formée : ligne ${i} absente.`);
  return ligne;
}

/** La case `j` de `ligne`, ou le même refus franc. Voir `ligneDe`. */
function caseDe(ligne: readonly number[], j: number): number {
  const valeur = ligne[j];
  if (valeur === undefined) throw new Error(`Matrice mal formée : case ${j} absente.`);
  return valeur;
}

/**
 * Résout A·x = b pour une matrice carrée.
 * @returns le vecteur solution, ou null si le système est singulier.
 */
export function resoudre(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  if (A.length !== n || A.some((ligne) => ligne.length !== n)) {
    throw new Error('Dimensions incohérentes.');
  }

  /* L'échelle de chaque colonne, prise sur la matrice D'ORIGINE : c'est à
     elle qu'on compare le pivot une fois la colonne éliminée. Une colonne
     entièrement nulle garde une amplitude nulle, et le test ci-dessous la
     rejette comme avant. */
  const amplitude = Array.from({ length: n }, (_, c) =>
    Math.max(...A.map((ligne) => Math.abs(caseDe(ligne, c)))));

  // matrice augmentée, copiée pour ne pas altérer les entrées
  const M: number[][] = A.map((ligne, i) => [...ligne, caseDe(b, i)]);

  for (let colonne = 0; colonne < n; colonne++) {
    // pivot partiel : on prend la ligne au plus grand coefficient absolu,
    // ce qui limite la propagation des erreurs d'arrondi flottant
    let meilleure = colonne;
    for (let ligne = colonne + 1; ligne < n; ligne++) {
      if (Math.abs(caseDe(ligneDe(M, ligne), colonne))
        > Math.abs(caseDe(ligneDe(M, meilleure), colonne))) {
        meilleure = ligne;
      }
    }
    /* Une colonne vide dès l'origine n'a aucune amplitude à laquelle se
       rapporter : un seuil relatif seul la laisserait passer, puis diviser par
       zéro. Elle reste ce qu'elle a toujours été — une variable dont rien ne
       dépend, donc un système singulier. */
    const echelle = caseDe(amplitude, colonne);
    if (echelle === 0) return null;

    /* Ce qui reste de la colonne, rapporté à ce qu'elle valait au départ.
       Proche de zéro : les autres colonnes l'expliquent déjà — le système est
       singulier en pratique, même si son déterminant n'est pas nul. */
    if (Math.abs(caseDe(ligneDe(M, meilleure), colonne)) < EPSILON_RELATIF * echelle) {
      return null; // colonne devenue redondante : système singulier
    }
    const permutee = ligneDe(M, colonne);
    M[colonne] = ligneDe(M, meilleure);
    M[meilleure] = permutee;

    /* Le pivot ne bouge plus de la boucle qui suit : elle ne touche que les
       lignes DIFFÉRENTES de `colonne`. On le lit donc une fois. */
    const pivot = ligneDe(M, colonne);
    const coefficientPivot = caseDe(pivot, colonne);

    for (let ligne = 0; ligne < n; ligne++) {
      if (ligne === colonne) continue;
      const courante = ligneDe(M, ligne);
      const facteur = caseDe(courante, colonne) / coefficientPivot;
      if (facteur === 0) continue;
      for (let k = colonne; k <= n; k++) {
        courante[k] = caseDe(courante, k) - facteur * caseDe(pivot, k);
      }
    }
  }

  const x = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const ligne = ligneDe(M, i);
    const valeur = caseDe(ligne, n) / caseDe(ligne, i);
    if (!Number.isFinite(valeur)) return null;
    x[i] = valeur;
  }

  return x;
}

/** Arrondi au pas demandé (0 ou absent = pas d'arrondi). */
export function arrondir(valeur: number, pas = 0): number {
  if (!pas || pas <= 0) return valeur;
  return Math.round(valeur / pas) * pas;
}
