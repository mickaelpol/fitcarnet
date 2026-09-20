/**
 * Charte visuelle de fitcarnet, reprise de la maquette validée :
 * fond sombre, Barlow Condensed pour les chiffres, code couleur par macro.
 */

export const C = {
  fond: '#14161a',
  surface: '#1d2026',
  surface2: '#23272e',
  ligne: '#2f343d',
  encre: '#e8eaed',

  /* LES QUATRE VALEURS SUIVANTES ONT ÉTÉ ÉCLAIRCIES, ET C'EST MESURÉ.
   *
   * Le seuil de lisibilité reconnu pour du texte courant est un contraste de
   * 4,5:1 avec son fond. Sur `surface2`, le fond le plus clair de
   * l'application, la palette d'origine donnait :
   *
   *     discret  #5d646e   2,51:1     ← la moitié du minimum
   *     erreur   #d8352a   3,18:1
   *     ok       #3d9a5c   4,26:1
   *     attenue  #8b929c   4,77:1     (passait, de justesse)
   *
   * `discret` porte les unités — « kg », « rép » —, les étiquettes et les
   * mentions secondaires. Du gris à 2,5:1 sur fond sombre, dans une salle au
   * néon ou en plein soleil, ne se lit pas. Ce n'est pas une question de
   * norme : c'est le texte qui dit ce que le chiffre signifie.
   *
   * TEINTE ET SATURATION INCHANGÉES : seule la luminosité monte. Ce sont les
   * mêmes couleurs, assez claires pour être lues.
   *
   * `attenue` monte aussi, alors qu'il passait déjà. Sans cela il se
   * confondrait avec le nouveau `discret` — 4,77 contre 4,53 — et les deux
   * niveaux de mise en retrait n'en feraient plus qu'un : on aurait corrigé un
   * défaut de lisibilité en créant un défaut de hiérarchie.
   *
   * `charte.test.ts` vérifie désormais ces rapports. La palette ne peut plus
   * redescendre sous le seuil sans qu'un test le dise. */
  attenue: '#adb2b9',
  discret: '#868e99',
  vif: '#e3b23c',
  ok: '#3f9f5f',
  erreur: '#e2675f',
  /* Une couleur par rôle nutritionnel. `fec` reprend volontairement la teinte
     de `vif` : le doré est à la fois la couleur d'accent de l'application et
     celle des féculents. Deux noms, une teinte, en connaissance de cause. */
  prot: '#7ba7dd',
  fec: '#e3b23c',
  lip: '#e0906a',
  leg: '#5ec080',

  /* Voiles et fonds translucides. Ils étaient écrits en rgba() au fil des
     écrans — six variantes de « le doré, mais discret », qui divergeaient
     d'un centième d'opacité sans que personne ne le décide. */

  /** derrière une modale : on doit deviner l'écran sans pouvoir le lire */
  voile: 'rgba(10,11,13,0.78)',
  /** fond d'une mention mise en avant */
  vifFond: 'rgba(227,178,60,0.12)',
  /** le même, presque effacé : bandes de tableau, lignes alternées */
  vifVoile: 'rgba(227,178,60,0.08)',
  /** contour d'un bouton doré discret */
  vifBord: 'rgba(227,178,60,0.4)',
  /** fond d'une mention rassurante — un complément, un plafond respecté */
  okFond: 'rgba(120,180,120,0.10)',
  /** fond d'une mention grave : une donnée sur laquelle on ne peut pas compter */
  erreurFond: 'rgba(216,53,42,0.12)',
  /** séparateur atténué, à l'intérieur d'une carte */
  ligneVoile: 'rgba(47,52,61,0.5)',
  /** l'ombre portée, et le blanc pur : deux valeurs qui ne sont pas des gris */
  ombre: '#000',
  blanc: '#ffffff',
} as const;

export const R = { s: 9, m: 11, l: 14, xl: 18 } as const;

export const E = { xs: 4, s: 8, m: 12, l: 16, xl: 24 } as const;

export const P = {
  titre: 'BarlowCondensed_700Bold',
  chiffre: 'BarlowCondensed_600SemiBold',
  texte: 'Inter_400Regular',
  fort: 'Inter_600SemiBold',
} as const;

/**
 * Échelle typographique. **Aucune taille de police ne s'écrit ailleurs.**
 *
 * Avant, chaque écran posait ses propres nombres : 11, 11,5, 12, 12,5, 13…
 * Une trentaine de valeurs voisines, dispersées dans trente fichiers. Grossir
 * le texte de l'application obligeait à toucher les trente, et deux libellés
 * de même nature finissaient toujours par diverger d'un demi-point.
 *
 * Sept marches, c'est peu, et c'est voulu : si un texte ne trouve pas la
 * sienne, c'est presque toujours qu'il devrait ressembler à un autre.
 * Grossir toute l'application se fait maintenant ici, en sept nombres.
 */
