import type { Aliment, Gravite } from '@/solveur/types';
import { KJ_PAR_KCAL, kcalDesGrammes, kilojoulesCertains } from './nutrition';

/**
 * LES DONNÉES NE PEUVENT PAS MENTIR SANS QU'ON LE VOIE.
 *
 * Le solveur est juste : il résout exactement le système qu'on lui donne. Sa
 * faiblesse n'est pas l'algèbre, c'est ce qu'on lui raconte sur les aliments.
 * Des valeurs de riz CUIT posées sur un riz qu'on pèse SEC, et le calcul reste
 * impeccable — il fait simplement peser trois fois trop. C'est arrivé, et
 * aucun test du solveur ne pouvait le voir : le mensonge était en amont.
 *
 * Ce module ne calcule rien. Il regarde un aliment et se demande si ce qu'il
 * raconte est physiquement possible.
 *
 * CE QUI A CHANGÉ, ET POURQUOI CE FICHIER A MAIGRI DE MOITIÉ.
 *
 * Un aliment portait autrefois un « état de référence » disant si ses valeurs
 * décrivaient le produit cru ou cuit. Trois champs — macros, rendement, état —
 * pour un seul fait. Ils pouvaient donc se contredire, et la moitié de ce
 * module servait à rattraper leurs désaccords : quatre codes d'anomalie,
 * dont un qui devait demander à l'utilisateur laquelle de ses deux valeurs
 * était la vraie. Une question à laquelle personne n'a envie de répondre en
 * ouvrant son frigo.
 *
 * Désormais les macros décrivent toujours le produit TEL QU'ON LE PÈSE, et le
 * rendement n'est qu'un facteur d'affichage. Deux nombres indépendants ne
 * peuvent pas se contredire : les quatre codes ont disparu avec l'état.
 *
 * Il reste trois familles de contrôles, tous portant sur UNE seule valeur à la
 * fois, et donc tous réparables d'une seule façon :
 *
 *   - **arithmétique** : des valeurs finies, positives, qui tiennent dans
 *     100 g ;
 *   - **énergétique** : les calories déclarées correspondent aux macros
 *     déclarées, à la règle d'Atwater près ;
 *   - **grain sec** : un féculent qui gonfle se pèse sec, et un grain sec fait
 *     300 à 400 kcal aux 100 g. C'est une borne physique, pas une moyenne.
 *     C'est le seul contrôle qui attrape encore des valeurs cuites saisies par
 *     erreur — et il sait maintenant les corriger tout seul.
 */

export interface Anomalie {
  gravite: Gravite;
  code: string;
  message: string;
}

/**
 * Calories théoriques de 100 g d'après les macros seules (Atwater).
 *
 * CONVENTION EUROPÉENNE, LES FIBRES COMPTENT.
 *
 * Cette fonction appliquait l'Atwater américain — fibres ignorées — que
 * `nutrition.ts` interdit explicitement en tête de fichier, quatre fichiers
 * plus loin. Une marge de 20 % était censée absorber l'écart ; elle ne suffit
 * pas dès que les fibres pèsent. Sur des graines de chia (486 kcal, 34 g de
 * fibres), le calcul tombait à 378 et le module annonçait « une des deux
 * valeurs est fausse » alors qu'aucune ne l'était — sur toute la famille des
 * oléagineux, celle-là même que `nutrition.ts` cite en exemple.
 *
 * La somme elle-même vient de `nutrition.ts` (`kcalDesGrammes`) depuis le
 * 17 septembre 2026 : les coefficients y étaient déjà pris, mais la formule
 * était réécrite ici. Des fibres inconnues comptent zéro gramme : l'écart
 * qu'elles laissent entre dans la marge générale de 20 % de
 * `verifierAliment`, qui ne les distingue pas.
 */
export const kcalAtwater = (a: Aliment): number => kcalDesGrammes({
  prot: a.prot100, gluc: a.gluc100, lip: a.lip100, fibres: a.fibres100,
});

/** Bande dans laquelle tombe toute céréale ou légumineuse sèche. */
const SEC_MINI = 300;
const SEC_MAXI = 400;

/**
 * En dessous de ce rendement, un féculent n'a pas gonflé : c'est une pomme de
 * terre, une patate douce, une banane plantain. Elle se pèse crue et ne fait
 * pas 350 kcal — la bande des grains secs ne la concerne pas.
 */
const GONFLE = 1.3;

