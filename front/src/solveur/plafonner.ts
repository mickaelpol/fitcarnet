import { type Role, roleDe } from './repasVocabulaire';
import { calculer, convertir, versReference } from './solveur';
import type { Aliment, Cibles, Fixe, Resultat, Variables } from './types';

/**
 * LE STOCK FAIT LA LOI.
 *
 * `composer` choisit les aliments, `solveur` calcule les quantités — et ni
 * l'un ni l'autre ne sait ce que le frigo contient vraiment. C'est ce module
 * qui confronte le calcul au réel : il plafonne ce qui déborde et confie le
 * manque à un autre aliment du même rôle.
 *
 * Extrait de `composer.ts` le 15 septembre 2026 (rang 6 du lot 6 de l'audit).
 * Découpage mécanique : aucune ligne de logique n'a changé.
 */

export interface Plafonne {
  /** le rôle dont l'aliment a débordé, pour l'afficher au bon endroit */
  role: Role;
  aliment: Aliment;
  /** ce qu'il en restait réellement, en grammes à cuire */
  grammes: number;
  /** ce qui a pris le relais, s'il y avait de quoi */
  releve?: Aliment;
}

export interface Ajuste {
  variables: Variables;
  fixes: Fixe[];
  plafonnes: Plafonne[];
  resultat: Resultat;
}

/**
 * Ce qui peut prendre le relais d'un aliment épuisé : un aliment du MÊME
 * rôle. L'huile supplée l'oléagineux, et rien d'autre ne se supplée.
 *
 * On regarde le rôle de l'aliment qui déborde, pas le nom de la variable :
 * quand le skyr manquait, la variable « proteine » de la collation cherchait
 * une protéine et proposait du blanc de poulet à 16 h.
 */
export const releveDe = (a: Aliment): Role[] => {
  const role = roleDe(a);
  if (role === 'lipide' || role === 'huile') return ['lipide', 'huile'];

  return role === null ? [] : [role];
};

/**
 * Ramène chaque quantité à ce que le frigo contient VRAIMENT, et complète.
 *
 * Le solveur calcule ce qu'il faudrait — 327 g de saumon — sans savoir qu'il
 * n'y en a que 200. Servir ce chiffre-là, c'est envoyer quelqu'un peser une
 * quantité qui n'existe pas, et manquer sa diète sans le savoir.
 *
 * On plafonne donc l'aliment qui déborde à ce qu'il en reste, et on confie le
 * manque à un AUTRE aliment du même rôle : les 200 g de saumon deviennent une
 * quantité imposée, et le poulet — ou le thon — porte le reste des protéines.
 * Le solveur savait déjà faire ça, c'est le mécanisme des restes à écouler ;
 * il ne lui manquait que de savoir quand s'en servir.
 *
 * S'il n'y a plus personne pour prendre le relais, la variable disparaît :
 * la macro n'est plus atteignable, et `calculer` le dit en clair plutôt que
 * de promettre un repas impossible.
 */
