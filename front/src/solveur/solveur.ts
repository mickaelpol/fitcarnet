import { arrondir, resoudre } from './algebre';
/* Chemin RELATIF, jamais `@/calcul/nutrition` : ce sont des VALEURS, et
   `tsc -p tsconfig.tests.json` ne réécrit pas l'alias — le `require('@/…')`
   partirait tel quel dans `dist-tests/` et casserait au `node --test`. */
import {
  KCAL_FIBRES, KCAL_GLUCIDES, KCAL_LIPIDES, KCAL_PROTEINES,
} from '../calcul/nutrition';
import type {
  Aliment, Cibles, Diagnostic, Fixe, Macros, Options, Quantite, Resultat, Variables,
} from './types';

const TOLERANCE_DEFAUT: Macros = { kcal: 45, prot: 1.5, gluc: 2.5, lip: 1.2 };
const ARRONDI_DEFAUT = { proteine: 1, glucide: 5, lipide: 0.5 };

/** Au-delà, l'écart entre les kcal annoncées et les grammes n'est plus un arrondi. */
export const SEUIL_COHERENCE = 15;

/**
 * LES CALORIES QUE DÉCRIVENT DES GRAMMES, dans la convention de l'application.
 *
 * Les coefficients viennent de `src/calcul/nutrition.ts`, qui fait foi — ils ne
 * sont pas réécrits ici. Trois copies de `4·P + 4·G + 9·L` vivaient dans le
 * projet (`solveur.ts`, et deux fois dans `app/objectifs.tsx`), toutes en
 * Atwater AMÉRICAIN, celui que l'en-tête de `nutrition.ts` interdit.
 *
 * `fibres` est facultatif parce que `Cibles` ne sait pas l'exprimer : une cible
 * dit trois grammages et des calories, jamais sa part de fibres. Absent, il ne
 * vaut pas « zéro fibre » — il veut dire « cette macro n'en parle pas », et
 * c'est à l'appelant de décider ce qu'il en fait. `ecartDeCoherence` le fait.
 */
export const kcalDesMacros = (
  m: { prot: number; gluc: number; lip: number; fibres?: number },
): number =>
  KCAL_PROTEINES * m.prot
  + KCAL_GLUCIDES * m.gluc
  + KCAL_LIPIDES * m.lip
  + KCAL_FIBRES * (m.fibres ?? 0);

/**
 * DE COMBIEN LES CALORIES ANNONCÉES RATENT CE QUE LES GRAMMES PEUVENT DONNER.
 * `0` quand la cible est atteignable : il n'y a alors rien à signaler.
 *
 * En convention européenne, les grammes de glucides excluent les fibres : la
 * cible décrit un seul nombre de calories, et l'écart se lit directement.
 *
 * En glucides TOTAUX, les fibres sont DEDANS sans qu'on sache combien. Les
 * mêmes grammes couvrent alors tout un intervalle — de « tout en fibres »
 * (2 kcal/g) à « aucune fibre » (4 kcal/g) — et une cible qui tombe dedans est
 * atteignable. La compter à 4 kcal/g accusait à tort dès 7,5 g de fibres.
 * On ne devine pas la part manquante : on refuse de trancher, ce qui est la
 * seule réponse honnête quand la donnée n'est pas là.
 */
export const ecartDeCoherence = (cibles: Cibles, glucidesTotaux = false): number => {
  const sansFibres = kcalDesMacros(cibles);
  if (!glucidesTotaux) return cibles.kcal - sansFibres;

  const toutEnFibres = kcalDesMacros({ ...cibles, gluc: 0, fibres: cibles.gluc });
  if (cibles.kcal > sansFibres) return cibles.kcal - sansFibres;
  if (cibles.kcal < toutEnFibres) return cibles.kcal - toutEnFibres;

  return 0;
};

