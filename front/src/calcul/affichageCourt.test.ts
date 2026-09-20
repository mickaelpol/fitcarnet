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
