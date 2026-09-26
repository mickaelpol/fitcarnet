/**
 * CE QU'UNE SAISIE DE NOMBRE DÉSIGNE — la règle du front, écrite une fois.
 *
 * LA PANNE, PROUVÉE LE 15 SEPTEMBRE 2026 SUR ÉMULATEUR ANDROID. Taper « 42,5 »
 * dans le poids d'une série enregistrait 425 kg. Quatre champs — répétitions et
 * poids d'une série, répétitions et poids cibles d'un modèle — reconstruisaient
 * leur texte depuis le nombre à chaque frappe : « 42, » se lisait 42, se
 * réécrivait « 42 », et le « 5 » suivant s'accolait. Chacun portait aussi sa
 * propre lecture, `parseInt(v, 10) || 0` ou `parseFloat(...) || 0`, qui faisait
 * d'une saisie illisible un ZÉRO : « je ne sais pas » devenu un chiffre, contre
 * la règle 6.
 *
 * La bonne règle existait déjà, juste, dans `grammesSaisis` (`demandeRepas.ts`),
 * écrite pour les grammes d'un repas. Elle vit désormais ici, et `grammesSaisis`
 * s'y branche : une cinquième copie aurait fini par diverger des quatre autres.
 *
 * Garder le texte PENDANT la frappe n'est pas l'affaire de ce module : c'est
 * celle de `composants/champNombre.tsx`, qui s'appuie sur lui.
 */

/**
 * Le nombre désigné par une saisie, ou `null`.
 *
 * `null` pour le vide ET pour l'illisible : aucune des deux saisies ne dit un
 * nombre, et en inventer un — zéro — serait écrire un chiffre faux. La virgule
 * française vaut le point. Négatif : refusé, ni une charge ni un nombre de
 * répétitions ne l'est. `entier` refuse un décimal au lieu de l'arrondir en
 * silence : 8,5 répétitions n'existent pas.
 */
export function nombreSaisi(brut: string | undefined, options: { entier?: boolean } = {}): number | null {
  const saisi = (brut ?? '').trim();
  if (saisi === '') return null;

  /* `Number` et non `parseFloat` : `parseFloat('4,2,1')` rend 4 sans broncher,
     `Number` rend NaN. Et « 42, » — l'état du champ entre deux frappes — devient
     « 42. », que `Number` lit bien 42. */
  const n = Number(saisi.replace(',', '.'));

  if (!Number.isFinite(n) || n < 0) return null;
  if (options.entier === true && !Number.isInteger(n)) return null;

  return n;
}

/**
 * Une valeur déjà connue, écrite pour être modifiée : décimale à la française,
 * SANS ARRONDI. Pas `nb()`, qui arrondit à une décimale pour l'affichage — l'éditeur
 * de modèle s'en servait dans un champ, et 42,25 s'y réécrivait « 42.3 ».
 */
export const texteDuNombre = (n: number | null): string =>
  (n === null ? '' : String(n).replace('.', ','));

/**
 * UNE FRAPPE ACCEPTABLE DANS UN CHAMP NUMÉRIQUE — 26 septembre 2026.
 *
 * Ce n'est PAS une lecture, et c'est tout le sujet de la feature
 * `macros-editeur-vide-pas-zero` : l'écran ne décide plus de ce qu'un texte
 * désigne, le serveur le fait. Ce filtre est le « contrôle front léger »
 * que le propriétaire laisse à l'écran : il empêche seulement de taper autre
 * chose qu'un chiffre, « , » ou « . ». « 4,2,1 » passe, et c'est le serveur
 * qui le refuse, sous le champ. Le signe moins ne passe pas : aucune valeur
 * de l'éditeur d'aliment n'est négative.
 */
export const frappeNumeriqueAcceptee = (texte: string): boolean => /^[0-9.,]*$/.test(texte);