/**
 * Les rendements de cuisson observables. Au-delà, ce n'est plus une cuisson :
 * un féculent quintuple de poids au plus, une viande en perd un quart.
 *
 * Un rendement hors bande ne fausse AUCUNE macro — il ne touche que le poids
 * annoncé dans l'assiette. D'où des gravités volontairement basses ici : on
 * signale une mesure douteuse, on ne bloque pas un repas pour autant.
 */
const RENDEMENT = {
  /* Jusqu'à 5 : un riz à 4,7 existe, il contient simplement 81 % d'eau au
     lieu des 68 à 70 % d'un riz de table. Le bilan de matière l'autorise —
     83 g de riz sec portent 73 g de matière sèche, et 73 g de matière sèche
     tiennent dans 393 g de produit très hydraté. Cette pesée-là était juste,
     et ce module l'a d'abord refusée à tort. */
  fec: { mini: 1, maxi: 5 },
  prot: { mini: 0.6, maxi: 1.05 },
  /* Un légume ne gonfle pas : il rend son eau, parfois beaucoup. 467 g de
     courgettes pour 343 g cuites font 0,73, 200 g de brocoli pour 150 g font
     0,75 — deux mesures justes, elles aussi signalées à tort au début.
     Le plancher descend à 0,30 pour l'épinard, qui perd les deux tiers de sa
     masse : le refuser reviendrait à refuser la réalité d'une poêle. */
  leg: { mini: 0.3, maxi: 1.05 },
} as const;

/** Un rendement s'écrit avec deux décimales, pas avec seize. */
const r2 = (v: number): string => v.toFixed(2);

/**
 * CE RENDEMENT EST-IL **POSSIBLE** ? — à ne pas confondre avec « plausible ».
 *
 * `RENDEMENT` ci-dessus décrit ce qu'on OBSERVE : hors de ces bandes, on
 * AVERTIT. Cette fonction-ci dit ce qui est **impossible**, donc ce qu'un écran
 * de saisie doit refuser d'enregistrer. Les deux questions sont différentes, et
 * les confondre a produit les deux pannes du 16 septembre 2026 :
 *
 *  - `ratioVraisemblable` (0,4 à 5, **toutes catégories confondues**) refusait
 *    un épinard mesuré à 0,32 — 500 g crus, 160 g cuits — alors que ce module
 *    déclare ce cas légitime à la ligne près (`leg.mini = 0,30`, « le refuser
 *    reviendrait à refuser la réalité d'une poêle »). Une vraie mesure,
 *    refusée par un message qui affirmait qu'elle n'était pas vraisemblable ;
 *  - et il LAISSAIT PASSER un féculent à 0,8, que la base refuse par contrainte
 *    `CHECK` : l'utilisateur recevait un **HTTP 500 avec le SQL brut** au lieu
 *    de la phrase écrite pour lui, vingt lignes plus bas dans ce fichier.
 *
 * La règle posée ici est **exactement celle de la base** (`aliment_ratio_sens`,
 * `db/01-schema.sql:137`) et **celle de l'API** (`RendementPlausible::sens`) :
 * un féculent absorbe de l'eau, une protéine et un légume en perdent. C'est la
 * seule façon qu'un écran ne propose pas ce que le serveur rejettera.
 *
 * **QUATRE endroits la portent, pas trois** — ce commentaire a dit « trois »
 * jusqu'au 16 septembre 2026. Le quatrième est `sens_du_rendement` dans
 * `ciqual_vers_grocy.py`, et il divergeait : le cas `leg` y manquait. Aligné le
 * même jour. Il garde en plus une bande 0,3-6 qui n'appartient qu'à lui : un
 * garde-fou d'export, volontairement plus strict.
 *
 * Tout le reste passe : ce sont des avertissements, et `verifierAliment` les
 * dit déjà. Un rendement douteux ne fait pas mal peser — il ne déplace que le
 * poids annoncé dans l'assiette.
 */
/*
 * `categorie: string` et non l'union : l'éditeur d'aliment tient la catégorie
 * en cours de saisie dans un `string` libre, et une catégorie que cette règle
 * ne connaît pas n'est pas pour autant IMPOSSIBLE — elle passe, comme le fruit
 * ou l'huile. Élargir ici évite un `as` au point d'appel, c'est-à-dire une
 * affirmation de type que rien ne garantit.
 */
