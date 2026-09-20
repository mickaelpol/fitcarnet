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

describe('l\'éditeur AFFICHE ce que le serveur répond', () => {
  /**
   * LE CONTRAT A CHANGÉ LE 20 SEPTEMBRE 2026, et ces tests avec lui.
   *
   * Ils vérifiaient que l'écran SAIT qu'un grain sec fait au moins 300 kcal.
   * Il ne le sait plus, et c'est le but : « tout doit passer par le serveur
   * car le métier doit être sur le serveur, comme ça je peux changer le front
   * quand bon me semble ».
   *
   * Ce qu'on éprouve désormais : l'écran affiche fidèlement ce qui lui arrive,
   * et éteint son bouton quand le serveur le dit. La RÈGLE, elle, est éprouvée
   * côté serveur par `VerdictAlimentTest`, et la chaîne entière par l'épreuve
   * de bout en bout.
   */
  const SAISIE = {
    nom: 'Riz test', categorie: 'fec' as const,
    kcal100: 130, prot100: 2.7, gluc100: 28, lip100: 0.3, fibres100: null,
    ratio: 2.26, peseeAvant: null, peseeApres: null,
  };

  const VERDICT_REFUS = {
    refus: [{ champ: 'kcal100', message: '130 kcal pour 100 g d\u2019un féculent qui gonfle : un grain sec en fait au moins 300.' }],
    avertissements: [],
    resume: 'Les valeurs sont cohérentes entre elles.',
    verdict: 'coherent' as const,
    conversion: null,
    candidat: null,
    enregistrable: false,
  };

  it('affiche le refus du serveur, mot pour mot', (t: TestContext) => {
    t.after(cleanup);
    render(<EditeurAliment visible aliment={SAISIE} verdict={VERDICT_REFUS}
      onFermer={() => undefined} onEnregistrer={() => undefined} />);

    assert.match(document.body.textContent ?? '', /grain sec/,
      'la phrase vient du serveur, l\'écran ne la fabrique pas');
  });

  it('LE TÉMOIN : sans refus, il n\'invente rien', (t: TestContext) => {
    t.after(cleanup);
    /* Sans ce cas, un écran qui afficherait toujours un refus passerait le
       test ci-dessus tout en criant sur chaque aliment juste. Et surtout :
       il ne doit PAS déduire le refus des valeurs — il ne les juge plus. */
    render(<EditeurAliment visible aliment={SAISIE}
      verdict={{ ...VERDICT_REFUS, refus: [], enregistrable: true }}
      onFermer={() => undefined} onEnregistrer={() => undefined} />);

    assert.doesNotMatch(document.body.textContent ?? '', /grain sec/);
  });

  it('remonte CE QUI EST TAPÉ, pour que le parent puisse demander', (t: TestContext) => {
    t.after(cleanup);
    /* L'écran ne fait pas l'appel lui-même : il reste pur, et c'est ce qui
       permet de le monter ici sans client HTTP. */
    const vues: string[] = [];
    render(<EditeurAliment visible aliment={SAISIE}
      onSaisie={(saisie) => vues.push(saisie.kcal100)}
      onFermer={() => undefined} onEnregistrer={() => undefined} />);

    assert.deepEqual(vues.at(-1), '130');
  });

  it('SANS RÉPONSE ENCORE, il n\'affiche aucun verdict', (t: TestContext) => {
    t.after(cleanup);
    /* Inventer un avis local le temps de l\'aller-retour, ce serait
       réintroduire exactement la deuxième écriture qu\'on vient de retirer. */
    render(<EditeurAliment visible aliment={SAISIE}
      onFermer={() => undefined} onEnregistrer={() => undefined} />);

    const texte = document.body.textContent ?? '';
    assert.doesNotMatch(texte, /grain sec/);
    assert.doesNotMatch(texte, /cohérent/i);
  });
});
