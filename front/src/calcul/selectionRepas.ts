/**
 * COCHER UN REPAS, QUAND LA CASE A UN DÉFAUT.
 *
 * Deux fonctions de trois lignes, sorties de l'écran pour une seule raison :
 * le bug qu'elles corrigent est parti sur un téléphone, et le typage comme les
 * 280 tests du projet l'ont laissé passer sans un mot.
 *
 * CE QUI S'ÉTAIT PASSÉ
 *
 * Les repas sont pré-cochés dès qu'un objectif existe pour eux — avoir
 * renseigné une cible pour le déjeuner, c'est avoir dit qu'on déjeune. Un
 * repas pré-coché n'a donc AUCUNE entrée dans le dictionnaire : la case est
 * cochée à l'écran, et le dictionnaire est vide.
 *
 * L'écran basculait en écrivant `!choisis[cle]`, c'est-à-dire `!undefined`,
 * c'est-à-dire `true` — exactement ce qui était déjà affiché. Le premier appui
 * ne changeait rien de visible ; il fallait taper deux fois pour décocher.
 *
 * LA RÈGLE, EN UNE PHRASE : **dès qu'une valeur affichée a un défaut, on
 * bascule à partir de l'AFFICHAGE, jamais à partir du stockage.** Le
 * dictionnaire ne dit pas ce que l'utilisateur voit ; il ne dit que ce qu'il a
 * décidé lui-même.
 */

/** Ce que l'utilisateur a décidé lui-même. Une clé absente = rien décidé. */
export type Choisis = Record<string, boolean>;

/**
 * Ce repas est-il coché À L'ÉCRAN ?
 *
 * `??` et non `||` : décocher écrit `false`, et `false || défaut` remettrait
 * la case à `true`. Un repas décoché doit le rester.
 */
export const estCoche = (
  choisis: Choisis,
  cle: string,
  parDefaut: boolean,
): boolean => choisis[cle] ?? parDefaut;

/**
 * Le dictionnaire après un appui sur la case.
 *
 * `affiche` est la valeur que l'utilisateur VOIT — celle que rend `estCoche`,
 * défaut compris. C'est elle qu'on inverse.
 */
export const basculer = (
  choisis: Choisis,
  cle: string,
  affiche: boolean,
): Choisis => ({ ...choisis, [cle]: !affiche });
