/**
 * Logique du frigo indépendante de l'affichage : regroupement par emplacement
 * et calcul des écarts d'inventaire.
 *
 * Extrait de l'écran pour que l'inventaire et la consultation partagent le
 * même ordre — sans quoi les deux vues du même frigo divergeraient.
 */

import { nombreSaisi } from './saisieNombre';
import type { AlimentDisponible, AlimentIncomplet } from '@/api/types';
import { sansAccent } from './texte';

/**
 * LE STOCK RAMENÉ AU GRAMME, ou `null` si la conversion est inconnue.
 *
 * Rapatriée le 20 septembre 2026 (palier 0). Cette règle était écrite TROIS
 * fois, dans deux langages, **avec trois gardes différentes** :
 *
 *     api/src/Service/AlimentDisponible.php:167   null !== $g && $g > 0   ← refuse 0
 *     front/src/calcul/planCalcule.ts:65          a.grammesParUnite !== null
 *     front/src/composants/ligneFrigo.tsx:97      … !== null
 *
 * Un produit Grocy dont le facteur de conversion vaut `0` — `FrigoGrocy.php`
 * le lit tel quel — donnait donc trois réponses : le serveur « je ne sais
 * pas », le solveur « zéro gramme », et l'écran du frigo **« soit 0 g »**.
 * Un « je ne sais pas » rendu en zéro, ce que la règle 6 interdit
 * explicitement.
 *
 * C'EST LA GARDE DU SERVEUR QUI FAIT FOI, et c'est la plus stricte : un
 * facteur nul n'est pas une conversion, c'est une conversion absente. Un
 * litre de lait ou un pack n'ont pas de poids connu — le calculateur doit
 * les écarter, pas supposer.
 *
 * *(Aucune instance Grocy n'a été trouvée avec un facteur à zéro : c'est un
 * risque, pas un défaut constaté. Mais les trois écritures divergeaient
 * VRAIMENT, et c'est cela qu'on corrige.)*
 */
export const stockEnGrammes = (
  aliment: { stock: number; grammesParUnite: number | null },
): number | null => (aliment.grammesParUnite !== null && aliment.grammesParUnite > 0
  ? aliment.stock * aliment.grammesParUnite
  : null);

/** Ordre de parcours d'un inventaire réel : on descend du frais au sec. */
export const ORDRE_EMPLACEMENTS = ['Frigo', 'Congélateur', 'Congelateur', 'Placard'];

/**
 * Une ligne du frigo : un aliment utilisable, OU un produit Grocy incomplet.
 *
 * Les deux se rangent dans la même section depuis le 19 septembre 2026 —
 * « je veux que TOUS mes aliments apparaissent dans mon frigo ». Ce qui les
 * distingue à la lecture est la présence de `manquants`, et le typage oblige
 * à choisir : aucun code ne peut lire `kcal100` sur une ligne incomplète.
 */
export type LigneFrigo = AlimentDisponible | AlimentIncomplet;

export const estIncomplet = (l: LigneFrigo): l is AlimentIncomplet => 'manquants' in l;

export interface SectionFrigo {
  titre: string;
  data: LigneFrigo[];
}

export function grouperParEmplacement(aliments: LigneFrigo[]): SectionFrigo[] {
  const parLieu = new Map<string, LigneFrigo[]>();
  for (const a of aliments) {
    const lieu = a.emplacement ?? 'Sans emplacement';
    parLieu.set(lieu, [...(parLieu.get(lieu) ?? []), a]);
  }

  return [...parLieu.entries()]
    .sort((a, b) => {
      const ia = ORDRE_EMPLACEMENTS.indexOf(a[0]);
      const ib = ORDRE_EMPLACEMENTS.indexOf(b[0]);

      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0], 'fr');
    })
    .map(([titre, data]) => ({
      titre,
      data: [...data].sort((x, y) => x.nom.localeCompare(y.nom, 'fr')),
    }));
}

/**
 * Recherche sur le nom et l'emplacement, insensible aux accents et à la casse.
 * « congelateur » doit trouver le congélateur, sinon la barre ne sert à rien.
 */
export function filtrerFrigo(
  aliments: LigneFrigo[],
  recherche: string,
): LigneFrigo[] {
  const q = sansAccent(recherche.trim());
  if (q === '') return aliments;

  return aliments.filter(
    (a) => sansAccent(a.nom).includes(q) || sansAccent(a.emplacement ?? '').includes(q));
}

export interface LigneInventaire {
  reference: string;
  quantite: number;
}

/**
 * Seuil d'écart. En deçà, la différence vient de l'arrondi d'affichage, pas
 * de la balance : l'envoyer ferait un mouvement de stock pour rien.
 */
export const SEUIL_ECART = 0.001;

/**
 * Ce qui sera réellement envoyé : uniquement les lignes saisies dont la
 * valeur diffère du stock théorique.
 *
 * Une saisie vide n'est pas un zéro — elle signifie « pas encore compté ».
 * Confondre les deux viderait le frigo de tout ce qu'on n'a pas eu le temps
 * de peser.
 */
export function ecartsInventaire(
  aliments: AlimentDisponible[],
  saisies: Record<string, string>,
): LigneInventaire[] {
  const lignes: LigneInventaire[] = [];

  for (const a of aliments) {
    const texte = (saisies[a.reference] ?? '').trim();
    if (texte === '') continue;

    /* `nombreSaisi` ET NON `parseFloat` : « 4,2,1 » se lisait 4,2, et partait
       vers Grocy comme une pesée. Relevé par la revue le 15 septembre 2026.
       Négatif et illisible rendent `null` : la ligne n'est pas envoyée. */
    const quantite = nombreSaisi(texte);
    if (quantite === null) continue;
    if (Math.abs(quantite - a.stock) <= SEUIL_ECART) continue;

    lignes.push({ reference: a.reference, quantite });
  }

  return lignes;
}
