import type { Aliment } from '@/solveur/types';

/**
 * LES FOURNÉES DU BATCH COOKING.
 *
 * Une cuisson n'est plus une valeur figée dans le code mais une LIGNE d'une
 * table partagée — « Vapeur », « Four 180 °C » — que seul l'administrateur
 * alimente. Voir `db/manuel/20-mode-de-cuisson.sql` pour le pourquoi.
 *
 * Deux conséquences qui simplifient tout ce fichier :
 *
 *   - **l'identifiant EST la fournée.** Deux aliments se cuisent ensemble
 *     s'ils pointent la même ligne. « Four 180 » et « Four 200 » sont deux
 *     lignes, donc deux fournées — et c'est exactement ce qu'on veut dire :
 *     on ne met pas le poisson à 180 avec les légumes à 200 en espérant que
 *     ça passe.
 *   - **rien à comparer, donc rien à faire diverger.** Pas de mode d'un côté
 *     et de température de l'autre, pas de vocabulaire dupliqué entre le
 *     front, l'API et le SQL. Le libellé s'affiche, l'identifiant regroupe.
 *
 * Un aliment sans cuisson choisie n'est simplement pas cuit : il n'entre dans
 * aucune fournée. L'absence est l'état par défaut, et elle ne se stocke pas.
 */

export interface ModeCuisson {
  id: number;
  libelle: string;
  ordre: number;
}

/**
 * Ce que l'écran retient : quel mode pour quel aliment, dans quel repas.
 *
 * TROIS ÉTATS, ET LA DIFFÉRENCE ENTRE LES DEUX DERNIERS COMPTE :
 *
 *   - un identifiant  → cet aliment se cuit de cette façon ;
 *   - `null`          → cet aliment ne se cuit PAS, et c'est un choix ;
 *   - clé absente     → personne n'a encore décidé.
 *
 * Sans le `null`, le skyr et les amandes resteraient éternellement « à
 * situer » : l'écran réclamerait une cuisson pour des aliments qui n'en ont
 * pas, et on ne saurait jamais si un plan est complet. « Je n'en mets pas »
 * n'est pas « je n'ai pas répondu » — c'est la même distinction que le zéro
 * et le champ vide dans les restes.
 */
export type Cuissons = Record<string, number | null>;

/**
 * Le plan mis à plat, tel que ce module l'attend : un repas, ses quantités.
 *
 * Rien n'est recalculé ici — le solveur a déjà tout résolu. Ce module se
 * contente de regrouper et de répartir, et c'est la garantie qu'une fournée
 * ne peut pas fausser un gramme.
 */
export interface Repas {
  /** « 2|R3 » */
  cle: string;
  /** pour combien de personnes ce repas a été composé */
  convives: number;
  quantites: readonly { aliment: Aliment; aCuire: number; assiette: number }[];
}

/** La clé d'un choix : « 2|R3|grocy:12 ». */
export const cleDeCuisson = (cleRepas: string, aliment: Aliment): string =>
  `${cleRepas}|${aliment.id}`;

export interface Fournee {
  mode: ModeCuisson;
  lignes: { aliment: Aliment; aCuire: number }[];
}

/**
 * UNE BOÎTE : ce qu'on met de côté pour un repas donné.
 *
 * C'est la finalité du batch cooking. On cuit tout d'un coup — les fournées —
 * puis on répartit dans des boîtes, une par repas. Sans cette répartition, le
 * batch cooking ne sert à rien : on saurait quoi cuire, pas quoi mettre où.
 *
 * LES POIDS SONT ICI EN **CUIT**, et c'est la différence qui compte avec les
 * fournées. On pèse du riz sec pour le mettre à cuire ; on répartit du riz
 * cuit à la cuillère. Annoncer le poids sec devant des boîtes ferait servir
 * trois fois trop.
 *
 * Les aliments qui ne se cuisent pas sont à part : on ne met pas un skyr dans
 * une boîte cinq jours à l'avance, on l'ajoute au moment de manger.
 */
export interface Boite {
  /** « 2|R3 » : le repas auquel cette boîte est destinée */
  cle: string;
  convives: number;
  /** ce qui sort d'une fournée, en poids CUIT */
  cuits: Portion[];
  /** ce qui s'ajoute au dernier moment : yaourt, fruits, oléagineux, huile */
  crus: Portion[];
}

/**
 * Une ligne de boîte, avec les DEUX quantités qui comptent.
 *
 * `assiette` est ce qu'on met dans la boîte pour tout le monde. `parPersonne`
 * est ce que CELUI QUI SUIT LA DIÈTE doit se servir le jour venu.
 *
 * Les deux sont nécessaires, et confondre l'une avec l'autre ruine tout : une
 * boîte pour trois contient trois portions, mais ses macros ne valent que
 * pour une. Sans la seconde ligne, il faudrait recomposer le repas le jour du
 * repas pour retrouver combien s'en servir — c'est-à-dire refaire tout le
 * travail que le batch cooking venait d'éviter.
 */
export interface Portion {
  aliment: Aliment;
  /** ce qu'on met dans la boîte, pour tous les convives */
  assiette: number;
  /** ce qu'on se sert, pour UNE personne, afin de tenir ses macros */
  parPersonne: number;
}

