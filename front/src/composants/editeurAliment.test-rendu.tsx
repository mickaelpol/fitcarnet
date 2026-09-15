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
import { type TestContext, test } from 'node:test';
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
