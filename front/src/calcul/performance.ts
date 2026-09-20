import type { SeanceExercice, Serie } from '@/api/types';

/**
 * Mesures de progression.
 *
 * Trois indicateurs, chacun valide dans son domaine :
 *   - le 1RM, calculé UNIQUEMENT sur les séries courtes ;
 *   - le volume, valable partout ;
 *   - le temps, pour les efforts chronométrés.
 */

/**
 * Au-delà de ce nombre de répétitions, on mesure l'endurance, pas la force :
 * aucune formule de 1RM n'est fiable. Une série de 93 répétitions à 32 kg
 * donnerait, selon la formule, entre 50 et 131 kg — c'est-à-dire davantage
 * qu'une série de 7 à 35 kg, ce qui est absurde. On l'écarte donc du calcul,
 * et son effort est compté dans le volume.
 */
export const REPS_MAX_POUR_1RM = 15;

/**
 * Le coefficient d'Epley, et il n'est ecrit QU'ICI.
 *
 * Il l'etait trois fois dans ce meme fichier — la formule, son inverse, et le
 * calcul des repetitions par palier. Trois copies d'Epley aux bornes
 * divergentes avaient deja produit un « record » de 79,96 kg que la formule
 * elle-meme declare invalide (constat E1) ; les avoir toutes rapatriees ici
 * n'aurait servi a rien en laissant le nombre se repeter dans le module de
 * reference lui-meme. Releve le 15 septembre 2026.
 */
const COEF_EPLEY = 0.0333;


/** Estimation d'Epley, fiable jusqu'à une quinzaine de répétitions. */
export const epley = (poids: number, reps: number): number =>
  poids * (1 + COEF_EPLEY * reps);

/**
 * Le 1RM d'un ensemble de séries : la meilleure série courte.
 *
 * Une répétition unique est prise telle quelle, comme dans
 * `estimerDepuisEssai` : le maximum EST la charge soulevée, par définition, et
 * Epley y ajouterait 3,3 % inventés. La garde n'existait que sur l'un des deux
 * chemins — la carte d'exercice annonçait 103,3 kg là où le calculateur
 * affichait 100 kg, pour la même série.
 */
export function rmDesSeries(series: Serie[]): number | null {
  let meilleur: number | null = null;

  for (const s of series) {
    if (s.reps === null || s.poids === null) continue;
    if (s.reps < 1 || s.reps > REPS_MAX_POUR_1RM || s.poids <= 0) continue;

    const rm = s.reps === 1 ? s.poids : epley(s.poids, s.reps);
    if (meilleur === null || rm > meilleur) meilleur = rm;
  }

  return meilleur === null ? null : Math.round(meilleur * 10) / 10;
}

/** Volume : tout ce qui a été soulevé, séries longues comprises. */
export function volumeDesSeries(series: Serie[]): number {
  let total = 0;
  for (const s of series) {
    if (s.reps === null || s.poids === null) continue;
    if (s.reps > 0 && s.poids > 0) total += s.reps * s.poids;
  }

  return Math.round(total);
}

export const repsTotales = (series: Serie[]): number =>
  series.reduce((n, s) => n + (s.reps ?? 0), 0);

/** Temps total d'un effort chronométré, en secondes. */
export function tempsTotal(bloc: SeanceExercice): number | null {
  const t = bloc.secondesTotal ?? null;
  if (t !== null && t > 0) return t;

  // repli : la somme des temps de série, pour un exercice en tenue
  const somme = bloc.series.reduce((n, s) => n + (s.secondes ?? 0), 0);

  return somme > 0 ? somme : null;
}

/** Les trois indicateurs d'un exercice, selon son mode. */
export interface Performance {
  rm: number | null;
  volume: number;
  reps: number;
  secondes: number | null;
  /** séries écartées du 1RM parce que trop longues */
  seriesLongues: number;
}

export function performanceDe(bloc: SeanceExercice, mode: string): Performance {
  const series = bloc.series;

  return {
    rm: rmDesSeries(series),
    volume: volumeDesSeries(series),
    reps: repsTotales(series),
    secondes: mode === 'charge' ? null : tempsTotal(bloc),
    seriesLongues: series.filter(
      (s) => s.reps !== null && s.reps > REPS_MAX_POUR_1RM && (s.poids ?? 0) > 0,
    ).length,
  };
}