/**
 * Regroupe tout un plan en fournées.
 *
 * Les quantités s'ADDITIONNENT sur toute la période : cuire 300 g de riz en
 * une fois pour trois repas, c'est tout l'intérêt du batch cooking. Un aliment
 * qui revient dans quatre repas donne donc une seule ligne, et son total.
 *
 * `quantites` arrive déjà résolu par le solveur — on ne recalcule rien ici,
 * on regroupe. Un aliment sans mode choisi est ignoré : il n'est pas cuit.
 */
export function enFournees(
  repas: readonly Repas[],
  choisi: Cuissons,
  modes: readonly ModeCuisson[],
): Fournee[] {
  const parMode = new Map<number, Map<Aliment['id'], { aliment: Aliment; aCuire: number }>>();

  for (const r of repas) {
    for (const q of r.quantites) {
      const idMode = choisi[cleDeCuisson(r.cle, q.aliment)];
      /* `undefined` : pas encore décidé. `null` : décidé qu'on ne le cuit
         pas. Ni l'un ni l'autre n'entre dans une fournée — mais seul le
         premier est signalé à l'écran.

         Le cas `null` est doublement protégé : même sans ce test, aucun mode
         ne porterait cet identifiant et le groupe serait écarté plus bas. La
         mutation le confirme — la retirer ne casse aucun test. On la garde
         quand même, parce qu'elle dit l'INTENTION : « ceci ne se cuit pas »
         n'est pas « ce mode n'existe plus », et les deux ne doivent pas
         dépendre du même hasard. */
      if (idMode === undefined || idMode === null) continue;

      const lignes = parMode.get(idMode) ?? new Map();
      const deja = lignes.get(q.aliment.id);
      if (deja === undefined) {
        lignes.set(q.aliment.id, { aliment: q.aliment, aCuire: q.aCuire });
      } else {
        deja.aCuire += q.aCuire;
      }
      parMode.set(idMode, lignes);
    }
  }

  const out: Fournee[] = [];
  for (const [idMode, lignes] of parMode) {
    const mode = modes.find((m) => m.id === idMode);
    /* Un mode supprimé par l'administrateur pendant qu'un plan était ouvert :
       on écarte la fournée plutôt que d'inventer un libellé. */
    if (mode === undefined) continue;
    out.push({
      mode,
      lignes: [...lignes.values()].sort((x, y) => y.aCuire - x.aCuire),
    });
  }

  /* L'ordre de la table, celui que l'administrateur a voulu. */
  return out.sort((x, y) => x.mode.ordre - y.mode.ordre
    || x.mode.libelle.localeCompare(y.mode.libelle, 'fr'));
}

/**
 * Marque « sans cuisson » tout ce qui n'a pas encore été décidé.
 *
 * Un plan de sept jours porte une trentaine de lignes, dont beaucoup ne se
 * cuisent pas — skyr, amandes, fruits, huile. Les pointer une par une pour
 * dire « rien à faire » serait absurde. Ce qui EST cuit se choisit à la main ;
 * le reste se règle d'un geste.
 *
 * Rien n'est écrasé : les choix déjà faits, y compris les « sans cuisson »,
 * restent tels quels.
 */
export function resteSansCuisson(
  repas: readonly Repas[],
  choisi: Cuissons,
): Cuissons {
  const suite: Cuissons = { ...choisi };
  for (const r of repas) {
    for (const q of r.quantites) {
      const cle = cleDeCuisson(r.cle, q.aliment);
      if (suite[cle] === undefined) suite[cle] = null;
    }
  }

  return suite;
}

/** Combien d'aliments du plan attendent encore qu'on dise comment les cuire. */
export function sansCuisson(
  repas: readonly Repas[],
  choisi: Cuissons,
): number {
  let n = 0;
  for (const r of repas) {
    for (const q of r.quantites) {
      /* Seule l'ABSENCE de décision compte. Un aliment marqué « sans
         cuisson » est réglé, même s'il n'ira dans aucune fournée. */
      if (choisi[cleDeCuisson(r.cle, q.aliment)] === undefined) n += 1;
    }
  }

  return n;
}

/**
 * Ce qu'on met dans chaque boîte, repas par repas.
 *
 * L'ordre suit celui du plan — jour puis repas — parce qu'on remplit ses
 * boîtes dans l'ordre où on les mangera.
 */
export function repartition(repas: readonly Repas[], choisi: Cuissons): Boite[] {
  return repas.map((r) => {
    const cuits: Boite['cuits'] = [];
    const crus: Boite['crus'] = [];

    for (const q of r.quantites) {
      const choix = choisi[cleDeCuisson(r.cle, q.aliment)];
      const ou = (choix === undefined || choix === null) ? crus : cuits;
      ou.push({
        aliment: q.aliment,
        assiette: q.assiette,
        /* Une portion vaut TES cibles, celles de ton compte. Cuisiner pour
           trois, c'est cuisiner trois fois la même portion — la famille n'a
           pas tes besoins, mais elle ne pèse rien. */
        parPersonne: q.assiette / Math.max(1, r.convives),
      });
    }

    return { cle: r.cle, convives: r.convives, cuits, crus };
  });
}
