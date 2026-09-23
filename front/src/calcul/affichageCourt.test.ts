import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { identifiantYoutube, mmss, nombreLisible } from './affichageCourt';

/**
 * TROIS FORMATS COURTS, longtemps coinces dans des `.tsx`.
 *
 *     composants/chronoSerie.tsx:9     mmss
 *     composants/modaleExercice.tsx:12 identifiantYoutube
 *     composants/complements.tsx:44    nombreLisible
 *
 * Pures, exportees, et aucune eprouvable la ou elles vivaient. Rassemblees le
 * 20 septembre 2026 (palier 0).
 */

describe('les secondes en m:ss', () => {
  it('complete les secondes a deux chiffres', () => {
    assert.equal(mmss(65), '1:05');
    assert.equal(mmss(3), '0:03');
    assert.equal(mmss(600), '10:00');
  });

  it('UNE DUREE NEGATIVE NE S\'AFFICHE PAS', () => {
    /* Elle rendait « -1:-5 » sous un chronometre qui tourne. Tous les
       appelants garantissent un temps positif — mais rien ne l'ecrivait. */
    assert.equal(mmss(-5), '0:00');
  });

  it('ignore les fractions de seconde', () => {
    assert.equal(mmss(65.9), '1:05');
  });
});

describe('l\'identifiant d\'une video', () => {
  it('reconnait les quatre formes d\'URL', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    ]) {
      assert.equal(identifiantYoutube(url), 'dQw4w9WgXcQ', url);
    }
  });

  it('LE TEMOIN : ce qui n\'est pas une video YouTube rend null', () => {
    /* Sans ce cas, un motif trop large attraperait un fragment de chemin et
       l'ecran afficherait une vignette morte. */
    assert.equal(identifiantYoutube('https://vimeo.com/123456'), null);
    assert.equal(identifiantYoutube('pas une url'), null);
    assert.equal(identifiantYoutube(''), null);
    assert.equal(identifiantYoutube(null), null);
  });
});

describe('une quantite telle qu\'on l\'ecrit', () => {
  it('enleve les zeros inutiles et rend la virgule', () => {
    assert.equal(nombreLisible('5.00'), '5');
    assert.equal(nombreLisible('0.50'), '0,5');
    assert.equal(nombreLisible('400'), '400');
  });

  it('CE QU\'ON NE SAIT PAS LIRE RESTE TEL QUEL', () => {
    /* Regle 6 : une quantite illisible doit se voir. La rendre « 0 » donnerait
       un chiffre plausible que personne n'a saisi. */
    assert.equal(nombreLisible('abc'), 'abc');
    assert.equal(nombreLisible(''), '');
  });
});

describe('ce que l\'API envoie VRAIMENT', () => {
  /**
   * LA PANNE DU 23 SEPTEMBRE 2026 : l'onglet Compte en page blanche.
   *
   *     Uncaught TypeError: t.trim is not a function
   *         at nombreLisible
   *         at MesComplements
   *
   * `Complement::getQuantite(): float` (api/src/Entity/Complement.php:128)
   * rend un FLOTTANT depuis le 17 aout 2026. API Platform serialise par
   * l'accesseur, donc `GET /api/complements` envoie `"quantite": 5` — un
   * nombre JSON, jamais la chaine « 5.00 » que cette fonction attendait.
   *
   * POURQUOI PERSONNE NE L'A VU PENDANT CINQ SEMAINES :
   *
   *  - `types.ts` DECLARAIT une chaine, avec un commentaire affirmant que
   *    l'API « refuse un nombre ». `tsc` ne pouvait pas voir le defaut : on
   *    lui avait decrit le contraire de la realite.
   *  - les tests ci-dessus n'envoient QUE des chaines. Ils eprouvent ce que
   *    la signature promet, jamais ce qui arrive sur le cable.
   *  - il faut au moins UN complement enregistre pour que la boucle de
   *    `MesComplements` appelle cette fonction. Liste vide, aucun appel,
   *    aucune panne — l'ecran a casse le jour du premier complement.
   *
   * Ce cas-ci part donc du nombre, et pas de sa representation en chaine.
   */
  it('accepte un nombre, parce que c\'est ce que le serveur envoie', () => {
    assert.equal(nombreLisible(5), '5');
    assert.equal(nombreLisible(0.5), '0,5');
    assert.equal(nombreLisible(400), '400');
  });

  it('un nombre illisible reste visible, comme une chaine illisible', () => {
    /* Regle 7 : jamais un « 0 » plausible a la place de ce qu'on ne sait
       pas lire. NaN et Infinity ne viennent pas d'une colonne DECIMAL, mais
       cette fonction est le dernier rempart avant l'ecran. */
    assert.equal(nombreLisible(Number.NaN), 'NaN');
    assert.equal(nombreLisible(Number.POSITIVE_INFINITY), 'Infinity');
  });
});
