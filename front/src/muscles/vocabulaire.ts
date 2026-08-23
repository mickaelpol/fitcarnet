/**
 * LES MOTS DU CATALOGUE, ET CE QU'ILS DISENT EN FRANÇAIS.
 *
 * POURQUOI CE FICHIER EXISTE. « Zone » et « Aussi sollicités » étaient deux
 * champs de texte libre, en anglais, remplis à la main. Trois vocabulaires
 * cohabitent en base sans que rien ne les rapproche : `muscle_cible` dit
 * `delts` et `quads`, `muscles_secondaires` dit `shoulders` et `quadriceps`,
 * `partie_corps` dit `shoulders` et `upper legs`. Taper un mot à la main,
 * c'est en inventer un quatrième.
 *
 * ON TRADUIT POUR AFFICHER, ON N'ÉCRIT PAS EN FRANÇAIS. La base garde le
 * vocabulaire du catalogue importé : le prochain import ne se battra pas avec
 * nos libellés, et une seule vérité reste stockée. Le français ne vit qu'ici,
 * du côté de l'écran.
 *
 * CE QUI N'EST PAS DANS CES TABLES N'EST PAS PERDU. Un terme inconnu s'affiche
 * tel quel et reste cochable : le sélecteur ne peut pas effacer en silence une
 * valeur qu'il ne connaît pas. C'est la seule façon d'écrire ces listes sans
 * avoir à jurer qu'elles sont complètes.
 */

export interface Terme {
  /** ce qu'on ÉCRIT en base quand on coche */
  cle: string;
  /** ce qu'on MONTRE */
  label: string;
  /** les autres écritures de la même chose, qu'on reconnaît sans les écrire */
  aussi?: readonly string[];
}

/**
 * LES ZONES — `partie_corps`.
 *
 * ELLE N'EST JAMAIS MULTIPLE : sur les 1338 exercices du catalogue, aucun ne
 * contient de virgule dans ce champ. D'où un choix simple, et pas une liste à
 * cocher — proposer d'en prendre plusieurs inventerait une possibilité que la
 * donnée n'a jamais eue.
 *
 * Les dix valeurs du catalogue importé. La liste réellement proposée à l'écran
 * est celle du catalogue chargé, pas celle-ci : ce tableau ne fait que
 * traduire. Une zone ajoutée à la main apparaîtra donc quand même, avec son
 * mot d'origine.
 */
export const ZONES: readonly Terme[] = [
  { cle: 'chest', label: 'Pectoraux' },
  { cle: 'back', label: 'Dos' },
  { cle: 'shoulders', label: 'Épaules' },
  { cle: 'upper arms', label: 'Bras' },
  { cle: 'lower arms', label: 'Avant-bras' },
  { cle: 'waist', label: 'Abdominaux' },
  { cle: 'upper legs', label: 'Cuisses' },
  { cle: 'lower legs', label: 'Mollets' },
  { cle: 'neck', label: 'Cou' },
  { cle: 'cardio', label: 'Cardio' },
];

/**
 * LES MUSCLES SECONDAIRES — `muscles_secondaires`.
 *
 * CELLE-CI EST BIEN MULTIPLE : 985 exercices sur 1338 en portent plusieurs,
 * pour 165 combinaisons différentes. D'où une liste à cocher.
 *
 * L'ORDRE EST CELUI DE LA FRÉQUENCE, pas l'alphabétique ni celui du corps.
 * On coche ici plusieurs cases à la suite en relisant une fiche ; les cinq
 * termes qui reviennent le plus couvrent la moitié des saisies, autant les
 * avoir sous le pouce.
 *
 * LES DOUBLONS SONT FUSIONNÉS, et c'est la moitié de l'intérêt du sélecteur.
 * La base contient `traps` (33 fois) ET `trapezius` (47), `deltoids` (28) ET
 * `épaules` (1) ET `deltoïdes antérieurs` (1), `lats` (1) ET
 * `latissimus dorsi` (5). Quarante-deux termes pour une vingtaine de muscles.
 * Chacun garde ici une seule case, qui reconnaît toutes ses écritures et n'en
 * réécrit qu'une.
 *
 * LA RÉÉCRITURE N'A LIEU QU'À LA MODIFICATION. Ouvrir une fiche et la fermer
 * ne touche à rien : l'éditeur compare des formes normalisées, donc une fiche
 * qu'on n'a pas modifiée ne compte aucun changement et n'est pas renvoyée.
 */
