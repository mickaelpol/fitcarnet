import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { Aliment } from '../solveur/types';
import { verifierAliment } from './plausibilite';

/**
 * LE VERROU ENTRE LES DEUX JUGES DE LA COHÉRENCE — palier 1, 20 septembre 2026.
 *
 * Jusqu'ici, ce front était le SEUL juge : `verifierAliment` refusait 90 kcal
 * pour un riz qui en fait 350, et l'API l'acceptait sans un mot. Un appel
 * direct, un bug d'écran, un autre client demain — et la donnée entrait.
 *
 * Poser la règle côté serveur, c'est l'écrire une DEUXIÈME fois. Ce fichier et
 * son jumeau `api/tests/Service/CoherencePartageTest.php` lisent LE MÊME
 * fichier, `api/regles/coherence.json` : le jour où l'un des deux juges change
 * d'avis sans l'autre, une des deux suites tombe en nommant le cas.
 *
 * CE QUI EST VERROUILLÉ : LE REFUS, et lui seul — ici, les anomalies de
 * gravité `blocage`. Les avertissements de ce module (« ce chiffre est
 * inhabituel », « vérifie la ligne du paquet ») affichent un doute sans rien
 * empêcher : ils restent au front, et le serveur ne les connaît pas.
 *
 * LA TABLE CIQUAL N'A RIEN À VOIR AVEC CECI. Aucune de ces règles ne consulte
 * un référentiel : elles ne comparent l'aliment qu'à lui-même. Deux personnes
 * peuvent acheter deux riz basmati aux macros différentes, et les deux ont
 * raison — ce qu'on refuse, c'est un aliment qui se contredit.
 */

interface CasPartage {
  nom: string;
  categorie: Aliment['categorie'];
  kcal100: number;
  prot100: number;
  gluc100: number;
  lip100: number;
  fibres100: number | null;
  ratio: number;
  refuse: boolean;
  pourquoi: string;
}

/* Depuis `front/`, là où `npm test` s'exécute. La liste vit sous `api/` parce
   que c'est le serveur qui décide ce qui entre en base. */
const CHEMIN = path.resolve(process.cwd(), '../api/regles/coherence.json');

const regles = JSON.parse(readFileSync(CHEMIN, 'utf-8')) as {
  cas: CasPartage[];
  matiere_maximale_pour_100g: number;
  grain_sec_kcal_minimum: number;
  grain_sec_ratio_qui_gonfle: number;
  facteur_kilojoule: number;
};

const aliment = (c: Partial<CasPartage>): Aliment => ({
  id: 1,
  nom: 'Témoin',
  categorie: c.categorie ?? 'autre',
  kcal100: c.kcal100 ?? 0,
  prot100: c.prot100 ?? 0,
  gluc100: c.gluc100 ?? 0,
  lip100: c.lip100 ?? 0,
  fibres100: c.fibres100 ?? null,
  ratio: c.ratio ?? 1,
} as Aliment);

/** Le front refuse-t-il ? C'est-à-dire : porte-t-il une anomalie BLOQUANTE. */
const refuse = (a: Aliment): boolean =>
  verifierAliment(a).some((x) => x.gravite === 'blocage');

test('chaque cas de la liste partagée est jugé comme elle le dit', () => {
  for (const cas of regles.cas) {
    assert.equal(
      refuse(aliment(cas)), cas.refuse,
      `api/regles/coherence.json dit que « ${cas.nom} » `
      + `${cas.refuse ? 'est refusé' : 'passe'} (${cas.pourquoi}), `
      + 'le front dit le contraire',
    );
  }
});

test('les bornes sont celles de la liste, des deux côtés de leur bord', () => {
  /* Un cas de table peut passer par hasard : déplacer la borne de 100,5 à 150
     laisserait « 110 g de nutriments » refusé si on avait oublié d'écrire ce
     cas-là. */
  const maxi = regles.matiere_maximale_pour_100g;

  assert.equal(refuse(aliment({ kcal100: 4 * maxi, gluc100: maxi })), false,
    'la borne de matière elle-même doit être acceptée');
  assert.equal(refuse(aliment({ kcal100: 4 * (maxi + 0.1), gluc100: maxi + 0.1 })), true,
    'juste au-dessus de la borne, c\'est refusé');

  const mini = regles.grain_sec_kcal_minimum;
  const gonfle = regles.grain_sec_ratio_qui_gonfle;

  assert.equal(
    refuse(aliment({ categorie: 'fec', kcal100: mini, gluc100: mini / 4, ratio: gonfle + 0.1 })),
    false, 'la borne du grain sec elle-même doit être acceptée');
  assert.equal(
    refuse(aliment({ categorie: 'fec', kcal100: mini - 1, gluc100: (mini - 1) / 4, ratio: gonfle + 0.1 })),
    true, 'juste en dessous, c\'est refusé');
  assert.equal(
    refuse(aliment({ categorie: 'fec', kcal100: mini - 1, gluc100: (mini - 1) / 4, ratio: gonfle })),
    false, 'AU ratio qui gonfle, la borne ne s\'applique pas encore');
});

test('LE TÉMOIN : une huile très dense n\'est pas prise pour des kilojoules', () => {
  /* On ne refuse pas sur les kcal seules : une huile fait vraiment 900 kcal
     aux 100 g, et ses macros le confirment. Un plafond les refuserait toutes. */
  assert.equal(refuse(aliment({ categorie: 'huile', kcal100: 900, lip100: 100 })), false);

  assert.equal(
    refuse(aliment({ kcal100: 400 * regles.facteur_kilojoule, gluc100: 100 })), true,
    'des kcal exactement au facteur kilojoule doivent être refusées');
});
