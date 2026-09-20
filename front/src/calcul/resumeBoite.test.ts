import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { grammesCuitsDeLaBoite, resumeDeBoite } from './resumeBoite';

/**
 * LE RÉSUMÉ REPLIÉ D'UNE BOÎTE DE BATCH COOKING.
 *
 * La ligne qu'on lit sans déplier : « 640 g cuits · 2 personnes ». Elle était
 * écrite DEUX fois, mot pour mot, dans deux écrans :
 *
 *     front/src/composants/etapeBatch.tsx:161
 *     front/src/composants/planRelu.tsx:163
 *
 * Même `reduce`, même `nb()`, même « personnes », même séparateur — jusqu'aux
 * deux espaces autour du point médian. Un jumeau parfait, et donc deux
 * endroits où corriger le jour où on veut dire autre chose.
 *
 * LA SEULE DIFFÉRENCE ÉTAIT DÉLIBÉRÉE, et elle est conservée : `planRelu`
 * affiche les crus DANS la liste de la boîte, il n'a donc rien à annoncer
 * « à ajouter après » ; `etapeBatch` les garde à part et doit le dire. C'est
 * un paramètre, pas une divergence.
 */

const cuits = (...g: number[]) => g.map((assiette) => ({ assiette }));

describe('les grammes cuits d\'une boîte', () => {
  it('additionne les assiettes', () => {
    assert.equal(grammesCuitsDeLaBoite(cuits(200, 150, 90)), 440);
  });

  it('une boîte sans rien de cuit pèse zéro', () => {
    /* Zéro est une réponse ici : la boîte existe, elle ne contient rien de
       cuit. Ce n'est pas « je ne sais pas ». */
    assert.equal(grammesCuitsDeLaBoite([]), 0);
  });
});

describe('le résumé replié d\'une boîte', () => {
  it('dit les grammes cuits, toujours', () => {
    assert.equal(resumeDeBoite({ cuits: cuits(300), convives: 1, crusAAjouter: 0 }),
      '300 g cuits');
  });

  it('ne parle de personnes qu\'à partir de deux', () => {
    /* LE TÉMOIN DE L'AUTRE CÔTÉ : « 1 personne » serait du bruit sur la
       quasi-totalité des boîtes. Un seuil, pas un affichage systématique. */
    assert.equal(resumeDeBoite({ cuits: cuits(300), convives: 1, crusAAjouter: 0 }),
      '300 g cuits');
    assert.equal(resumeDeBoite({ cuits: cuits(300), convives: 2, crusAAjouter: 0 }),
      '300 g cuits  ·  2 personnes');
  });

  it('annonce les crus quand l\'écran les garde à part', () => {
    assert.equal(resumeDeBoite({ cuits: cuits(640), convives: 2, crusAAjouter: 3 }),
      '640 g cuits  ·  2 personnes  ·  3 à ajouter après');
  });

  it('n\'annonce rien à ajouter quand l\'écran les affiche déjà', () => {
    /* C'est le cas de `planRelu`, qui fond les crus dans la liste : lui dire
       « 3 à ajouter après » alors qu'ils sont déjà listés ferait compter
       deux fois. */
    assert.equal(resumeDeBoite({ cuits: cuits(640), convives: 2, crusAAjouter: 0 }),
      '640 g cuits  ·  2 personnes');
  });

  it('formate les grammes comme tout le reste de l\'application', () => {
    /* Par `nb()`, donc virgule décimale et arrondi à l'entier sous 0,05.
       Écrire un `toFixed` ici redonnerait le point anglais que la charte a
       justement chassé. */
    assert.equal(resumeDeBoite({ cuits: cuits(200.5, 100), convives: 1, crusAAjouter: 0 }),
      '300,5 g cuits');
    assert.equal(resumeDeBoite({ cuits: cuits(99.98), convives: 1, crusAAjouter: 0 }),
      '100 g cuits');
  });
});