export const SECONDAIRES: readonly Terme[] = [
  { cle: 'shoulders', label: 'Épaules',
    aussi: ['deltoids', 'delts', 'épaules', 'deltoïdes antérieurs'] },
  { cle: 'hamstrings', label: 'Ischio-jambiers' },
  { cle: 'forearms', label: 'Avant-bras',
    aussi: ['wrists', 'hands', 'wrist extensors', 'wrist flexors', 'grip muscles'] },
  { cle: 'triceps', label: 'Triceps' },
  { cle: 'biceps', label: 'Biceps', aussi: ['brachialis'] },
  { cle: 'quadriceps', label: 'Quadriceps', aussi: ['quads'] },
  { cle: 'calves', label: 'Mollets', aussi: ['soleus'] },
  { cle: 'glutes', label: 'Fessiers' },
  { cle: 'core', label: 'Gainage', aussi: ['abdominals', 'abs', 'lower abs'] },
  { cle: 'chest', label: 'Pectoraux', aussi: ['pectorals', 'upper chest'] },
  { cle: 'trapezius', label: 'Trapèzes', aussi: ['traps'] },
  { cle: 'hip flexors', label: 'Fléchisseurs de hanche' },
  { cle: 'obliques', label: 'Obliques' },
  { cle: 'lower back', label: 'Lombaires', aussi: ['spine'] },
  { cle: 'rhomboids', label: 'Rhomboïdes' },
  { cle: 'upper back', label: 'Haut du dos', aussi: ['back'] },
  { cle: 'rear deltoids', label: 'Épaules (arrière)' },
  { cle: 'ankles', label: 'Chevilles', aussi: ['ankle stabilizers'] },
  { cle: 'feet', label: 'Pieds' },
  { cle: 'rotator cuff', label: 'Coiffe des rotateurs' },
  { cle: 'latissimus dorsi', label: 'Dorsaux', aussi: ['lats'] },
  { cle: 'inner thighs', label: 'Adducteurs', aussi: ['groin', 'adductors'] },
  { cle: 'shins', label: 'Tibiaux' },
  { cle: 'sternocleidomastoid', label: 'Cou' },
];

/**
 * LA VIRGULE EST LE SEUL SÉPARATEUR, et je l'ai vérifié plutôt que supposé :
 * les 42 termes distincts du catalogue sortent d'un découpage sur la virgule
 * et aucun ne contient de « et », de « / » ou de « + ».
 */
export const decouper = (brut: string | null | undefined): string[] =>
  (brut ?? '').split(',').map((t) => t.trim()).filter((t) => t !== '');

/** Ce qu'on réécrit en base : les clés retenues, dans l'ordre de la liste. */
export const assembler = (cles: readonly string[]): string => cles.join(', ');

/** Le terme dont ce mot est une écriture, ou `null` s'il n'en est aucune. */
export function termeDe(table: readonly Terme[], mot: string): Terme | null {
  const m = mot.trim().toLowerCase();
  if (m === '') return null;

  return table.find((t) => t.cle === m || (t.aussi ?? []).includes(m)) ?? null;
}

/**
 * Le nom français d'un mot de la base — ou le mot lui-même.
 *
 * ON NE REND JAMAIS RIEN DE VIDE. Un terme non traduit affiché en anglais se
 * voit et se corrige ; un terme non traduit effacé ne se voit pas du tout.
 */
export const libelle = (table: readonly Terme[], mot: string): string =>
  termeDe(table, mot)?.label ?? mot.trim();

/** Une valeur brute de la base, prête à lire : « Épaules · Triceps ». */
export const enFrancais = (table: readonly Terme[], brut: string | null | undefined): string =>
  decouper(brut).map((m) => libelle(table, m)).join(' · ');

/**
 * Les clés retenues par une valeur brute, doublons fusionnés.
 *
 * Un exercice portant `traps` ET `trapezius` — le catalogue en contient —
 * ne coche qu'une case, et n'en réécrira qu'une.
 */
export function normaliser(table: readonly Terme[], brut: string | null | undefined): string[] {
  const vues: string[] = [];
  for (const mot of decouper(brut)) {
    const cle = termeDe(table, mot)?.cle ?? mot.trim();
    if (!vues.includes(cle)) vues.push(cle);
  }

  return vues;
}

/**
 * Les cases à afficher : celles de la table, PLUS ce que cet exercice porte
 * déjà et que la table ignore.
 *
 * SANS CE COMPLÉMENT, LE SÉLECTEUR EFFACERAIT. Un exercice portant un terme
 * absent de la table n'aurait aucune case à cocher pour lui : il partirait à
 * l'enregistrement, sans message, et personne ne saurait quoi rechercher.
 */
export function casesPour(
  table: readonly Terme[], retenus: readonly string[],
): { cle: string; label: string }[] {
  const cases = table.map((t) => ({ cle: t.cle, label: t.label }));
  for (const cle of retenus) {
    if (!cases.some((c) => c.cle === cle)) cases.push({ cle, label: cle });
  }

  return cases;
}
