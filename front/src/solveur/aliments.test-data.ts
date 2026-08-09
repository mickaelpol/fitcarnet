import type { Aliment } from './types';

const a = (
  nom: string, categorie: Aliment['categorie'],
  kcal100: number, prot100: number, gluc100: number, lip100: number,
  ratio = 1, etatReference: Aliment['etatReference'] = 'cuit',
): Aliment => ({ id: nom, nom, categorie, kcal100, prot100, gluc100, lip100, ratio, etatReference });

export const A = {
  saumon:      a('Saumon', 'prot', 173.5, 18.9, 0, 10.2, 0.85, 'cru'),
  truite:      a('Truite', 'prot', 148, 20.8, 0, 6.8, 0.85, 'cru'),
  cabillaud:   a('Cabillaud', 'prot', 105, 22.8, 0, 0.9, 0.85, 'cru'),
  thon:        a('Thon au naturel', 'prot', 116, 25.5, 0, 1, 1, 'cru'),
  poulet:      a('Blanc de poulet', 'prot', 165, 31, 0, 3.6, 0.75, 'cru'),
  boeuf5:      a('Boeuf hache 5%', 'prot', 149, 25, 0, 4.6, 0.78, 'cru'),
  oeufs:       a('Oeufs entiers', 'prot', 146, 12, 2, 10, 1, 'cru'),
  blancs:      a("Blancs d'oeufs", 'prot', 52, 10.9, 0.7, 0.2, 1, 'cru'),
  skyr:        a('Skyr 0%', 'lait', 57, 10, 4, 0.2),
  lait:        a('Lait demi-écrémé', 'lait', 47.7, 3.5, 5, 1.6),
  boulgour:    a('Boulgour', 'fec', 131, 4.3, 24.1, 1, 2.5),
  patateDouce: a('Patate douce', 'fec', 92, 2, 20.7, 0.16, 1),
  riz:         a('Riz basmati', 'fec', 130, 2.7, 28.2, 0.3, 3),
  quinoa:      a('Quinoa', 'fec', 120, 4.4, 21.3, 1.9, 2.75),
  avoine:      a('Flocons avoine', 'fec', 375, 12.5, 67.5, 7.5, 1),
  haricots:    a('Haricots verts', 'leg', 31, 1.8, 7, 0.1),
  courgettes:  a('Courgettes', 'leg', 17, 1.2, 3.1, 0.3),
  concombre:   a('Concombre', 'leg', 15, 0.7, 3.6, 0.1),
  amandes:     a('Amandes', 'ole', 575, 21, 21.5, 49.5),
  noix:        a('Noix', 'ole', 654, 15.2, 13.7, 65.2),
  huile:       a('Huile', 'huile', 900, 0, 0, 100),
  fraises:     a('Fraises', 'fruit', 32, 0.7, 7.7, 0.3),
  banane:      a('Banane', 'fruit', 89, 1.1, 22.8, 0.3),
};

export const CIBLES = {
  R1: { kcal: 578.6, prot: 26.8, gluc: 64.7, lip: 25.9 },
  R2: { kcal: 661.9, prot: 42.8, gluc: 61.8, lip: 25.8 },
  R3: { kcal: 591.7, prot: 57.3, gluc: 51.6, lip: 16.4 },
  R4: { kcal: 551.8, prot: 30.1, gluc: 80.3, lip: 15.4 },
};
