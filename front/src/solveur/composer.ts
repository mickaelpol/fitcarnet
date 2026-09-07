import { calculer, convertir, versReference } from './solveur';
import type { Aliment, Cibles, Fixe, Resultat, Variables } from './types';

/**
 * Choisit LES ALIMENTS d'un repas. Le solveur, lui, choisit les quantités.
 *
 * Séparation volontaire : `calculer` reçoit une protéine, un glucide, un
 * lipide et rend des grammes. Il ne sait pas ce qu'est un repas, et n'a pas à
 * l'apprendre — ses 47 tests portent sur l'algèbre, pas sur le menu. Composer
 * est la couche qui décide QUOI lui donner ; elle se teste à part.
 */

export type Repas = 'R1' | 'R2' | 'R3' | 'R4';

export const REPAS: readonly Repas[] = ['R1', 'R2', 'R3', 'R4'];

export const NOM_REPAS: Record<Repas, string> = {
  R1: 'Matin', R2: 'Midi', R3: '16 h', R4: 'Soir',
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

const sansAccent = (v: string): string =>
  v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();


export interface Composition {
  variables: Variables;
  fixes: Fixe[];
  /** ce qui a manqué pour composer un repas complet */
  manquants: Role[];
  /** les aliments servis en quantité fixe, par rôle */
  imposes: Partial<Record<Role, Aliment>>;
}

/**
 * Compose un repas à partir du stock.
 *
 * `precedents` sert à ne pas resservir le même aliment quatre fois dans la
 * journée : à qualité égale, on prend celui qui n'a pas encore servi. Ce
 * n'est pas une contrainte — s'il n'y a qu'une protéine en stock, elle
 * reviendra à tous les repas, et c'est très bien.
 */
export function composer(
  disponibles: Aliment[],
  portions: number,
  precedents: ReadonlySet<number | string> = new Set(),
  repas: Repas = 'R2',
): Composition {
  const utilisables = disponibles.filter((a) => roleDe(a) !== null);

  const modele = MODELE[repas];

  const choisir = (role: Role): Aliment | undefined => {
    const candidats = utilisables.filter((a) => roleDe(a) === role);
    if (candidats.length === 0) return undefined;

    /* L'aliment nommé par le plan passe devant, s'il est là. */
    const voulu = modele.preferes?.[role];
    if (voulu !== undefined) {
      const nomme = candidats.find((a) => sansAccent(a.nom).includes(sansAccent(voulu)));
      if (nomme !== undefined) return nomme;
    }

    /* Départage stable : d'abord ce qui n'a pas encore servi aujourd'hui,
       puis l'ordre du stock. Un tri instable rendrait deux générations
       identiques différentes, et l'utilisateur croirait à un bug. */
    const neufs = candidats.filter((a) => !precedents.has(a.id));

    return (neufs.length > 0 ? neufs : candidats)[0];
  };

  const proteine = choisir(modele.proteine);
  const glucide = choisir(modele.glucide);
  const huile = choisir('huile');

  /* L'oléagineux pilote les lipides. À défaut — aucun en stock — c'est
     l'huile qui prend ce rôle, et elle cesse alors d'être une quantité fixe :
     sans elle, plus rien ne porterait les lipides. */
  const oleagineux = choisir(modele.lipide);
  const lipide = oleagineux ?? huile;

  const variables: Variables = {};
  if (proteine) variables.proteine = proteine;
  if (glucide) variables.glucide = glucide;
  if (lipide) variables.lipide = lipide;

  /* Quantités IMPOSÉES, pas des variables : elles pèsent peu sur les macros,
     et les laisser s'ajuster ferait apparaître des « 40 g de brocolis » qui ne
     veulent rien dire dans une assiette. Ce que le modèle du repas ne demande
     pas n'apparaît pas — pas de brocoli à 16 h, pas de fruit au dîner. */
  const fixes: Fixe[] = [];
  const imposes: Partial<Record<Role, Aliment>> = {};

  for (const { role, grammes } of modele.imposes) {
    // l'huile qui porte les lipides n'est plus une quantité fixe
    if (role === 'huile' && lipide?.id === huile?.id) continue;

    const aliment = choisir(role);
    if (aliment === undefined) continue;

    imposes[role] = aliment;
    /* SANS `unite`, LA QUANTITÉ S'ENTEND CRUE — c'est-à-dire À PESER.
       200 g de légume, ce sont 200 g sur la balance avant cuisson ; ce qui
       arrive dans l'assiette en découle par le rendement de l'aliment, et
       l'écran affiche les deux colonnes côte à côte.

       CE COMMENTAIRE DISAIT L'INVERSE — « cuit pour un légume, c'est ce
       qu'on SERT » — et contredisait `Fixe.unite` dans `types.ts`, qui pose
       'cru' par défaut « comme tout le reste de l'application ». Le code,
       lui, n'a jamais converti : `versReference` rend la quantité telle
       quelle quand `unite` est absent. C'était donc le commentaire qui
       mentait, pas le calcul. Deux commentaires contradictoires sur la même
       question, c'est une décision qu'on reprend à zéro à chaque relecture. */
    fixes.push({ aliment, grammes: grammes * portions });
  }

  const manquants = ([
    ['proteine', proteine], ['glucide', glucide], ['lipide', lipide],
  ] as const).filter(([, a]) => a === undefined).map(([r]) => r as Role);

  return { variables, fixes, manquants, imposes };
}

/* ------------------------------------------------ le stock fait la loi */

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
      return { variables, fixes, plafonnes, resultat };
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

  return {
    variables, fixes, plafonnes,
    resultat: calculer(cibles, variables, fixes, { glucidesTotaux }),
  };
}

