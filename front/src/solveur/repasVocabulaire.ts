import type { Aliment } from './types';

/**
 * LE VOCABULAIRE D'UN REPAS : les quatre créneaux, les rôles, et le modèle
 * qui dit de quoi chaque repas se compose.
 *
 * Rien ici ne calcule. C'est la couche que tout le reste du solveur lit sans
 * jamais la modifier — `composer` y prend le modèle, `plafonner` et `auMieux`
 * y prennent les rôles, `periode` y prend l'ordre des repas.
 *
 * Extrait de `composer.ts` le 15 septembre 2026 (rang 6 du lot 6 de l'audit).
 * Découpage mécanique : aucune ligne de logique n'a changé.
 */

export type Repas = 'R1' | 'R2' | 'R3' | 'R4';

export const REPAS: readonly Repas[] = ['R1', 'R2', 'R3', 'R4'];

export const NOM_REPAS: Record<Repas, string> = {
  R1: 'Matin', R2: 'Midi', R3: '16 h', R4: 'Soir',
};

/**
 * Le nom long, celui qu'on lit quand il y a la place.
 *
 * RASSEMBLE ICI LE 20 SEPTEMBRE 2026 (palier 0). `app/objectifs.tsx` portait
 * sa propre table, dont la colonne courte recopiait `NOM_REPAS` mot pour mot :
 * renommer « 16 h » en « Collation » ici aurait donne DEUX noms pour le meme
 * repas dans la meme application — le calculateur disant l'un, les objectifs
 * l'autre.
 */
export const NOM_LONG_REPAS: Record<Repas, string> = {
  R1: 'Petit-déjeuner', R2: 'Déjeuner', R3: 'Collation', R4: 'Dîner',
};

/**
 * Le rôle d'un aliment dans un repas, déduit de sa catégorie.
 *
 * C'est la SEULE règle automatique du calculateur, et elle ne dit rien du
 * moment de la journée : elle dit quelle macro l'aliment pilote.
 *
 * Rien ici n'exclut un aliment d'un repas, et rien ne le fera. Une tentative
 * a été faite — retenir qu'un aliment remplacé n'a pas sa place à ce repas —
 * et elle était fausse : elle confondait « l'avoine n'a rien à faire à midi »
 * avec « aujourd'hui j'ai envie de saumon ». Les deux gestes sont identiques,
 * seule l'intention diffère, et l'application ne la connaît pas. Remplacer
 * n'engage donc que le repas qu'on regarde.
 */
export type Role =
  | 'proteine' | 'laitage' | 'glucide' | 'fruit' | 'lipide' | 'huile' | 'legume';

/* Le fruit a son propre rôle depuis qu'un petit-déjeuner doit pouvoir porter
   un féculent ET un fruit. Confondus sous « glucide », l'un chassait l'autre. */
const ROLE_DE: Record<Aliment['categorie'], Role | null> = {
  prot: 'proteine',
  /* Le laitage a son propre rôle depuis que la collation porte DEUX sources
     de protéines : le skyr et les blancs d'œufs. Confondus, l'un chassait
     l'autre, exactement comme le fruit chassait le féculent. */
  lait: 'laitage',
  fec: 'glucide',
  fruit: 'fruit',
  ole: 'lipide',
  huile: 'huile',
  leg: 'legume',
  autre: null,
};

export const roleDe = (a: Aliment): Role | null => ROLE_DE[a.categorie];

/**
 * Grammes de légume par personne — chiffre du plan, pas une invention.
 *
 * Le plan de reference sert 200 g de legumes verts a midi et 200 g de
 * haricots verts le soir. Le 150 g d'origine venait de moi et obligeait le
 * reste du repas a compenser.
 */
export const LEGUME_PAR_PORTION = 200;

/**
 * Grammes d'huile par personne — 5 g, le chiffre du plan de reference, qui
 * en sert exactement cette quantite a midi, a la collation et le soir.
 *
 * L'huile et l'oléagineux figurent TOUS DEUX au repas, mais un seul des deux
 * peut s'ajuster : trois macros ne déterminent que trois inconnues, et laisser
 * les quatre variables libres donnerait une infinité de solutions. On fige
 * donc celle qui se dose à la cuillère et non à la balance ; l'oléagineux
 * absorbe le reste. La quantité reste modifiable repas par repas.
 */
export const HUILE_PAR_PORTION = 5;

/**
 * Grammes de fruit par personne, PAR REPAS.
 *
 * Ce ne sont pas des valeurs inventees : 55 g de fraises au petit-dejeuner et
 * 83 g de banane a la collation, ce sont les quantites du plan lui-meme. Une
 * moyenne des deux — 80 g — obligeait le reste du repas a compenser et
 * eloignait le resultat du plan d'origine.
 */
