import type { Aliment, Gravite } from '@/solveur/types';

/**
 * LES DONNÉES NE PEUVENT PAS MENTIR SANS QU'ON LE VOIE.
 *
 * Le solveur est juste : il résout exactement le système qu'on lui donne. Sa
 * faiblesse n'est pas l'algèbre, c'est ce qu'on lui raconte sur les aliments.
 * Un riz dont les valeurs sont celles du sec mais qu'on déclare cuit, et le
 * calcul reste impeccable — il fait simplement manger deux fois trop de
 * glucides. C'est arrivé, et aucun test du solveur ne pouvait le voir : le
 * mensonge était en amont.
 *
 * Ce module ne calcule rien. Il regarde un aliment et se demande si ce qu'il
 * raconte est physiquement possible. Trois familles de contrôles :
 *
 *   - **arithmétique** : des valeurs finies, positives, qui tiennent dans
 *     100 g ;
 *   - **énergétique** : les calories déclarées doivent correspondre aux
 *     macros déclarées, à la règle d'Atwater près ;
 *   - **état de référence** : c'est le contrôle qui compte. Un rendement de
 *     cuisson implique une densité énergétique avant cuisson. Si elle est
 *     absurde, c'est que l'état de référence ou le ratio est faux.
 */

export interface Anomalie {
  gravite: Gravite;
  code: string;
  message: string;
}

/** Calories théoriques de 100 g d'après les macros seules (Atwater). */
export const kcalAtwater = (a: Aliment): number =>
  4 * a.prot100 + 4 * a.gluc100 + 9 * a.lip100;

/**
 * Densité énergétique du produit AVANT cuisson, déduite du rendement.
 *
 * 100 g de riz cuit à 130 kcal avec un rendement de 3 disent que 33,3 g de riz
 * sec portent 130 kcal, donc que le riz sec fait 390 kcal/100 g. C'est
 * vérifiable : un grain de céréale sèche pèse entre 330 et 370 kcal/100 g,
 * toujours. Une valeur en dehors ne laisse que deux explications, et les deux
 * font manger de travers : le rendement est faux, ou l'état de référence est
 * inversé.
 */
export const densiteAvantCuisson = (a: Aliment): number => a.kcal100 * a.ratio;

/** Bande dans laquelle tombe toute céréale ou légumineuse sèche. */
const SEC_MINI = 300;
const SEC_MAXI = 400;

/**
 * Les rendements de cuisson observables. Au-delà, ce n'est plus une cuisson :
 * un féculent triple de poids au plus (riz, semoule), une viande en perd un
 * quart au plus.
 */
const RENDEMENT = {
  /* Jusqu'à 5 : un riz à 4,7 existe, il contient simplement 81 % d'eau au
     lieu des 68 à 70 % d'un riz de table. Le bilan de matière l'autorise —
     83 g de riz sec portent 73 g de matière sèche, et 73 g de matière sèche
     tiennent dans 393 g de produit très hydraté. Ce n'est pas la pesée qui
     est fautive dans ce cas, c'est de lui associer les macros d'un AUTRE riz.
     Le contrôle qui compte est plus bas : celui du couple. */
  fec: { mini: 1, maxi: 5 },
  prot: { mini: 0.6, maxi: 1.05 },
  /* Un légume ne gonfle pas : il rend son eau, parfois beaucoup. 467 g de
     courgettes pour 343 g cuites font 0,73, 200 g de brocoli pour 150 g font
     0,75 — deux mesures justes, que ce module a d'abord signalées à tort.
     Le plancher descend à 0,30 pour l'épinard, qui perd les deux tiers de sa
     masse : le refuser reviendrait à refuser la réalité d'une poêle. */
  leg: { mini: 0.3, maxi: 1.05 },
} as const;

/** Un rendement s'écrit avec deux décimales, pas avec seize. */
const r2 = (v: number): string => v.toFixed(2);

/** Densité énergétique typique d'un grain sec, au milieu de la bande. */
const SEC_TYPE = 350;

/**
 * Les macros du produit CUIT telles que le rendement mesuré les impose.
 *
 * C'est le calcul le plus honnête qu'on puisse faire quand une pesée
 * personnelle contredit une table : la pesée est un fait, la table est une
 * moyenne. 83 g de riz sec portent environ 290 kcal ; s'ils donnent 393 g
 * cuits, alors CE riz-là fait 74 kcal pour 100 g, et rien ne peut en faire
 * 130. Les proportions entre macros sont conservées — la cuisson n'ajoute
 * que de l'eau.
 */
