/**
 * Le formulaire d'aliment, monté pour de vrai.
 *
 * PREMIER TEST DE RENDU DU PROJET. Le suffixe `.test-rendu.tsx` n'est pas
 * décoratif : `npm test` lance ces fichiers-là dans une seconde passe,
 * derrière `--import .../tests/environnement.js`, qui installe un DOM et
 * aiguille `react-native` vers `react-native-web`. Sans lui,
 * `require('react-native')` casse sur de la syntaxe Flow. Lire ce fichier-là,
 * et l'`include` de `tsconfig.tests.json`, avant d'en écrire un second.
 *
 * CE QU'IL PROTÈGE : le bug de la saisie effacée, corrigé le 15 septembre 2026.
 * L'effet de remise à zéro dépendait de `aliment`, donc de la RÉFÉRENCE de
 * l'objet. L'appelant le reconstruit à chaque rendu (`versSaisie(edite)`), et
 * `useSuiviInventaire` provoque un rendu toutes les deux secondes tant qu'un
 * inventaire tourne : corriger les fibres d'un aliment pendant un inventaire,
 * c'était voir sa saisie s'effacer sous les doigts, sans le moindre message.
 *
 * Le correctif — dépendre de `aliment?.id` — n'était couvert par rien : le
 * typage ne voit pas une liste de dépendances, et `client.test.ts` n'atteint
 * pas un composant. Ce test tombe si on remet `aliment` dans les dépendances,
 * vérifié en le remettant.
 */
import { describe, it, type TestContext, test } from 'node:test';
import assert from 'node:assert/strict';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EditeurAliment, type AlimentSaisi } from './editeurAliment';

/** Un aliment tel que l'écran le reçoit : fibres inconnues, à corriger. */
const alimentNomme = (nom: string): AlimentSaisi => ({ nom, categorie: 'prot',
  kcal100: 63, prot100: 11, gluc100: 4, lip100: 0.2, fibres100: null,
  ratio: 1, peseeAvant: null, peseeApres: null,
});

/**
 * Un parent qui se comporte comme le vrai : il RECONSTRUIT l'objet `aliment`
 * à chaque rendu, au lieu de le mémoïser. C'est tout le piège.
 *
 * ON DISTINGUE LES ALIMENTS PAR LEUR NOM, ET C'EST VOULU. Ce parent passait
 * un `id` numérique — un scénario que l'écran ne peut PAS produire : le seul
 * appelant réel, `versSaisie`, construit son objet depuis un
 * `AlimentDisponible`, qui porte une `reference` (« grocy:12 ») et jamais
 * d'`id`. Le témoin prouvait donc quelque chose d'inatteignable. Relevé par la
 * revue le 15 septembre 2026.
 */
function Parent({ nom }: { nom: string }) {
  const [, redessiner] = useState(0);

  return (
    <>
      <button type="button" onClick={() => redessiner((n) => n + 1)}>
        rendu du parent
      </button>
      <EditeurAliment
        visible
        aliment={alimentNomme(nom)}
        onEnregistrer={() => undefined}
        onFermer={() => undefined}
      />
    </>
  );
}

/** Le champ « Fibres (facultatif) », seul champ dont l'indication soit « — ». */
const champFibres = () => screen.getByPlaceholderText('—') as HTMLInputElement;

/* `cleanup` en `after` et non en fin de corps : une assertion qui tombe laisse
   sinon l'arbre monté, et le test SUIVANT échoue sur « multiple elements » au
   lieu d'échouer sur ce qu'il mesure. Une cascade masque toujours la cause. */
test('la saisie survit à un rendu du parent qui reconstruit l’aliment', (t: TestContext) => {
  t.after(cleanup);
  const { rerender } = render(<Parent nom="Skyr nature" />);

  fireEvent.change(champFibres(), { target: { value: '3,2' } });
  assert.equal(champFibres().value, '3,2');

  // le parent se redessine tout seul : c'est le battement de l'inventaire
  fireEvent.click(screen.getByText('rendu du parent'));
  // et il se redessine aussi parce qu'on le lui demande d'au-dessus
  rerender(<Parent nom="Skyr nature" />);

  assert.equal(champFibres().value, '3,2',
    'la saisie en cours a été écrasée par un simple rendu du parent');
});

