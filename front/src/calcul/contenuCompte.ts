/**
 * Ce qu'un compte contient, et donc ce que sa suppression détruit — en mots.
 *
 * Seule mise en mots de ces compteurs : la carte du compte et la confirmation
 * de suppression s'en servent toutes les deux (`app/admin-utilisateurs.tsx`).
 * Voir `contenuCompte.test.ts` pour ce qui manquait avant.
 */

export interface ContenuCompte {
  seances: number;
  series: number;
  modeles: number;
  plans: number;
  aliments: number;
  stock: number;
}

const compte = (n: number, singulier: string, pluriel: string): string =>
  `${n} ${n > 1 ? pluriel : singulier}`;

/** Chaque compteur, accordé, dans l'ordre où l'écran les présente. */
export function contenuEnMots(c: ContenuCompte): string[] {
  return [
    compte(c.seances, 'séance', 'séances'),
    compte(c.series, 'série', 'séries'),
    compte(c.modeles, 'modèle', 'modèles'),
    compte(c.plans, 'plan', 'plans'),
    compte(c.aliments, 'aliment', 'aliments'),
    compte(c.stock, 'ligne de stock', 'lignes de stock'),
  ];
}

/** « a, b et c » — pour une phrase, là où la carte se contente de « · ». */
export function enumeration(elements: string[]): string {
  if (elements.length <= 1) return elements.join('');

  return `${elements.slice(0, -1).join(', ')} et ${elements[elements.length - 1]}`;
}
