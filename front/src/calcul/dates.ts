/**
 * Dates vues du calendrier de l'utilisateur, et non d'UTC.
 *
 * `toISOString()` rend l'heure UTC : en France, entre minuit et 1 h (2 h
 * l'été), il donne le jour d'avant. Voir `dates.test.ts` et le constat 04#9.
 *
 * Construite à la main, sans `toLocaleDateString` — mais PAS pour la raison
 * qui était écrite ici. Ce commentaire disait « Hermes n'embarque pas toujours
 * l'Intl complet », et c'était faux. Mesuré le 20 septembre 2026 sur
 * l'émulateur, moteur Hermes réel (`HermesInternal.getRuntimeProperties()`
 * → « OSS Release Version: for RN 0.81.5 »), Android 14 et Android 16 :
 *
 *     Object.keys(Intl)
 *       → ["getCanonicalLocales","Collator","DateTimeFormat","NumberFormat"]
 *     new Date(…).toLocaleDateString('fr-FR', { weekday: 'long', … })
 *       → "dimanche 20/09"
 *
 * `HERMES_ENABLE_INTL=True` est en dur dans React Native lui-même
 * (`ReactAndroid/hermes-engine/build.gradle.kts:267`) : aucun réglage de ce
 * dépôt ne peut l'éteindre. La confusion venait de `normalize`, qui n'est PAS
 * une API `Intl` mais de l'ECMAScript de base — un incident généralisé à tort.
 *
 * LA VRAIE RAISON DE NE PAS L'UTILISER ICI : `dateLocale` produit une CLÉ,
 * « AAAA-MM-JJ », pas un affichage. Une clé qui dépend de la locale de
 * l'appareil n'est pas une clé. Les fonctions d'affichage plus bas, elles,
 * appellent `toLocaleDateString` sans réserve, et c'est correct.
 *
 * CE QUI MANQUE VRAIMENT À CET `Intl`, et qui reste un piège : `PluralRules`,
 * `RelativeTimeFormat`, `ListFormat`, `DisplayNames`, `Locale`, `Segmenter`
 * sont ABSENTS. Les utiliser lèverait un `TypeError` sur téléphone et pas sur
 * le poste — exactement le motif `normalize`. Et les données venant de l'ICU
 * du système, l'orthographe exacte peut varier d'un Android à l'autre : ne
 * jamais éprouver une sortie `toLocaleDateString` caractère par caractère.
 */
const deuxChiffres = (n: number): string => String(n).padStart(2, '0');

/** « AAAA-MM-JJ » du jour local de `d`. */
export const dateLocale = (d: Date): string =>
  `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;

/* ------------------------------------------------------------------------ *
 * LES JOURS DU CALENDRIER DE COMPOSITION
 *
 * Descendus le 20 septembre 2026 (palier 0) depuis `composants/calendrier.tsx`,
 * ou ces six fonctions pures vivaient sans un seul test — et sans pouvoir en
 * avoir : un `.test.ts` qui importe une VALEUR depuis un `.tsx` casse a
 * l'execution. Elles decident quel jour on compose, et `etapeReglage` s'en sert
 * pour nommer chaque repas.
 *
 * `aujourdhui` est un parametre plutot qu'un `new Date()` cache : c'est ce qui
 * rend la regle du changement d'heure eprouvable, et c'est exactement celle que
 * l'ancien commentaire declarait invisible en test.
 * ------------------------------------------------------------------------ */

const MILLISECONDES_PAR_JOUR = 24 * 60 * 60 * 1000;

/** La meme journee, a zero heure zero, sans toucher a la date recue. */
export const aMinuit = (d: Date): Date => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);

  return c;
};

/**
 * Le nombre de jours entre aujourd'hui et cette date.
 *
 * ON DIVISE DES DATES RAMENEES A MINUIT, ET ON ARRONDIT. Sans cela, la nuit du
 * changement d'heure fait 23 ou 25 heures et decale toute la grille d'un jour
 * — un bug qui ne se voyait que deux fois par an, donc jamais. Il est
 * desormais couvert par un balayage de 400 jours consecutifs.
 */
export const rangDepuisAujourdhui = (jour: Date, aujourdhui: Date = new Date()): number =>
  Math.round((aMinuit(jour).getTime() - aMinuit(aujourdhui).getTime())
    / MILLISECONDES_PAR_JOUR);

/** Le minuit local du jour situe a `rang` jours d'aujourd'hui. */
export const dateDuRang = (rang: number, aujourdhui: Date = new Date()): Date => {
  const d = aMinuit(aujourdhui);
  d.setDate(d.getDate() + rang);

  return d;
};

/** « Aujourd'hui », « Demain », puis « mardi 12/08 ». */
export const libelleDuJour = (rang: number, aujourdhui: Date = new Date()): string => {
  if (rang === 0) return "Aujourd'hui";
  if (rang === 1) return 'Demain';

  return dateDuRang(rang, aujourdhui)
    .toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit' });
};

/**
 * La forme courte, pour un resume : « auj. », « dem. », « mar. 12/08 ».
 *
 * Sert quand plusieurs jours doivent tenir sur une ligne repliee. Ecrire
 * « Aujourd'hui, Demain, mardi 12/08, mercredi 13/08 » deborderait, et un
 * resume tronque ne resume rien.
 */
export const libelleCourt = (rang: number, aujourdhui: Date = new Date()): string => {
  if (rang === 0) return 'auj.';
  if (rang === 1) return 'dem.';

  const d = dateDuRang(rang, aujourdhui);

  return `${d.toLocaleDateString('fr-FR', { weekday: 'short' })} `
    + `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`;
};

/** Les cases d'un mois, alignees sur une grille lundi → dimanche. */
export function grilleDuMois(annee: number, mois: number): (Date | null)[] {
  const premier = new Date(annee, mois, 1);
  /* getDay() rend 0 pour dimanche ; on veut 6, pour que lundi soit 0. */
  const decalage = (premier.getDay() + 6) % 7;
  const combien = new Date(annee, mois + 1, 0).getDate();

  const cases: (Date | null)[] = Array.from({ length: decalage }, () => null);
  for (let j = 1; j <= combien; j += 1) cases.push(new Date(annee, mois, j));
  /* On complete la derniere semaine pour que la grille garde sa forme. */
  while (cases.length % 7 !== 0) cases.push(null);

  return cases;
}