/* --------------------------------------- le calculateur se débrouille seul */

export interface AuMieux extends Ajuste {
  /** ce que le calculateur a changé de lui-même, pour pouvoir le dire */
  echanges: { role: Role; retire: Aliment; mis: Aliment }[];
}

/** Combien un aliment coûte en gras pour chaque gramme de protéine apporté. */
const grasParProteine = (a: Aliment): number =>
  (a.prot100 > 0 ? a.lip100 / a.prot100 : Number.POSITIVE_INFINITY);

/**
 * À quel point ce repas rate ses cibles. Plus c'est bas, mieux c'est.
 *
 * Un blocage pèse plus lourd que n'importe quel écart : un repas qu'on ne
 * peut pas cuisiner n'est pas un repas presque juste.
 */
const penalite = (r: Resultat): number => {
  const blocages = r.diagnostics.filter((d) => d.gravite === 'blocage').length;
  const e = r.ecarts;

  return blocages * 1000
    + Math.abs(e.prot) / 2 + Math.abs(e.gluc) / 4 + Math.abs(e.lip);
};

/**
 * Essaie d'autres aliments quand la combinaison de départ ne tombe pas juste.
 *
 * Sans cela, l'application annonçait le problème et laissait l'utilisateur le
 * résoudre à la main : mettre les amandes à zéro, ajouter de l'huile, revenir
 * en arrière. C'est exactement le travail qu'un calculateur doit faire.
 *
 * Deux échanges seulement, ceux qui correspondent aux impasses réelles :
 *
 *  - **les lipides ne tiennent pas** — l'oléagineux tombe à zéro et le gras
 *    reste hors cible : on confie les lipides à l'huile, qui cesse alors
 *    d'être une quantité figée ;
 *  - **la protéine est trop grasse** — aucun oléagineux ne peut compenser :
 *    on essaie les protéines les plus maigres du stock, dans l'ordre.
 *
 * `verrous` protège ce que l'utilisateur a choisi lui-même. Un aliment qu'il
 * a mis là par une substitution n'est jamais remplacé dans son dos : corriger
 * à sa place ce qu'il vient de décider serait pire que de ne rien faire.
 */