/* ---------------------------------------------------------------- 
   Calculateur de RM : trouver la charge à viser pour un objectif    */

/** Arrondi au palier réellement disponible en salle. */
export function arrondirCharge(kg: number, pas = 2.5): number {
  return Math.round(kg / pas) * pas;
}

/**
 * Estime le 1RM à partir d'un essai : « j'ai réussi 3 répétitions à 40 kg ».
 * C'est exactement ce qu'on fait en salle en montant progressivement.
 *
 * Cas particulier d'une seule répétition : le maximum EST la charge soulevée,
 * par définition. Epley y ajouterait 3,3 % — un chiffre inventé.
 */
export function estimerDepuisEssai(poids: number, reps: number): number | null {
  if (poids <= 0 || reps < 1 || reps > REPS_MAX_POUR_1RM) return null;
  if (reps === 1) return Math.round(poids * 10) / 10;

  return Math.round(epley(poids, reps) * 10) / 10;
}

/**
 * Répétitions théoriquement possibles à ce pourcentage du maximum.
 * À 100 %, c'est une répétition : c'est la définition du 1RM.
 *
 * ATTENTION : cette fonction répond pour TOUT pourcentage, y compris ceux où
 * elle n'a plus de sens. Ne jamais afficher son résultat sans passer par
 * `predictionValide`.
 */
export const repsAu = (pourcent: number): number =>
  pourcent >= 100 ? 1 : Math.max(1, Math.round((100 / pourcent - 1) / COEF_EPLEY));

/* ----------------------------------------------------------------
   LA table des paliers                                             */

/**
 * Ce à quoi sert un palier.
 *
 * `travail` : la zone où l'on progresse, 70 à 90 % du maximum.
 * `echauffement` : plus léger, on y monte en température. La charge garde un
 * sens ; la prédiction de répétitions, non.
 */
export type NaturePalier = 'travail' | 'echauffement';

export interface Palier {
  readonly pourcent: number;
  readonly nature: NaturePalier;
}

/**
 * LA table des paliers, et il n'y en a qu'une.
 *
 * IL Y EN AVAIT DEUX, ET ELLES DIVERGEAIENT. Celle-ci allait de 100 à 50 %
 * pour le calculateur ; `disqueRM.tsx` en portait une AUTRE, locale, de 90 à
 * 40 %, dont le commentaire signalait déjà le défaut sans l'avoir corrigé.
 * Deux tables pour la même question, c'est exactement la règle 5 — la même
 * mécanique que les trois copies d'Epley aux bornes divergentes. Fusionnées le
 * 15 septembre 2026.
 *
 * Elle est centrée sur la ZONE DE PROGRESSION, 70 à 90 %, par pas de 2,5 % :
 * neuf paliers, et neuf cibles de répétitions distinctes — 3, 4, 5, 6, 8, 9,
 * 10, 11, 13. On choisit sa ligne par le nombre de répétitions qu'on veut
 * tenir, pas par un pourcentage abstrait.
 *
 * 95 et 100 % ont disparu : le maximum est déjà affiché en grand au-dessus de
 * la table, et une ligne « 100 % · 1 rép » ne l'apprend à personne.
 *
 * L'échauffement descend par pas de 10 % : on n'y cherche pas une cible fine,
 * seulement de quoi monter en température — et il reste utile à tout le monde.
 */
export const PALIERS: readonly Palier[] = [
  { pourcent: 90, nature: 'travail' },
  { pourcent: 87.5, nature: 'travail' },
  { pourcent: 85, nature: 'travail' },
  { pourcent: 82.5, nature: 'travail' },
  { pourcent: 80, nature: 'travail' },
  { pourcent: 77.5, nature: 'travail' },
  { pourcent: 75, nature: 'travail' },
  { pourcent: 72.5, nature: 'travail' },
  { pourcent: 70, nature: 'travail' },
  { pourcent: 60, nature: 'echauffement' },
  { pourcent: 50, nature: 'echauffement' },
  { pourcent: 40, nature: 'echauffement' },
];