test('un autre aliment repart bien de ses propres valeurs', (t: TestContext) => {
  t.after(cleanup);
  const { rerender } = render(<Parent nom="Skyr nature" />);

  fireEvent.change(champFibres(), { target: { value: '3,2' } });
  assert.equal(champFibres().value, '3,2');

  /* L'IDENTITÉ change, sans démontage : ce n'est plus le même aliment, le
     formulaire DOIT se recharger. Sans ce second témoin, « ne pas écraser la
     saisie » se corrigerait en supprimant l'effet — et l'écran garderait les
     valeurs de l'aliment précédent, ce qui est bien pire. */
  rerender(<Parent nom="Fromage blanc" />);

  assert.equal(champFibres().value, '',
    'changer d’aliment doit repartir des valeurs du nouveau');
});

/* ======================================================================== */
/* UNE MACRO VIDE N'EST PAS UNE MACRO À ZÉRO                                */
/* ======================================================================== */

/**
 * LA PANNE, RELEVÉE PAR LA REVUE LE 15 SEPTEMBRE 2026. `nombre()` lisait un
 * champ vide — ou illisible — comme 0, et l'aliment s'enregistrait avec.
 * Les calories vides étaient déjà refusées (`kcal100 > 0`), et un zéro qui rend
 * l'aliment incohérent l'était aussi par le contrôle. Restait le cas qui passe :
 * une macro qui VAUT zéro pour cet aliment. Vider les protéines de l'huile
 * d'olive donnait exactement les mêmes valeurs — et « je ne sais pas » partait
 * en base comme « zéro gramme », règle 6.
 */
const huile = (): AlimentSaisi => ({ nom: 'Huile d\'olive', categorie: 'lip',
  kcal100: 900, prot100: 0, gluc100: 0, lip100: 100, fibres100: null,
  ratio: 1, peseeAvant: null, peseeApres: null,
});

/** Les quatre champs de macros portent la même indication « à saisir » : on les prend dans l'ordre. */
const macro = (rang: 0 | 1 | 2 | 3) => screen.getAllByPlaceholderText('à saisir')[rang] as HTMLInputElement;
const CALORIES = 0; const PROTEINES = 1; const LIPIDES = 3;

function editer(t: TestContext): AlimentSaisi[] {
  t.after(cleanup);
  const envoyes: AlimentSaisi[] = [];
  render(
    <EditeurAliment visible aliment={huile()} onEnregistrer={(a) => { envoyes.push(a); }} onFermer={() => undefined} />,
  );

  return envoyes;
}

test('une huile intacte s\'enregistre — le témoin de l\'inverse', (t: TestContext) => {
  const envoyes = editer(t);
  assert.equal(macro(CALORIES).value, '900', 'le test ne vise pas le bon champ');

  fireEvent.click(screen.getByText('Enregistrer'));

  assert.equal(envoyes.length, 1, 'sans ce témoin, un bouton toujours désactivé passerait pour une correction');
});

test('des protéines vidées ne partent pas comme 0 g', (t: TestContext) => {
  const envoyes = editer(t);

  fireEvent.change(macro(PROTEINES), { target: { value: '' } });
  fireEvent.click(screen.getByText('Enregistrer'));

  assert.equal(envoyes.length, 0,
    'vider un champ, c\'est dire « je ne sais pas » : l\'enregistrer à 0 g écrit un chiffre que personne n\'a donné');
});

test('des lipides illisibles ne partent pas non plus', (t: TestContext) => {
  const envoyes = editer(t);

  fireEvent.change(macro(LIPIDES), { target: { value: '10,0,0' } });
  fireEvent.click(screen.getByText('Enregistrer'));

  assert.equal(envoyes.length, 0);
});