export function rendementPossible(categorie: string, ratio: number): boolean {
  if (!Number.isFinite(ratio) || ratio <= 0) return false;
  if (categorie === 'fec') return ratio >= 1;
  if (categorie === 'prot' || categorie === 'leg') return ratio <= 1.05;

  return true;
}

/**
 * Les valeurs telles qu'elles seraient si celles qu'on lit décrivaient le
 * produit CUIT.
 *
 * La cuisson n'ajoute que de l'eau : elle dilue tout dans les mêmes
 * proportions. Repasser du cuit au pesé est donc une simple multiplication par
 * le rendement, la même pour chaque macro. 99 kcal et 22 g de glucides pour
 * 100 g de riz cuit, avec un rendement de 3,53, redonnent 350 kcal et 78 g de
 * glucides pour 100 g de riz sec.
 *
 * C'est l'unique correction possible, et c'est ce qui rend le diagnostic
 * utilisable : l'application n'a plus à demander à l'utilisateur de choisir
 * entre deux réparations, elle lui donne la bonne.
 */
export function macrosSiDejaCuites(a: Aliment): {
  kcal100: number; prot100: number; gluc100: number; lip100: number; fibres100: number;
} {
  const r = a.ratio > 0 ? a.ratio : 1;

  return {
    kcal100: a.kcal100 * r,
    prot100: a.prot100 * r,
    gluc100: a.gluc100 * r,
    lip100: a.lip100 * r,
    fibres100: (a.fibres100 ?? 0) * r,
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
      'rendement de cuisson à zéro : impossible d\'annoncer un poids cuit.');

    return out;
  }

  const matiere = a.prot100 + a.gluc100 + a.lip100 + (a.fibres100 ?? 0);
  if (matiere > 100.5) {
    dire('blocage', 'plus_de_cent',
      `${matiere.toFixed(1)} g de nutriments dans 100 g de produit.`);
  }

  /* ---------------------------------------------------- énergétique */

  const atwater = kcalAtwater(a);

  /* LES KILOJOULES RECOPIÉS À LA PLACE DES KCAL — ajouté le 20 septembre 2026
     (palier 1), et ajouté ICI parce que le serveur venait de l'apprendre : le
     verrou `coherencePartage.test.ts` a refusé que les deux juges divergent
     dès le premier jour.

     Les étiquettes européennes portent les deux unités côte à côte — 1465 kJ
     et 350 kcal. Recopier la première ligne multiplie tout par 4,184, et
     l'aliment devient quatre fois trop riche sans qu'une seule macro ne bouge.
     Le calcul reste cohérent, et on mange le quart de ce qu'on croit.

     ON NE REGARDE PAS LES KCAL SEULES : une huile fait vraiment 900 kcal aux
     100 g. C'est leur DÉSACCORD avec les macros, dans ce rapport précis, qui
     trahit l'unité. */
  if (kilojoulesCertains(a.kcal100, atwater)) {
    dire('blocage', 'kilojoules_recopies',
      `${a.kcal100.toFixed(0)} pour 100 g ressemble à des kilojoules : ses `
      + `macros en font ${atwater.toFixed(0)} kcal. L'étiquette porte les deux `
      + `unités côte à côte — la ligne à recopier est celle en kcal, soit `
      + `environ ${(a.kcal100 / KJ_PAR_KCAL).toFixed(0)}.`);

    return out;
  }

  const ecart = a.kcal100 - atwater;
  /* 20 % de marge : les fibres, les polyols et les arrondis de table
     justifient un écart, pas un facteur deux. */
  if (Math.abs(ecart) > Math.max(25, 0.2 * Math.max(atwater, a.kcal100))) {
    dire('avertissement', 'calories_incoherentes',
      `${a.kcal100} kcal déclarées pour 100 g, mais ses macros en font `
      + `${atwater.toFixed(0)}. Une des deux valeurs est fausse.`);
  }

  /* ------------------------------------------------------- grain sec */

  /* LE contrôle qui reste. Il ne dépend d'aucune table : un grain sec, c'est
     de la matière sèche, et la matière sèche fait 300 à 400 kcal aux 100 g,
     toujours. En dessous, ce sont des valeurs de produit cuit — le calcul
     resterait juste et ferait peser trois fois trop. */
  if (a.categorie === 'fec' && a.ratio > GONFLE && a.kcal100 > 0
    && a.kcal100 < SEC_MINI) {
    const sien = macrosSiDejaCuites(a);
    const explique = sien.kcal100 >= SEC_MINI && sien.kcal100 <= SEC_MAXI;

    if (explique) {
      dire('blocage', 'valeurs_deja_cuites',
        `ses valeurs sont celles du produit CUIT. Un féculent qui gonfle se `
        + `pèse SEC, et 100 g de grain sec font ${SEC_MINI} à ${SEC_MAXI} kcal — `
        + `ici ${a.kcal100.toFixed(0)}. Multiplie tout par le rendement `
        + `(${r2(a.ratio)}) : ${sien.kcal100.toFixed(0)} kcal, `
        + `${sien.gluc100.toFixed(1)} g de glucides, `
        + `${sien.prot100.toFixed(1)} g de protéines et `
        + `${sien.lip100.toFixed(1)} g de lipides pour 100 g.`);
    } else {
      dire('blocage', 'grain_sec_invraisemblable',
        `${a.kcal100.toFixed(0)} kcal pour 100 g de grain sec, alors qu'un `
        + `grain sec en fait ${SEC_MINI} à ${SEC_MAXI} — c'est une borne `
        + 'physique, pas une moyenne. Ressaisis les valeurs du produit tel que '
        + 'tu le pèses, sec, paquet en main.');
    }
  }

  if (a.categorie === 'fec' && a.ratio > GONFLE && a.kcal100 > SEC_MAXI) {
    dire('avertissement', 'grain_sec_trop_dense',
      `${a.kcal100.toFixed(0)} kcal pour 100 g de grain sec : c'est au-dessus `
      + `des ${SEC_MAXI} kcal qu'atteint la matière sèche la plus grasse. `
      + 'Vérifie la ligne du paquet.');
  }

  /* ---------------------------------------------------- rendements */

  /* Aucun de ces contrôles ne bloque : le rendement n'entre dans aucune macro.
     Il n'affiche que le poids servi, et se tromper sur le poids servi ne fait
     pas manger de travers. */

  /* LES DEUX BORNES NE DISENT PAS LA MÊME CHOSE, et un seul message servait
     les deux jusqu'au 16 septembre 2026. Pour une viande à 1,5, il annonçait
     « une cuisson plus poussée que la moyenne » et « la colonne cuit sera
     basse » : les deux sont faux — la viande aurait GAGNÉ de l'eau, et la
     colonne serait haute. Pire, il le disait en gravité « info » pendant que la
     base refuse cette valeur par contrainte. Relevé par l'agent bout en bout. */
  if (a.categorie === 'prot') {
    const r = RENDEMENT.prot;
    if (a.ratio > r.maxi) {
      /* AVERTISSEMENT, pas blocage — comme son jumeau le légume, vingt lignes
         plus bas. La première version de ce correctif bloquait, et le test
         « Le rendement d'une protéine ne fait qu'annoncer un poids » est tombé
         dessus : il défend une décision de ce module, écrite en haut de la
         section, et elle tient. Ce qui refuse l'ENREGISTREMENT d'une telle
         valeur, c'est `rendementPossible`, du côté de l'écran de saisie. */
      dire('avertissement', 'proteine_qui_gonfle',
        `un rendement de ${r2(a.ratio)} : une viande ou un poisson PERD de l'eau `
        + 'à la cuisson, il n\'en gagne pas. Les deux pesées ont probablement été '
        + 'interverties — ou elles ne portaient pas sur la même chose.');
    } else if (a.ratio < r.mini) {
      dire('info', 'rendement_hors_norme',
        `un rendement de ${r2(a.ratio)} : c'est une cuisson plus poussée que la `
        + `moyenne (on attend ${r.mini * 100} à ${r.maxi * 100} %). Sans `
        + 'conséquence sur tes macros — elles se comptent sur le poids que tu '
        + 'pèses — mais la colonne « cuit » sera basse. Vérifie seulement que '
        + 'les deux pesées portaient bien sur la même chose.');
    }
  }

  /* LE JUMEAU DU CORRECTIF POSÉ VINGT LIGNES PLUS HAUT, ET IL AVAIT LE MÊME
     DÉFAUT. Le 16 septembre 2026, les deux bornes de `prot` ont été séparées
     parce qu'un seul message servait les deux et mentait sur la borne haute.
     Le commentaire écrit ce jour-là disait « comme son jumeau le légume » — et
     ce jumeau, lui, testait encore `< mini || > maxi` pour servir la même
     phrase. La revue l'a relevé le soir même.

     Ce que ça donnait : un épinard poêlé, 500 g crus pour 120 g cuits, s'entend
     répondre « un légume rend son eau, il n'en gagne pas » — l'inverse exact de
     ce qui vient de se passer. Et c'est atteignable : `rendementPossible`
     accepte un `leg` sous 1,05, la contrainte de la base aussi. */
  if (a.categorie === 'leg') {
    const r = RENDEMENT.leg;
    if (a.ratio > r.maxi) {
      dire('avertissement', 'legume_qui_gonfle',
        `un rendement de ${r2(a.ratio)} : un légume rend son eau, il n'en gagne pas.`);
    } else if (a.ratio < r.mini) {
      dire('avertissement', 'rendement_hors_norme',
        `un rendement de ${r2(a.ratio)} : ce légume aurait perdu plus des deux `
        + `tiers de sa masse (on attend ${r.mini * 100} à ${r.maxi * 100} %). `
        + 'C\'est beaucoup, même pour un épinard. Sans conséquence sur tes '
        + 'macros — elles se comptent sur le poids que tu pèses — mais vérifie '
        + 'que les deux pesées portaient bien sur la même chose.');
    }
  }

  if (a.categorie === 'fec') {
    const r = RENDEMENT.fec;

    /* UN FÉCULENT QUI RÉTRÉCIT EST UN BLOCAGE, et c'est une exception assumée
       à la règle « le rendement ne bloque jamais ».

       Le rendement ne touche aucune macro : se tromper dessus ne fait pas mal
       peser, et tous les autres contrôles de rendement de ce module sont donc
       de simples avertissements. Mais un féculent ABSORBE de l'eau — il ne
       peut pas peser moins cuit que sec. Un rendement sous 1 n'est pas une
       cuisson inhabituelle, c'est une impossibilité, et une impossibilité ne
       s'explique que d'une façon : la fiche entière décrit autre chose que ce
       qu'elle prétend.

       Le cas réel : une semoule appariée par erreur à l'entrée CUITE de la
       table, donc 142 kcal déclarées sèches et un rendement de 0,41. Les
       142 kcal, elles, ne pouvaient PAS être attrapées — une pomme de terre
       en fait 92, et c'est normal. Le rendement impossible est le seul indice
       visible que le reste est faux. */
    if (a.ratio < r.mini) {
      dire('blocage', 'feculent_qui_retrecit',
        `un rendement de ${r2(a.ratio)} : un féculent absorbe de l'eau, il ne `
        + 'peut pas peser moins cuit que sec. Ce n\'est pas une cuisson '
        + 'inhabituelle, c\'est impossible — donc ses autres valeurs décrivent '
        + 'probablement le produit CUIT, elles aussi. Ressaisis la ligne du '
        + 'paquet, pour 100 g de produit sec.');
    } else if (a.ratio > r.maxi) {
      /* F5, 15 septembre 2026. La phrase posait 88 g de matière sèche pour
         100 g de grain, puis divisait 100 par le rendement — c'est-à-dire
         comme s'il y en avait eu 100. Pour un rendement de 6 elle annonçait
         17 g quand son propre raisonnement en donne 15. Le chiffre affiché
         contredisait la prémisse affichée deux mots plus haut.

         Ce qu'il dit vraiment : la matière sèche ne se cuit pas, elle se
         dilue. Répartie dans `ratio × 100` g de produit cuit, elle n'y pèse
         plus que `88 / ratio` g pour 100 g — et sous la limite de 5, cela fait
         encore 18 g, ce qu'un riz très hydraté atteint. Au-delà, plus aucun
         féculent cuit ne correspond. */
      dire('avertissement', 'rendement_hors_norme',
        `un rendement de ${r2(a.ratio)} : le bilan de matière ne l'autorise pas. `
        + '100 g de grain sec ne portent que 88 g de matière sèche, et il n\'en '
        + `resterait que ${(88 / a.ratio).toFixed(0)} g pour 100 g de produit cuit — `
        + 'moins que n\'en contient un féculent égoutté. Repèse en égouttant, et '
        + 'laisse tiédir avant de poser sur la balance.');
    }
  }

  if ((a.categorie === 'fruit' || a.categorie === 'lait'
    || a.categorie === 'huile' || a.categorie === 'ole') && a.ratio !== 1) {
    dire('avertissement', 'rendement_inattendu',
      `un rendement de ${r2(a.ratio)} sur un aliment qu'on ne fait pas gonfler. `
      + 'Il ne changera que le poids annoncé dans l\'assiette, mais autant '
      + 'qu\'il soit juste.');
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