/**
 * Une prédiction de répétitions a-t-elle un sens à ce pourcentage ?
 *
 * Le seuil n'est PAS « 70 % » écrit à la main : c'est `repsAu` confrontée à
 * `REPS_MAX_POUR_1RM`. Si le plafond bouge un jour, la table suit toute seule
 * au lieu de mentir — c'est la même raison qui a fait rapatrier `COEF_EPLEY`.
 *
 * Ce que la table annonçait avant, sans broncher : 65 % → 16 rép,
 * 60 % → 20 rép, 50 % → 30 rép, 40 % → 45 rép. Or `estimerDepuisEssai` REFUSE
 * de calculer au-delà de 15 répétitions : le disque affichait « 45 » avec le
 * même aplomb que « 3 répétitions à 90 % ». Règle 7 — un chiffre faux est pire
 * qu'un refus de répondre. Relevé le 15 septembre 2026.
 */
export const predictionValide = (pourcent: number): boolean =>
  repsAu(pourcent) <= REPS_MAX_POUR_1RM;

/** Les pas d'arrondi proposés, du plus fin au plus grossier. */
export const PAS_DISPONIBLES = [1, 2.5, 5] as const;

/** Combien de charges distinctes la zone de travail doit garder pour rester utile. */
export const MIN_CHARGES_TRAVAIL = 5;

/**
 * Le pas le plus fin qu'on accepte de conseiller, et le repli quand aucun des
 * autres ne tient.
 *
 * Il est NOMMÉ, et la liste ci-dessous est bâtie à partir de lui — pas
 * l'inverse. `PAS_CONSEILLABLES[PAS_CONSEILLABLES.length - 1]` se lisait
 * `number | undefined` une fois `noUncheckedIndexedAccess` rallumé (M13,
 * 18 septembre 2026) : le repli d'une fonction qui rend un pas de pesée n'a
 * pas à dépendre d'une case qui pourrait manquer.
 */
const PAS_LE_PLUS_FIN = 1;

/**
 * Les pas qu'on propose TOUT SEUL, du plus grossier au plus fin.
 *
 * 5 kg n'y figure pas : il reste un choix manuel. Personne n'a besoin qu'on lui
 * suggère de sauter de 10 kg entre deux paliers.
 */
const PAS_CONSEILLABLES = [2.5, PAS_LE_PLUS_FIN] as const;

/** Charges distinctes que la zone de travail produit à ce pas. */
const chargesTravail = (rm: number, pas: number): number =>
  new Set(
    PALIERS
      .filter((p) => p.nature === 'travail')
      .map((p) => arrondirCharge((rm * p.pourcent) / 100, pas))
      .filter((c) => c > 0),
  ).size;

/**
 * Le pas d'arrondi qui convient à ce maximum.
 *
 * C'EST LA RÉPONSE AUX PETITES CHARGES. Avec un pas figé à 2,5 kg, un débutant
 * à 20 kg de 1RM voyait onze paliers pour CINQ charges : trois lignes disaient
 * « 15 kg » sans que rien ne signale qu'elles étaient la même. Plus de la
 * moitié du tableau ne lui apprenait rien.
 *
 * On garde 2,5 kg par défaut — un disque de 1,25 kg de chaque côté, ce qu'une
 * barre permet RÉELLEMENT — et on ne descend à 1 kg que lorsque ce pas fait
 * s'effondrer la zone de travail. Le seuil n'est pas écrit à la main : on
 * compte les charges distinctes que la table produit, et on descend d'un cran
 * s'il en reste moins de `MIN_CHARGES_TRAVAIL`. En pratique la bascule tombe
 * vers 50 kg de maximum, mais c'est la table qui le décide, pas un nombre posé
 * là.
 *
 * Un pas plus fin que la réalité de la salle serait une autre façon de mentir :
 * une première version conseillait 1 kg dès 40 kg de maximum et proposait
 * « 53 kg » à qui travaille sur barre, une charge qu'aucun jeu de disques ne
 * fait. Corrigé le 15 septembre 2026, avant d'être affiché.
 */
export function pasConseille(rm: number): number {
  if (!(rm > 0)) return PAS_LE_PLUS_FIN;

  for (const pas of PAS_CONSEILLABLES) {
    if (chargesTravail(rm, pas) >= MIN_CHARGES_TRAVAIL) return pas;
  }

  return PAS_LE_PLUS_FIN;
}

