/**
 * LE BATCH COOKING — LA PORTE, ET RIEN D'AUTRE.
 *
 * Ce fichier portait 613 lignes et trois sujets que trois bandeaux de
 * commentaire séparaient déjà : les fournées, l'instantané conservé, les
 * cuissons habituelles. Vérifié au découpage — les dépendances vont dans un
 * seul sens, `planFige` et `habitudesCuisson` lisent `fournees` et rien ne
 * remonte.
 *
 * Les trois sujets vivent désormais chacun dans son fichier. Les
 * ré-exportations ci-dessous existent pour que les appelants — composants,
 * hooks d'API, écrans, tests — n'aient rien à changer : ils continuent
 * d'écrire `from '@/calcul/cuisson'`. Un module qui naît aujourd'hui gagne à
 * viser le fichier précis plutôt que la porte.
 *
 * Découpage du 15 septembre 2026, rang 6 du lot 6 de l'audit. Mécanique :
 * aucun comportement n'a changé, aucune formule n'a été recopiée.
 */

export * from './fournees';
export * from './planFige';
export * from './habitudesCuisson';
