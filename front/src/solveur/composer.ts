import { calculer } from './solveur';
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
export type Role = 'proteine' | 'glucide' | 'fruit' | 'lipide' | 'huile' | 'legume';

/* Le fruit a son propre rôle depuis qu'un petit-déjeuner doit pouvoir porter
   un féculent ET un fruit. Confondus sous « glucide », l'un chassait l'autre. */
const ROLE_DE: Record<Aliment['categorie'], Role | null> = {
  prot: 'proteine',
  lait: 'proteine',
  fec: 'glucide',
  fruit: 'fruit',
  ole: 'lipide',
  huile: 'huile',
  leg: 'legume',
  autre: null,
};

export const roleDe = (a: Aliment): Role | null => ROLE_DE[a.categorie];

/** Grammes de légume servis à chaque personne, avant tout calcul de macros. */
export const LEGUME_PAR_PORTION = 150;

/**
 * Grammes d'huile par personne — une cuillère à soupe.
 *
 * L'huile et l'oléagineux figurent TOUS DEUX au repas, mais un seul des deux
 * peut s'ajuster : trois macros ne déterminent que trois inconnues, et laisser
 * les quatre variables libres donnerait une infinité de solutions. On fige
 * donc celle qui se dose à la cuillère et non à la balance ; l'oléagineux
 * absorbe le reste. La quantité reste modifiable repas par repas.
 */
export const HUILE_PAR_PORTION = 10;

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
  /** ce qui s'ajuste pour atteindre les cibles — trois au maximum */
  variables: Role[];
  /** ce qui est servi en quantite fixe, en grammes par personne */
  imposes: { role: Role; grammes: number }[];
}

export const MODELE: Record<Repas, ModeleRepas> = {
  // Matin : oeufs, flocons d'avoine, un fruit, des amandes.
  R1: {
    variables: ['proteine', 'glucide', 'lipide'],
    imposes: [{ role: 'fruit', grammes: FRUIT_PAR_PORTION.R1 }],
  },
  // Midi : proteine, feculent, oleagineux, huile, legume.
  R2: {
    variables: ['proteine', 'glucide', 'lipide'],
    imposes: [
      { role: 'huile', grammes: HUILE_PAR_PORTION },
      { role: 'legume', grammes: LEGUME_PAR_PORTION },
    ],
  },
  // Collation : comme le matin. La seconde proteine — le skyr a cote des
  // blancs d'oeufs — s'ajoute a la main : sa quantite n'appartient qu'a toi.
  R3: {
    variables: ['proteine', 'glucide', 'lipide'],
    imposes: [{ role: 'fruit', grammes: FRUIT_PAR_PORTION.R3 }],
  },
  R4: {
    variables: ['proteine', 'glucide', 'lipide'],
    imposes: [
      { role: 'huile', grammes: HUILE_PAR_PORTION },
      { role: 'legume', grammes: LEGUME_PAR_PORTION },
    ],
  },
};


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

  const choisir = (role: Role): Aliment | undefined => {
    const candidats = utilisables.filter((a) => roleDe(a) === role);
    if (candidats.length === 0) return undefined;

    /* Départage stable : d'abord ce qui n'a pas encore servi aujourd'hui,
       puis l'ordre du stock. Un tri instable rendrait deux générations
       identiques différentes, et l'utilisateur croirait à un bug. */
    const neufs = candidats.filter((a) => !precedents.has(a.id));

    return (neufs.length > 0 ? neufs : candidats)[0];
  };

  const modele = MODELE[repas];

  const proteine = choisir('proteine');
  const glucide = choisir('glucide');
  const huile = choisir('huile');

  /* L'oléagineux pilote les lipides. À défaut — aucun en stock — c'est
     l'huile qui prend ce rôle, et elle cesse alors d'être une quantité fixe :
     sans elle, plus rien ne porterait les lipides. */
  const oleagineux = choisir('lipide');
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
    /* Sans `unite`, la quantité s'entend dans l'état de référence de
       l'aliment : cuit pour un légume, une huile, un fruit. C'est ce qu'on
       SERT. Le poids à peser en découle, il n'est jamais saisi ici. */
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
  role: 'proteine' | 'glucide' | 'lipide';
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

/** Ce qui peut prendre le relais d'un rôle : l'huile supplée l'oléagineux. */
const RELEVE: Record<'proteine' | 'glucide' | 'lipide', Role[]> = {
  proteine: ['proteine'],
  glucide: ['glucide'],
  lipide: ['lipide', 'huile'],
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
): Ajuste {
  const variables: Variables = { ...depart.variables };
  let fixes = [...depart.fixes];
  const plafonnes: Plafonne[] = [];

  const utilises = new Set<number | string>([
    ...Object.values(variables).map((a) => a.id),
    ...fixes.map((f) => f.aliment.id),
  ]);

  /* Une boucle bornée : chaque tour consomme un aliment du stock, et le
     stock est fini. La borne n'est là que pour qu'un cas non prévu s'arrête
     au lieu de figer l'écran. */
  for (let tour = 0; tour < 12; tour += 1) {
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

    const releve = candidats.find(
      (c) => RELEVE[deborde.cle].includes(roleDe(c) as Role)
        && !utilises.has(c.id)
        && stockDe(c) > 0);

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
): AuMieux {
  const base = ajusterAuStock(depart, cibles, stockDe, candidats, glucidesTotaux);
  let meilleur: AuMieux = { ...base, echanges: [] };
  if (base.resultat.ok) return meilleur;

  const essayer = (
    variables: Variables,
    fixes: Fixe[],
    echange: { role: Role; retire: Aliment; mis: Aliment },
  ) => {
    const tente = ajusterAuStock(
      { variables, fixes }, cibles, stockDe, candidats, glucidesTotaux);
    if (penalite(tente.resultat) < penalite(meilleur.resultat)) {
      meilleur = { ...tente, echanges: [echange] };
    }
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
    const maigres = candidats
      .filter((c) => roleDe(c) === 'proteine' && c.id !== proteine.id && stockDe(c) > 0)
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
