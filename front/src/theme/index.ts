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
  attenue: '#8b929c',
  discret: '#5d646e',
  vif: '#e3b23c',
  ok: '#3d9a5c',
  erreur: '#d8352a',
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

/** Formatage court : 154 g, 12,5 g — jamais « 154.00 ». */
export const nb = (v: number): string =>
  Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
