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
  // une couleur par rôle nutritionnel
  prot: '#7ba7dd',
  fec: '#e3b23c',
  lip: '#e0906a',
  leg: '#5ec080',
} as const;

export const R = { s: 9, m: 11, l: 14, xl: 18 } as const;

export const E = { xs: 4, s: 8, m: 12, l: 16, xl: 24 } as const;

export const P = {
  titre: 'BarlowCondensed_700Bold',
  chiffre: 'BarlowCondensed_600SemiBold',
  texte: 'Inter_400Regular',
  fort: 'Inter_600SemiBold',
} as const;

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