export function macrosSelonLeRendement(a: Aliment): {
  kcal100: number; prot100: number; gluc100: number; lip100: number; fibres100: number;
} {
  const kcal100 = a.ratio > 0 ? SEC_TYPE / a.ratio : a.kcal100;
  const facteur = a.kcal100 > 0 ? kcal100 / a.kcal100 : 1;

  return {
    kcal100,
    prot100: a.prot100 * facteur,
    gluc100: a.gluc100 * facteur,
    lip100: a.lip100 * facteur,
    fibres100: (a.fibres100 ?? 0) * facteur,
  };
}

export function verifierAliment(a: Aliment): Anomalie[] {
  const out: Anomalie[] = [];
  const dire = (gravite: Gravite, code: string, message: string): void => {
    out.push({ gravite, code, message: `${a.nom} : ${message}` });
  };

  /* --------------------------------------------------- arithmétique */

  const chiffres: [string, number][] = [
    ['calories', a.kcal100], ['protéines', a.prot100],
    ['glucides', a.gluc100], ['lipides', a.lip100],
    ['fibres', a.fibres100 ?? 0], ['rendement', a.ratio],
  ];
  for (const [nom, v] of chiffres) {
    if (!Number.isFinite(v)) {
      dire('blocage', 'valeur_illisible', `la valeur « ${nom} » n'est pas un nombre.`);
    } else if (v < 0) {
      dire('blocage', 'valeur_negative', `${nom} négatif (${v}).`);
    }
  }
  if (out.length > 0) return out;

  if (a.ratio <= 0) {
    dire('blocage', 'rendement_nul',
      'rendement de cuisson à zéro : impossible de passer du cru au cuit.');

    return out;
  }

  const matiere = a.prot100 + a.gluc100 + a.lip100 + (a.fibres100 ?? 0);
  if (matiere > 100.5) {
    dire('blocage', 'plus_de_cent',
      `${matiere.toFixed(1)} g de nutriments dans 100 g de produit.`);
  }

  /* ---------------------------------------------------- énergétique */

  const atwater = kcalAtwater(a);
  const ecart = a.kcal100 - atwater;
  /* 20 % de marge : les fibres, les polyols et les arrondis de table
     justifient un écart, pas un facteur deux. */
  if (Math.abs(ecart) > Math.max(25, 0.2 * Math.max(atwater, a.kcal100))) {
    dire('avertissement', 'calories_incoherentes',
      `${a.kcal100} kcal déclarées pour 100 g, mais ses macros en font `
      + `${atwater.toFixed(0)}. Une des deux valeurs est fausse.`);
  }

  /* ------------------------------------------- état de référence */

  if (a.categorie === 'prot') {
    if (a.etatReference !== 'cru') {
      dire('blocage', 'proteine_reference_cuite',
        'une viande, un poisson ou un œuf se pèse CRU. Ses valeurs doivent '
        + 'se rapporter au cru, sinon la portion servie sera fausse.');
    }
    const r = RENDEMENT.prot;
    if (a.ratio < r.mini || a.ratio > r.maxi) {
      /* Une INFO, pas un avertissement. Une protéine porte ses valeurs
         CRUES et se pèse crue : son rendement ne sert qu'à afficher le poids
         cuit. Quel qu'il soit, il ne déplace pas d'un gramme ce qui est
         compté dans la journée. Le signaler comme une faute laissait croire
         à une erreur de mesure là où il n'y a qu'une cuisson très poussée. */
      dire('info', 'rendement_hors_norme',
        `un rendement de ${r2(a.ratio)} : c'est une cuisson plus poussée que la `
        + `moyenne (on attend ${r.mini * 100} à ${r.maxi * 100} %). Sans `
        + 'conséquence sur tes macros — elles se comptent sur le poids CRU, que '
        + 'tu pèses — mais la colonne « cuit » sera basse. Vérifie seulement que '
        + 'les deux pesées portaient bien sur la même chose.');
    }
  }

  if (a.categorie === 'leg') {
    if (a.etatReference !== 'cru') {
      /* Un légume se pèse CRU, comme une viande : personne ne pèse ses
         brocolis après la vapeur. Référencé « cuit », il fallait connaître
         son rendement pour savoir quoi peser — et ce rendement n'est pas
         dérivable, l'énergie ne se conservant pas à l'eau bouillante. */
      dire('blocage', 'legume_reference_cuite',
        'un légume se pèse CRU, avant cuisson. Ses valeurs doivent se '
        + 'rapporter au cru, sinon la quantité à peser sera fausse.');
    }
    const r = RENDEMENT.leg;
    if (a.ratio < r.mini || a.ratio > r.maxi) {
      dire('avertissement', 'rendement_invraisemblable',
        `un rendement de ${r2(a.ratio)} : un légume rend son eau, il n'en gagne pas.`);
    }
  }

  if (a.categorie === 'fec') {
    if (a.etatReference !== 'cuit' && a.ratio > 1.2) {
      /* LE bug. Des valeurs de riz SEC lues comme du riz cuit : le calcul
         reste juste, la portion triple. */
      dire('blocage', 'feculent_reference_crue',
        'un féculent qui gonfle à la cuisson doit porter ses valeurs CUITES — '
        + 'c\'est ce qu\'on met dans l\'assiette. Lues comme crues, elles font '
        + `manger ${a.ratio.toFixed(1)} fois trop de glucides.`);
    }

    const r = RENDEMENT.fec;
    if (a.ratio < r.mini || a.ratio > r.maxi) {
      dire('avertissement', 'rendement_hors_norme',
        `un rendement de ${r2(a.ratio)} : le bilan de matière ne l'autorise pas. `
        + '100 g de grain sec ne portent que 88 g de matière sèche, et il en '
        + `faudrait ${(100 / a.ratio).toFixed(0)} g pour tenir dans le poids cuit `
        + 'annoncé. Repèse en égouttant, et laisse tiédir avant de poser sur la '
        + 'balance.');
    }

    /* LE contrôle. Il ne dépend d'aucune table : c'est la conservation de
       l'énergie, qu'aucune casserole ne viole. Il ne dit PAS que la pesée est
       fausse — une pesée peut être parfaitement exacte et rendre fausses des
       macros venues d'ailleurs. Il dit que les deux nombres décrivent deux
       produits différents, et il faut choisir lequel est le sien. */
    if (a.ratio > 1.3 && a.kcal100 > 0) {
      const sec = densiteAvantCuisson(a);
      if (sec < SEC_MINI || sec > SEC_MAXI) {
        const sien = macrosSelonLeRendement(a);
        dire('blocage', 'rendement_contredit_par_energie',
          'le rendement et les macros décrivent deux produits différents. '
          + `Avec un rendement de ${r2(a.ratio)}, 100 g de produit SEC `
          + `porteraient ${sec.toFixed(0)} kcal, or un grain sec en fait `
          + `${SEC_MINI} à ${SEC_MAXI} — c'est une borne physique, pas une `
          + 'moyenne. Deux corrections possibles, et toi seul sais laquelle : '
          + `garder ces macros et corriger le rendement à `
          + `${(SEC_MINI / a.kcal100).toFixed(2)}–${(SEC_MAXI / a.kcal100).toFixed(2)} ; `
          + `ou garder TA pesée et corriger les macros, qui deviennent alors `
          + `${sien.kcal100.toFixed(0)} kcal, ${sien.gluc100.toFixed(1)} g de `
          + `glucides, ${sien.prot100.toFixed(1)} g de protéines et `
          + `${sien.lip100.toFixed(1)} g de lipides pour 100 g cuits.`);
      }
    }
  }

  if ((a.categorie === 'fruit' || a.categorie === 'lait'
    || a.categorie === 'huile' || a.categorie === 'ole') && a.ratio !== 1) {
    dire('avertissement', 'rendement_inattendu',
      `un rendement de ${r2(a.ratio)} sur un aliment qu'on ne fait pas gonfler. `
      + 'Vérifie : la quantité servie en dépend directement.');
  }

  return out;
}

/** Tout ce qui cloche dans un frigo, du plus grave au moins grave. */
export function verifierCatalogue(aliments: readonly Aliment[]): Anomalie[] {
  const ordre: Record<Gravite, number> = { blocage: 0, avertissement: 1, info: 2 };

  return aliments
    .flatMap((a) => verifierAliment(a))
    .sort((x, y) => ordre[x.gravite] - ordre[y.gravite]);
}

/** Un aliment sur lequel on ne peut pas construire un repas fiable. */
export const inexploitable = (a: Aliment): boolean =>
  verifierAliment(a).some((d) => d.gravite === 'blocage');