/** Bornes des calories que ces grammes peuvent décrire, en glucides totaux. */
export const bornesDeCoherence = (cibles: Cibles): { min: number; max: number } => ({
  min: kcalDesMacros({ ...cibles, gluc: 0, fibres: cibles.gluc }),
  max: kcalDesMacros(cibles),
});

/**
 * Ramène une quantité vers le POIDS PESÉ, seul état dans lequel les valeurs
 * nutritionnelles d'un aliment ont un sens dans cette application.
 *
 * Une seule opération possible, et une seule direction : ce qui est saisi
 * cuit se divise par le rendement, le reste est déjà au bon endroit.
 *
 * Exemples :
 *   40 g de riz SEC       → 40 g   (identité : c'est déjà ce qu'on pèse)
 *   120 g de riz CUIT     → 34 g de riz sec, avec un rendement de 3,53
 *   100 g de saumon CUIT  → 118 g de saumon cru, avec un rendement de 0,85
 */
export function versReference(a: Aliment, grammes: number, unite?: 'cru' | 'cuit'): number {
  const r = a.ratio > 0 ? a.ratio : 1;

  return unite === 'cuit' ? grammes / r : grammes;
}

/**
 * Combien peser AVANT cuisson pour obtenir la quantité cuite voulue.
 * Riz : 100 g cuits → 33,3 g secs.  Saumon : 100 g cuits → 117,6 g crus.
 */
export function pourObtenirCuit(a: Aliment, grammesCuits: number): number {
  const r = a.ratio > 0 ? a.ratio : 1;
  return grammesCuits / r;
}

/**
 * Les glucides d'un aliment, tels que la CIBLE les entend.
 *
 * En convention européenne — celle des données de l'application — les fibres
 * sont hors des glucides. Une prescription nord-américaine, elle, les compte
 * dedans. Quand la cible vient d'un tel plan, on ajoute donc les fibres au
 * moment de comparer, et seulement à ce moment-là.
 */
const glucidesDe = (a: Aliment, totaux: boolean): number =>
  a.gluc100 + (totaux ? (a.fibres100 ?? 0) : 0);

const macrosDe = (a: Aliment, g: number, glucidesTotaux = false): Macros => ({
  kcal: (a.kcal100 * g) / 100,
  prot: (a.prot100 * g) / 100,
  gluc: (glucidesDe(a, glucidesTotaux) * g) / 100,
  lip: (a.lip100 * g) / 100,
});

const somme = (liste: Macros[]): Macros =>
  liste.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      prot: acc.prot + m.prot,
      gluc: acc.gluc + m.gluc,
      lip: acc.lip + m.lip,
    }),
    { kcal: 0, prot: 0, gluc: 0, lip: 0 },
  );

/**
 * Convertit un poids pesé en couple « à cuire » / « dans l'assiette ».
 *
 * Le poids pesé EST le poids à cuire — c'est la définition de la convention.
 * L'assiette s'en déduit par le rendement : 40 g de riz sec à 3,53 donnent
 * 141 g dans le plat ; 120 g de poulet cru à 0,75 en donnent 90.
 *
 * Conséquence à ne jamais perdre de vue : la colonne « à cuire », celle que
 * l'utilisateur pose sur sa balance, ne dépend PAS du rendement. Un rendement
 * approximatif rend l'annonce du poids servi approximative, et rien d'autre.
 */
export function convertir(a: Aliment, reference: number): { aCuire: number; assiette: number } {
  const r = a.ratio > 0 ? a.ratio : 1;

  return { aCuire: reference, assiette: reference * r };
}

/**
 * Calcule les quantités des trois variables pour atteindre les cibles.
 *
 * Le système est linéaire : trois inconnues (protéine, glucide, lipide),
 * trois équations (protéines, glucides, lipides). On le résout exactement.
 * Si une solution est négative — physiquement impossible — on fixe cette
 * variable à zéro et on résout le système réduit en privilégiant les
 * protéines et les glucides, l'écart se reportant alors sur les lipides.
 *
 * Les macros finales sont recalculées sur les quantités ARRONDIES : ce qui
 * est affiché correspond exactement à ce qui sera pesé.
 */
