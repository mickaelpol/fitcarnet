import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nombreSaisi, texteDuNombre } from './saisieNombre';

/**
 * CE QU'UNE SAISIE DÉSIGNE — ET CE QU'ELLE NE DÉSIGNE PAS.
 *
 * Écrit le 15 septembre 2026, après une épreuve sur émulateur Android : taper
 * « 42,5 » dans le poids d'une série enregistrait 425 kg. Le champ reconstruisait
 * son texte depuis le nombre à chaque frappe, la virgule disparaissait, et le « 5 »
 * suivant s'accolait au 42. Dans les mêmes lignes, `parseFloat(...) || 0`
 * transformait toute saisie illisible en ZÉRO — un « je ne sais pas » devenu un
 * chiffre (règle 6).
 *
 * Cette règle existait déjà, juste, dans `grammesSaisis` (`demandeRepas.ts`) :
 * elle vit désormais ici, et `grammesSaisis` s'y branche.
 */

describe('nombreSaisi — ce qu\'on a tapé, ou rien', () => {
  it('lit la virgule française comme le point', () => {
    assert.equal(nombreSaisi('42,5'), 42.5);
    assert.equal(nombreSaisi('42.5'), 42.5);
  });

  it('une virgule encore sans décimale se lit déjà comme l\'entier', () => {
    /* C'est l'état du champ ENTRE deux frappes. Il doit valoir 42 — et surtout
       rester affiché « 42, » : c'est `ChampNombre` qui y veille. */
    assert.equal(nombreSaisi('42,'), 42);
  });

  it('vide n\'est pas zéro', () => {
    assert.equal(nombreSaisi(''), null);
    assert.equal(nombreSaisi('   '), null);
    assert.equal(nombreSaisi(undefined), null);
  });

  it('zéro tapé reste zéro', () => {
    assert.equal(nombreSaisi('0'), 0);
  });

  it('illisible n\'est pas zéro non plus', () => {
    assert.equal(nombreSaisi('4,2,1'), null);
    assert.equal(nombreSaisi(','), null);
    assert.equal(nombreSaisi('abc'), null);
  });

  it('une charge ou un nombre de répétitions négatif n\'existe pas', () => {
    assert.equal(nombreSaisi('-5'), null);
  });

  it('des répétitions sont un entier : 8,5 n\'en est pas', () => {
    assert.equal(nombreSaisi('8,5', { entier: true }), null);
    assert.equal(nombreSaisi('8', { entier: true }), 8);
    assert.equal(nombreSaisi(' 12 ', { entier: true }), 12);
  });
});

describe('texteDuNombre — l\'affichage d\'une valeur déjà connue', () => {
  it('écrit la décimale à la française, sans arrondir', () => {
    /* PAS `nb()` : il arrondit à une décimale. L'éditeur de modèle s'en servait
       pour afficher le poids cible, et 42,25 s'y réécrivait en 42.3. */
    assert.equal(texteDuNombre(42.5), '42,5');
    assert.equal(texteDuNombre(42.25), '42,25');
    assert.equal(texteDuNombre(40), '40');
  });

  it('rien s\'écrit vide', () => {
    assert.equal(texteDuNombre(null), '');
  });
});
