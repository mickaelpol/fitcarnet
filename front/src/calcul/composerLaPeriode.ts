import { composer } from '../solveur/composer';
import { cleDuRepas } from '../solveur/periode';
import { MODELE, REPAS, type Repas, type Role } from '../solveur/repasVocabulaire';
import type { Aliment } from '../solveur/types';
import type { Compose } from './demandeRepas';

/**
 * Composer d'un coup tous les repas cochés d'une période.
 *
 * DESCENDU LE 20 SEPTEMBRE 2026 (palier 0) depuis `app/(onglets)/repas.tsx`,
 * où ces trente-cinq lignes vivaient dans le corps de l'écran — donc dans
 * `app/`, hors de portée de `tsconfig.tests.json`.
 *
 * Rien d'autre ne faisait ce travail : `solveur/composer.ts` ne traite QU'UN
 * repas, `solveur/periode.ts` résout les quantités mais pas le choix des
 * aliments. La boucle jours × repas n'existait qu'ici, et c'est elle qui
 * produit le plan affiché.
 *
 * LE RISQUE QUI JUSTIFIE CE FICHIER : quelqu'un déplace `servis` d'un cran —
 * hors de la boucle des jours — et le poulet n'est plus proposé qu'une fois
 * pour la semaine entière ; au quatrième jour, il ne reste plus de protéine du
 * tout. Rien ne tombait, et rien ne le signalait avant d'avoir composé quatre
 * jours à la main.
 */
export function composerLaPeriode(demande: {
  /** Les jours retenus, en rangs relatifs à aujourd'hui. */
  jours: readonly number[];
  stock: Aliment[];
  /** Combien de personnes à ce repas de ce jour. */
  convives: (rang: number, repas: Repas) => number;
  /** Ce repas de ce jour est-il coché ? */
  coche: (rang: number, repas: Repas) => boolean;
}): Record<string, Compose> {
  const suite: Record<string, Compose> = {};

  for (const rang of demande.jours) {
    /* « DÉJÀ SERVI » SE REMET À ZÉRO CHAQUE JOUR. Éviter le poulet deux fois
       le même jour est un service ; l'éviter toute la semaine serait une
       contrainte que personne n'a demandée. C'est la déclaration la plus
       fragile du fichier : sortie d'un cran, elle change tout sans rien
       casser. */
    const servis = new Set<number | string>();

    for (const repas of REPAS) {
      if (!demande.coche(rang, repas)) continue;

      const c = composer(demande.stock, demande.convives(rang, repas), servis, repas);
      const roles: Partial<Record<Role, Aliment>> = {};

      /* Une variable du solveur peut venir d'un rôle différent : à la
         collation, c'est le laitage qui porte les protéines. */
      for (const slot of ['proteine', 'glucide', 'lipide'] as const) {
        const a = c.variables[slot];
        if (a) { roles[MODELE[repas][slot]] = a; servis.add(a.id); }
      }

      /* Les quantités imposées ne comptent PAS dans « déjà servi » :
         resservir la même huile à tous les repas est normal. */
      for (const [role, aliment] of Object.entries(c.imposes)) {
        roles[role as Role] = aliment;
      }

      /* Restes, verrous, ajouts et relèves sont des décisions de
         l'utilisateur, prises après. On ne les prérremplit pas. */
      suite[cleDuRepas(rang, repas)] = {
        roles, restes: {}, verrous: [], ajouts: [], releves: {},
      };
    }
  }

  return suite;
}
