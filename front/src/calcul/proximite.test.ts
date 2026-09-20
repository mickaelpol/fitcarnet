import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SEUIL_PROXIMITE, proximite } from './proximite';

/**
 * « CES DEUX EXERCICES SONT-ILS LE MÊME ? »
 *
 * Une distance de Levenshtein, vingt lignes, écrite dans `app/admin-fusion.tsx`
 * — donc dans le seul endroit du front que `tsconfig.tests.json` n'atteint
 * pas. Elle décide quelles fusions sont proposées à l'administrateur, et une
 * fusion SUPPRIME un exercice après lui avoir transféré son historique.
 *
 * LE DÉFAUT QU'ELLE CACHAIT, relevé le 20 septembre 2026 : l'écran appelait
 *
 *     proximite(ancien.nom, e.nomFr ?? e.nom)
 *
 * c'est-à-dire le nom ANGLAIS d'un côté et le nom FRANÇAIS de l'autre.
 * `db/manuel/29-noms-francais.sql` renseigne `nom_fr` pour 1314 des
 * 1318 exercices importés, et `nom` y reste l'anglais : l'écran comparait donc
 * « barbell incline bench press » à 1314 noms français, et le seuil ne
 * laissait passer que du bruit alphabétique. Le cas perso → catalogue
 * fonctionnait (français des deux côtés), ce qui rendait la panne invisible à
 * l'essai.
 *
 * Deux lignes plus haut, le même écran affichait pourtant `ancien.nomFr ??
 * ancien.nom`. Le jumeau oublié dans sa forme la plus nette.
 */

describe('la proximité de deux noms', () => {
  it('rend 1 pour deux noms identiques', () => {
    assert.equal(proximite('Développé couché', 'Développé couché'), 1);
  });

  it('ignore la casse', () => {
    assert.equal(proximite('SQUAT', 'squat'), 1);
  });

  it('ignore les accents', () => {
    /* LA CORRECTION DU 20 SEPTEMBRE. « Developpe couche » saisi sans accents
       — ce qui arrive sur un clavier de téléphone — doit retrouver
       « Développé couché ». Toutes les autres recherches du projet passent par
       `sansAccent` ; celle-ci était la seule à ne pas le faire. */
    assert.equal(proximite('Developpe couche', 'Développé couché'), 1);
  });

  it('reconnaît un nom contenu dans l\'autre', () => {
    assert.ok(proximite('Squat', 'Squat barre') >= 0.9);
    assert.ok(proximite('Squat barre', 'Squat') >= 0.9);
  });

  it('rapproche deux noms à une faute près', () => {
    assert.ok(proximite('Développé couché', 'Développé couche') > SEUIL_PROXIMITE);
  });

  it('LE TÉMOIN : deux exercices différents restent loin', () => {
    /* Sans ce cas, une fonction qui rendrait toujours 1 passerait tout ce qui
       précède — et proposerait de fusionner le squat avec le curl, c'est-à-dire
       de SUPPRIMER un exercice et de lui transférer l'historique d'un autre. */
    assert.ok(proximite('Squat', 'Curl biceps') < SEUIL_PROXIMITE);
    assert.ok(proximite('Développé couché', 'Soulevé de terre') < SEUIL_PROXIMITE);
  });

  it('ne divise pas par zéro sur un nom vide', () => {
    assert.equal(proximite('', ''), 1);
    assert.equal(proximite('Squat', ''), 0);
    assert.equal(proximite('', 'Squat'), 0);
  });

  it('est symétrique', () => {
    /* Une distance qui dépend de l'ordre des arguments ferait dépendre les
       suggestions de quel exercice a été choisi en premier. */
    for (const [a, b] of [['Squat', 'Squat barre'], ['Curl', 'Curl marteau'], ['Dips', 'Pompes']]) {
      assert.equal(proximite(a!, b!), proximite(b!, a!), `${a} / ${b}`);
    }
  });
});
