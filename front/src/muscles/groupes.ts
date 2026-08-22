/**
 * LES GROUPES MUSCULAIRES QU'ON PEUT CHOISIR.
 *
 * FICHIER ENGENDRÉ pour les cadrages et les tracés mis en avant, relu et
 * ordonné à la main pour le reste.
 *
 * QUATORZE, ET PAS DIX-SEPT. Le paquet en fournit dix-sept ; trois — Obliques,
 * Cou, Tibial antérieur — ne correspondent à AUCUN exercice du catalogue.
 * Les afficher donnerait trois vignettes qui rendent toujours une liste vide,
 * et une liste vide sans explication se lit comme une panne.
 *
 * L'ORDRE EST CELUI DU CORPS, pas l'alphabétique : haut, tronc, bas. On
 * cherche « les jambes » en regardant vers le bas de la grille, comme on
 * regarderait vers le bas de soi.
 *
 * LA CORRESPONDANCE AVEC LA BASE EST ICI, et j'ai commencé par la mettre
 * ailleurs. Un filtre serveur `?muscle=pectoraux` était écrit, propre, et
 * inutile : mesure faite, faire voyager `muscleCible` avec la liste coûte
 * 33 Ko pour 1338 exercices — 5 % du poids qu'on avait retiré du catalogue.
 * Or l'application charge déjà tout le catalogue et le garde une demi-heure.
 * Elle peut donc filtrer elle-même, instantanément, sans réseau, y compris
 * dans une salle sans couverture. Le filtre serveur a été supprimé plutôt que
 * gardé « au cas où » : deux chemins vers le même résultat finissent toujours
 * par ne plus dire la même chose.
 */
export interface GroupeMusculaire {
  cle: string;
  label: string;
  face: 'front' | 'back';
  /** le cadrage du pictogramme dans la silhouette */
  viewBox: string;
  /** les tracés à peindre en couleur pleine ; les autres restent en fond */
  vifs: readonly number[];
}

export const GROUPES: readonly GroupeMusculaire[] = [
  { cle: 'pectoraux', label: 'Pectoraux', face: 'front',
    viewBox: '184 196 360 360', vifs: [87, 88] },
  { cle: 'dos', label: 'Dos', face: 'back',
    viewBox: '886 256 396 396', vifs: [64, 65, 66, 67, 68, 69] },
  { cle: 'epaules', label: 'Épaules', face: 'front',
    viewBox: '109 95 510 510', vifs: [35, 36] },
  { cle: 'biceps', label: 'Biceps', face: 'front',
    viewBox: '90 176 549 549', vifs: [24, 25] },
  { cle: 'triceps', label: 'Triceps', face: 'front',
    viewBox: '118 203 492 492', vifs: [26, 27] },
  { cle: 'avant-bras', label: 'Avant-bras', face: 'front',
    viewBox: '6 234 717 717', vifs: [59, 60, 61, 62, 63, 64] },
  { cle: 'abdominaux', label: 'Abdominaux', face: 'front',
    viewBox: '148 356 432 432', vifs: [16, 17, 18, 19, 20, 21, 22, 23] },
  { cle: 'trapezes', label: 'Trapèzes', face: 'back',
    viewBox: '903 205 360 360', vifs: [2, 3] },
  { cle: 'lombaires', label: 'Lombaires', face: 'back',
    viewBox: '904 383 360 360', vifs: [12, 13, 14, 15] },
  { cle: 'fessiers', label: 'Fessiers', face: 'back',
    viewBox: '904 518 360 360', vifs: [24, 25, 26, 27] },
  { cle: 'quadriceps', label: 'Quadriceps', face: 'front',
    viewBox: '154 598 420 420', vifs: [43, 44, 45, 46, 47, 48] },
  { cle: 'ischios', label: 'Ischios', face: 'back',
    viewBox: '886 674 396 396', vifs: [30, 31, 32, 33, 34, 35, 36, 37] },
  { cle: 'mollets', label: 'Mollets', face: 'front',
    viewBox: '184 940 360 360', vifs: [55, 56, 57, 58] },
  { cle: 'adducteurs', label: 'Adducteurs', face: 'front',
    viewBox: '176 586 375 375', vifs: [37, 38, 39, 40, 41, 42] },
];

/**
 * LA QUINZIÈME VIGNETTE N'A PAS DE DESSIN.
 *
 * Soixante exercices ne tombent sous aucun muscle de la silhouette : le
 * cardio (29), ceux sans muscle renseigné (19), les abducteurs (5), le
 * serratus (5), l'élévateur de la scapula (2).
 *
 * On aurait pu les laisser hors du filtre. C'est le choix qui ne se voit
 * pas — et une absence qui ne se voit pas est exactement ce qu'on passe son
 * temps à traquer. Ils ont donc leur case, sans pictogramme.
 */
export const AUTRE = { cle: 'autre', label: 'Autre' } as const;

