/* SOUS UN AUTRE NOM, PARCE QUE `Repas` EST DÉJÀ PRIS ICI.
   Dans ce fichier, `Repas` désigne le CONTENU d'un repas — ses aliments, ses
   convives. Dans le solveur, c'est le CRÉNEAU : 'R1' à 'R4'. Deux notions,
   deux noms ; les confondre compilait sans broncher et donnait un champ qui
   acceptait un objet là où on attend « R1 ». Le solveur n'importe pas ce
   fichier, il n'y a donc pas de cycle. */
import type { Repas as MomentDuRepas } from '@/solveur/repasVocabulaire';
import type { Aliment } from '@/solveur/types';
import type { Boite, Fournee, Portion, Repas } from './fournees';

/**
 * L'INSTANTANÉ CONSERVÉ : ce qu'on a cuisiné, figé pour être relu.
 *
 * Extrait de `cuisson.ts` le 15 septembre 2026 (rang 6 du lot 6 de l'audit).
 * Découpage mécanique : aucune ligne de logique n'a changé.
 */

/**
 * UN PLAN ENREGISTRÉ EST UN INSTANTANÉ, PAS UNE RECETTE À REJOUER.
 *
 * Il porte des NOMS et des GRAMMES, jamais des identifiants d'aliments. Deux
 * raisons, et la seconde est la plus importante :
 *
 *   - un aliment supprimé du frigo depuis ne doit pas rendre un plan
 *     illisible ;
 *   - **on ne recalcule rien à la lecture.** Le jeudi midi, on ne veut pas
 *     savoir ce qu'on cuisinerait aujourd'hui — le stock a bougé, une cible a
 *     peut-être changé — on veut savoir ce qu'on a cuisiné dimanche. Rejouer
 *     le solveur donnerait un autre plan, et ce serait le mauvais.
 */
export interface PlanEnregistre {
  /** version de la forme, pour qu'une évolution ne rende pas l'ancien illisible */
  version: 1 | 2 | 3;
  courses: { nom: string; categorie: string; grammes: number }[];
  fournees: {
    libelle: string;
    lignes: { nom: string; categorie: string; aCuire: number }[];
  }[];
  boites: {
    /** « Aujourd'hui · Midi », déjà mis en toutes lettres */
    titre: string;
    /**
     * LE MOMENT DE REPAS, EN CODE. Absent des plans version 1 et 2.
     *
     * `titre` est un libellé d'affichage : « Aujourd'hui · Matin ». Il se lit,
     * il ne se relit pas — en tirer « R1 » demanderait d'inverser une table de
     * traduction, et un jour où l'on renomme « 16 h » en « collation », tous
     * les plans déjà enregistrés perdraient silencieusement le lien.
     *
     * Ce champ sert à rattacher la boîte à ses compléments alimentaires. Les
     * compléments ne sont PAS figés dans le plan : ce sont des consignes
     * courantes, et en rouvrant un plan de dimanche on veut savoir ce qu'on
     * prend AUJOURD'HUI, pas ce qu'on prenait alors. Le plan n'a donc qu'à
     * dire de quel repas il s'agit.
     */
    repas?: MomentDuRepas;
    convives: number;
    cuits: LigneEnregistree[];
    crus: LigneEnregistree[];
  }[];
  /**
   * CE QUE CE PLAN PREND AU FRIGO. Absent des plans version 1.
   *
   * La seule partie de l'instantané qui porte des IDENTIFIANTS, et c'est
   * assumé. Le reste du plan se lit ; celle-ci se CALCULE avec — réserver du
   * stock puis le décrémenter demande de désigner une ligne du frigo, pas de
   * l'appeler par son nom. Un nom se réécrit, un identifiant non ; se tromper
   * de ligne ici viderait le mauvais bac.
   *
   * Un aliment disparu du frigo depuis rend sa ligne inapplicable, et c'est
   * dit plutôt que deviné.
   *
   * Les grammes sont ceux de la BALANCE — le poids pesé, additionné sur toute
   * la période, cuisson ou pas. C'est ce qui sort réellement du frigo : ce
   * qu'on y a mis n'a jamais été de l'eau de cuisson.
   */
  consomme?: { reference: number | string; nom: string; grammes: number }[];
}

export interface LigneEnregistree {
  nom: string;
  categorie: string;
  /** ce qu'on met dans la boîte, pour tous les convives */
  assiette: number;
  /** ce qu'on se sert, pour UNE personne */
  parPersonne: number;
}

/**
 * Fige un plan pour le relire plus tard.
 *
 * `nomDeLaBoite` traduit une clé « 2|R3 » en « jeudi 14/08 · 16 h ». On la
 * résout ICI et non à la lecture : dans trois jours, le rang 2 ne désignera
 * plus le même jour. Un instantané qui se relit doit être daté au moment où
 * il est pris.
 */