export const FRUIT_PAR_PORTION: Record<Repas, number> = {
  R1: 55, R2: 0, R3: 83, R4: 0,
};

/**
 * De quoi se compose chaque repas.
 *
 * Ce n'est PAS une regle devinee : c'est la façon dont Mickaël mange, dictee
 * par lui. Un petit-dejeuner ne porte ni legume ni huile mais un fruit ; un
 * dejeuner porte l'inverse. Une table qui pretendrait deduire ça des
 * categories se tromperait — c'est une habitude, pas une propriete des
 * aliments.
 *
 * Trois variables au plus : le solveur resout trois macros. Le reste est
 * impose, avec une quantite par personne que l'utilisateur peut changer.
 *
 * **C'est ici qu'on modifie la forme d'un repas**, et nulle part ailleurs.
 */
export interface ModeleRepas {
  /** quel role alimente chacune des trois variables du solveur */
  proteine: Role;
  glucide: Role;
  lipide: Role;
  /** ce qui est servi en quantite fixe, en grammes par personne */
  imposes: { role: Role; grammes: number }[];
  /**
   * L'aliment PREFERE pour un role, reconnu a un fragment de son nom.
   *
   * C'est une preference, pas une contrainte : absent du frigo, on prend
   * n'importe quel aliment du role. Elle existe parce qu'un plan nomme ses
   * aliments — la collation porte des flocons d'avoine, pas du boulgour — et
   * qu'aucune propriete nutritionnelle ne permet de le deviner.
   */
  preferes?: Partial<Record<Role, string>>;
}

/** Blancs d'oeufs de la collation, en grammes par personne — chiffre du plan. */
export const BLANCS_PAR_PORTION = 175;

export const MODELE: Record<Repas, ModeleRepas> = {
  // Matin : oeufs, flocons d'avoine, un fruit, des amandes.
  R1: {
    proteine: 'proteine', glucide: 'glucide', lipide: 'lipide',
    imposes: [{ role: 'fruit', grammes: FRUIT_PAR_PORTION.R1 }],
    preferes: { proteine: 'oeufs entiers', glucide: 'avoine' },
  },
  // Midi : proteine, feculent, oleagineux, huile, legume.
  R2: {
    proteine: 'proteine', glucide: 'glucide', lipide: 'lipide',
    imposes: [
      { role: 'huile', grammes: HUILE_PAR_PORTION },
      { role: 'legume', grammes: LEGUME_PAR_PORTION },
    ],
  },
  /* Collation : DEUX sources de proteines. Le laitage s'ajuste — c'est lui
     qui porte la cible — et les blancs d'oeufs sont une quantite fixe, celle
     du plan. Trois macros ne determinent que trois inconnues : l'un des deux
     devait etre fige, et c'est celui qui se dose au verre doseur. */
  R3: {
    proteine: 'laitage', glucide: 'glucide', lipide: 'lipide',
    imposes: [
      { role: 'proteine', grammes: BLANCS_PAR_PORTION },
      { role: 'fruit', grammes: FRUIT_PAR_PORTION.R3 },
    ],
    preferes: { proteine: 'blancs', laitage: 'skyr', glucide: 'avoine', fruit: 'banane' },
  },
  R4: {
    proteine: 'proteine', glucide: 'glucide', lipide: 'lipide',
    imposes: [
      { role: 'huile', grammes: HUILE_PAR_PORTION },
      { role: 'legume', grammes: LEGUME_PAR_PORTION },
    ],
  },
};

/**
 * Les roles que ce repas utilise VRAIMENT.
 *
 * Sert a ne signaler l'absence que de ce qui manque pour de bon. Le dejeuner
 * annoncait « Aucun laitage utilisable dans ton frigo » et « Aucun fruit
 * utilisable » — deux roles que son modele ne demande pas. Signaler l'absence
 * de ce qu'on n'a jamais reclame n'informe de rien et fait douter du reste.
 *
 * L'huile a longtemps ete ajoutee ici sans condition, et reproduisait
 * exactement le meme travers : le petit-dejeuner affichait « Aucune huile
 * utilisable dans ton frigo » alors qu'il y en avait, simplement parce que ce
 * repas n'en sert pas. Elle suit donc la regle commune : elle ne figure que si
 * le modele la demande.
 */
export const rolesDuRepas = (repas: Repas): Set<Role> => {
  const m = MODELE[repas];

  return new Set<Role>([
    m.proteine, m.glucide, m.lipide,
    ...m.imposes.map((i) => i.role),
  ]);
};