describe('l\'éditeur dit ce que le SERVEUR refusera', () => {
  /**
   * RELEVÉ PAR LE PROPRIÉTAIRE DU PROJET, le 20 septembre 2026, sur son écran.
   *
   * Il saisit un féculent à 130 kcal qui gonfle, et l'éditeur affiche en vert
   * « Cohérent, mais sans les fibres le contrôle reste approximatif ». Puis le
   * serveur refuse l'enregistrement.
   *
   * LES DEUX ONT RAISON, ET C'EST LE PROBLÈME. `controler()` ne compare que la
   * somme d'Atwater aux calories déclarées : 130 contre 125,5, c'est cohérent.
   * Mais `verifierAliment()` sait en plus qu'un grain sec fait au moins
   * 300 kcal — et l'éditeur ne l'appelait PAS. L'écran jugeait avec la moitié
   * de ce que l'application sait, et disait « cohérent » de ce que le serveur
   * allait refuser.
   *
   * Ce n'est pas un juge de plus : `verifierAliment` existe déjà et est
   * verrouillé sur le serveur par `api/regles/coherence.json`. L'éditeur cesse
   * simplement de s'en priver.
   */
  const SAISIE = {
    nom: 'Riz test', categorie: 'fec' as const,
    kcal100: 130, prot100: 2.7, gluc100: 28, lip100: 0.3, fibres100: null,
    ratio: 2.26, peseeAvant: null, peseeApres: null,
  };

  it('annonce le refus AVANT d\'envoyer', (t: TestContext) => {
    t.after(cleanup);
    render(<EditeurAliment visible aliment={SAISIE} onFermer={() => undefined}
      onEnregistrer={() => undefined} />);

    const texte = document.body.textContent ?? '';
    assert.match(texte, /grain sec/,
      'l\'écran doit dire ce que le serveur dira, pas « cohérent »');
  });

  it('le dit DÈS les calories, sans attendre les quatre macros', (t: TestContext) => {
    t.after(cleanup);
    /* RELEVÉ PAR LE PROPRIÉTAIRE DU PROJET le 20 septembre 2026 : « je
       souhaite que l'avertissement soit affiché direct dès qu'on a renseigné
       les macros et non pas à l'enregistrement ».

       Le message attendait que les QUATRE macros soient lisibles. Or la règle
       du grain sec n'a besoin que des calories, de la catégorie et du
       rendement : faire patienter jusqu'au bout, c'est laisser saisir trois
       champs de plus avant de dire que c'était perdu d'avance.

       Les deux autres règles ne peuvent pas se tromper pour autant : à macros
       vides la matière vaut 0 g, et l'Atwater 0 — sous le plancher du soupçon
       de kilojoules. Aucune ne peut se déclencher à tort. */
    /* UNE VRAIE CRÉATION : aucun `aliment`, donc tous les champs partent
       VIDES. C'est le seul montage qui reproduit le geste réel — passer un
       aliment aux macros à zéro remplit les champs de « 0 », qui sont
       lisibles, et le cas ne prouve rien. */
    render(<EditeurAliment visible nomImpose="Riz test"
      onFermer={() => undefined} onEnregistrer={() => undefined} />);

    /* On tape les calories, on choisit la catégorie, on pose le rendement —
       et rien d'autre. */
    fireEvent.click(screen.getByText('Glucide'));
    /* Les quatre macros partagent l'invite « à saisir » : la première est
       celle des calories. */
    fireEvent.change(screen.getAllByPlaceholderText('à saisir')[0]!,
      { target: { value: '130' } });
    fireEvent.click(screen.getByText(/Riz, pâtes, quinoa/));

    assert.match(document.body.textContent ?? '', /grain sec/,
      'les calories, la catégorie et le rendement suffisent : ne pas attendre '
      + 'trois champs de plus pour dire que c\'est perdu d\'avance');
  });

  it('LE TÉMOIN : un riz SEC ne déclenche rien', (t: TestContext) => {
    t.after(cleanup);
    /* Sans ce cas, un avertissement permanent passerait le test ci-dessus tout
       en criant sur chaque aliment juste — et on apprendrait à l'ignorer. */
    render(<EditeurAliment visible aliment={{ ...SAISIE, kcal100: 350, gluc100: 78, prot100: 7, lip100: 0.6 }}
      onFermer={() => undefined} onEnregistrer={() => undefined} />);

    assert.doesNotMatch(document.body.textContent ?? '', /grain sec/);
  });
});
