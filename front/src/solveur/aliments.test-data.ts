import type { Aliment } from './types';

const a = (
  nom: string, categorie: Aliment['categorie'],
  kcal100: number, prot100: number, gluc100: number, lip100: number,
  ratio = 1,
): Aliment => ({ id: nom, nom, categorie, kcal100, prot100, gluc100, lip100, ratio });

/**
 * Le catalogue des tests, dans l'unique convention de l'application : toutes
 * les valeurs se rapportent à 100 g de produit TEL QU'ON LE PÈSE.
 *
 * Les féculents portaient auparavant leurs valeurs CUITES. Les passer au sec
 * est une multiplication par le rendement, et c'est exactement pour cela que
 * pas une seule attente de test n'a bougé : le riz à 28,2 g de glucides pour
 * 100 g cuits et le riz à 84,6 g pour 100 g secs avec un rendement de 3 sont
 * le MÊME riz. Le solveur trouvait 33,3 g à peser, il trouve toujours 33,3 g.
 * La conversion préserve les deux colonnes qui comptent.
 */
export const A = {
  saumon:      a('Saumon', 'prot', 173.5, 18.9, 0, 10.2, 0.85),
  truite:      a('Truite', 'prot', 148, 20.8, 0, 6.8, 0.85),
  cabillaud:   a('Cabillaud', 'prot', 105, 22.8, 0, 0.9, 0.85),
  thon:        a('Thon au naturel', 'prot', 116, 25.5, 0, 1, 1),
  poulet:      a('Blanc de poulet', 'prot', 165, 31, 0, 3.6, 0.75),
  boeuf5:      a('Boeuf hache 5%', 'prot', 149, 25, 0, 4.6, 0.78),
  oeufs:       a('Oeufs entiers', 'prot', 146, 12, 2, 10, 1),
  blancs:      a("Blancs d'oeufs", 'prot', 52, 10.9, 0.7, 0.2, 1),
  skyr:        a('Skyr 0%', 'lait', 57, 10, 4, 0.2),
  lait:        a('Lait demi-écrémé', 'lait', 47.7, 3.5, 5, 1.6),
  /* Grains secs : les valeurs cuites d'hier multipliees par leur rendement.
     Boulgour 131 x 2,5, riz 130 x 3, quinoa 120 x 2,75. Toutes retombent
     entre 300 et 400 kcal, la bande de la matiere seche — c'est le controle
     que `plausibilite.ts` applique desormais a ces trois-la.

     CE SONT DES DONNEES DE TEST, PAS UNE REFERENCE. Le « 130 x 3 » du riz
     vient d'une valeur USDA ; CIQUAL 2025 (colonne « Reglement UE n° 1169
     2011 ») donne 350 au riz blanc cru et 155 au riz blanc cuit, soit un
     rendement de 2,26. Le catalogue reel (`db/manuel/16-catalogue-ciqual.sql`)
     porte 350 et 2,26 ; ces fixtures gardent l'ancienne paire parce que les
     tests s'appuient dessus, et que ce qu'ils eprouvent est la conversion, pas
     la valeur du riz. Note du 16 septembre 2026. */
  boulgour:    a('Boulgour', 'fec', 327.5, 10.75, 60.25, 2.5, 2.5),
  /* La patate douce ne gonfle pas : rendement 1, valeurs inchangees, et la
     bande des grains secs ne la concerne pas. */
  patateDouce: a('Patate douce', 'fec', 92, 2, 20.7, 0.16, 1),
  riz:         a('Riz basmati', 'fec', 390, 8.1, 84.6, 0.9, 3),
  quinoa:      a('Quinoa', 'fec', 330, 12.1, 58.575, 5.225, 2.75),
  avoine:      a('Flocons avoine', 'fec', 375, 12.5, 67.5, 7.5, 1),
  /* Légumes : on pèse ce qu'on sort du frigo, comme les viandes. Le rendement
     reste à 1 : aucune mesure ne le donne, et il n'affiche que le poids servi
     sans toucher une seule macro. */
  haricots:    a('Haricots verts', 'leg', 31.9, 1.8, 4.1, 0.2, 1),
  courgettes:  a('Courgettes', 'leg', 16.7, 1.2, 1.8, 0.3, 1),
  concombre:   a('Concombre', 'leg', 16.8, 0.7, 2.9, 0.1, 1),
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

/**
 * Le frigo de référence des tests : un aliment par rôle, et rien de plus.
 *
 * Il vivait en tête de `composer.test.ts`. Le découpage du 15 septembre 2026
 * l'a rendu nécessaire à trois fichiers de tests ; le recopier trois fois
 * aurait donné trois frigos libres de diverger.
 */
export const STOCK = [
  A.poulet, A.riz, A.avoine, A.amandes, A.huile, A.courgettes, A.skyr, A.banane,
];
