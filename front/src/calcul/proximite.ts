import { sansAccent } from './texte';

/**
 * « Ces deux noms désignent-ils la même chose ? »
 *
 * DESCENDU LE 20 SEPTEMBRE 2026 (palier 0) depuis `app/admin-fusion.tsx`, où
 * cette distance de Levenshtein occupait vingt lignes — dans `app/`, donc hors
 * de portée de `tsconfig.tests.json`. Elle décide quelles fusions sont
 * proposées, et une fusion SUPPRIME un exercice après lui avoir transféré son
 * historique : ce n'est pas un confort d'affichage.
 *
 * DEUX CORRECTIONS EN LA DESCENDANT.
 *
 * 1. L'APPELANT COMPARAIT DEUX LANGUES. Il écrivait
 *    `proximite(ancien.nom, e.nomFr ?? e.nom)` : l'anglais d'un côté, le
 *    français de l'autre. `db/manuel/29-noms-francais.sql` renseigne `nom_fr`
 *    pour 1314 des 1318 exercices importés et laisse `nom` en anglais — donc
 *    l'écran comparait « barbell incline bench press » à 1314 noms français,
 *    et le seuil ne laissait passer que du bruit. Le cas perso → catalogue
 *    marchait, français des deux côtés : c'est ce qui rendait la panne
 *    invisible à l'essai. La correction est chez l'appelant ; elle est notée
 *    ici parce que c'est ce module qui la rend éprouvable.
 *
 * 2. LES ACCENTS. Toutes les autres recherches du projet passent par
 *    `sansAccent` — `choixAliment`, `filtrerFrigo`, la recherche CIQUAL. Celle
 *    -ci était la seule à ne comparer que la casse : « Developpe couche » tapé
 *    sans accents ne retrouvait pas « Développé couché ».
 */

/**
 * AU-DESSUS DE CE SCORE, ON PROPOSE LA FUSION.
 *
 * 0,45 : assez bas pour rattraper une faute de frappe ou un mot en plus, assez
 * haut pour que « Squat » et « Curl biceps » ne se croisent jamais. Le chiffre
 * vient de l'écran d'origine et n'a pas changé.
 */
export const SEUIL_PROXIMITE = 0.45;

/**
 * Un score entre 0 (rien à voir) et 1 (le même nom).
 *
 * Symétrique : les suggestions ne doivent pas dépendre de quel exercice a été
 * choisi en premier.
 */
export function proximite(a: string, b: string): number {
  const x = sansAccent(a).toLowerCase();
  const y = sansAccent(b).toLowerCase();

  if (x === y) return 1;
  if (x.length === 0 || y.length === 0) return 0;
  if (x.includes(y) || y.includes(x)) return 0.9;

  /* Levenshtein, matrice complète. Les noms d'exercices font quelques dizaines
     de caractères : il n'y a rien à optimiser ici. */
  const m: number[][] = Array.from(
    { length: x.length + 1 },
    () => new Array<number>(y.length + 1).fill(0));

  for (let i = 0; i <= x.length; i++) m[i]![0] = i;
  for (let j = 0; j <= y.length; j++) m[0]![j] = j;

  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      m[i]![j] = Math.min(
        m[i - 1]![j]! + 1,
        m[i]![j - 1]! + 1,
        m[i - 1]![j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    }
  }

  return 1 - m[x.length]![y.length]! / Math.max(x.length, y.length);
}
