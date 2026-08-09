import type { Aliment, Cibles } from './types';
import type { Repas } from './composer';

/**
 * Des frigos plausibles, tirés au sort, mais TOUJOURS LES MÊMES.
 *
 * Une batterie d'invariants ne vaut que si elle voit des situations que
 * personne n'a pensé à écrire : un frigo sans oléagineux, une protéine à
 * 12 g de reste, un féculent en rupture. Le tirage au sort les produit ;
 * la graine les rend reproductibles.
 *
 * `Math.random` est proscrit ici : un test qui échoue une fois sur cent, et
 * qu'on ne peut pas rejouer, est pire qu'une absence de test. Le générateur
 * ci-dessous est un congruentiel linéaire — le même à chaque exécution, sur
 * chaque machine, aujourd'hui comme dans un an. Quand un invariant tombe, le
 * message donne la graine, et le scénario se rejoue à l'identique.
 */
export function tirage(graine: number): () => number {
  let etat = (graine * 2654435761) % 2147483647;
  if (etat <= 0) etat += 2147483646;

  return () => {
    etat = (etat * 16807) % 2147483647;

    return (etat - 1) / 2147483646;
  };
}

const a = (
  nom: string, categorie: Aliment['categorie'],
  kcal100: number, prot100: number, gluc100: number, lip100: number,
  fibres100: number, ratio: number, etatReference: Aliment['etatReference'],
): Aliment => ({
  id: nom, nom, categorie, kcal100, prot100, gluc100, lip100,
  fibres100, ratio, etatReference,
});

/**
 * Le catalogue dans lequel les frigos sont tirés.
 *
 * Valeurs Ciqual, convention européenne : `gluc100` EXCLUT les fibres, qui
 * ont leur propre colonne.
 *
 * L'état de référence suit le GESTE, pas la catégorie : on pèse ce qu'on sort
 * du frigo. Protéines et légumes sont donc référencés CRUS, féculents et
 * laitages référencés à l'état servi. Le rendement dit ce qu'on retrouvera
 * dans l'assiette.
 */
