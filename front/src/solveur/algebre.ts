/**
 * Résolution exacte d'un système linéaire par élimination de Gauss
 * avec pivot partiel. Aucune itération, aucune convergence à espérer :
 * soit le système a une solution, soit il est singulier.
 */

const EPSILON = 1e-10;

/**
 * Résout A·x = b pour une matrice carrée.
 * @returns le vecteur solution, ou null si le système est singulier.
 */
export function resoudre(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  if (A.length !== n || A.some((ligne) => ligne.length !== n)) {
    throw new Error('Dimensions incohérentes.');
  }

  // matrice augmentée, copiée pour ne pas altérer les entrées
  const M: number[][] = A.map((ligne, i) => [...ligne, b[i]]);

  for (let colonne = 0; colonne < n; colonne++) {
    // pivot partiel : on prend la ligne au plus grand coefficient absolu,
    // ce qui limite la propagation des erreurs d'arrondi flottant
    let meilleure = colonne;
    for (let ligne = colonne + 1; ligne < n; ligne++) {
      if (Math.abs(M[ligne][colonne]) > Math.abs(M[meilleure][colonne])) {
        meilleure = ligne;
      }
    }
    if (Math.abs(M[meilleure][colonne]) < EPSILON) {
      return null; // colonne nulle : système singulier
    }
    [M[colonne], M[meilleure]] = [M[meilleure], M[colonne]];

    for (let ligne = 0; ligne < n; ligne++) {
      if (ligne === colonne) continue;
      const facteur = M[ligne][colonne] / M[colonne][colonne];
      if (facteur === 0) continue;
      for (let k = colonne; k <= n; k++) {
        M[ligne][k] -= facteur * M[colonne][k];
      }
    }
  }

  const x = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    x[i] = M[i][n] / M[i][i];
    if (!Number.isFinite(x[i])) return null;
  }

  return x;
}

/** Arrondi au pas demandé (0 ou absent = pas d'arrondi). */
export function arrondir(valeur: number, pas = 0): number {
  if (!pas || pas <= 0) return valeur;
  return Math.round(valeur / pas) * pas;
}
