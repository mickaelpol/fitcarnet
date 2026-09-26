import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, it, type TestContext } from 'node:test';
import { ChampRattachement } from './champRattachement';
import type { AlimentReference } from '../api/types';

/**
 * LE CHAMP « ÇA RESSEMBLE À… ».
 *
 * Il rattache un aliment au catalogue CIQUAL — c'est-à-dire qu'il dit ce que
 * l'aliment EST, jamais ce qu'il VAUT. Trois choses comptent, et chacune a son
 * cas ici :
 *
 *  1. ce qu'on rend est un CODE, choisi par la personne ;
 *  2. ne rien trouver n'est PAS une erreur — une marque n'est pas dans CIQUAL ;
 *  3. les valeurs du catalogue n'entrent jamais dans le formulaire, elles ne
 *     servent qu'à avertir d'un écart.
 */

const YAOURT: AlimentReference = {
  code: '19024',
  nom: 'Yaourt ou lait fermenté, nature',
  groupe: 'lait et produits laitiers',
  sousgroupe: 'laits fermentés',
  sousgroupeCode: '1902',
  kcal100: 50.1,
  prot100: 4.1,
  gluc100: 4.7,
  lip100: 1.5,
  fibres100: null,
};

const BASE = {
  valeur: null,
  nomAliment: 'Skyr nature Milbona',
  kcalTapees: '',
  recherche: '',
  resultats: [],
  onRecherche: () => undefined,
  onChange: () => undefined,
};

describe('rattacher un aliment au catalogue', () => {
  it('rend le CODE de la ligne sur laquelle on tape', (t: TestContext) => {
    t.after(cleanup);
    let recu: string | null = 'rien';
    render(<ChampRattachement {...BASE} resultats={[YAOURT]} onChange={(c) => { recu = c; }} />);

    fireEvent.click(screen.getByText(/Yaourt ou lait fermenté/));

    /* LE CODE, PAS LE NOM. C'est ce qui fait qu'un aliment renommé plus tard —
       « poulet » devenu « poulets » — garde son rattachement. */
    assert.equal(recu, '19024');
  });

  it('ne trouve rien sans crier à l\'erreur, et dit quoi faire', (t: TestContext) => {
    t.after(cleanup);
    /* « Skyr » n'est pas dans CIQUAL, qui ne porte que des aliments
       génériques — mesuré le 20 septembre 2026. Bloquer ici obligerait à
       choisir n'importe quoi pour avancer, et c'est un rattachement FAUX que
       la base de connaissance croirait ensuite sur parole. */
    render(<ChampRattachement {...BASE} recherche="skyr" resultats={[]} />);

    const texte = document.body.textContent ?? '';
    assert.match(texte, /Rien de ce nom/);
    assert.match(texte, /laisser vide/,
      'il faut dire que l\'aliment s\'enregistre quand même');
  });

  it('NE PRÉ-REMPLIT PAS le champ avec le nom : il le PROPOSE', (t: TestContext) => {
    t.after(cleanup);
    /* Mesure du 20 septembre 2026, sur le vrai écran : le nom tapé servait
       d'invite au champ de rattachement. Quelqu'un tape « sqdkjqlkmd » dans
       « Nom », le voit apparaître grisé sous « Ça ressemble à », croit le champ
       rempli — et ne comprend pas que rien ne se cherche. Relevé :

           invite du champ  : "sqdkjqlkmd"
           contenu réel     : ""

       Une invite décrit ce qu'on attend, elle ne propose pas une valeur. */
    let demande = '';
    render(<ChampRattachement {...BASE} nomAliment="Poulet rôti"
      onRecherche={(q) => { demande = q; }} />);

    const champ = screen.getByPlaceholderText(/poulet, riz, yaourt/);
    assert.equal((champ as HTMLInputElement).value, '',
      'le champ doit rester vide tant que personne n\'a rien tapé dedans');

    fireEvent.click(screen.getByText(/Chercher « Poulet rôti »/));
    assert.equal(demande, 'Poulet rôti', 'le raccourci remplit VRAIMENT le champ');
  });

  it('se tait tant que la recherche est trop courte', (t: TestContext) => {
    t.after(cleanup);
    /* Le serveur ne cherche pas en dessous de deux caractères. Annoncer
       « rien trouvé » sur une lettre serait un mensonge : on n'a pas cherché. */
    render(<ChampRattachement {...BASE} recherche="s" resultats={[]} />);

    assert.doesNotMatch(document.body.textContent ?? '', /Rien de ce nom/);
  });

  it('avertit d\'un écart fort sans jamais corriger la saisie', (t: TestContext) => {
    t.after(cleanup);
    /* 300 kcal pour un yaourt qui en fait 50 : six fois trop. On le SIGNALE —
       un produit peut légitimement s'écarter — et on ne remplace rien.
       C'est la règle 7 : afficher l'incertitude plutôt qu'un chiffre non
       vérifié. */
    const { container } = render(
      <ChampRattachement {...BASE} valeur="19024" kcalTapees="300" resultats={[YAOURT]} />);

    fireEvent.click(screen.getByText(/Yaourt ou lait fermenté/));

    const texte = container.textContent ?? '';
    assert.match(texte, /300 kcal/, 'on rappelle ce qui a été saisi');
    assert.match(texte, /50\.1|50,1/, 'et ce que vaut ce type d\'aliment');
    assert.match(texte, /vérifie/, 'on invite à relire, on ne corrige pas');
  });

  it('LE TÉMOIN : un écart normal ne dit rien', (t: TestContext) => {
    t.after(cleanup);
    /* Sans ce cas, un avertissement affiché en permanence passerait le test
       ci-dessus tout en criant sur chaque aliment juste — et on apprendrait
       à l'ignorer. 60 kcal pour un yaourt à 50, c'est un skyr : rien à dire. */
    const { container } = render(
      <ChampRattachement {...BASE} valeur="19024" kcalTapees="60" resultats={[YAOURT]} />);

    fireEvent.click(screen.getByText(/Yaourt ou lait fermenté/));

    assert.doesNotMatch(container.textContent ?? '', /vérifie quand même/);
  });
});
