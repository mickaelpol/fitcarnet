/**
 * LES HOOKS D'API, PAR DOMAINE — ET UNE SEULE PORTE POUR LES ÉCRANS.
 *
 * `src/api/hooks.ts` faisait 1 191 lignes et dix domaines sans rapport les uns
 * avec les autres. Rien ne les liait : aucune variable partagée d'un bandeau de
 * commentaire à l'autre, vérifié au découpage. En revanche la distance cachait
 * de vraies dépendances — la lecture des modes de cuisson vivait 140 lignes
 * avant les mutations qui l'invalident, et la règle « les DECIMAL partent en
 * chaînes » était réécrite trois fois parce qu'elle a été oubliée trois fois
 * (les commentaires de l'époque le disaient eux-mêmes).
 *
 * CE BARIL EXISTE POUR QUE LES 18 ÉCRANS N'AIENT RIEN À CHANGER : ils
 * continuent d'écrire `from '@/api/hooks'`. Ce qui n'était pas public avant ne
 * l'est pas devenu — `REFERENTIEL` et les adaptateurs de `decimales.ts` sont
 * exportés pour leurs voisins, pas pour les écrans, et ne sont donc pas
 * ré-exportés ici. Un nouveau domaine s'ajoute par un fichier et une ligne.
 *
 * Découpage du 15 septembre 2026, rang 5 du lot 6 de l'audit. Mécanique :
 * aucun comportement n'a changé.
 */

export * from './auth';
export { useAliments, useExercices, useExerciceDetail, useMajExercice, useFusionExercices }
  from './referentiels';
export * from './frigo';
export * from './cuissons';
export * from './plans';
export * from './nutrition';
export * from './seances';
export * from './comptes';
export type { AlimentEcriture } from './decimales';
