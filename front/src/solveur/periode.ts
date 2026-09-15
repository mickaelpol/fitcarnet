import { type AuMieux, resoudreAuMieux } from './auMieux';
import { REPAS, type Repas, type Role } from './repasVocabulaire';
import type { Aliment, Cibles, Fixe, Variables } from './types';

/**
 * UNE JOURNÉE, UNE PÉRIODE — UN SEUL FRIGO.
 *
 * La couche la plus haute du solveur : elle enchaîne les repas dans l'ordre du
 * temps sur un stock qui décroît, et en déduit la liste de courses. Elle
 * n'appelle que `resoudreAuMieux` ; tout le mécanisme de plafonnement et de
 * relève vit en dessous.
 *
 * Extrait de `composer.ts` le 15 septembre 2026 (rang 6 du lot 6 de l'audit).
 * Découpage mécanique : aucune ligne de logique n'a changé.
 */

/** Un repas prêt à résoudre, tel que l'écran l'a corrigé. */
export interface DemandeRepas {
  repas: Repas;
  variables: Variables;
  fixes: Fixe[];
  /** cibles DÉJÀ multipliées par le nombre de convives */
  cibles: Cibles;
  /** les rôles que l'utilisateur a choisis lui-même */
  verrous: ReadonlySet<Role>;
  glucidesTotaux: boolean;
  /**
   * CE DONT ON DISPOSE POUR CE REPAS-LÀ, quand l'utilisateur l'a déclaré.
   *
   * « Il me reste 290 g de pommes de terre » : un PLAFOND, pas une quantité
   * imposée. Le calcul en sert ce qu'il faut pour tenir les cibles, jamais
   * plus. Avant, une telle déclaration figeait la quantité et sortait
   * l'aliment des variables — on se retrouvait à ajuster les autres à
   * l'aveugle pour rattraper une colonne qu'on n'avait pas demandée.
   *
   * PAR ALIMENT ET PAR REPAS, et c'est tout l'intérêt d'être ici plutôt que
   * dans `stockDe` : un fond de casserole annoncé ce midi ne doit pas brider
   * le dîner de jeudi.
   *
   * Les grammes s'entendent dans l'unité du STOCK — celle de la colonne
   * « à cuire », donc l'aliment cru ou sec. L'appelant convertit.
   */
  plafonds?: Readonly<Record<string, number>>;
  /**
   * QUI PREND LE RELAIS QUAND UN ALIMENT MANQUE, choisi par l'utilisateur.
   *
   * Par rôle, parce que c'est le rôle qui manque — « il n'y a plus assez de
   * féculent » — et non l'aliment en particulier. Absent : le calcul prend le
   * premier candidat valable, comme avant.
   */
  releves?: Readonly<Partial<Record<Role, Aliment>>>;
}

/**
 * Résout plusieurs repas qui PARTAGENT le même frigo.
 *
 * Chaque repas savait déjà se plafonner à ce qu'il restait. Ce qu'aucun ne
 * savait, c'est que les autres puisent dans le même stock : composés
 * séparément, le déjeuner et le dîner réclamaient chacun 400 g de brocoli
 * quand il n'en restait que 500. Deux repas annoncés justes, dont un
 * impossible, et rien ne le disait.
 *
 * Le partage se fait DANS L'ORDRE DES REPAS — matin, midi, 16 h, soir.
 * Chacun prend ce dont il a besoin, le suivant compose sur ce qui reste. Le
 * dernier hérite donc du manque, et c'est voulu : mieux vaut trois repas
 * justes et un recomposé autour de ce qui reste que quatre repas légèrement
 * faux. Un manque n'est jamais tu — il est plafonné, annoncé, et confié à un
 * autre aliment du même rôle quand il y en a un.
 *
 * Rien de neuf dans le mécanisme : c'est `ajusterAuStock` qui travaille, avec
 * un stock qui décroît au fil de la journée au lieu de repartir intact à
 * chaque repas.
 */
export function resoudreLaJournee(
  demandes: readonly DemandeRepas[],
  stockDe: (a: Aliment) => number,
  candidats: Aliment[],
): Map<Repas, AuMieux> {
  /* ON NE RELIT PAS LA CLÉ : ON LA REDEMANDE À CELLE QUI L'ÉCRIT.
     Ici vivait un `cle.split('|')[1] as Repas` — vingt lignes au-dessus de
     `lireLaCle`, la fonction qui se déclare seule à savoir lire cette clé.
     Relevé par la revue le 15 septembre 2026, le jour même où `lireLaCle` a
     été écrite : le jumeau oublié, dans le fichier même.
     `lireLaCle` aurait fait l'affaire, mais s'en passer vaut mieux : les
     journées sont toutes au jour 0, donc `cleDuRepas(0, d.repas)` désigne
     exactement l'entrée cherchée. Aucune assertion, aucun repli à choisir, et
     un sens de lecture en moins à tenir. */
  const parCle = resoudreLaPeriode(
    demandes.map((d) => ({ ...d, jour: 0 })), stockDe, candidats);

  const sorties = new Map<Repas, AuMieux>();
  for (const d of demandes) {
    const sortie = parCle.get(cleDuRepas(0, d.repas));
    if (sortie !== undefined) sorties.set(d.repas, sortie);
  }

  return sorties;
}

