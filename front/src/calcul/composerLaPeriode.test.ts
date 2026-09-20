import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Aliment } from '@/solveur/types';
/* RELATIF : `cleDuRepas` est une VALEUR, et l'alias `@/` n'est pas reecrit
   dans `dist-tests/`. Deuxieme fois aujourd'hui que le piege mord. */
import { cleDuRepas } from '../solveur/periode';
import { composerLaPeriode } from './composerLaPeriode';

/**
 * COMPOSER PLUSIEURS JOURS D'UN COUP.
 *
 * Trente-cinq lignes qui vivaient dans `app/(onglets)/repas.tsx` — donc dans
 * `app/`, intestables. `solveur/composer.ts` ne traite QU'UN repas ;
 * `solveur/periode.ts` résout les quantités, pas le choix des aliments. La
 * boucle jours × repas n'existait nulle part ailleurs : c'est elle qui produit
 * le plan affiché.
 *
 * TROIS RÈGLES Y ÉTAIENT ÉCRITES, et la première est celle qui compte :
 *
 *   - « déjà servi » se remet à zéro CHAQUE JOUR ;
 *   - une variable du solveur peut porter un autre rôle (à la collation, le
 *     laitage porte les protéines) ;
 *   - les quantités imposées ne comptent pas dans « déjà servi ».
 *
 * LE RISQUE CONCRET, avant ce fichier : quelqu'un déplace `const servis` d'un
 * cran — hors de la boucle des jours — et le poulet n'est plus proposé qu'une
 * fois pour la semaine entière. Rien ne tombe, et personne ne s'en aperçoit
 * avant d'avoir composé quatre jours.
 *
 * Descendu le 20 septembre 2026 (palier 0), à comportement identique.
 */

const aliment = (id: number, nom: string, categorie: Aliment['categorie']): Aliment => ({
  id, nom, categorie,
  kcal100: 150, prot100: 20, gluc100: 5, lip100: 5, ratio: 1,
} as Aliment);

/* Deux candidats par rôle : c'est le minimum pour que « ne pas resservir »
   puisse se voir. Avec un seul, le solveur n'a pas le choix et le test
   passerait quoi qu'on écrive. */
const STOCK: Aliment[] = [
  aliment(1, 'Poulet', 'prot'), aliment(2, 'Dinde', 'prot'),
  aliment(3, 'Riz', 'fec'), aliment(4, 'Pâtes', 'fec'),
  aliment(5, 'Huile', 'huile'), aliment(6, 'Beurre', 'huile'),
  aliment(7, 'Brocoli', 'leg'), aliment(8, 'Haricots', 'leg'),
  aliment(9, 'Amandes', 'ole'), aliment(10, 'Noix', 'ole'),
  aliment(11, 'Skyr', 'lait'), aliment(12, 'Fromage blanc', 'lait'),
  aliment(13, 'Pomme', 'fruit'), aliment(14, 'Banane', 'fruit'),
];

const tout = () => true;
const seul = () => 1;

describe('ce que compose la période', () => {
  it('une clé par repas coché, et rien pour les autres', () => {
    const suite = composerLaPeriode({
      jours: [0, 1], stock: STOCK, convives: seul,
      coche: (rang, repas) => rang === 0 && repas === 'R2',
    });

    assert.deepEqual(Object.keys(suite), [cleDuRepas(0, 'R2')]);
  });

  it('aucun jour coché rend un plan vide, pas une erreur', () => {
    assert.deepEqual(composerLaPeriode({
      jours: [0], stock: STOCK, convives: seul, coche: () => false,
    }), {});
  });

  it('un frigo vide rend une clé par repas, sans aliment', () => {
    /* On ne refuse PAS de composer : l'écran doit pouvoir dire « il manque
       ceci », et il ne le peut que si la clé existe. */
    const suite = composerLaPeriode({ jours: [0], stock: [], convives: seul, coche: tout });

    assert.equal(Object.keys(suite).length, 4);
    assert.deepEqual(suite[cleDuRepas(0, 'R1')]!.roles, {});
  });
});

describe('« déjà servi », et sa remise à zéro', () => {
  it('ne ressert pas la même protéine deux fois dans la JOURNÉE', () => {
    const suite = composerLaPeriode({
      jours: [0], stock: STOCK, convives: seul,
      coche: (_rang, repas) => repas === 'R2' || repas === 'R4',
    });

    const midi = suite[cleDuRepas(0, 'R2')]!.roles.proteine;
    const soir = suite[cleDuRepas(0, 'R4')]!.roles.proteine;

    assert.ok(midi && soir);
    assert.notEqual(midi.id, soir.id, 'le même aliment ne doit pas revenir le même jour');
  });

  it('LA RÈGLE QUI SE PERD LE PLUS FACILEMENT : le lendemain repart de zéro', () => {
    /* C'est le cas qui tombe si `servis` sort de la boucle des jours. Éviter
       le poulet deux fois le même jour est un service ; l'éviter toute la
       semaine est une contrainte que personne n'a demandée — et sur quatre
       jours, le frigo n'aurait plus assez de protéines distinctes. */
    const suite = composerLaPeriode({
      jours: [0, 1], stock: STOCK, convives: seul,
      coche: (_rang, repas) => repas === 'R2',
    });

    const jour0 = suite[cleDuRepas(0, 'R2')]!.roles.proteine;
    const jour1 = suite[cleDuRepas(1, 'R2')]!.roles.proteine;

    assert.ok(jour0 && jour1);
    assert.equal(jour0.id, jour1.id,
      'deux jours identiques doivent proposer le MÊME aliment : le compteur repart de zéro');
  });

  it('quatre jours de suite proposent tous la même chose', () => {
    /* Le corollaire, et le vrai symptôme de la régression : avec un `servis`
       global, le quatrième jour n'aurait plus de protéine du tout. */
    const suite = composerLaPeriode({
      jours: [0, 1, 2, 3], stock: STOCK, convives: seul,
      coche: (_rang, repas) => repas === 'R2',
    });

    const prots = [0, 1, 2, 3].map((j) => suite[cleDuRepas(j, 'R2')]?.roles.proteine?.id);

    assert.ok(prots.every((p) => p !== undefined),
      'aucun jour ne doit se retrouver sans protéine');
    assert.equal(new Set(prots).size, 1);
  });
});

describe('les rôles posés dans le plan', () => {
  it('un plan composé ne porte ni restes, ni verrous, ni ajouts', () => {
    /* Ce sont des décisions de l'utilisateur, prises APRÈS. Les préremplir
       ferait croire à des choix qu'il n'a pas faits. */
    const suite = composerLaPeriode({
      jours: [0], stock: STOCK, convives: seul, coche: (_r, repas) => repas === 'R2',
    });
    const midi = suite[cleDuRepas(0, 'R2')]!;

    assert.deepEqual(midi.restes, {});
    assert.deepEqual(midi.verrous, []);
    assert.deepEqual(midi.ajouts, []);
    assert.deepEqual(midi.releves, {});
  });

  it('le nombre de convives du repas est bien celui qu\'on demande', () => {
    /* Un plan pour quatre et un plan pour un ne choisissent pas les mêmes
       quantités : si `convives` n'était pas transmis, l'écart serait muet. */
    let demande: [number, string] | null = null;
    composerLaPeriode({
      jours: [7], stock: STOCK,
      convives: (rang, repas) => { demande = [rang, repas]; return 4; },
      coche: (_r, repas) => repas === 'R2',
    });

    assert.deepEqual(demande, [7, 'R2']);
  });
});