export const T = {
  /** en-têtes de colonnes, mentions en majuscules */
  minuscule: 11,
  /** texte discret, sous-titres, unités */
  petit: 13,
  /** libellés, boutons */
  normal: 15,
  /** texte courant */
  moyen: 17,
  /** accroches, valeurs mises en avant */
  grand: 20,
  /** titres d'écran */
  titre: 24,
  /** le chiffre qu'on lit de loin, à bout de bras en salle */
  geant: 34,
} as const;

/**
 * Tailles des chiffres en Barlow Condensed. Séparées de `T` parce qu'une
 * police condensée paraît plus petite à taille égale : les aligner sur la
 * même échelle donnerait des nombres trop discrets.
 */
export const N = { petit: 20, normal: 25, grand: 30 } as const;

/** Hauteur minimale d'une zone tactile : 44 px, sinon on rate la cible. */
export const TOUCHE = 44;

export const couleurRole = (categorie: string): string => {
  if (categorie === 'prot' || categorie === 'lait') return C.prot;
  if (categorie === 'fec' || categorie === 'fruit') return C.fec;
  if (categorie === 'ole' || categorie === 'huile') return C.lip;
  if (categorie === 'leg') return C.leg;

  return C.ligne;
};

/**
 * Formatage court : 154 g, 12,5 g — jamais « 154.00 », et jamais « 12.5 ».
 *
 * LA VIRGULE EST VRAIMENT LÀ DEPUIS LE 17 SEPTEMBRE 2026. Ce commentaire
 * promettait « 12,5 g » depuis toujours pendant que `toFixed(1)` rendait
 * « 12.5 », à un utilisateur français, dans une application écrite en
 * français. La revue l'a relevé le 16 septembre 2026.
 *
 * C'EST LE CODE QUI A ÉTÉ CORRIGÉ, PAS LE COMMENTAIRE, et pas par goût :
 * l'application écrivait DÉJÀ la virgule ailleurs. `texteDuNombre`
 * (`calcul/saisieNombre.ts`) rend « 42,25 » dans tout champ modifiable. Le même
 * poids s'affichait donc « 42,25 » là où on pouvait le corriger et « 42.5 » là
 * où on ne le pouvait pas : c'est cette incohérence qui était le défaut, le
 * commentaire disait juste.
 *
 * SANS DANGER POUR LA SAISIE — vérifié appelant par appelant, les quatorze, le
 * 17 septembre 2026. `nb` ne produit QUE du texte affiché : enfants JSX, ou
 * gabarits suivis d'une unité (« g », « kcal », « kg », « % »). Aucune de ses
 * sorties n'alimente un champ, n'est relue par `parseFloat`, ni ne sert de
 * coordonnée — la courbe de `sparkline.tsx` calcule ses hauteurs sur les
 * nombres bruts et ne confie à `nb` que le texte de son pied. Un champ passe
 * par `ChampNombre`, jamais par `nb` : la panne du 15 septembre 2026 — « 42,5 »
 * tapé, 425 kg enregistrés — vivait dans les champs et reste hors d'atteinte.
 *
 * Ne pas « simplifier » en `toLocaleString('fr-FR')` — LA CONSIGNE TIENT, SA
 * RAISON ÉTAIT FAUSSE. Elle invoquait « une API que Hermes n'embarque pas
 * partout » : mesuré le 20 septembre 2026 sur le moteur réel, `Intl.NumberFormat`
 * est bien là, et `toLocaleString('fr-FR')` fonctionne. Mais il ne fait pas la
 * même chose :
 *
 *     (1234.5).toLocaleString('fr-FR')  →  "1 234,5"
 *     nb(1234.5)                        →  "1234,5"
 *
 * et l'espace de la première est un U+202F, espace fine insécable. `nb` ne
 * groupe pas les milliers et arrondit à une décimale : ce sont deux formats
 * différents, pas deux écritures du même. C'est cela qui interdit la
 * substitution, pas une crainte sur le moteur.
 *
 * @see charte.test.ts — « nb, le formatage court »
 */
export const nb = (v: number): string =>
  (Math.abs(v - Math.round(v)) < 0.05
    ? String(Math.round(v))
    : v.toFixed(1).replace('.', ','));
