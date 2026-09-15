import type { ModeCuisson } from './fournees';

/**
 * QUELS POIDS UNE LIGNE DE REPAS ANNONCE — et lequel dépend de la cuisson.
 *
 * F2, deuxième moitié, 15 septembre 2026. La première moitié avait été
 * corrigée le matin même dans `fournees.ts` → `repartition` : une boîte de
 * batch cooking n'annonce plus 200 g de flocons d'avoine pour 100 g pesés
 * quand on a dit qu'on ne les cuisait pas. `carteRepas.tsx`, lui, affichait
 * toujours `q.assiette` — c'est-à-dire `pesé × rendement` — pour TOUS les
 * aliments, cuisson choisie ou non. 100 g de riz marqués « tel quel »
 * s'annonçaient à 300 g dans la colonne « servi », et à 300 g / convives dans
 * la colonne « 1 pers. ».
 *
 * Les deux écrans se contredisaient donc sur le même aliment du même repas :
 * la carte disait 300 g, la boîte 100 g. Et c'est la carte qu'on lit devant
 * la balance.
 *
 * POURQUOI UN MODULE PLUTÔT QUE TROIS LIGNES DANS LE `.tsx`. Parce que c'est
 * exactement ce qui a produit F2 : la règle était juste dans `repartition` et
 * absente de l'écran. Écrite ici, elle se teste sans monter un composant, et
 * le test croisé plus bas (`poidsServi.test.ts`) refuse que les deux affichages
 * divergent à nouveau.
 */

/**
 * Ce que l'écran sait de la cuisson d'un aliment DANS CE REPAS.
 *
 * Les trois états de `Cuissons` (`fournees.ts`), vus depuis l'écran : un mode
 * résolu en ligne de la table, `null` quand on a décidé qu'on ne le cuit pas,
 * et `'a choisir'` tant que personne n'a tranché.
 */
export type ChoixDeCuisson = ModeCuisson | null | 'a choisir';

/** Les trois colonnes du tableau d'un repas : à peser, servi, 1 pers. */
export interface PoidsDeLaLigne {
  /** ce qu'on pose sur la balance — ne dépend jamais du rendement */
  aPeser: number;
  /** ce qui arrive dans le plat, pour tous les convives */
  servi: number;
  /** ce que s'en sert celui qui suit la diète */
  parPersonne: number;
}

/**
 * Les trois poids d'une ligne, ou `undefined` quand le solveur n'a rien servi.
 *
 * `undefined` et non zéro : l'écran l'écrit « — ». Vide n'est pas zéro
 * (règle 6) — un aliment qu'aucun gramme n'a rejoint n'est pas un aliment
 * qu'on sert à 0 g.
 */
export function poidsDeLaLigne(
  q: { aCuire: number; assiette: number } | undefined,
  cuisson: ChoixDeCuisson,
  portions: number,
): PoidsDeLaLigne | undefined {
  if (q === undefined) return undefined;

  /* SEUL LE `null` CORRIGE, et c'est l'arbitrage de `repartition` repris mot
     pour mot — pas un second arbitrage rendu ici.

     `q.assiette` vaut `pesé × rendement`, toujours : `convertir`, dans le
     solveur, ne sait rien des cuissons choisies. « Sans cuisson » est un
     CHOIX, et un choix se respecte : on annonce le poids de la balance.
     `'a choisir'` veut dire « personne n'a encore décidé » — on ne répond pas
     à sa place (règle 6), et `sansCuisson` le réclame déjà à l'écran. */
  const servi = cuisson === null ? q.aCuire : q.assiette;

  /* `Math.max(1, …)` COMME `repartition`, ET C'EST LE POINT DE L'AFFAIRE.
     On lisait ici `servi / portions`, quand `fournees.ts` écrit
     `servi / Math.max(1, r.convives)` : à zéro convive, la carte annonçait
     `Infinity` g par personne pendant que la boîte annonçait le poids entier.
     Deux écrans, deux réponses, pour le même aliment du même repas — la faute
     exacte que ce module existe pour fermer. Relevé par la revue le
     15 septembre 2026 ; le test croisé plus bas couvre désormais ce cas. */
  return { aPeser: q.aCuire, servi, parPersonne: servi / Math.max(1, portions) };
}
