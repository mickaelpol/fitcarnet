import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AlimentDisponible, AlimentIncomplet } from '@/api/types';
import {
  SEUIL_ECART, ecartsInventaire, estIncomplet, filtrerFrigo,
  grouperParEmplacement, poidsConnu, stockEnGrammes,
} from './frigo';

const aliment = (
  reference: string,
  nom: string,
  stock: number,
  emplacement: string | null = 'Frigo',
): AlimentDisponible => ({
  reference, nom, categorie: 'autre',
  kcal100: 0, prot100: 0, gluc100: 0, lip100: 0, fibres100: null,
  ratio: 1,
  stock, unite: 'g', grammesParUnite: 1,
  emplacement, peseeAvant: null, peseeApres: null, provenanceRatio: 'table',
});

describe('écarts d\'inventaire', () => {
  const stock = [aliment('base:1', 'Riz', 500), aliment('base:2', 'Thon', 120)];

  it('un champ vide n\'est pas un zéro', () => {
    assert.deepEqual(ecartsInventaire(stock, { 'base:1': '', 'base:2': '   ' }), []);
  });

  it('un zéro saisi part, lui', () => {
    assert.deepEqual(
      ecartsInventaire(stock, { 'base:1': '0' }),
      [{ reference: 'base:1', quantite: 0 }]);
  });

  it('n\'envoie que ce qui a changé', () => {
    const lignes = ecartsInventaire(stock, { 'base:1': '500', 'base:2': '90' });
    assert.deepEqual(lignes, [{ reference: 'base:2', quantite: 90 }]);
  });

  it('ignore une différence sous le seuil d\'arrondi', () => {
    assert.deepEqual(ecartsInventaire(stock, { 'base:1': String(500 + SEUIL_ECART / 2) }), []);
  });

  it('accepte la virgule décimale', () => {
    assert.deepEqual(
      ecartsInventaire(stock, { 'base:2': '119,5' }),
      [{ reference: 'base:2', quantite: 119.5 }]);
  });

  it('une saisie illisible n\'est pas envoyée comme un nombre plausible', () => {
    /* `parseFloat` lisait « 4,2,1 » 4,2 sans broncher : un stock inventé,
       envoyé à Grocy comme une pesée. Relevé par la revue le 15 septembre
       2026 ; la lecture passe désormais par `nombreSaisi`, qui rend `null`. */
    assert.deepEqual(ecartsInventaire(stock, { 'base:1': '4,2,1', 'base:2': '12O' }), []);
  });

  it('écarte une saisie illisible ou négative plutôt que de deviner', () => {
    assert.deepEqual(ecartsInventaire(stock, { 'base:1': 'abc', 'base:2': '-3' }), []);
  });

  it('ignore une saisie qui ne correspond à aucun aliment', () => {
    assert.deepEqual(ecartsInventaire(stock, { 'base:99': '10' }), []);
  });
});

describe('regroupement par emplacement', () => {
  it('descend du frais au sec, puis alphabétiquement', () => {
    const sections = grouperParEmplacement([
      aliment('a', 'Riz', 1, 'Placard'),
      aliment('b', 'Lait', 1, 'Frigo'),
      aliment('c', 'Petits pois', 1, 'Congélateur'),
      aliment('d', 'Divers', 1, 'Cave'),
    ]);

    assert.deepEqual(
      sections.map((s) => s.titre),
      ['Frigo', 'Congélateur', 'Placard', 'Cave']);
  });

  it('range les sans-emplacement sous un titre explicite', () => {
    const sections = grouperParEmplacement([aliment('a', 'Riz', 1, null)]);
    assert.equal(sections[0]!.titre, 'Sans emplacement');
  });

  it('trie les aliments par nom, à la française', () => {
    const sections = grouperParEmplacement([
      aliment('a', 'Œufs', 1), aliment('b', 'Épinards', 1), aliment('c', 'Beurre', 1),
    ]);

    assert.deepEqual(sections[0]!.data.map((x) => x.nom), ['Beurre', 'Épinards', 'Œufs']);
  });
});

describe('recherche dans le frigo', () => {
  const liste = [
    aliment('a', 'Épinards', 1, 'Congélateur'),
    aliment('b', 'Riz complet', 1, 'Placard'),
  ];

  it('ignore les accents et la casse', () => {
    assert.deepEqual(filtrerFrigo(liste, 'EPINARD').map((x) => x.nom), ['Épinards']);
  });

  it('cherche aussi dans l\'emplacement', () => {
    assert.deepEqual(filtrerFrigo(liste, 'congelateur').map((x) => x.nom), ['Épinards']);
  });

  it('rend tout sur une recherche vide', () => {
    assert.equal(filtrerFrigo(liste, '   ').length, 2);
  });
});

