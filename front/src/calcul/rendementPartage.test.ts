import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { Aliment } from '@/solveur/types';
import { rendementPossible, verifierAliment } from './plausibilite';

/**
 * LE VERROU ENTRE LES DEUX JUGES DU RENDEMENT — constat 04#7.
 *
 * L'API et le front répondent tous les deux à « ce rendement est-il
 * possible ? » : `RendementPlausible::sens()` là-bas, `rendementPossible()`
 * ici. Chacun était correctement testé de son côté — et c'est exactement ce
 * qui rendait une divergence invisible : les deux suites restaient vertes en
 * se contredisant.
 *
 * Ce fichier et son jumeau `api/tests/Service/RendementPartageTest.php` lisent
 * LE MÊME fichier, `api/regles/rendement.json`. Le jour où l'un des deux juges
 * change d'avis sans l'autre, une des deux suites tombe en nommant le cas.
 *
 * CE QUI EST VERROUILLÉ : l'impossible. Les bandes plus douces d'ici — « ce
 * rendement est inhabituel », en `info` ou en `avertissement` — restent au
 * front : elles affichent un doute, elles ne refusent rien.
 */

interface CasPartage {
  categorie: Aliment['categorie'];
  ratio: number;
  possible: boolean;
  pourquoi: string;
}

interface Regles {
  categories_qui_perdent_de_l_eau: Aliment['categorie'][];
  ratio_maximal_en_perdant: number;
  ratio_minimal_d_un_feculent: number;
  matiere_maximale_pour_100g: number;
  cas: CasPartage[];
}

/* Depuis `front/`, là où `npm test` s'exécute. La liste vit sous `api/` parce
   que le conteneur de l'API ne monte que ce dossier — et parce que c'est
   l'API qui décide quel rendement est retenu. */
const CHEMIN = path.resolve(process.cwd(), '../api/regles/rendement.json');

const regles = JSON.parse(readFileSync(CHEMIN, 'utf-8')) as Regles;

/** Un aliment quelconque : seul le champ éprouvé compte. */
const aliment = (champs: Partial<Aliment>): Aliment => ({
  id: 1,
  nom: 'Témoin',
  categorie: 'autre',
  kcal100: 400,
  prot100: 10,
  gluc100: 10,
  lip100: 10,
  ratio: 1,
  ...champs,
} as Aliment);

test('chaque cas de la liste partagée est jugé comme elle le dit', () => {
  for (const cas of regles.cas) {
    assert.equal(
      rendementPossible(cas.categorie, cas.ratio), cas.possible,
      `api/regles/rendement.json dit que « ${cas.categorie} à ${cas.ratio} » `
      + `${cas.possible ? 'est possible' : 'est impossible'} (${cas.pourquoi}), `
      + 'le front dit le contraire',
    );
  }
});

test('les bornes elles-mêmes sont celles de la liste', () => {
  const { ratio_maximal_en_perdant: maxi, ratio_minimal_d_un_feculent: mini } = regles;

  /* Un cas de table peut passer par hasard : une borne déplacée de 1,05 à 1,5
     laisserait « prot à 1,2 » refusé si on avait oublié d'écrire ce cas. On
     éprouve donc le bord lui-même, des deux côtés. */
  for (const categorie of regles.categories_qui_perdent_de_l_eau) {
    assert.equal(rendementPossible(categorie, maxi), true,
      `${categorie} : la borne haute doit être acceptée`);
    assert.equal(rendementPossible(categorie, maxi + 0.01), false,
      `${categorie} : juste au-dessus de la borne, c'est refusé`);
  }

  assert.equal(rendementPossible('fec', mini), true);
  assert.equal(rendementPossible('fec', mini - 0.01), false);
});

test('le seuil de matière est celui de la liste', () => {
  const seuil = regles.matiere_maximale_pour_100g;
  const codes = (matiere: number): string[] => verifierAliment(aliment({
    prot100: matiere / 3, gluc100: matiere / 3, lip100: matiere / 3, fibres100: 0,
  })).map((a) => a.code);

  assert.equal(codes(seuil).includes('plus_de_cent'), false,
    'la borne elle-même ne doit pas être signalée');
  assert.equal(codes(seuil + 0.5).includes('plus_de_cent'), true,
    'au-delà du seuil, la matière doit être signalée');
});
