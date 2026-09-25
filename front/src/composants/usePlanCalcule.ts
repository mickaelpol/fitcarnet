/**
 * LA CHAÎNE DE CALCUL DU PLAN, d'un bout à l'autre.
 *
 * `demandes` → `resultats` → `plat` → `cuissons` → `parFournee` / `boites`.
 * Neuf `useMemo` enchaînés, sortis de `app/(onglets)/repas.tsx` le
 * 15 septembre 2026 (rang 8 du lot 6 de l'audit).
 *
 * POURQUOI UN SEUL HOOK ET PAS NEUF. L'audit l'avait vu : les écrans
 * « correction du plan » et « batch cooking » partagent cette chaîne, et c'est
 * la vraie dépendance entre eux. Elle est cohésive — chaque maillon n'a besoin
 * que du précédent — donc elle se déplace entière. La couper en morceaux
 * rendrait à l'écran la charge de les rebrancher dans le bon ordre, ce qui est
 * exactement ce qu'on lui retire.
 *
 * LES FORMULES NE SONT PAS ICI : `calcul/planCalcule.ts` pour la traduction et
 * le regroupement, `solveur/composer` pour le calcul, `calcul/cuisson` pour les
 * fournées et les boîtes. Ce hook ne fait que les enchaîner et se souvenir.
 *
 * CE HOOK NE S'APPELLE QU'UNE FOIS, ET C'EST UNE CONTRAINTE, PAS UN USAGE.
 *
 * `useFrigoCalculable` peut être appelé par plusieurs composants — ses requêtes
 * sont partagées par le cache et ses `useMemo` ne coûtent rien. Celui-ci NON.
 * Le 15 septembre 2026, le rang 8 a envisagé de le faire appeler par
 * `etapeBatch.tsx` pour lui retirer quatre props. Trois raisons l'ont interdit,
 * dans l'ordre où elles comptent :
 *
 * 1. `cuissonsChoisies` est un `useState` D'ICI. Une seconde instance a le sien,
 *    vide. Mesuré sur un riz dont l'habitude dit « à l'eau » et que
 *    l'utilisateur met au four : la première instance rend le mode 7, la
 *    seconde le mode 4, et compte encore un aliment « à situer ». L'écran de
 *    batch cooking aurait affiché la mauvaise fournée — un chiffre faux sur
 *    l'écran devant lequel on cuisine.
 * 2. `resoudreLaPeriode` + `listeDeCourses` coûtent 4,2 ms pour un plan de sept
 *    jours sur 60 aliments (mesuré). Les jouer deux fois par invalidation de la
 *    chaîne est un prix qu'aucune prop ne vaut.
 * 3. Le compte serait perdant : quatre props sorties, six entrées (`plan`,
 *    `joursRetenus`, `portions`, `cibles`, `stock`, `stockDe`).
 *
 * Si quelqu'un veut retenter, il faut d'abord sortir `cuissonsChoisies` d'ici —
 * et alors le point 2 reste entier.
 *
 * L'ORDRE DES `useMemo` ET LEURS DÉPENDANCES SONT LE FOND DU SUJET. La chaîne
 * se recalcule en cascade ; une dépendance oubliée fige un résultat périmé
 * sans rien afficher, et l'écran montre alors des boîtes qui ne correspondent
 * plus au plan. Les `?? []` et `?? {}` restent DANS les `useMemo`, avec la
 * dépendance sur `…​.data` : les hisser dehors donnerait un objet neuf à chaque
 * rendu et relancerait le solveur sur toute la période à chaque frappe.
 */

import { useCallback, useMemo, useState } from 'react';
import { useEnregistrerCuissons, useMesCuissons, useModesCuisson } from '../api/hooks';
import type { Cible } from '../api/types';
import type { Aliment } from '../solveur/types';
import type { AuMieux, DemandeDatee } from '../solveur/composer';
import { listeDeCourses, resoudreLaPeriode } from '../solveur/composer';
import type { Compose } from '../calcul/demandeRepas';
import type { Cuissons } from '../calcul/cuisson';
import {
  cleDeCuisson, enFournees, lignesDHabitudes, repartition, resteSansCuisson, sansCuisson,
} from '../calcul/cuisson';
import { cuissonsEffectives, demandesDuPlan, mettreAPlat } from '../calcul/planCalcule';

