import type { Aliment } from '@/solveur/types';
import type { ModeCuisson } from './fournees';

/**
 * LES FIXTURES DU BATCH COOKING.
 *
 * Elles vivaient en tête de `cuisson.test.ts`. Le découpage du 15 septembre
 * 2026 les a rendues nécessaires à quatre fichiers de tests ; les recopier
 * quatre fois aurait donné quatre catalogues libres de diverger — et le riz
 * qui double à la cuisson est précisément ce qui rend visible, dans chaque
 * attente, laquelle des deux colonnes est lue.
 *
 * Même rôle que `solveur/aliments.test-data.ts`, et même raison d'être.
 */

export const MODES: ModeCuisson[] = [
  { id: 1, libelle: 'Vapeur', ordre: 10 },
  { id: 4, libelle: 'Four 180 °C', ordre: 40 },
  { id: 5, libelle: 'Four 200 °C', ordre: 50 },
];

const a = (nom: string): Aliment => ({
  id: nom, nom, categorie: 'prot',
  kcal100: 100, prot100: 20, gluc100: 0, lip100: 2, ratio: 1,
});

export const RIZ = a('Riz');
export const POULET = a('Poulet');
export const BROCOLI = a('Brocoli');

/* `assiette` vaut ici deux fois le poids pesé : un riz qui double. Ça rend
   visible, dans les attentes, laquelle des deux colonnes est lue — et une
   fournée qui annoncerait du cuit, ou une boîte qui annoncerait du sec, se
   verrait immédiatement. */
export const repas = (cle: string, ...q: { aliment: Aliment; aCuire: number }[]) =>
  ({ cle, convives: 1, quantites: q.map((x) => ({ ...x, assiette: x.aCuire * 2 })) });

/** Le même repas, cuisiné pour plusieurs. */
export const pour = (convives: number, r: ReturnType<typeof repas>) => ({ ...r, convives });
