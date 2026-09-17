/**
 * Dates vues du calendrier de l'utilisateur, et non d'UTC.
 *
 * `toISOString()` rend l'heure UTC : en France, entre minuit et 1 h (2 h
 * l'été), il donne le jour d'avant. Voir `dates.test.ts` et le constat 04#9.
 *
 * Construite à la main, sans `toLocaleDateString` : Hermes n'embarque pas
 * toujours l'Intl complet — la même prudence que `cleDHabitude` avec
 * `normalize`.
 */
const deuxChiffres = (n: number): string => String(n).padStart(2, '0');

/** « AAAA-MM-JJ » du jour local de `d`. */
export const dateLocale = (d: Date): string =>
  `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;