/** Un repas situé dans le temps : le même besoin, plus le jour où il tombe. */
export interface DemandeDatee extends DemandeRepas {
  /**
   * Le jour, en RANG. Aucune date ici : le solveur n'a besoin que de l'ORDRE,
   * et une date l'obligerait à connaître un fuseau, un calendrier et un
   * changement d'heure pour répondre « lequel vient d'abord ».
   *
   * N'importe quelle numérotation croissante convient — 0,1,2 ou 0,3,7 — du
   * moment qu'elle est la même que celle de l'écran : les clés de sortie la
   * reprennent telle quelle, donc l'appelant retrouve ses repas sans avoir à
   * retraduire. Une traduction de plus, c'est une occasion de plus
   * d'attribuer les repas d'un jour à un autre.
   */
  jour: number;
}

/** La clé d'un repas dans une période : « 2|R3 » pour le 16 h du 3e jour. */
export const cleDuRepas = (jour: number, repas: Repas): string => `${jour}|${repas}`;

/**
 * L'INVERSE DE `cleDuRepas`, ET IL VIT ICI PARCE QUE LA CLÉ EST DÉFINIE ICI.
 *
 * QUATRE endroits la découpaient à la main, et aucun ne la validait. Ce
 * commentaire en a d'abord annoncé DEUX — il mentait le jour de son écriture,
 * et c'est la revue qui a compté :
 *
 *   - `app/(onglets)/repas.tsx` faisait `Number(rang)` : une clé malformée
 *     donnait un libellé de jour `NaN` à l'écran, sans un mot ;
 *   - `calcul/planFige.ts` écrivait `split('|')[1] as MomentDuRepas`, une
 *     assertion qui ment sans rien dire dès que la clé change de forme ;
 *   - `resoudreLaJournee`, VINGT LIGNES PLUS HAUT dans ce fichier même ;
 *   - `composants/etapeBatch.tsx`, sur un chemin d'affichage vivant.
 *
 * Les deux derniers n'avaient pas besoin de lire la clé du tout : ils la
 * redemandent maintenant à `cleDuRepas`, ou reçoivent le repas directement.
 *
 * Rassemblés ici le 15 septembre 2026. Une clé se lit là où elle s'écrit,
 * sinon les deux règles divergent — et celle qui produit dit toujours vrai,
 * celle qui lit se trompe en silence.
 *
 * Rend `null` plutôt que d'inventer : une clé illisible n'est pas le jour 0.
 */
export function lireLaCle(cle: string): { jour: number; repas: Repas } | null {
  /* DEUX MORCEAUX, PAS « AU MOINS DEUX ». Sans ce compte, « 2|R2|R3 » passait :
     le troisieme morceau etait simplement ignore, et la cle acceptee. Trouve
     par le test avant que le code ne parte. */
  const morceaux = cle.split('|');
  if (morceaux.length !== 2) return null;

  const [brut, repas] = morceaux as [string, string];
  const jour = Number(brut);

  if (brut === '' || !Number.isInteger(jour) || jour < 0) return null;
  if (!REPAS.includes(repas as Repas)) return null;

  return { jour, repas: repas as Repas };
}

/**
 * TOUTE LA PÉRIODE PARTAGE UN SEUL FRIGO.
 *
 * C'est l'extension littérale de la journée, et le mécanisme ne change pas
 * d'un iota : les repas sont résolus dans l'ordre du temps — jour 0 matin,
 * jour 0 midi, … jour 3 soir — sur un stock qui décroît. Le premier repas
 * planifié est servi en entier, le dernier hérite du manque.
 *
 * C'EST UN CHOIX, ET IL A UN PRIX. Un frigo qui doit tenir cinq jours
 * s'épuisera, et les derniers repas seront recomposés autour de ce qui reste
 * — parfois jusqu'à ne plus tomber sur leurs cibles. C'est la réalité qu'on
 * veut voir : mieux vaut savoir dès le lundi que le jeudi ne passera pas que
 * de le découvrir jeudi soir devant un frigo vide. Rien n'est tu, chaque
 * plafonnement est annoncé.
 *
 * L'alternative — chaque jour repart d'un frigo plein — dirait ce qu'il FAUT
 * sans jamais dire ce qui MANQUE. Elle sert un autre besoin, celui de la
 * liste de courses, et se calcule en passant un stock infini.
 */