/**
 * Les valeurs de `muscle_cible` que chaque vignette recouvre.
 *
 * CE SONT LES MOTS DE LA BASE, PAS DES TRADUCTIONS. `pectorals`, `lats`,
 * `delts` : le vocabulaire du catalogue importé, tel quel. Les traduire ici
 * ferait deux vérités, et la seconde se périmerait au prochain import. Pour
 * les relire :  SELECT DISTINCT muscle_cible FROM exercice
 *
 * `dos` EN PORTE DEUX. `lats` et `upper back` sont deux gestes différents —
 * tirage vertical, tirage horizontal — mais la silhouette ne sait pas les
 * distinguer : dans le paquet d'origine, `upper-back` couvre dorsaux et
 * trapèze inférieur d'un bloc. Une vignette pour les deux, donc, plutôt que
 * deux vignettes au dessin identique.
 */
const VALEURS: Record<string, readonly string[]> = {
  pectoraux: ['pectorals'],
  dos: ['lats', 'upper back'],
  epaules: ['delts'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  'avant-bras': ['forearms'],
  abdominaux: ['abs'],
  trapezes: ['traps'],
  lombaires: ['spine'],
  fessiers: ['glutes'],
  quadriceps: ['quads'],
  ischios: ['hamstrings'],
  mollets: ['calves'],
  adducteurs: ['adductors'],
};

/** Tout ce qu'une vignette recouvre, pour reconnaître « Autre » par complément. */
const CONNUS = new Set(Object.values(VALEURS).flat());

/**
 * CE QU'ON ÉCRIT EN BASE quand on rattache un exercice à une vignette.
 *
 * Une vignette peut recouvrir PLUSIEURS valeurs — « Dos » lit `lats` et
 * `upper back` — mais quand on en choisit une, il faut en écrire UNE. Le
 * premier de la liste ferait l'affaire aujourd'hui et changerait le jour où
 * quelqu'un réordonne le tableau au-dessus sans y penser. On le déclare donc.
 *
 * `lats` pour « Dos » : c'est le plus fréquent des deux, et la distinction
 * verticale/horizontale ne se lit de toute façon pas sur la silhouette.
 */
const CANONIQUE: Record<string, string> = {
  pectoraux: 'pectorals',
  dos: 'lats',
  epaules: 'delts',
  biceps: 'biceps',
  triceps: 'triceps',
  'avant-bras': 'forearms',
  abdominaux: 'abs',
  trapezes: 'traps',
  lombaires: 'spine',
  fessiers: 'glutes',
  quadriceps: 'quads',
  ischios: 'hamstrings',
  mollets: 'calves',
  adducteurs: 'adductors',
};

/** La valeur à écrire en base pour cette vignette. */
export const valeurPourGroupe = (cle: string): string | null => CANONIQUE[cle] ?? null;

/**
 * De quelle vignette relève cette valeur de base ?
 *
 * L'INVERSE DE `valeurPourGroupe`, ET IL N'EST PAS SYMÉTRIQUE : `upper back`
 * rend `dos`, alors que `dos` écrit `lats`. C'est voulu — on veut RECONNAÎTRE
 * tout ce que le catalogue contient, et n'ÉCRIRE qu'une valeur par vignette.
 *
 * Rend `null` pour ce qu'aucune vignette ne couvre : le cardio, les
 * abducteurs, un muscle absent. L'écran d'administration l'affiche alors
 * comme « Autre », ce qui est la vérité.
 */
export function groupeDeLaValeur(muscleCible: string | null | undefined): string | null {
  const m = (muscleCible ?? '').trim().toLowerCase();
  if (m === '') return null;

  return GROUPES.find((g) => (VALEURS[g.cle] ?? []).includes(m))?.cle ?? null;
}

/**
 * Cet exercice tombe-t-il sous cette vignette ?
 *
 * ON NE COMPARE QUE `muscleCible`, jamais les muscles secondaires. Filtrer sur
 * le secondaire noierait « Triceps » sous tous les développés couchés, où ils
 * ne sont que sollicités. On cherche ce que l'exercice VISE.
 */
export function dansLeGroupe(muscleCible: string | null | undefined, cle: string): boolean {
  const m = (muscleCible ?? '').trim().toLowerCase();

  /* « AUTRE » EST UN COMPLÉMENT, PAS UNE LISTE. Le cardio, les abducteurs, le
     serratus, et les exercices dont le muscle n'a jamais été renseigné. Écrire
     leurs noms ici obligerait à y penser au prochain import ; le complément,
     lui, ramasse tout seul ce qu'on n'a pas prévu. */
  if (cle === AUTRE.cle) return m === '' || !CONNUS.has(m);

  return (VALEURS[cle] ?? []).includes(m);
}

/**
 * Le nom français de la vignette dont relève cette valeur de base.
 *
 * `null` quand aucune ne la couvre — l'appelant décide alors quoi dire.
 * On ne rend pas « Autre » d'office : « aucun muscle renseigné » et « muscle
 * qu'aucune vignette ne couvre » se traitent parfois différemment, et un
 * libellé tout fait effacerait la nuance.
 */
export function libelleDuMuscle(muscleCible: string | null | undefined): string | null {
  const cle = groupeDeLaValeur(muscleCible);

  return GROUPES.find((g) => g.cle === cle)?.label ?? null;
}