/** Une ligne de la table affichée : un ou plusieurs paliers confondus. */
export interface LignePalier {
  /** les pourcentages portés par cette ligne, du plus fort au plus faible */
  pourcents: number[];
  charge: number;
  /**
   * L'étendue des répétitions estimées, ou `null` hors du domaine d'Epley.
   * `null` veut dire « on ne sait pas », pas « zéro » — l'affichage doit le
   * montrer comme une absence, jamais comme un chiffre.
   */
  reps: { min: number; max: number } | null;
  nature: NaturePalier;
}

/**
 * La table telle qu'elle s'affiche, pour un maximum et un pas donnés.
 *
 * DEUX PALIERS QUI DONNENT LA MÊME CHARGE NE FONT QU'UNE LIGNE. Elle porte
 * alors l'étendue des pourcentages et celle des répétitions — « 90 à 82,5 % ·
 * 17,5 kg · 3 à 6 rép » —, ce qui dit la vérité : à cette charge-là, ces
 * paliers sont le même geste.
 *
 * La fusion ne regarde pas la nature du palier. Si l'arrondi confond un palier
 * de travail et un palier d'échauffement — cela n'arrive qu'en dessous de
 * 10 kg de maximum —, la ligne GARDE la charge et PERD la prédiction : une
 * seule extrémité hors domaine suffit à la retirer.
 */
export function paliersPour(rm: number, pas = 2.5): LignePalier[] {
  if (!(rm > 0)) return [];

  const lignes: LignePalier[] = [];

  for (const { pourcent, nature } of PALIERS) {
    const charge = arrondirCharge((rm * pourcent) / 100, pas);

    // une ligne à 0 kg n'est pas une charge, c'est une ligne vide
    if (charge <= 0) continue;

    const derniere = lignes[lignes.length - 1];

    if (derniere !== undefined && derniere.charge === charge) {
      derniere.pourcents.push(pourcent);
      derniere.reps = derniere.reps !== null && predictionValide(pourcent)
        ? { min: derniere.reps.min, max: repsAu(pourcent) }
        : null;
      continue;
    }

    lignes.push({
      pourcents: [pourcent],
      charge,
      reps: predictionValide(pourcent)
        ? { min: repsAu(pourcent), max: repsAu(pourcent) }
        : null,
      nature,
    });
  }

  return lignes;
}

/**
 * CE QU'EST UNE PROGRESSION, et ce qui n'est que du bruit.
 *
 * DESCENDU LE 20 SEPTEMBRE 2026 (palier 0) depuis `composants/disqueRM.tsx`.
 * « 1RM, volume, paliers » designe ce module comme domicile de ces regles, et
 * la table des paliers en etait deja redescendue le 15 septembre : le voisin
 * etait parti, le seuil etait reste — dans un `.tsx`, donc sans test.
 *
 * Ce n'est pas un detail d'affichage : ce seuil decide de la COULEUR sous
 * chaque 1RM, c'est-a-dire de ce qu'on lit comme « je progresse » ou « je
 * recule ».
 *
 * TROIS POUR CENT. En deca, l'ecart releve du bruit — une repetition de moins
 * sur douze fait deja 2,4 %, et une nuit courte suffit a l'expliquer. Au-dela,
 * c'est un vrai mouvement : 2,5 kg de plus sur une barre a 40 kg font 6 %.
 */
export const SEUIL_PROGRESSION = 0.03;

export type Tendance = 'hausse' | 'stable' | 'baisse' | 'inconnue';

/**
 * La tendance entre deux 1RM.
 *
 * SANS PRECEDENT, C'EST « INCONNUE » ET NON « STABLE ». Une premiere seance
 * n'est ni une progression ni un recul, et l'annoncer stable serait un chiffre
 * invente (regle 7). Un precedent a zero ou negatif est traite pareil : on ne
 * divise pas par lui.
 */
export function tendanceDe(actuel: number, precedent: number | null): Tendance {
  if (precedent === null || precedent <= 0) return 'inconnue';

  const ecart = (actuel - precedent) / precedent;
  if (ecart > SEUIL_PROGRESSION) return 'hausse';
  if (ecart < -SEUIL_PROGRESSION) return 'baisse';

  return 'stable';
}