export const CATALOGUE: readonly Aliment[] = [
  // protéines — référence crue, ratio = cuit/cru (perte à la cuisson)
  a('Saumon frais', 'prot', 173.5, 18.9, 0, 10.2, 0, 0.85, 'cru'),
  a('Truite', 'prot', 148, 20.8, 0, 6.8, 0, 0.85, 'cru'),
  a('Cabillaud', 'prot', 105, 22.8, 0, 0.9, 0, 0.85, 'cru'),
  a('Thon au naturel', 'prot', 116, 25.5, 0, 1, 0, 1, 'cru'),
  a('Blanc de poulet', 'prot', 165, 31, 0, 3.6, 0, 0.75, 'cru'),
  a('Boeuf hache 5%', 'prot', 149, 25, 0, 4.6, 0, 0.78, 'cru'),
  a('Oeufs entiers', 'prot', 146, 12, 2, 10, 0, 1, 'cru'),
  a("Blancs d'oeufs", 'prot', 52, 10.9, 0.7, 0.2, 0, 1, 'cru'),
  a('Dinde', 'prot', 135, 29, 0, 1.9, 0, 0.75, 'cru'),

  // laitages — référence cuite (rien à cuire), ratio 1
  a('Skyr 0%', 'lait', 57, 10, 4, 0.2, 0, 1, 'cuit'),
  a('Fromage blanc 0%', 'lait', 47, 7.5, 4.3, 0.2, 0, 1, 'cuit'),
  a('Lait demi-écrémé', 'lait', 47.7, 3.5, 5, 1.6, 0, 1, 'cuit'),

  // féculents — référence CUITE, ratio = cuit/sec
  a('Riz basmati', 'fec', 130, 2.7, 28.2, 0.3, 0.7, 3, 'cuit'),
  a('Boulgour', 'fec', 131, 4.3, 24.1, 1, 2.7, 2.5, 'cuit'),
  a('Quinoa', 'fec', 120, 4.4, 21.3, 1.9, 2.8, 2.75, 'cuit'),
  a('Patate douce', 'fec', 92, 2, 20.7, 0.16, 2.5, 1, 'cuit'),
  a('Pommes de terre', 'fec', 85, 2, 17.8, 0.2, 1.9, 1, 'cuit'),
  a('Pâtes complètes', 'fec', 133, 5.3, 24.5, 0.9, 3.5, 2.4, 'cuit'),
  a('Flocons avoine', 'fec', 375, 12.5, 59.5, 7.5, 8, 1, 'cuit'),

  /* légumes — référence CRUE, comme les viandes. On pèse ce qu'on sort du
     frigo : 200 g de brocoli sur la balance en rendent 150 à la vapeur. Et
     à la vapeur seule l'eau part, donc compter sur le poids cru est exact.
     Le rendement n'AFFICHE que le poids attendu dans l'assiette. */
  a('Brocoli', 'leg', 28, 3, 2, 0.5, 2.6, 0.75, 'cru'),
  a('Haricots verts', 'leg', 30, 1.8, 3.6, 0.2, 3, 0.9, 'cru'),
  a('Courgettes', 'leg', 15, 1, 1.6, 0.2, 1, 0.73, 'cru'),
  a('Épinards', 'leg', 22, 2.7, 0.9, 0.4, 2.5, 0.4, 'cru'),
  a('Carottes', 'leg', 33, 0.6, 6, 0.2, 2.7, 0.85, 'cru'),

  // oléagineux et huiles
  /* Valeurs Ciqual, PAS USDA : la table américaine annonce 21,5 g de glucides
     pour l'amande, fibres comprises. Reprises telles quelles à côté d'une
     colonne fibres, elles comptent les fibres deux fois — et 104 g de
     nutriments tiennent alors dans 100 g d'amande. */
  a('Amandes', 'ole', 634, 25.4, 6.7, 53.4, 12.6, 1, 'cuit'),
  a('Noix', 'ole', 698, 15.2, 5.1, 68.5, 6.7, 1, 'cuit'),
  a('Beurre de cacahuète', 'ole', 599, 25, 12, 50, 6, 1, 'cuit'),
  a("Huile d'olive", 'huile', 900, 0, 0, 100, 0, 1, 'cuit'),
  a("Huile d'avocat", 'huile', 900, 0, 0, 100, 0, 1, 'cuit'),

  // fruits
  a('Fraises', 'fruit', 32, 0.7, 5.7, 0.3, 2, 1, 'cuit'),
  a('Banane', 'fruit', 89, 1.1, 20.5, 0.3, 2.3, 1, 'cuit'),
  a('Pomme', 'fruit', 52, 0.3, 11.4, 0.2, 2.4, 1, 'cuit'),
  a('Myrtilles', 'fruit', 57, 0.7, 12, 0.3, 2.4, 1, 'cuit'),
];

/** Les cibles réelles du plan, par personne. */
export const CIBLES_PLAN: Record<Repas, Cibles> = {
  R1: { kcal: 578.6, prot: 26.8, gluc: 64.7, lip: 25.9 },
  R2: { kcal: 661.9, prot: 42.8, gluc: 61.8, lip: 25.8 },
  R3: { kcal: 591.7, prot: 57.3, gluc: 51.6, lip: 16.4 },
  R4: { kcal: 551.8, prot: 30.1, gluc: 80.3, lip: 15.4 },
};

export interface Frigo {
  graine: number;
  /** ce que le frigo contient, dans l'ordre où l'application le verrait */
  aliments: Aliment[];
  /** grammes restants, dans l'unité « à cuire » — c'est ainsi qu'on stocke */
  stockDe: (a: Aliment) => number;
  stocks: Map<Aliment['id'], number>;
}

/**
 * Un frigo tiré au sort : entre 5 et 20 aliments, des stocks entre 10 g et
 * 800 g. Les petits stocks sont volontairement fréquents — c'est là que le
 * calculateur se trompe, pas quand tout abonde.
 */
export function frigoAleatoire(graine: number): Frigo {
  const r = tirage(graine);

  const aliments = CATALOGUE.filter(() => r() < 0.45);

  const stocks = new Map<Aliment['id'], number>();
  for (const al of aliments) {
    const d = r();
    /* Un stock sur cinq est maigre : moins de 60 g. Un sur vingt est
       ridicule : moins de 15 g. Ce sont les cas qui font mentir un
       calculateur qui ne regarde pas le frigo. */
    const g = d < 0.05 ? 3 + r() * 12
      : d < 0.25 ? 15 + r() * 45
        : 60 + r() * 740;
    stocks.set(al.id, Math.round(g * 10) / 10);
  }

  return {
    graine,
    aliments,
    stocks,
    stockDe: (al) => stocks.get(al.id) ?? 0,
  };
}