export function ajusterAuStock(
  depart: { variables: Variables; fixes: Fixe[] },
  cibles: Cibles,
  stockDe: (a: Aliment) => number,
  candidats: Aliment[],
  glucidesTotaux = false,
  /**
   * CE QUE L'UTILISATEUR A CHOISI POUR PRENDRE LE RELAIS, par rôle.
   *
   * Sans ça, le relais est le PREMIER candidat trouvé — un ordre de liste,
   * pas une décision. On se retrouvait avec du boulgour parce qu'il passait
   * avant le riz, et il n'y avait aucun moyen de dire non.
   *
   * Le choix reste SOUMIS AUX MÊMES CONDITIONS que le choix automatique :
   * bon rôle, encore en stock, pas déjà au menu. Un choix devenu impossible
   * n'est pas imposé de force — l'écran montrera ce qui a réellement pris le
   * relais, plutôt qu'une ligne qui ment.
   */
  releves: Readonly<Partial<Record<Role, Aliment>>> = {},
): Ajuste {
  const variables: Variables = { ...depart.variables };
  let fixes = [...depart.fixes];
  const plafonnes: Plafonne[] = [];

  const utilises = new Set<number | string>([
    ...Object.values(variables).map((a) => a.id),
    ...fixes.map((f) => f.aliment.id),
  ]);

  /**
   * Qui prend le relais d'un aliment épuisé : le choix de l'utilisateur s'il
   * en a fait un et qu'il tient debout, le premier candidat valable sinon.
   *
   * UNE SEULE FONCTION POUR LES DEUX ENDROITS où l'on plafonne — une quantité
   * imposée qui déborde, et une variable qui déborde. C'étaient deux copies
   * de la même recherche ; ajouter le choix manuel à l'une et pas à l'autre
   * aurait donné un écran qui obéit une fois sur deux.
   */
  const choisirReleve = (epuise: Aliment, role: Role | null): Aliment | undefined => {
    const permis = releveDe(epuise);
    const valable = (c: Aliment | undefined): boolean => c !== undefined
      && permis.includes(roleDe(c) as Role)
      && !utilises.has(c.id)
      && stockDe(c) > 0;

    const voulu = role === null ? undefined : releves[role];
    if (valable(voulu)) return voulu;

    return candidats.find((c) => valable(c));
  };

  /* Une boucle bornée : chaque tour consomme un aliment du stock, et le
     stock est fini. La borne n'est là que pour qu'un cas non prévu s'arrête
     au lieu de figer l'écran. */
  /** Ce qu'il faudrait peser pour servir cette quantité imposée. */
  const aCuireDe = (f: Fixe): number =>
    convertir(f.aliment, versReference(f.aliment, f.grammes, f.unite)).aCuire;

  /**
   * LA DERNIÈRE PORTE, ET LES DEUX SORTIES PASSENT PAR ELLE.
   *
   * F7, 15 septembre 2026. La sortie de secours — celle qu'on prend quand les
   * douze tours sont épuisés — rendait `calculer(...)` sans reconfronter le
   * résultat au stock. La dernière variable, celle qui n'avait pas eu son
   * tour, sortait donc avec la quantité que l'algèbre réclamait, `ok: true` et
   * aucun diagnostic.
   *
   * Reproduit avec treize protéines à 5 g : l'écran annonçait 32 g d'un
   * treizième poulet dont il ne restait que 5 g, en présentant le repas comme
   * réussi. Et `resoudreAuMieux`, qui sort immédiatement sur `resultat.ok`,
   * n'essayait même pas une autre combinaison.
   *
   * Le contrôle est posé au POINT DE PASSAGE OBLIGÉ plutôt que devant la seule
   * porte fautive : sur le chemin normal la boucle vient de vérifier que rien
   * ne déborde, donc il n'y coûte rien et ne changera jamais un résultat — il
   * empêche seulement qu'une troisième sortie, écrite un jour, oublie la
   * vérification comme celle-ci l'avait oubliée.
   */
  const sortie = (resultat: Resultat): Ajuste => {
    const trop = resultat.quantites.filter((q) => q.aCuire > stockDe(q.aliment) + 0.5);
    if (trop.length === 0) return { variables, fixes, plafonnes, resultat };

    const detail = trop
      .map((q) => `${q.aliment.nom} (${Math.round(q.aCuire)} g demandés, `
        + `${Math.round(stockDe(q.aliment))} g en stock)`)
      .join(' ; ');

    return {
      variables,
      fixes,
      plafonnes,
      resultat: {
        ...resultat,
        /* Les macros tombent peut-être juste — mais sur un repas qu'on ne peut
           pas cuisiner. Un plan impossible n'est pas un plan réussi, et c'est
           `ok` que lit l'écran. */
        ok: false,
        diagnostics: [...resultat.diagnostics, {
          gravite: 'blocage',
          code: 'stock_insuffisant',
          message:
            `Ce repas demande plus que ce que le frigo contient : ${detail}. `
            + 'Les relais du stock n\'ont pas suffi à boucler le compte. '
            + 'Complète le frigo, ou compose ce repas à la main.',
        }],
      },
    };
  };

  for (let tour = 0; tour < 12; tour += 1) {
    /* Les quantités IMPOSÉES passent devant, parce qu'elles ne se discutent
       pas : 200 g de brocoli quand il en reste 60, c'est une consigne qu'on
       ne peut pas suivre, et tout ce que le solveur calcule autour repose
       dessus. Longtemps seules les variables étaient confrontées au stock ;
       le légume, l'huile, les blancs d'œufs et le fruit du plan passaient au
       travers, et l'application affichait sereinement une quantité que le
       frigo ne contenait pas. */
    const iDeborde = fixes.findIndex(
      (f) => aCuireDe(f) > stockDe(f.aliment) + 0.5);

    if (iDeborde >= 0) {
      const f = fixes[iDeborde]!;
      const dispo = stockDe(f.aliment);
      const r = f.aliment.ratio > 0 ? f.aliment.ratio : 1;
      /* Le manque se compte DANS L'ASSIETTE : c'est la portion servie que le
         plan fixe, pas le poids à la balance, et le relais n'a ni le même
         rendement de cuisson ni la même densité. */
      const manque = convertir(f.aliment, versReference(f.aliment, f.grammes, f.unite))
        .assiette - dispo * r;

      const releve = choisirReleve(f.aliment, roleDe(f.aliment));

      // `unite: 'cru'` : le stock se compte avant cuisson, comme la colonne « à cuire »
      fixes = fixes.map((x, i) => (i === iDeborde
        ? { aliment: x.aliment, grammes: dispo, unite: 'cru' as const }
        : x));

      if (releve !== undefined && manque > 0.5) {
        fixes = [...fixes, { aliment: releve, grammes: manque, unite: 'cuit' as const }];
        utilises.add(releve.id);
      }

      plafonnes.push({
        role: roleDe(f.aliment) ?? 'glucide',
        aliment: f.aliment,
        grammes: dispo,
        releve: manque > 0.5 ? releve : undefined,
      });

      continue;
    }

    const resultat = calculer(cibles, variables, fixes, { glucidesTotaux });

    const cles = ['proteine', 'glucide', 'lipide'] as const;
    const deborde = cles
      .map((cle) => {
        const aliment = variables[cle];
        if (aliment === undefined) return null;
        const q = resultat.quantites.find((x) => x.aliment.id === aliment.id);
        const dispo = stockDe(aliment);
        /* Un demi-gramme de marge : au-delà, c'est l'arrondi d'affichage qui
           parlerait, pas la balance. */
        if (q === undefined || q.aCuire <= dispo + 0.5) return null;

        return { cle, aliment, dispo };
      })
      .find((x) => x !== null);

    if (deborde === undefined || deborde === null) {
      return sortie(resultat);
    }

    /* Ce qu'on a vraiment devient une quantité imposée. `unite: 'cru'` parce
       que le stock se compte AVANT cuisson — 200 g de saumon cru, 500 g de
       riz sec — et c'est aussi ce que dit la colonne « à cuire ». */
    fixes = [...fixes, { aliment: deborde.aliment, grammes: deborde.dispo, unite: 'cru' }];
    delete variables[deborde.cle];

    const releve = choisirReleve(deborde.aliment, deborde.cle);

    if (releve !== undefined) {
      variables[deborde.cle] = releve;
      utilises.add(releve.id);
    }

    plafonnes.push({ role: deborde.cle, aliment: deborde.aliment, grammes: deborde.dispo, releve });
  }

  return sortie(calculer(cibles, variables, fixes, { glucidesTotaux }));
}