export function resoudreLaPeriode(
  demandes: readonly DemandeDatee[],
  stockDe: (a: Aliment) => number,
  candidats: Aliment[],
  /**
   * Ignorer les restes déclarés — réservé à la passe « frigo plein ».
   *
   * Un plafond décrit LE FRIGO, pas le plan. `listeDeCourses` résout une
   * seconde fois avec un stock infini pour savoir ce que le plan réclame
   * idéalement ; le plafond y survivait et devenait le seul frein, si bien que
   * déclarer « il me reste 80 g de riz » faisait SOUS-ACHETER — jusqu'à 542 g
   * sur un seul aliment. Décrire son frigo plus finement ne rend pas la
   * nourriture moins nécessaire.
   */
  ignorerPlafonds = false,
): Map<string, AuMieux> {
  const consomme = new Map<Aliment['id'], number>();
  const sorties = new Map<string, AuMieux>();

  /* Ce qu'il reste VRAIMENT à cet instant de la période. Jamais négatif : un
     dépassement d'arrondi ne doit pas rendre un aliment « dû ». */
  const restant = (a: Aliment): number =>
    Math.max(0, stockDe(a) - (consomme.get(a.id) ?? 0));

  /* L'ordre du TEMPS, pas celui de la saisie. Deux plans qui portent les
     mêmes repas doivent donner le même résultat, quel que soit l'ordre dans
     lequel l'écran les a empilés — sinon cocher ses jours à rebours changerait
     les quantités. */
  const enOrdre = [...demandes].sort(
    (x, y) => x.jour - y.jour || REPAS.indexOf(x.repas) - REPAS.indexOf(y.repas));

  for (const d of enOrdre) {
    /* LE PLAFOND DÉCLARÉ SE COMPORTE COMME UN FRIGO PLUS PETIT, et rien de
       plus. Tout ce qui suit — le plafonnement, la relève par un autre
       aliment du même rôle, le message « le reste est porté par X » — existe
       déjà pour le stock. On ne réécrit pas ce mécanisme, on lui donne un
       stock plus bas le temps d'un repas. */
    const dispo = d.plafonds === undefined || ignorerPlafonds
      ? restant
      : (a: Aliment): number => Math.min(
        restant(a),
        d.plafonds![String(a.id)] ?? Number.POSITIVE_INFINITY,
      );

    const sortie = resoudreAuMieux(
      { variables: d.variables, fixes: d.fixes },
      d.cibles, dispo, candidats, d.verrous, d.glucidesTotaux, d.releves);

    /* On retire ce que ce repas vient de prendre, dans l'unité du stock —
       celle de la colonne « à cuire ». */
    for (const q of sortie.resultat.quantites) {
      consomme.set(q.aliment.id, (consomme.get(q.aliment.id) ?? 0) + q.aCuire);
    }

    sorties.set(cleDuRepas(d.jour, d.repas), sortie);
  }

  return sorties;
}

/**
 * CE QU'IL FAUT ACHETER POUR TENIR LE PLAN.
 *
 * On résout la même période DEUX fois : une fois bridée par le frigo — c'est
 * ce qu'on peut cuisiner ce soir — et une fois frigo plein, qui dit ce que le
 * plan réclame idéalement. La liste de courses est la seconde moins le stock.
 *
 * Pourquoi ce détour plutôt que de compter les manques du premier calcul : le
 * solveur ne subit pas une pénurie, il la CONTOURNE. À court de brocoli il
 * sert des haricots, et le plan qui en sort tient dans le frigo — il n'y a
 * donc, par construction, plus rien à acheter. Compter les manques de ce
 * plan-là répondrait « rien », ce qui est exact et inutile.
 *
 * Le second calcul répond à la vraie question : de quoi ai-je besoin pour
 * manger ce que je voulais manger, et non ce que mon frigo m'impose.
 */
export function listeDeCourses(
  demandes: readonly DemandeDatee[],
  stockDe: (a: Aliment) => number,
  candidats: Aliment[],
): { aliment: Aliment; grammes: number }[] {
  const ALaCarte = (): number => Number.POSITIVE_INFINITY;
  const voulu = new Map<Aliment['id'], { aliment: Aliment; grammes: number }>();

  /* `true` : la passe « frigo plein » ignore aussi les restes déclarés. Sans
     ça le plafond restait le seul frein d'un calcul censé n'en avoir aucun. */
  for (const sortie of resoudreLaPeriode(demandes, ALaCarte, candidats, true).values()) {
    for (const q of sortie.resultat.quantites) {
      const deja = voulu.get(q.aliment.id);
      if (deja === undefined) {
        voulu.set(q.aliment.id, { aliment: q.aliment, grammes: q.aCuire });
      } else {
        deja.grammes += q.aCuire;
      }
    }
  }

  return [...voulu.values()]
    /* Le stock est en grammes « à cuire », comme les quantités : c'est ce
       qu'on pèse, donc ce qu'on achète. */
    .map((v) => ({ aliment: v.aliment, grammes: v.grammes - stockDe(v.aliment) }))
    /* Un gramme manquant n'est pas une course. Le seuil évite une liste
       encombrée de « 2 g d'huile » nés d'un arrondi. */
    .filter((v) => v.grammes >= 5)
    .map((v) => ({ aliment: v.aliment, grammes: Math.ceil(v.grammes) }))
    .sort((x, y) => x.aliment.nom.localeCompare(y.aliment.nom, 'fr'));
}