export function usePlanCalcule({
  plan, joursRetenus, portions, cibles, stock, stockDe,
}: {
  plan: Record<string, Compose> | null;
  joursRetenus: readonly number[];
  portions: Record<string, number>;
  /** la réponse brute de la requête : le `?? []` appartient aux `useMemo` */
  cibles: readonly Cible[] | undefined;
  stock: Aliment[];
  stockDe: (a: Aliment) => number;
}) {
  const modesCuisson = useModesCuisson();
  /* Les cuissons déjà décidées les fois précédentes. Elles ne DÉCIDENT rien :
     elles pré-remplissent, et l'utilisateur change ce qu'il veut. */
  const mesCuissons = useMesCuissons();
  const enregistrerCuissons = useEnregistrerCuissons();

  /* Les cuissons choisies À LA MAIN pour ce plan, par repas et par aliment.
     Rien n'est stocké sur la fiche de l'aliment : les mêmes pommes de terre
     passent au four ce soir et à la vapeur demain. Clé : « jour|repas|id ».

     Cet état ne contient QUE les choix explicites. Les habitudes se superposent
     dessous (voir `cuissons`) plutôt que d'être recopiées ici : recopier
     obligerait à savoir quand recopier, à ne pas écraser ce que l'utilisateur
     vient de faire, et à distinguer « il n'a pas encore choisi » de « il a
     choisi la même chose ». Trois questions qui ne se posent pas si le défaut
     reste en dessous. */
  const [cuissonsChoisies, setCuissonsChoisies] = useState<Cuissons>({});

  /* Les demandes du plan, dans l'ordre du temps. Sert deux fois : au calcul
     réel, bridé par le frigo, et à la liste de courses, frigo plein. */
  const demandes = useMemo(
    (): DemandeDatee[] => demandesDuPlan(plan, joursRetenus, portions, cibles ?? []),
    [plan, cibles, portions, joursRetenus],
  );

  /* TOUTE la période résolue EN UNE PASSE, sur un frigo qui se vide. Chaque
     repas se plafonnait déjà à ce qu'il restait ; aucun ne savait que les
     autres avaient servi avant lui — ni hier. */
  const resultats = useMemo(
    () => (demandes.length === 0
      ? new Map<string, AuMieux>()
      : resoudreLaPeriode(demandes, stockDe, stock)),
    [demandes, stockDe, stock],
  );

  /* Ce qu'il faut acheter pour tenir le plan. Calculé frigo plein puis diminué
     du stock réel : le solveur CONTOURNE une pénurie au lieu de la subir, donc
     compter les manques du plan répondrait « rien ». */
  const aAcheter = useMemo(
    () => (demandes.length === 0 ? [] : listeDeCourses(demandes, stockDe, stock)),
    [demandes, stockDe, stock],
  );

  const plat = useMemo(
    () => mettreAPlat(resultats, joursRetenus, portions),
    [resultats, joursRetenus, portions],
  );

  /* Tes habitudes, puis tes choix par-dessus. Tout le reste de l'écran lit
     CETTE valeur — le compteur d'aliments à situer, les fournées, les boîtes. */
  const cuissons = useMemo(
    () => cuissonsEffectives(plat, mesCuissons.data ?? {}, cuissonsChoisies),
    [plat, mesCuissons.data, cuissonsChoisies],
  );

  /* Ce que ce plan a décidé, tel quel, sans le trier.
     
     LE `?? {}` A DISPARU D'ICI, ET C'ÉTAIT UN DÉFAUT, pas une précaution. On
     passait `mesCuissons.data ?? {}` comme « ce qui est déjà connu » : requête
     en pause — hors ligne — `data` valait `undefined`, l'écran croyait ne rien
     connaître et déclarait TOUTE cuisson du plan comme nouvelle. Une trentaine
     de `maj_le` repoussés sans raison, à chaque retour de réseau.

     Ce qui est déjà connu ne regarde plus l'écran : le serveur le sait, et lui
     seul peut le savoir sans se tromper. Mesuré et corrigé le 25 septembre 2026. */
  const cuissonsAEnvoyer = useMemo(
    () => lignesDHabitudes(plat, cuissons),
    [plat, cuissons],
  );

  const parFournee = useMemo(
    () => enFournees(plat, cuissons, modesCuisson.data ?? []),
    [plat, cuissons, modesCuisson.data],
  );

  const restentASituer = useMemo(() => sansCuisson(plat, cuissons), [plat, cuissons]);

  const boites = useMemo(() => repartition(plat, cuissons), [plat, cuissons]);

  /**
   * Retenir ce qui vient d'être décidé — au passage au batch cooking.
   *
   * C'est le moment JUSTE : l'utilisateur vient de finir de régler ses
   * cuissons, il ne reviendra pas dessus. Écrire plus tôt — à chaque appui
   * dans le sélecteur — enregistrerait des aller-retours d'hésitation ; écrire
   * plus tard, à l'enregistrement du plan, raterait les plans qu'on consulte
   * sans enregistrer.
   *
   * L'échec ne bloque RIEN et ne s'affiche pas. Une habitude perdue coûte un
   * appui la semaine prochaine ; interrompre quelqu'un qui va cuisiner pour lui
   * dire qu'un défaut n'a pas été mémorisé coûte plus cher que ça.
   */
  const retenirLesCuissons = useCallback(() => {
    /* Un plan dont AUCUNE cuisson n'est décidée n'a rien à dire : on ne part
       pas pour un lot vide. Un plan dont rien n'a CHANGÉ, en revanche, part
       comme les autres — c'est le serveur qui verra qu'il n'y a rien à écrire,
       et il répondra `{"enregistrees": 0}` sans toucher un seul `maj_le`. */
    if (cuissonsAEnvoyer.length === 0) return;
    enregistrerCuissons.mutate(cuissonsAEnvoyer, { onError: () => {} });
  }, [cuissonsAEnvoyer, enregistrerCuissons]);

  /** Un aliment de ce repas se cuit comme ceci — `null` : il se mange tel quel. */
  const noterLaCuisson = useCallback(
    (cleRepas: string, aliment: Aliment, mode: number | null) => setCuissonsChoisies(
      (c) => ({ ...c, [cleDeCuisson(cleRepas, aliment)]: mode })),
    [],
  );

  /**
   * « Tout le reste se mange tel quel », d'un geste.
   *
   * On part des cuissons EFFECTIVES, habitudes comprises. Partir des seuls
   * choix explicites marquerait « sans cuisson » un riz dont l'habitude dit
   * « à l'eau » — une réponse fausse, posée par un bouton censé ne remplir que
   * les trous.
   */
  const reglerToutLeReste = useCallback(
    () => setCuissonsChoisies(resteSansCuisson(plat, cuissons)), [plat, cuissons]);

  /** Un plan enregistré est fini : le suivant commence sur une page blanche. */
  const oublierLesCuissons = useCallback(() => setCuissonsChoisies({}), []);

  return {
    modesCuisson, mesCuissons,
    demandes, resultats, aAcheter, plat, cuissons, cuissonsAEnvoyer,
    parFournee, restentASituer, boites,
    retenirLesCuissons, noterLaCuisson, reglerToutLeReste, oublierLesCuissons,
  };
}
