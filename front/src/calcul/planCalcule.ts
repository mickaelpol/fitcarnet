/**
 * LA CHAÎNE DE CALCUL DU CALCULATEUR, dans sa part PURE.
 *
 * Sortie de `app/(onglets)/repas.tsx` le 15 septembre 2026 (rang 8 du lot 6
 * de l'audit). L'écran enchaînait neuf `useMemo` —
 * `stock` → `demandes` → `resultats` → `plat` → `cuissons` → `boites` — dont
 * pas un seul n'avait de test : `tsconfig.tests.json` ne compile que `src`,
 * et un test posé dans `app/` n'est jamais exécuté, sans le moindre signal.
 *
 * CE MODULE NE CONTIENT QUE CE QUI EST PUR. Les `useMemo` et les requêtes
 * restent dans `composants/useFrigoCalculable.ts` et
 * `composants/usePlanCalcule.ts` : un hook React n'est pas testable ici, le
 * projet n'embarquant ni `@testing-library` ni `react-test-renderer`. Ce qui
 * peut descendre plus bas descend plus bas.
 *
 * AUCUNE FORMULE N'EST ÉCRITE ICI. Les macros viennent de `demandeRepas`, le
 * solveur de `solveur/composer`, les cuissons de `calcul/cuisson`. Ce module
 * TRADUIT et REGROUPE, il ne calcule pas un gramme.
 */

import { poidsConnu } from './frigo';
import { stockEnGrammes } from './frigo';
import type { AlimentDisponible, Cible } from '@/api/types';
import type { Aliment } from '@/solveur/types';
import type { AuMieux, DemandeDatee, Repas as Creneau } from '@/solveur/composer';
/* Valeur, donc chemin RELATIF : `tsc -p tsconfig.tests.json` ne réécrit pas
   l'alias `@/`, et le `require('@/solveur/composer')` casserait en
   MODULE_NOT_FOUND au `node --test`, pas au typage. */
import { REPAS, cleDuRepas } from '../solveur/composer';
import type { Compose } from './demandeRepas';
import { demandePour, vers } from './demandeRepas';
import type { Cuissons, Habitudes, Repas as RepasAPlat } from './cuisson';
import { depuisLesHabitudes } from './cuisson';

/**
 * Les aliments du frigo que le calculateur peut employer.
 *
 * Trois refus, et chacun évite un chiffre faux plutôt qu'une gêne :
 * un litre ou un pack n'ont pas de poids (`grammesParUnite` inconnu) et les
 * macros sont pour 100 g ; ce qui n'est plus en stock ne se cuisine pas ; et
 * un aliment sans énergie déclarée, servi comme s'il valait zéro, fausserait
 * tout le repas autour de lui.
 */
export function alimentsCalculables(
  aliments: readonly AlimentDisponible[],
): Aliment[] {
  return aliments
    .filter((a) => poidsConnu(a) && a.stock > 0 && a.kcal100 > 0)
    .map(vers);
}

/**
 * Combien il y en a VRAIMENT, en grammes à cuire.
 *
 * C'est ce qui empêche le calculateur de réclamer 327 g de saumon quand il
 * n'y en a que 200. Indexé par `reference`, qui est l'`id` que `vers` donne à
 * l'aliment du solveur — les deux clés sont la même, et doivent le rester.
 *
 * TOUT le frigo, pas seulement `alimentsCalculables` : un aliment dont
 * l'énergie manque n'est pas servi, mais son poids reste vrai.
 */
export function grammesEnStock(
  aliments: readonly AlimentDisponible[],
): Map<Aliment['id'], number> {
  const m = new Map<Aliment['id'], number>();
  for (const a of aliments) {
    /* `stockEnGrammes` ET NON LA FORMULE : la garde du serveur refuse un
       facteur nul, celle-ci l'acceptait et posait « 0 g » en stock. */
    const g = stockEnGrammes(a);
    if (g !== null) m.set(a.reference, g);
  }

  return m;
}

/**
 * Les fibres pour 100 g, par aliment.
 *
 * Elles ne sont pas des macros pour le solveur — elles n'entrent dans aucune
 * cible — mais elles pèsent 2 kcal par gramme. Sans elles à l'écran, le total
 * de calories d'un repas paraît sorti de nulle part.
 *
 * `?? 0` ici et NULLE PART AILLEURS : c'est un affichage, et une fibre
 * inconnue s'y affiche à zéro faute de mieux. `vers` garde la distinction
 * pour le calcul, et `alimentsSansFibresConnues` la dit à l'écran.
 */
export function fibresPar100(
  aliments: readonly AlimentDisponible[],
): Map<Aliment['id'], number> {
  const m = new Map<Aliment['id'], number>();
  for (const a of aliments) m.set(a.reference, a.fibres100 ?? 0);

  return m;
}

/**
 * Combien il y en a vraiment, DISPONIBLE — stock moins ce qui est promis.
 *
 * Le plancher à zéro compte : un frigo négatif n'existe pas, et le solveur le
 * lirait comme une dette à rembourser sur les repas suivants.
 */
export function grammesDisponibles(
  enStock: ReadonlyMap<Aliment['id'], number>,
  promis: ReadonlyMap<Aliment['id'], number>,
  a: Aliment,
): number {
  return Math.max(0, (enStock.get(a.id) ?? 0) - (promis.get(a.id) ?? 0));
}