export function resoudreAuMieux(
  depart: { variables: Variables; fixes: Fixe[] },
  cibles: Cibles,
  stockDe: (a: Aliment) => number,
  candidats: Aliment[],
  verrous: ReadonlySet<Role> = new Set(),
  glucidesTotaux = false,
  releves: Readonly<Partial<Record<Role, Aliment>>> = {},
): AuMieux {
  const base = ajusterAuStock(
    depart, cibles, stockDe, candidats, glucidesTotaux, releves);
  let meilleur: AuMieux = { ...base, echanges: [] };
  if (base.resultat.ok) return meilleur;

  const essayer = (
    variables: Variables,
    fixes: Fixe[],
    echange: { role: Role; retire: Aliment; mis: Aliment },
  ) => {
    const tente = ajusterAuStock(
      { variables, fixes }, cibles, stockDe, candidats, glucidesTotaux, releves);
    if (penalite(tente.resultat) >= penalite(meilleur.resultat)) return;

    /* Le plafonnement du stock peut faire revenir l'aliment qu'on venait de
       sortir : il redevient le relais d'un autre. Annoncer « X ne permettait
       pas de tenir les objectifs » alors que X est toujours au menu, sur sa
       propre ligne, est un mensonge d'affichage. Dans ce cas on garde le
       résultat, mais sans prétendre à un échange. */
    const revenu = Object.values(tente.variables).some((a) => a.id === echange.retire.id)
      || tente.fixes.some((f) => f.aliment.id === echange.retire.id);

    /* Et le remplaçant doit peser quelque chose. Quand le repas est déjà trop
       gras, l'huile promue variable retombe à zéro : annoncer « c'est l'huile
       qui s'en charge » sous une ligne vide n'aide personne. Les diagnostics
       disent alors la vérité — trop gras — et c'est suffisant. */
    const sert = tente.resultat.quantites.some(
      (q) => q.aliment.id === echange.mis.id && q.aCuire > 0);

    meilleur = { ...tente, echanges: revenu || !sert ? [] : [echange] };
  };

  /* 1. Les lipides : l'huile prend le relais de l'oléagineux. Elle est
        aujourd'hui une quantité figée ; on la libère pour qu'elle s'ajuste. */
  const oleagineux = depart.variables.lipide;
  if (oleagineux !== undefined && !verrous.has('lipide')) {
    const huiles = depart.fixes.filter((f) => roleDe(f.aliment) === 'huile');
    for (const f of huiles) {
      essayer(
        { ...depart.variables, lipide: f.aliment },
        depart.fixes.filter((x) => x !== f),
        { role: 'lipide', retire: oleagineux, mis: f.aliment },
      );
    }
  }

  /* 2. La protéine : la plus maigre d'abord. On s'arrête à trois essais —
        au-delà, on ne fait plus que raboter des dixièmes de gramme. */
  const proteine = depart.variables.proteine;
  if (proteine !== undefined && !verrous.has('proteine')) {
    /* Le rôle de CELUI QU'ON REMPLACE, pas le nom de la case. À 16 h la
       variable « proteine » porte un laitage : y glisser un blanc de poulet
       parce que la case s'appelle « proteine » donnait une collation au
       poulet — et, quand les blancs d'œufs étaient déjà servis en quantité
       imposée, le même aliment deux fois sur deux lignes. */
    const role = roleDe(proteine);

    /* Un aliment déjà au menu ne peut pas « remplacer » : il s'ajouterait à
       lui-même. */
    const dejaLa = new Set<Aliment['id']>([
      ...depart.fixes.map((f) => f.aliment.id),
      ...Object.values(depart.variables).map((a) => a.id),
    ]);

    const maigres = candidats
      .filter((c) => roleDe(c) === role && !dejaLa.has(c.id) && stockDe(c) > 0)
      .sort((a, b) => grasParProteine(a) - grasParProteine(b))
      .slice(0, 3);

    for (const c of maigres) {
      essayer(
        { ...depart.variables, proteine: c },
        depart.fixes,
        { role: 'proteine', retire: proteine, mis: c },
      );
    }
  }

  return meilleur;
}

/* ------------------------------------------- une journée, un seul frigo */

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
  const sorties = new Map<Repas, AuMieux>();
  for (const [cle, sortie] of resoudreLaPeriode(
    demandes.map((d) => ({ ...d, jour: 0 })), stockDe, candidats)) {
    sorties.set(cle.split('|')[1] as Repas, sortie);
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
    const dispo = d.plafonds === undefined
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

  for (const sortie of resoudreLaPeriode(demandes, ALaCarte, candidats).values()) {
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