export function calculer(
  cibles: Cibles,
  variables: Variables,
  fixes: Fixe[] = [],
  options: Options = {},
): Resultat {
  const diagnostics: Diagnostic[] = [];
  const arrondi = { ...ARRONDI_DEFAUT, ...options.arrondi };
  const tolerance = { ...TOLERANCE_DEFAUT, ...options.tolerance };
  const glucidesTotaux = options.glucidesTotaux === true;

  // chaque quantité déjà possédée est ramenée à l'état de référence de son aliment
  const fixesRef = fixes.map((f) => ({
    aliment: f.aliment,
    reference: versReference(f.aliment, f.grammes, f.unite),
  }));
  const macrosFixes = somme(fixesRef.map((f) => macrosDe(f.aliment, f.reference, glucidesTotaux)));

  // Chaque variable est rattachée à la macro qu'elle pilote. On ne résout que
  // le sous-système correspondant aux variables réellement disponibles : avec
  // moins de trois, les macros non couvertes dérivent et sont rapportées.
  const roles: { cle: keyof Variables; macro: 'prot' | 'gluc' | 'lip' }[] = [
    { cle: 'proteine', macro: 'prot' },
    { cle: 'glucide', macro: 'gluc' },
    { cle: 'lipide', macro: 'lip' },
  ];
  const actifs = roles.filter((r) => variables[r.cle] !== undefined);

  const quantitesVar: Record<string, number> = { proteine: 0, glucide: 0, lipide: 0 };

  if (actifs.length === 0) {
    diagnostics.push({
      gravite: 'avertissement',
      code: 'aucune_marge',
      message:
        'Tout est verrouillé : rien ne peut être ajusté. Voici ce que donne ' +
        'ce que tu as, et ce qui manque pour tomber juste.',
    });
  } else {
    const par100 = (a: Aliment, m: 'prot' | 'gluc' | 'lip') =>
      (m === 'prot' ? a.prot100
        : m === 'gluc' ? glucidesDe(a, glucidesTotaux)
          : a.lip100) / 100;

    const A = actifs.map((eq) => actifs.map((v) => par100(variables[v.cle]!, eq.macro)));
    const b = actifs.map((eq) => cibles[eq.macro] - macrosFixes[eq.macro]);

    let x = resoudre(A, b);

    if (x === null) {
      diagnostics.push({
        gravite: 'blocage',
        code: 'systeme_singulier',
        message:
          'Ces aliments se ressemblent trop pour que le calcul fonctionne. ' +
          'Choisis-en un plus riche en protéines, un plus riche en féculents ' +
          'et un plus gras.',
      });
      x = actifs.map(() => 0);
    }

    // une quantité négative n'a pas de sens : on la met à zéro et on résout
    // le sous-système restant, l'écart se reportant sur la macro abandonnée
    for (let essai = 0; essai < 3; essai++) {
      const negatifs = x.map((v, i) => (v < -1e-6 ? i : -1)).filter((i) => i >= 0);
      if (negatifs.length === 0) break;

      negatifs.forEach((i) => {
        diagnostics.push({
          gravite: 'avertissement',
          code: 'quantite_negative',
          message:
            `Pas de ${variables[actifs[i]!.cle]!.nom.toLowerCase()} dans ce repas : ` +
            "le reste apporte déjà tout ce qu'il faut.",
        });
      });

      const gardes = actifs.map((_, i) => i).filter((i) => !negatifs.includes(i));
      const nouveau = actifs.map(() => 0);
      if (gardes.length > 0) {
        const sousA = gardes.map((eq) => gardes.map((v) => par100(variables[actifs[v]!.cle]!, actifs[eq]!.macro)));
        const sousB = gardes.map((eq) => cibles[actifs[eq]!.macro] - macrosFixes[actifs[eq]!.macro]);
        const sol = resoudre(sousA, sousB);
        if (sol) gardes.forEach((v, i) => { nouveau[v] = Math.max(0, sol[i]!); });
      }
      x = nouveau;
    }

    actifs.forEach((r, i) => { quantitesVar[r.cle] = Math.max(0, x![i]!); });
  }

  // arrondi AVANT le calcul des macros : ce qui est affiché est ce qui sera pesé
  const brut = quantitesVar;
  const arrondis = {
    proteine: Math.max(0, arrondir(brut.proteine, arrondi.proteine)),
    glucide: Math.max(0, arrondir(brut.glucide, arrondi.glucide)),
    lipide: Math.max(0, arrondir(brut.lipide, arrondi.lipide)),
  };

  const quantites: Quantite[] = [];
  const toutes: Macros[] = fixesRef.map((f) => macrosDe(f.aliment, f.reference, glucidesTotaux));

  fixesRef.forEach((f) => {
    quantites.push({ aliment: f.aliment, ...convertir(f.aliment, f.reference), impose: true });
  });

  (['proteine', 'glucide', 'lipide'] as const).forEach((nom) => {
    const aliment = variables[nom];
    if (!aliment) return;
    const q = arrondis[nom];
    if (q <= 0) return;
    toutes.push(macrosDe(aliment, q, glucidesTotaux));
    quantites.push({ aliment, ...convertir(aliment, q), impose: false });
  });

  const macros = somme(toutes);
  const ecarts: Macros = {
    kcal: macros.kcal - cibles.kcal,
    prot: macros.prot - cibles.prot,
    gluc: macros.gluc - cibles.gluc,
    lip: macros.lip - cibles.lip,
  };

  /* ------------------------------------------------------------------
   * QUI PORTE LE SURPLUS, ET COMBIEN EN RETIRER.
   *
   * « Ce que tu as déjà dépasse l'objectif en féculents et sucres. Réduis une
   * quantité. » — LAQUELLE, ET DE COMBIEN ? Le message ne le disait pas, et
   * c'est la seule chose qu'on veuille savoir devant sa balance à midi.
   * L'information existe pourtant ici même : on connaît l'écart au gramme
   * près, et on sait quel aliment imposé apporte quoi.
   *
   * ON DÉSIGNE LE PLUS GROS PORTEUR, PAS TOUS. Répartir le surplus sur trois
   * aliments donnerait trois nombres à soustraire, trois pesées à refaire et
   * une décision de plus à prendre. Un seul aliment, un seul nombre, un seul
   * geste — quitte à ce que ce soit approximatif : la balance tranchera.
   * ------------------------------------------------------------------ */
  const porteurDe = (macro: 'prot' | 'gluc' | 'lip') => {
    let tete: { nom: string; apport: number; quantite: number } | null = null;
    for (const f of fixesRef) {
      if (f.reference <= 0) continue;
      const apport = macrosDe(f.aliment, f.reference, glucidesTotaux)[macro];
      if (apport <= 0) continue;
      if (tete === null || apport > tete.apport) {
        tete = { nom: f.aliment.nom, apport, quantite: f.reference };
      }
    }

    return tete;
  };

  /**
   * « Retire environ 47 g de pommes de terre. » — OU « ajoute environ 44 g ».
   *
   * LES DEUX SENS, DANS UNE SEULE FONCTION, et ce n'était pas le cas au
   * premier essai : je n'avais écrit que le retrait, et le manque s'affichait
   * comme « trop de glucides de -7,5 g ». Un nombre négatif derrière le mot
   * « trop » ne se lit pas, il se déchiffre. Un écart a un signe ; le message
   * doit changer de verbe avec lui, pas se contenter de changer de nombre.
   *
   * Rend une chaîne VIDE quand il n'y a rien d'utile à dire — aucun aliment
   * du repas ne porte cette macro, ou le calcul donnerait zéro gramme. Mieux
   * vaut le message générique qu'un conseil qui désigne le mauvais aliment.
   */
  const conseil = (macro: 'prot' | 'gluc' | 'lip', ecart: number): string => {
    const p = porteurDe(macro);
    if (p === null) return '';
    const parGramme = p.apport / p.quantite;
    if (!(parGramme > 0)) return '';
    const grammes = Math.round(Math.abs(ecart) / parGramme);
    if (grammes <= 0) return '';
    const nom = p.nom.toLowerCase();

    if (ecart < 0) return ` Ajoute environ ${grammes} g de « ${nom} ».`;

    /* Retirer plus qu'il n'y en a n'a pas de sens : on le dit, plutôt que
       d'annoncer « retire 400 g » d'un aliment qui n'en pèse que 290. */
    return grammes >= p.quantite
      ? ` Même en retirant tout le « ${nom} » (${Math.round(p.quantite)} g), `
        + "il resterait un écart : c'est ailleurs qu'il faut couper."
      : ` Retire environ ${grammes} g de « ${nom} » `
        + '— ou garde-les pour le repas suivant.';
  };

  /** L'écart, dit en toutes lettres, avec le total et la cible. */
  const constat = (quoi: string, ecart: number, total: number, cible: number): string =>
    (ecart > 0
      ? `Trop de ${quoi} de ${ecart.toFixed(1)} g`
      : `Il manque ${(-ecart).toFixed(1)} g de ${quoi}`)
    + ` : ce repas en apporte ${total.toFixed(1)} g `
    + `pour un objectif de ${cible.toFixed(1)} g.`;

  // diagnostics explicites sur les écarts qui subsistent
  if (Math.abs(ecarts.lip) > tolerance.lip) {
    if (ecarts.lip > 0 && arrondis.lipide <= 0) {
      diagnostics.push({
        gravite: 'blocage',
        code: 'lipides_incompressibles',
        /* On compare le gras TOTAL du repas à l'objectif. L'ancienne version
           n'annonçait que celui de la protéine — « apporte déjà 1,2 g alors
           que l'objectif est de 51,6 g » — un rapprochement qui ne voulait
           rien dire et laissait croire à un bug. */
        message:
          `Trop gras de ${ecarts.lip.toFixed(1)} g : ce repas en apporte ` +
          `${macros.lip.toFixed(1)} g pour un objectif de ${cibles.lip} g, ` +
          'sans le moindre oléagineux. Choisis une viande ou un poisson plus maigre.',
      });
    } else {
      diagnostics.push({
        gravite: 'avertissement',
        code: 'lipides_hors_cible',
        message: constat('lipides', ecarts.lip, macros.lip, cibles.lip)
          + (conseil('lip', ecarts.lip)
            || (ecarts.lip > 0
              ? ' Choisis une source plus maigre.'
              : " Ajoute des oléagineux ou un peu d'huile.")),
      });
    }
  }
  if (Math.abs(ecarts.gluc) > tolerance.gluc) {
    diagnostics.push({
      gravite: arrondis.glucide <= 0 ? 'blocage' : 'avertissement',
      code: 'glucides_hors_cible',
      /* LE SIGNE DE L'ÉCART DÉCIDE DU VERBE, pas le fait qu'il reste ou non
         quelque chose d'ajustable. `arrondis.glucide <= 0` dit seulement que
         le calcul n'a plus de levier de ce côté — souvent parce que TU as
         imposé la quantité du féculent. Ça ne dit rien du sens de l'écart. */
      message: constat('glucides', ecarts.gluc, macros.gluc, cibles.gluc)
        + (conseil('gluc', ecarts.gluc)
          || (ecarts.gluc > 0
            ? ' Réduis une quantité, ou garde-en pour le repas suivant.'
            : ' Ajoute un féculent à ce repas.')),
    });
  }
  if (Math.abs(ecarts.prot) > tolerance.prot) {
    diagnostics.push({
      gravite: 'avertissement',
      code: 'proteines_hors_cible',
      message: constat('protéines', ecarts.prot, macros.prot, cibles.prot)
        + conseil('prot', ecarts.prot),
    });
  }

  /* Les kcal ne sont pas une contrainte indépendante : elles découlent des
     macros. Si la cible kcal ne correspond pas à ce que les grammes peuvent
     donner, aucune combinaison d'aliments ne satisfait les deux — autant le
     dire.

     M1, 15 septembre 2026. La formule était réécrite ici en `4·P + 4·G + 9·L`,
     l'Atwater AMÉRICAIN que l'en-tête de `nutrition.ts` interdit. Tout le reste
     de `calculer` sait lire `glucidesTotaux` ; pas cette ligne. En glucides
     totaux la cible en glucides COMPREND les fibres, à 2 kcal/g et non 4, si
     bien que 7,5 g de fibres suffisaient à franchir le seuil de 15 kcal et à
     accuser une cible parfaitement atteignable. Mesuré sur
     {710 kcal, 40 P, 100 G, 20 L} : « font forcément 740 calories, pas 710 »,
     alors que 100 g de glucides totaux dont 15 g de fibres font bien 710. */
  const incoherence = ecartDeCoherence(cibles, glucidesTotaux);
  if (Math.abs(incoherence) > SEUIL_COHERENCE) {
    const grammes =
      `${cibles.prot} g de protéines, ${cibles.gluc} g de glucides ` +
      `et ${cibles.lip} g de lipides`;
    const bornes = bornesDeCoherence(cibles);
    diagnostics.push({
      gravite: 'info',
      code: 'cibles_incoherentes',
      message:
        `Tes objectifs ne collent pas entre eux : ${grammes} font `
        /* En glucides totaux, la part de fibres n'est PAS dans la cible. On
           annonce donc l'intervalle que les grammes peuvent couvrir plutôt
           qu'un chiffre unique qu'il faudrait inventer. */
        + (glucidesTotaux
          ? `entre ${bornes.min.toFixed(0)} et ${bornes.max.toFixed(0)} calories `
            + 'selon la part de fibres, '
          : `forcément ${bornes.max.toFixed(0)} calories, `)
        + `pas ${cibles.kcal.toFixed(0)}. `
        + 'L\'app respecte les grammes ; les calories suivent.',
    });
  }

  // Un aliment ajustable qui se réduit à presque rien n'apporte rien au repas :
  // autant le dire plutôt que d'afficher « 1 g de thon ».
  const roleMacro: Record<string, { m: 'prot' | 'gluc' | 'lip'; mot: string }> = {
    proteine: { m: 'prot', mot: 'protéines' },
    glucide:  { m: 'gluc', mot: 'glucides' },
    lipide:   { m: 'lip',  mot: 'lipides' },
  };
  (['proteine', 'glucide', 'lipide'] as const).forEach((cle) => {
    const aliment = variables[cle];
    const q = arrondis[cle];
    if (!aliment || q <= 0 || q >= 8) return;
    const apport = macrosDe(aliment, q)[roleMacro[cle]!.m];
    diagnostics.push({
      gravite: 'avertissement',
      code: 'apport_negligeable',
      message:
        `${aliment.nom} ne pèse quasiment rien ici (${q.toFixed(1)} g, soit ` +
        `${apport.toFixed(1)} g de ${roleMacro[cle]!.mot}) : le reste du repas couvre ` +
        `déjà l'objectif. Retire-le, ou réduis ce que tu as déjà mis.`,
    });
  });

  const ok =
    Math.abs(ecarts.prot) <= tolerance.prot &&
    Math.abs(ecarts.gluc) <= tolerance.gluc &&
    Math.abs(ecarts.lip) <= tolerance.lip;

  return { ok, quantites, macros, cibles, ecarts, diagnostics };
}
