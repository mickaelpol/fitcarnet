/**
 * CE MOT DE PASSE CONVIENT-IL, ET QU'EST-CE QUI LUI MANQUE.
 *
 * LE JUMEAU ASSUMÉ DE `api/src/Service/MotDePasse.php`. On ne peut pas
 * l'éviter : la jauge doit répondre **pendant la frappe**, et un aller-retour
 * réseau par caractère n'est pas une option. Deux codes répondent donc à la
 * même question dans deux langages.
 *
 * CE QUI LES EMPÊCHE DE DIVERGER : `api/regles/motdepasse.json`, que les deux
 * suites de tests lisent — `motDePassePartage.test.ts` ici,
 * `MotDePassePartageTest.php` là-bas. Le jour où l'un des deux change d'avis
 * sans l'autre, une des deux suites tombe en nommant le cas. C'est le
 * dispositif de `rendement.json`, inventé pour le constat 04#7 où deux juges
 * du rendement se contredisaient en silence, chacun correctement testé de son
 * côté.
 *
 * QUI DÉCIDE VRAIMENT : l'API. Ce module SERT À AFFICHER — ce qui manque
 * encore, et une jauge. Le serveur refuse ou accepte, et c'est sa réponse qui
 * fait foi. Un front qui accepterait à tort n'ouvre rien ; un front qui
 * refuserait à tort empêcherait seulement d'envoyer. Les deux sont des
 * défauts, aucun n'est une faille.
 */

/** Les cinq exigences, dans l'ordre où l'écran les affiche. */
export const EXIGENCES = ['longueur', 'minuscule', 'majuscule', 'chiffre', 'special'] as const;

export type Exigence = (typeof EXIGENCES)[number];

/**
 * Douze caractères.
 *
 * Le chiffre a bougé de 10 à 12 le 18 septembre 2026, EN MÊME TEMPS que les
 * quatre exigences de composition sont arrivées : imposer quatre familles
 * retire du choix, et la longueur rend ce qu'on vient de prendre.
 */
export const LONGUEUR_MINIMALE = 12;

/** Ce que chaque exigence demande, dit à la personne qui tape. */
export const DIT: Record<Exigence, string> = {
  longueur: `${LONGUEUR_MINIMALE} caractères au minimum`,
  minuscule: 'une lettre minuscule',
  majuscule: 'une lettre majuscule',
  chiffre: 'un chiffre',
  special: 'un caractère spécial',
};

/**
 * Ce qui manque à ce mot de passe, dans l'ordre de `EXIGENCES`.
 *
 * Vide veut dire « rien ne manque ».
 *
 * `\p{Ll}` ET `\p{Lu}` AVEC LE DRAPEAU `u`, jamais `a-z` / `A-Z` : « é » est
 * une minuscule et « É » une majuscule. Les classes ASCII les déclareraient
 * « spéciaux », et « Été3cetÉtéLà! » se verrait alors refuser sa majuscule
 * tout en obtenant un caractère spécial qu'il n'a pas. Deux erreurs qui se
 * compensent presque — la pire espèce.
 *
 * **Hermes implémente les classes Unicode.** C'est le point qu'il fallait
 * vérifier : `normalize('NFD')` n'y est pas (voir `texte.ts`), mais
 * `\p{…}` avec le drapeau `u` y est depuis longtemps, et le test de rendu
 * couvre le cas accentué.
 */
export function manquements(motDePasse: string): Exigence[] {
  const manque: Exigence[] = [];

  /* `[...chaîne]` ET NON `.length` : on compte les CARACTÈRES, pas les unités
     UTF-16. `.length` rend 13 pour « Été3cetÉtéLà! », ce qui est juste ici,
     mais rendrait 2 pour un emoji — et déclarerait donc plus long qu'il n'est
     un mot de passe qui en contient. Le PHP compte en caractères
     (`mb_strlen`) : les deux juges doivent compter la même chose. */
  if ([...motDePasse].length < LONGUEUR_MINIMALE) manque.push('longueur');
  if (!/\p{Ll}/u.test(motDePasse)) manque.push('minuscule');
  if (!/\p{Lu}/u.test(motDePasse)) manque.push('majuscule');
  if (!/\p{Nd}/u.test(motDePasse)) manque.push('chiffre');
  /* Ni lettre, ni chiffre, ni espace. L'espace est exclu exprès : une phrase
     de passe en contient sans que ce soit un choix, et le compter ferait
     passer « mon chat dort » pour plus solide qu'il n'est. */
  if (!/[^\p{L}\p{Nd}\s]/u.test(motDePasse)) manque.push('special');

  return manque;
}

/** Rien ne manque. */
export const acceptable = (motDePasse: string): boolean => manquements(motDePasse).length === 0;

/** Les quatre niveaux de la jauge, du plus faible au plus solide. */
export type Force = 'vide' | 'faible' | 'moyen' | 'bon' | 'solide';

/**
 * LA JAUGE NE PEUT PAS CONTREDIRE LE VERROU, et c'est sa seule contrainte
 * sérieuse.
 *
 * Beaucoup de sites affichent un « fort » vert sur un mot de passe que leur
 * propre serveur refuse ensuite. On s'interdit ça en construisant la jauge
 * SUR les exigences : tant qu'il en manque une, la jauge ne peut pas dépasser
 * `moyen`. « bon » veut dire « il passera », et rien d'autre.
 *
 * AU-DELÀ, C'EST LA LONGUEUR QUI PARLE, parce que c'est la seule chose qui
 * augmente vraiment le coût d'une attaque une fois les familles présentes.
 * Seize caractères valent « solide » ; douze avec les quatre familles valent
 * « bon », ce qui est la vérité : ça passe, ce n'est pas un exploit.
 *
 * ON NE PROMET PAS D'ENTROPIE. Un « 94 bits » affiché à l'écran serait faux —
 * il supposerait un tirage au sort, alors que les gens tapent des mots. Quatre
 * paliers nommés disent ce qu'on sait, et rien de plus (règle 7).
 */
export function force(motDePasse: string): Force {
  if (motDePasse === '') return 'vide';

  const manque = manquements(motDePasse);
  if (manque.length >= 3) return 'faible';
  if (manque.length >= 1) return 'moyen';

  return [...motDePasse].length >= LONGUEUR_MINIMALE + 4 ? 'solide' : 'bon';
}

/** Ce que la jauge affiche comme mot, à côté de la barre. */
export const MOT_DE_LA_FORCE: Record<Force, string> = {
  vide: '',
  faible: 'Trop faible',
  moyen: 'Presque',
  bon: 'Bon',
  solide: 'Solide',
};