/** Au moins une cible compte-t-elle les fibres dans ses glucides ? */
export function cibleEnGlucidesTotaux(cibles: readonly Cible[]): boolean {
  return cibles.some((c) => c.glucidesTotaux === true);
}

/**
 * LES FIBRES INCONNUES, QUAND LA CIBLE LES COMPTE.
 *
 * Une cible en glucides TOTAUX additionne glucides et fibres. Un aliment dont
 * les fibres sont inconnues est alors compté comme s'il n'en avait aucune — et
 * le solveur en sert davantage pour atteindre le chiffre : un pain complet à
 * 42 g de glucides et 7 g de fibres inconnues fait peser 143 g au lieu de 122.
 * Dix-sept pour cent de féculent en trop, quatre fois par jour.
 *
 * On ne corrige pas à la place de l'utilisateur — inventer 7 g de fibres
 * serait pire que de les ignorer. On NOMME les aliments concernés, une fois,
 * et seulement quand la cible rend le problème réel.
 */
export function alimentsSansFibresConnues(
  aliments: readonly AlimentDisponible[],
  cibles: readonly Cible[],
): string[] {
  if (!cibleEnGlucidesTotaux(cibles)) return [];

  return aliments
    .filter((a) => a.fibres100 === null || a.fibres100 === undefined)
    /* Les fibres d'une huile ou d'un blanc de poulet sont nulles, pas
       inconnues : les signaler noierait les vrais cas. On ne parle que de ce
       qui en contient forcément. */
    .filter((a) => a.categorie === 'fec' || a.categorie === 'leg'
      || a.categorie === 'fruit' || a.categorie === 'ole')
    .map((a) => a.nom);
}

/** La cible de ce créneau, s'il y en a une. */
export function cibleDuRepas(
  cibles: readonly Cible[],
  repas: Creneau,
): Cible | undefined {
  return cibles.find((c) => c.repas === repas);
}

/**
 * Les demandes du plan, dans l'ordre du temps.
 *
 * Sert deux fois : au calcul réel, bridé par le frigo, et à la liste de
 * courses, frigo plein. Un repas sans composition ou sans cible n'en produit
 * aucune — on ne demande pas au solveur d'atteindre un objectif qui n'existe
 * pas.
 *
 * LE RANG DU CALENDRIER SERT DIRECTEMENT DE RANG DE PÉRIODE : le solveur ne
 * s'en sert que pour ordonner et pour nommer sa sortie. Lui passer un index à
 * part obligerait à retraduire ses clés, et une erreur de traduction
 * attribuerait les repas d'un jour à un autre — sans que rien ne le signale.
 * Un seul système de numérotation.
 */
export function demandesDuPlan(
  plan: Readonly<Record<string, Compose>> | null,
  joursRetenus: readonly number[],
  portions: Readonly<Record<string, number>>,
  cibles: readonly Cible[],
): DemandeDatee[] {
  if (plan === null) return [];
  const out: DemandeDatee[] = [];

  for (const rang of joursRetenus) {
    for (const repas of REPAS) {
      const cle = cleDuRepas(rang, repas);
      const compose = plan[cle];
      const cible = cibleDuRepas(cibles, repas);
      if (compose === undefined || cible === undefined) continue;
      out.push({ ...demandePour(repas, compose, portions[cle] ?? 1, cible), jour: rang });
    }
  }

  return out;
}

/**
 * Le plan mis à plat, tel que `enFournees` l'attend : un repas, ses quantités.
 *
 * Ce regroupement ne recalcule RIEN — il reprend ce que le solveur a déjà
 * résolu, et c'est la garantie qu'un regroupement ne peut pas fausser un
 * gramme.
 *
 * L'ordre est celui du TEMPS, pas celui d'une `Map` : on remplit ses boîtes
 * dans l'ordre où on les mangera.
 */
export function mettreAPlat(
  resultats: ReadonlyMap<string, AuMieux>,
  joursRetenus: readonly number[],
  portions: Readonly<Record<string, number>>,
): RepasAPlat[] {
  return joursRetenus.flatMap((rang) => REPAS
    .map((repas) => cleDuRepas(rang, repas))
    .filter((cle) => resultats.has(cle))
    .map((cle) => ({
      cle,
      convives: portions[cle] ?? 1,
      quantites: resultats.get(cle)!.resultat.quantites,
    })));
}

/**
 * LES CUISSONS EFFECTIVES : tes habitudes, puis tes choix par-dessus.
 *
 * Deux couches, jamais une seule. Ce qui vient des habitudes est un DÉFAUT ;
 * ce que tu touches à l'écran passe toujours devant, et le reste devant même
 * si l'habitude change entre-temps. C'est ce qui rend un choix explicite
 * indéracinable, sans un seul effet de bord.
 *
 * Tout le reste de l'écran lit CETTE valeur — le compteur d'aliments à situer,
 * les fournées, les boîtes. Un endroit du code qui lirait encore les seuls
 * choix explicites verrait un plan à moitié réglé et redemanderait des
 * cuissons déjà connues.
 */
export function cuissonsEffectives(
  plat: readonly RepasAPlat[],
  habitudes: Habitudes,
  choisies: Cuissons,
): Cuissons {
  return { ...depuisLesHabitudes(plat, habitudes), ...choisies };
}