describe('les produits Grocy incomplets sont dans la MÊME liste', () => {
  /* Relevé par le propriétaire du projet le 19 septembre 2026, sur son frigo
     réel : « pourquoi les flageolet rouge n'apparaissent toujours pas dans mon
     frigo ? […] je veux que TOUS mes aliments apparaissent dans mon frigo ».

     `FrigoGrocy::lire()` les écartait faute de macros, et `creerProduit()`
     refusait de les recréer puisqu'ils existent déjà dans Grocy : invisibles
     ET impossibles à ajouter. Un premier correctif s'était contenté de les
     NOMMER dans un bandeau — ce n'était pas la demande. */
  const flageolet: AlimentIncomplet = {
    reference: 'grocy:7',
    nom: 'Flageolet rouge',
    stock: 0,
    emplacement: 'Placard',
    unite: 'g',
    manquants: ['kcal100', 'prot100'],
  };

  it('se range dans la section de son emplacement, avec les autres', () => {
    const sections = grouperParEmplacement([
      aliment('grocy:4', 'Riz basmati', 1500, 'Placard'),
      flageolet,
    ]);

    const placard = sections.find((s) => s.titre === 'Placard');
    assert.ok(placard, 'la section Placard doit exister');
    assert.equal(placard.data.length, 2,
      'la ligne doit être DANS la liste, pas dans un bandeau à côté');
    assert.deepEqual(placard.data.map((l) => l.nom), ['Flageolet rouge', 'Riz basmati'],
      'et triée comme les autres, sans traitement de faveur');
  });

  it('la recherche le trouve comme les autres', () => {
    /* Sans cela on chercherait « flageolet », on ne verrait rien, et on
       conclurait de nouveau qu'il n'existe pas. */
    assert.equal(filtrerFrigo([flageolet], 'flageolet').length, 1);
    assert.equal(filtrerFrigo([flageolet], 'riz').length, 0);
  });

  it('se distingue d\'un aliment sans qu\'on ait à lire ses macros', () => {
    /* `estIncomplet` regarde `manquants`, jamais `kcal100`. Un aliment réel à
       0 kcal serait sinon pris pour un produit incomplet — et 0 kcal existe :
       l'eau, le café noir. */
    assert.equal(estIncomplet(flageolet), true);
    assert.equal(estIncomplet(aliment('base:1', 'Eau', 1000)), false);
  });
});

describe('le stock ramené au gramme', () => {
  /* Cette règle était écrite TROIS fois, avec trois gardes différentes — dont
     une seule refusait un facteur nul, côté serveur (palier 0, 20 septembre
     2026). C'est celle-là qui fait foi. */

  it('multiplie quand la conversion est connue', () => {
    assert.equal(stockEnGrammes({ stock: 3, grammesParUnite: 55 }), 165);
  });

  it('UN FACTEUR NUL N\'EST PAS UNE CONVERSION : on ne sait pas', () => {
    /* C'est le cœur du correctif. `0` acceptait de multiplier et donnait
       « soit 0 g » à l'écran — un « je ne sais pas » rendu en zéro, ce que la
       règle 6 interdit. Le serveur, lui, répondait `null` depuis toujours. */
    assert.equal(stockEnGrammes({ stock: 12, grammesParUnite: 0 }), null);
  });

  it('une conversion absente reste absente', () => {
    /* Un litre de lait, un pack : pas de poids connu. Le calculateur doit
       les écarter, jamais supposer une densité. */
    assert.equal(stockEnGrammes({ stock: 2, grammesParUnite: null }), null);
  });

  it('un stock à zéro reste un zéro, lui', () => {
    /* Zéro EN STOCK est une information — « je n'en ai plus ». Ne pas le
       confondre avec zéro DE CONVERSION, qui est une ignorance. */
    assert.equal(stockEnGrammes({ stock: 0, grammesParUnite: 55 }), 0);
  });
});

describe('« le poids de cette unité est-il connu ? »', () => {
  /* LA MÊME QUESTION POSÉE CINQ FOIS, ET PAS DE LA MÊME FAÇON. Trois sites
     étaient fusionnés le 20 septembre au matin par `stockEnGrammes` ; la revue
     en a trouvé deux autres l'après-midi :

         app/(onglets)/frigo.tsx:144    grammesParUnite === null
         calcul/planCalcule.ts:47       grammesParUnite !== null

     Le premier est le plus gênant : un produit au facteur nul était écarté du
     calculateur ET absent du bandeau qui existe pour expliquer son absence. */

  it('un facteur renseigné et positif : oui', () => {
    assert.equal(poidsConnu({ grammesParUnite: 250 }), true);
  });

  it('pas de facteur : non', () => {
    assert.equal(poidsConnu({ grammesParUnite: null }), false);
  });

  it('LE CAS QUI SÉPARAIT LES CINQ : un facteur à zéro, c\'est « non »', () => {
    /* Zéro n'est pas une conversion, c'est une conversion absente — la garde
       du serveur, la plus stricte des cinq. Un litre de lait ou un pack n'ont
       pas de poids connu : le calculateur doit les écarter, et le bandeau doit
       les NOMMER. Les deux découlent de cette seule réponse. */
    assert.equal(poidsConnu({ grammesParUnite: 0 }), false);
  });

  it('un facteur négatif non plus', () => {
    assert.equal(poidsConnu({ grammesParUnite: -5 }), false);
  });
});
