/**
 * CE QUE LE FRIGO PERMET — la première moitié de la chaîne du calculateur.
 *
 * Sortie de `app/(onglets)/repas.tsx` le 15 septembre 2026 (rang 8 du lot 6
 * de l'audit). Sept dérivés du frigo vivaient dans l'écran, tous en amont du
 * solveur : le stock utilisable, ce qu'il en reste vraiment une fois retiré ce
 * qui est promis à un plan prévu, les fibres, les valeurs qui ne peuvent pas
 * être vraies.
 *
 * LES FORMULES NE SONT PAS ICI. Ce hook n'est que du câblage : trois requêtes,
 * sept `useMemo`, et la mémoire des dépendances. Tout ce qui décide quelque
 * chose est dans `calcul/planCalcule.ts`, avec ses tests — un hook n'est pas
 * testable dans ce projet, qui n'embarque ni `@testing-library` ni
 * `react-test-renderer`.
 *
 * LES `?? []` RESTENT DANS LES `useMemo`, ET LES DÉPENDANCES SUR `data`. Les
 * hisser à l'appel donnerait un tableau neuf à chaque rendu, et
 * `resoudreLaPeriode` — le solveur, sur toute la période — repartirait de zéro
 * à chaque frappe de clavier de l'écran.
 */

import { useCallback, useMemo } from 'react';
import { useCibles, useMonFrigo, usePlans } from '../api/hooks';
import type { Cible } from '../api/types';
import type { Aliment } from '../solveur/types';
import type { Repas } from '../solveur/composer';
import {
  alimentsCalculables, alimentsSansFibresConnues, cibleDuRepas, fibresPar100,
} from '../calcul/planCalcule';

export function useFrigoCalculable() {
  const frigo = useMonFrigo();
  const cibles = useCibles();
  const plans = usePlans();

  /* Le calculateur ne travaille qu'avec ce qui a un poids connu : un litre ou
     un pack n'entrent pas dans un calcul de macros pour 100 g. Un aliment sans
     énergie non plus — l'écrire à zéro fausserait tout le repas. */
  const stock = useMemo(
    () => alimentsCalculables(frigo.data?.aliments ?? []), [frigo.data]);

  /**
   * CE QUI RESTE VRAIMENT, EN GRAMMES À CUIRE — rendu par le serveur.
   *
   * C'est ce qui empêche le calculateur de réclamer 327 g de saumon quand il
   * n'y en a que 200, ET ce qui empêche deux batch cooking d'affilée de
   * compter deux fois le même frigo : on compose lundi-mercredi, on
   * enregistre ; on compose jeudi-samedi, et le solveur repartait du stock
   * d'avant. Le premier plan avait beau vider les 800 g de poulet, le second
   * annonçait « objectifs atteints » sur du poulet qui n'existait plus — et
   * rien ne le disait, puisque chaque plan était juste tout seul.
   *
   * CE FRONT LE CALCULAIT (`grammesEnStock` + `dejaPromis` +
   * `grammesDisponibles`, supprimés au palier B, le 21 septembre 2026). Les
   * deux entrées venaient du serveur et l'écran n'en modifiait aucune : c'est
   * le cas où le chiffre se rend, plutôt que la règle se transmette.
   *
   * `?? 0` REPREND LE COMPORTEMENT D'AVANT À L'IDENTIQUE : un aliment sans
   * poids par unité n'avait pas d'entrée dans `grammesEnStock`, et
   * `grammesDisponibles` rendait alors 0. Le solveur ne les voit de toute
   * façon pas — `alimentsCalculables` les écarte plus haut.
   */
  const disponible = useMemo(() => new Map<Aliment['id'], number>(
    (frigo.data?.aliments ?? []).map((a) => [a.reference, a.grammesDisponibles ?? 0])),
  [frigo.data]);

  const stockDe = useCallback((a: Aliment) => disponible.get(a.id) ?? 0, [disponible]);

  /* Les fibres ne sont pas des macros pour le solveur — elles n'entrent dans
     aucune cible — mais elles pèsent 2 kcal par gramme. Sans elles à l'écran,
     le total de calories d'un repas paraît sorti de nulle part. */
  const fibres = useMemo(
    () => fibresPar100(frigo.data?.aliments ?? []), [frigo.data]);

  const fibresDe = useCallback((a: Aliment) => fibres.get(a.id) ?? 0, [fibres]);

  /* Ce que les données racontent et qui ne peut pas être vrai.
     Le solveur est juste ; il ne peut rien contre un aliment dont les valeurs
     mentent. Des valeurs de riz CUIT posées sur un riz qu'on pèse sec se
     calculent parfaitement — et font peser trois fois trop. On le dit AVANT
     de composer, pas après avoir mangé. */
  /* LES ANOMALIES VIENNENT DU SERVEUR — 20 septembre 2026. Elles étaient
     déduites ici par `verifierCatalogue`, c'est-à-dire que ce front portait
     quatorze règles métier que tout autre front aurait dû réécrire, et
     potentiellement oublier.

     Elles arrivent avec le frigo, sans aller-retour de plus : les données
     étaient déjà là, et les redemander aurait coûté un appel pour rien —
     le même argument que pour `incomplets`.

     `?? []` et non un calcul de repli : pendant le chargement il n'y a pas
     « aucune anomalie », il n'y a pas encore de réponse. Un repli local
     réintroduirait exactement le juge qu'on vient de retirer. */
  const anomalies = frigo.data?.anomalies ?? [];

  /* La dépendance est `cibles.data` et non le seul booléen « la cible
     compte-t-elle les fibres ». L'écran dépendait du booléen : correct
     aujourd'hui, faux le jour où le filtre lira autre chose de la cible, et
     une dépendance oubliée fige un résultat périmé sans rien afficher. Le
     filtre est un parcours de liste — le recalculer à chaque rafraîchissement
     des cibles ne coûte rien. */
  const sansFibresConnues = useMemo(
    () => alimentsSansFibresConnues(frigo.data?.aliments ?? [], cibles.data ?? []),
    [frigo.data, cibles.data],
  );

  const cibleDe = useCallback(
    (repas: Repas): Cible | undefined => cibleDuRepas(cibles.data ?? [], repas),
    [cibles.data]);

  return {
    frigo, cibles, plans,
    stock, stockDe, fibresDe, anomalies, sansFibresConnues, cibleDe,
  };
}
