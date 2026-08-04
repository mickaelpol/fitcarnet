import { arrondir, resoudre } from './algebre';
import type {
  Aliment, Cibles, Diagnostic, Fixe, Macros, Options, Quantite, Resultat, Variables,
} from './types';

const TOLERANCE_DEFAUT: Macros = { kcal: 45, prot: 1.5, gluc: 2.5, lip: 1.2 };
const ARRONDI_DEFAUT = { proteine: 1, glucide: 5, lipide: 0.5 };

/**
 * Ramène une quantité saisie en cru ou en cuit vers l'état de référence de
 * l'aliment, seul état dans lequel ses valeurs nutritionnelles ont un sens.
 *
 * Exemples :
 *   100 g de riz CUIT      → référence 'cuit'  → 100 g (identité)
 *   100 g de saumon CUIT   → référence 'cru'   → 117,6 g de saumon cru
 *   40 g de riz SEC        → référence 'cuit'  → 120 g de riz cuit
 */
export function versReference(a: Aliment, grammes: number, unite?: 'cru' | 'cuit'): number {
  const r = a.ratio > 0 ? a.ratio : 1;
  const saisie = unite ?? a.etatReference;
  if (saisie === a.etatReference) return grammes;
  // saisie 'cuit' alors que la référence est 'cru'  → on divise par le rendement
  if (saisie === 'cuit') return grammes / r;
  // saisie 'cru' (ou sec) alors que la référence est 'cuit' → on multiplie
  return grammes * r;
}

/**
 * Combien peser AVANT cuisson pour obtenir la quantité cuite voulue.
 * Riz : 100 g cuits → 33,3 g secs.  Saumon : 100 g cuits → 117,6 g crus.
 */
export function pourObtenirCuit(a: Aliment, grammesCuits: number): number {
  const r = a.ratio > 0 ? a.ratio : 1;
  return grammesCuits / r;
}

const macrosDe = (a: Aliment, g: number): Macros => ({
  kcal: (a.kcal100 * g) / 100,
  prot: (a.prot100 * g) / 100,
  gluc: (a.gluc100 * g) / 100,
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
 * Convertit une quantité exprimée dans l'état de référence de l'aliment
 * en couple « à cuire » / « dans l'assiette ».
 *
 *  - référence CRUE (viandes, poissons) : la quantité EST le poids à cuire,
 *    l'assiette vaut moins (perte à la cuisson, ratio ≈ 0,85 ou 0,75).
 *  - référence CUITE (féculents, légumes) : la quantité EST le poids dans
 *    l'assiette, le poids à peser vaut moins (riz sec, ratio 3).
 */
export function convertir(a: Aliment, reference: number): { aCuire: number; assiette: number } {
  const r = a.ratio > 0 ? a.ratio : 1;

  if (a.etatReference === 'cru') {
    return { aCuire: reference, assiette: reference * r };
  }

  return { aCuire: reference / r, assiette: reference };
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

  // chaque quantité déjà possédée est ramenée à l'état de référence de son aliment
  const fixesRef = fixes.map((f) => ({
    aliment: f.aliment,
    reference: versReference(f.aliment, f.grammes, f.unite),
  }));
  const macrosFixes = somme(fixesRef.map((f) => macrosDe(f.aliment, f.reference)));

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
      (m === 'prot' ? a.prot100 : m === 'gluc' ? a.gluc100 : a.lip100) / 100;

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
  const toutes: Macros[] = fixesRef.map((f) => macrosDe(f.aliment, f.reference));

  fixesRef.forEach((f) => {
    quantites.push({ aliment: f.aliment, ...convertir(f.aliment, f.reference), impose: true });
  });

  (['proteine', 'glucide', 'lipide'] as const).forEach((nom) => {
    const aliment = variables[nom];
    if (!aliment) return;
    const q = arrondis[nom];
    if (q <= 0) return;
    toutes.push(macrosDe(aliment, q));
    quantites.push({ aliment, ...convertir(aliment, q), impose: false });
  });

  const macros = somme(toutes);
  const ecarts: Macros = {
    kcal: macros.kcal - cibles.kcal,
    prot: macros.prot - cibles.prot,
    gluc: macros.gluc - cibles.gluc,
    lip: macros.lip - cibles.lip,
  };

  // diagnostics explicites sur les écarts qui subsistent
  if (Math.abs(ecarts.lip) > tolerance.lip) {
    if (ecarts.lip > 0 && arrondis.lipide <= 0) {
      diagnostics.push({
        gravite: 'blocage',
        code: 'lipides_incompressibles',
        message:
          `Trop gras : ${variables.proteine?.nom.toLowerCase() ?? 'ce repas'} apporte déjà ` +
          `${(variables.proteine ? macrosDe(variables.proteine, arrondis.proteine).lip : macrosFixes.lip).toFixed(1)} g de gras, ` +
          `alors que l'objectif est de ${cibles.lip} g. ` +
          'Choisis une viande ou un poisson plus maigre.',
      });
    } else {
      diagnostics.push({
        gravite: 'avertissement',
        code: 'lipides_hors_cible',
        message: ecarts.lip > 0
          ? `Un peu trop gras : ${ecarts.lip.toFixed(1)} g de plus que l'objectif.`
          : `Pas assez gras : ${(-ecarts.lip).toFixed(1)} g de moins que l'objectif. ` +
            'Ajoute des oléagineux ou un peu d\'huile.',
      });
    }
  }
  if (Math.abs(ecarts.gluc) > tolerance.gluc) {
    diagnostics.push({
      gravite: arrondis.glucide <= 0 ? 'blocage' : 'avertissement',
      code: 'glucides_hors_cible',
      message:
        arrondis.glucide <= 0
          ? 'Ce que tu as déjà dépasse l\'objectif en féculents et sucres. ' +
            'Réduis une quantité, ou garde-en pour le repas suivant.'
          : (ecarts.gluc > 0
              ? `Un peu trop de féculents : ${ecarts.gluc.toFixed(1)} g de plus que l'objectif.`
              : `Il manque ${(-ecarts.gluc).toFixed(1)} g de féculents.`),
    });
  }
  if (Math.abs(ecarts.prot) > tolerance.prot) {
    diagnostics.push({
      gravite: 'avertissement',
      code: 'proteines_hors_cible',
      message: ecarts.prot > 0
        ? `Un peu trop de protéines : ${ecarts.prot.toFixed(1)} g de plus que l'objectif.`
        : `Il manque ${(-ecarts.prot).toFixed(1)} g de protéines.`,
    });
  }

  // Les kcal ne sont pas une contrainte indépendante : elles découlent des
  // macros. Si la cible kcal ne correspond pas à 4·P + 4·G + 9·L, aucune
  // combinaison d'aliments ne peut satisfaire les deux — autant le dire.
  const kcalDesMacros = 4 * cibles.prot + 4 * cibles.gluc + 9 * cibles.lip;
  const incoherence = cibles.kcal - kcalDesMacros;
  if (Math.abs(incoherence) > 15) {
    diagnostics.push({
      gravite: 'info',
      code: 'cibles_incoherentes',
      message:
        `Tes objectifs ne collent pas entre eux : ${cibles.prot} g de protéines, ` +
        `${cibles.gluc} g de glucides et ${cibles.lip} g de lipides font forcément ` +
        `${kcalDesMacros.toFixed(0)} calories, pas ${cibles.kcal.toFixed(0)}. ` +
        'L\'app respecte les grammes ; les calories suivent.',
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