export function figerLePlan(
  courses: readonly { aliment: Aliment; grammes: number }[],
  fournees: readonly Fournee[],
  boites: readonly Boite[],
  nomDeLaBoite: (cle: string) => string,
  /** le plan à plat — sert à savoir ce qui sort du frigo, cuisson ou pas */
  repas: readonly Repas[] = [],
): PlanEnregistre {
  const ligne = (p: Portion): LigneEnregistree => ({
    nom: p.aliment.nom,
    categorie: p.aliment.categorie,
    assiette: p.assiette,
    parPersonne: p.parPersonne,
  });

  return {
    version: 3,
    consomme: consommationDuPlan(repas),
    courses: courses.map((c) => ({
      nom: c.aliment.nom, categorie: c.aliment.categorie, grammes: c.grammes,
    })),
    fournees: fournees.map((f) => ({
      libelle: f.mode.libelle,
      lignes: f.lignes.map((l) => ({
        nom: l.aliment.nom, categorie: l.aliment.categorie, aCuire: l.aCuire,
      })),
    })),
    boites: boites.map((b) => ({
      titre: nomDeLaBoite(b.cle),
      /* « 2|R3 » — le rang du jour, puis le repas. Le rang ne veut plus rien
         dire dans trois jours ; le repas, si. On ne garde que lui. */
      repas: b.cle.split('|')[1] as MomentDuRepas,
      convives: b.convives,
      cuits: b.cuits.map(ligne),
      crus: b.crus.map(ligne),
    })),
  };
}

/**
 * Ce que ce plan prend au frigo, aliment par aliment.
 *
 * `aCuire` et non `assiette` : c'est le poids de la BALANCE. Ce qu'on sort du
 * frigo, c'est du riz sec et de la viande crue — l'eau que la cuisson ajoute
 * n'a jamais été dans le bac. Prendre l'assiette ferait déduire trois fois
 * trop de riz, et le frigo se viderait sur le papier bien avant de se vider
 * en vrai.
 *
 * Les quantités s'additionnent sur toute la période : un aliment servi à
 * quatre repas donne une seule ligne et son total.
 *
 * Tous les aliments, cuits ou non. Les fournées n'en couvrent qu'une partie —
 * le skyr et les amandes sortent du frigo comme le reste.
 */
export function consommationDuPlan(
  repas: readonly Repas[],
): { reference: number | string; nom: string; grammes: number }[] {
  const par = new Map<number | string, { nom: string; grammes: number }>();

  for (const r of repas) {
    for (const q of r.quantites) {
      const deja = par.get(q.aliment.id);
      if (deja === undefined) {
        par.set(q.aliment.id, { nom: q.aliment.nom, grammes: q.aCuire });
      } else {
        deja.grammes += q.aCuire;
      }
    }
  }

  return [...par]
    .map(([reference, x]) => ({ reference, nom: x.nom, grammes: x.grammes }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/**
 * CE QUI EST DÉJÀ PROMIS À UN AUTRE PLAN.
 *
 * Le bug qu'elle corrige : deux batch cooking d'affilée comptaient deux fois
 * le même frigo. On compose lundi-mercredi, on enregistre ; on compose
 * jeudi-samedi, et le solveur repartait du stock d'avant. Le premier plan
 * avait beau vider les 800 g de poulet, le second annonçait « objectifs
 * atteints » sur du poulet qui n'existait plus — et personne n'était prévenu,
 * puisque chaque plan était juste tout seul.
 *
 * Seuls les plans PRÉVUS réservent. Un plan cuisiné a déjà fait baisser le
 * stock pour de vrai : le compter encore le déduirait deux fois.
 *
 * Un plan version 1 ne réserve rien — il ne dit pas ce qu'il consomme, et
 * inventer une consommation à partir de ses noms d'aliments serait deviner.
 * Mieux vaut une réservation manquante, qu'on voit, qu'une réservation fausse,
 * qu'on ne voit pas.
 */
export function estCuisine(plan: { cuisineLe?: string | null }): boolean {
  /* `!= null` attrape `null` ET `undefined`, et la différence a coûté cher :
     tant que le serveur n'a pas vidé son cache après la migration, il ne
     renvoie pas du tout le champ. `!== null` répondait alors « cuisiné » pour
     TOUS les plans — donc aucune réservation, et l'écran affichait
     « Cuisiné le Invalid Date » sur un plan qu'on n'avait jamais cuisiné.

     Le défaut va vers PRÉVU, et c'est le bon sens du risque : réserver un
     stock qui ne l'était pas se voit tout de suite et se corrige d'un appui ;
     ne pas réserver laisse trois plans se partager le même brocoli en
     silence, et on le découvre devant le bac. */
  return plan.cuisineLe != null && plan.cuisineLe !== '';
}

export function dejaPromis(
  plans: readonly { contenu: PlanEnregistre; cuisineLe?: string | null }[],
): Map<number | string, number> {
  const promis = new Map<number | string, number>();

  for (const p of plans) {
    if (estCuisine(p)) continue;
    for (const c of p.contenu.consomme ?? []) {
      promis.set(c.reference, (promis.get(c.reference) ?? 0) + c.grammes);
    }
  }

  return promis;
}
