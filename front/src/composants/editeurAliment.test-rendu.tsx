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
import { EditeurAliment, type AlimentSaisi, type AlimentTape } from './editeurAliment';
import type { SaisieAliment, VerdictAliment } from '@/api/hooks/verification';
import { C } from '@/theme';

/**
 * Couleur attendue du texte d'un refus, DÉDUITE de `C.erreur` plutôt que
 * recopiée en dur : `getComputedStyle` rend une couleur `rgb(r, g, b)`, jamais
 * l'hexadécimal posé dans la feuille de style. Convertir ici évite une seconde
 * écriture de la couleur qui pourrait diverger du thème.
 */
const hexEnRgb = (hex: string): string => {
  const n = parseInt(hex.replace('#', ''), 16);

  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const ROUGE = hexEnRgb(C.erreur);

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

function editer(t: TestContext): AlimentTape[] {
  t.after(cleanup);
  const envoyes: AlimentTape[] = [];
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

test('des protéines vidées ne partent pas : « Enregistrer » reste éteint', (t: TestContext) => {
  const envoyes = editer(t);

  fireEvent.change(macro(PROTEINES), { target: { value: '' } });
  fireEvent.click(screen.getByText('Enregistrer'));

  /* RÉÉCRIT DEUX FOIS LE 26 SEPTEMBRE 2026. D'abord l'écran refusait d'envoyer
     en JUGEANT le texte (`nombreSaisi`) ; puis, feature
     `macros-editeur-vide-pas-zero`, il envoyait le vide tel quel et le serveur
     le refusait en 422. Le propriétaire a tranché le soir même : « il faut
     quand même un minimum de vérification côté front pour éviter à
     l'utilisateur d'avoir à faire des allers-retours, mais seul le serveur
     reste la vérif finale ». L'écran ne LIT toujours rien — il regarde
     seulement si le champ est vide — et n'envoie pas. Jamais comme un zéro. */
  assert.equal(envoyes.length, 0,
    'une macro vide ne doit pas partir : ni vide, ni surtout comme 0 g');
});

test('un 0 tapé est une réponse : il part tel quel — témoin', (t: TestContext) => {
  const envoyes = editer(t);

  fireEvent.change(macro(PROTEINES), { target: { value: '0' } });
  fireEvent.click(screen.getByText('Enregistrer'));

  assert.equal(envoyes.at(-1)?.prot100, '0',
    'zéro veut dire zéro : le contrôle du vide ne doit pas éteindre le bouton sur un 0');
});

test('des lipides illisibles partent tels quels, pour que le serveur les refuse', (t: TestContext) => {
  const envoyes = editer(t);

  fireEvent.change(macro(LIPIDES), { target: { value: '10,0,0' } });
  fireEvent.click(screen.getByText('Enregistrer'));

  /* Même réécriture : l'illisible part tel quel, et le serveur le refuse. */
  assert.equal(envoyes.at(-1)?.lip100, '10,0,0');
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

  // `candidat` a disparu de `VerdictAliment` le 26 septembre 2026, remplacé
  // par `rendement` — voir plus bas dans ce fichier.
  const VERDICT_REFUS: VerdictAliment = {
    refus: [{ champ: 'kcal100', message: '130 kcal pour 100 g d\u2019un féculent qui gonfle : un grain sec en fait au moins 300.' }],
    avertissements: [],
    resume: 'Les valeurs sont cohérentes entre elles.',
    verdict: 'coherent' as const,
    conversion: null,
    rendement: { valeur: null, explication: null, provenance: null },
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


/* ======================================================================== */
/* LES PESÉES REDEVIENNENT DES CHAMPS TEXTE, JUGÉS PAR LE SERVEUR            */
/* — 26 SEPTEMBRE 2026, LE LENDEMAIN                                         */
/* ======================================================================== */

/**
 * LE CONTRAT A CHANGÉ UNE SECONDE FOIS EN DEUX JOURS. La veille, « Poids avant
 * cuisson » et « Poids après cuisson » étaient devenus des `ChampNombre`, avec
 * un jugement LOCAL de la lisibilité (bordure rouge, bouton caché) — voir
 * l'historique de ce fichier. Ce jugement local est exactement ce que la
 * décision du 20 septembre 2026 interdit : « tout doit passer par le serveur ».
 * Les pesées redeviennent donc des `Champ` texte ordinaires, envoyées TELLES
 * QUELLES dans `SaisieAliment.peseeAvant`/`peseeApres`, et c'est le serveur qui
 * dit si elles se lisent (refus), qui calcule un rendement
 * (`VerdictAliment.rendement`) et qui juge l'aliment entier — refus d'écriture
 * compris (`EditeurAliment.refusEcriture`, un 422).
 *
 * CE QUI SURVIT DE LA VEILLE, ET C'EST POUR ÇA QUE CES TROIS TÉMOINS RESTENT :
 * l'affichage à la française d'une pesée déjà connue, le vide qui reste vide,
 * et la virgule qui ne disparaît pas sous les doigts. Ce sont des exigences sur
 * le TEXTE affiché, indépendantes de qui juge ensuite ce texte.
 *
 * CE QUI DISPARAÎT AVEC `ChampNombre` : le contrôle porté sur le SOURCE
 * (l'ancien CA-5, « ce sont des ChampNombre ») et la bordure rouge calculée
 * localement (CA-R1/CA-R2 de la veille) — il n'y a plus de jugement local à
 * colorer, le refus vient désormais du serveur et s'affiche par
 * `testID="refus-peseeAvant"` / `testID="refus-peseeApres"`, comme pour toute
 * autre valeur.
 */
describe('les pesées sont des champs texte, envoyées brutes au serveur', () => {
  const alimentAvecPesees = (peseeAvant: number | null, peseeApres: number | null): AlimentSaisi => ({
    nom: 'Riz basmati', categorie: 'fec', kcal100: 350, prot100: 7, gluc100: 77,
    lip100: 1, fibres100: null, ratio: 1, peseeAvant, peseeApres,
  });

  const champAvant = () => screen.getByLabelText('Poids avant cuisson') as HTMLInputElement;
  const champApres = () => screen.getByLabelText('Poids après cuisson') as HTMLInputElement;

  /** Chaque étape est le contenu ENTIER du champ après une frappe, comme sur un clavier. */
  function taper(champ: () => HTMLInputElement, ...etapes: string[]): string[] {
    return etapes.map((v) => {
      fireEvent.change(champ(), { target: { value: v } });

      return champ().value;
    });
  }

  function ouvrirMesure(t: TestContext, aliment: AlimentSaisi) {
    t.after(cleanup);
    render(<EditeurAliment visible aliment={aliment} onEnregistrer={() => undefined} onFermer={() => undefined} />);
    fireEvent.click(screen.getByText('Je préfère mesurer'));
  }

  test('CA-1 : une pesée connue s’affiche à la française, pas au point', (t: TestContext) => {
    // CA-1
    ouvrirMesure(t, alimentAvecPesees(42.5, 96));

    assert.equal(champAvant().value, '42,5',
      'String(42.5) donne "42.5" : le point de JavaScript, pas la virgule française');
    assert.equal(champApres().value, '96');
  });

  test('CA-2 : sans aucune pesée, les deux champs sont vides — témoin', (t: TestContext) => {
    // CA-2
    ouvrirMesure(t, alimentAvecPesees(null, null));

    assert.equal(champAvant().value, '', 'null ne doit ni s’afficher "0" ni "null"');
    assert.equal(champApres().value, '');
  });

  test('CA-3 : la virgule ne disparaît pas sous les doigts — témoin', (t: TestContext) => {
    // CA-3
    ouvrirMesure(t, alimentAvecPesees(null, null));

    assert.deepEqual(
      taper(champAvant, '4', '42', '42,', '42,5'),
      ['4', '42', '42,', '42,5'],
      'c’est exactement le bug du 15 septembre 2026 (425 kg au lieu de 42,5) : ici sur une pesée',
    );
  });
});

/* ======================================================================== */
/* LE REFUS, LE RENDEMENT ET L'ENREGISTRABLE VIENNENT DU SERVEUR             */
/* — 26 SEPTEMBRE 2026                                                       */
/* ======================================================================== */

/**
 * DEUXIÈME PALIER DE LA MÊME REFONTE. Ce que cet écran ne fait plus DU TOUT :
 *
 *  - il ne rédige plus AUCUN message (« Renseigne les quatre valeurs… »,
 *    « Un féculent absorbe de l'eau… », « Ces deux poids sont inversés… » ont
 *    disparu — c'était le dernier métier local) ;
 *  - il ne calcule plus de ratio candidat lui-même (`ratioCandidat` a disparu
 *    de `SaisieAliment`, et `VerdictAliment.candidat` est remplacé par
 *    `VerdictAliment.rendement`, rendu par le serveur) ;
 *  - il n'éteint plus le bouton sur ses propres macros : seul `enregistrable`,
 *    rendu par le serveur, compte — une macro vide n'est plus un motif
 *    d'extinction LOCAL.
 *
 * CE QU'IL FAIT ENCORE : filtrer la frappe des champs numériques
 * (`/^[0-9.,]*$/`) pour qu'une lettre ne s'affiche jamais dans un champ censé
 * porter un nombre — ce n'est pas un jugement métier, c'est un clavier.
 *
 * `AlimentTape` (les textes tels que tapés) remplace ce que `onEnregistrer`
 * recevait : les pesées y sont des chaînes, pas des nombres — c'est le serveur
 * qui les relit, comme pour les quatre macros depuis le 20 septembre.
 */
describe('le refus, le rendement et l’enregistrable viennent du serveur, rien n’est jugé ici', () => {
  /** Toutes les valeurs à 12 : sert à vérifier qu'une frappe illisible ne bouge rien. */
  const alimentDouze = (): AlimentSaisi => ({
    nom: 'Aliment de test', categorie: 'prot', kcal100: 12, prot100: 12, gluc100: 12,
    lip100: 12, fibres100: 12, ratio: 1, peseeAvant: 12, peseeApres: 12,
  });

  const RENDEMENT_INCONNU: VerdictAliment['rendement'] = { valeur: null, explication: null, provenance: null };

  const VERDICT_BASE: VerdictAliment = {
    refus: [], avertissements: [], resume: '', verdict: 'indecidable',
    conversion: null, enregistrable: true, rendement: RENDEMENT_INCONNU,
  };

  test('CA-1 : une macro non touchée remonte "" à onSaisie, et le refus du serveur s’affiche sous elle', (t: TestContext) => {
    // CA-1
    t.after(cleanup);
    const vues: SaisieAliment[] = [];
    const verdict: VerdictAliment = {
      ...VERDICT_BASE,
      refus: [{ champ: 'prot100', message: 'Valeur manquante : écris 0 si l’aliment n’en contient pas.' }],
    };
    render(<EditeurAliment visible verdict={verdict}
      onSaisie={(s) => vues.push(s)} onEnregistrer={() => undefined} onFermer={() => undefined} />);

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Riz' } });
    fireEvent.change(screen.getByLabelText('Calories'), { target: { value: '350' } });
    fireEvent.change(screen.getByLabelText('Glucides'), { target: { value: '77' } });
    fireEvent.change(screen.getByLabelText('Lipides'), { target: { value: '1' } });
    // Protéines volontairement non touché : sur une création, il part vide.

    assert.equal(vues.at(-1)?.prot100, '', 'une macro non touchée doit rester vide, pas "0"');

    const refusProt = screen.getByTestId('refus-prot100');
    assert.match(refusProt.textContent ?? '', /Valeur manquante/,
      'l’écran ne rédige plus ce message : il doit venir tel quel du verdict');
    /* La couleur est portée par le TEXTE du refus : un `View` n'a pas de
       couleur de texte en React Native. */
    assert.equal(getComputedStyle(refusProt.firstElementChild as Element).color, ROUGE);
  });

  for (const etiquette of ['Calories', 'Protéines', 'Fibres (facultatif)', 'Poids avant cuisson', 'Poids après cuisson']) {
    test(`CA-2 : une frappe illisible sur « ${etiquette} » laisse le champ inchangé`, (t: TestContext) => {
      // CA-2
      t.after(cleanup);
      render(<EditeurAliment visible aliment={alimentDouze()}
        onEnregistrer={() => undefined} onFermer={() => undefined} />);
      if (etiquette.startsWith('Poids')) fireEvent.click(screen.getByText('Je préfère mesurer'));

      const champ = screen.getByLabelText(etiquette) as HTMLInputElement;
      assert.equal(champ.value, '12', 'précondition : le champ doit porter "12" avant la frappe illisible');

      fireEvent.change(champ, { target: { value: 'a' } });
      assert.equal(champ.value, '12', '"a" seul ne matche pas /^[0-9.,]*$/');

      fireEvent.change(champ, { target: { value: '4a2' } });
      assert.equal(champ.value, '12', '"4a2" collé ne matche pas non plus');
    });
  }

  test('CA-2 : une frappe illisible sur « Quantité déjà en stock » n’est même pas transmise', (t: TestContext) => {
    // CA-2
    t.after(cleanup);
    const captures: string[] = [];
    render(<EditeurAliment visible aliment={alimentDouze()} quantite="12"
      onQuantiteChange={(v) => captures.push(v)}
      onEnregistrer={() => undefined} onFermer={() => undefined} />);

    const champ = screen.getByLabelText('Quantité déjà en stock (facultatif)') as HTMLInputElement;
    fireEvent.change(champ, { target: { value: 'a' } });
    fireEvent.change(champ, { target: { value: '4a2' } });

    assert.equal(champ.value, '12');
    assert.equal(captures.length, 0,
      'un texte illisible ne doit même pas être transmis au parent : sinon un parent qui le stockerait afficherait autre chose que "12"');
  });

  test('CA-3 : la virgule et le point sont tous deux acceptés dans une macro', (t: TestContext) => {
    // CA-3
    t.after(cleanup);
    render(<EditeurAliment visible aliment={alimentDouze()}
      onEnregistrer={() => undefined} onFermer={() => undefined} />);
    const kcal = () => screen.getByLabelText('Calories') as HTMLInputElement;
    assert.equal(kcal().value, '12');

    fireEvent.change(kcal(), { target: { value: '42,5' } });
    assert.equal(kcal().value, '42,5');

    fireEvent.change(kcal(), { target: { value: '42.5' } });
    assert.equal(kcal().value, '42.5');
  });

  test('CA-4 : « 4,2,1 » passe le filtre de frappe — c’est le serveur qui le refuse ensuite', (t: TestContext) => {
    // CA-4
    t.after(cleanup);
    const verdict: VerdictAliment = {
      ...VERDICT_BASE,
      refus: [{ champ: 'lip100', message: '« 4,2,1 » n’est pas un nombre lisible.' }],
    };
    render(<EditeurAliment visible aliment={alimentDouze()} verdict={verdict}
      onEnregistrer={() => undefined} onFermer={() => undefined} />);

    const lip = screen.getByLabelText('Lipides') as HTMLInputElement;
    fireEvent.change(lip, { target: { value: '4,2,1' } });
    assert.equal(lip.value, '4,2,1',
      'le filtre de frappe accepte chiffres, points et virgules même en surnombre : ce n’est pas à lui de juger');

    assert.match(screen.getByTestId('refus-lip100').textContent ?? '', /n’est pas un nombre lisible/);
  });

  test('CA-5 : « Renseigne les quatre valeurs » a disparu, même macro vide', (t: TestContext) => {
    // CA-5
    t.after(cleanup);
    render(<EditeurAliment visible onEnregistrer={() => undefined} onFermer={() => undefined} />);

    assert.equal(screen.queryByText(/Renseigne les quatre valeurs/), null,
      'ce message était rédigé par l’écran ; il n’a plus le droit de juger');
  });

  test('CA-5 : kcal vide éteint le bouton, même si le serveur dit enregistrable', (t: TestContext) => {
    // CA-5, AMENDÉ le 26 septembre 2026 par le propriétaire : un contrôle léger
    // du VIDE évite l'aller-retour. L'écran ne juge toujours pas la VALEUR —
    // voir le test suivant.
    t.after(cleanup);
    const envoyes: AlimentTape[] = [];
    render(<EditeurAliment visible verdict={{ ...VERDICT_BASE, enregistrable: true }}
      onEnregistrer={(a) => envoyes.push(a)} onFermer={() => undefined} />);

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Riz' } });
    fireEvent.change(screen.getByLabelText('Protéines'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Glucides'), { target: { value: '78' } });
    fireEvent.change(screen.getByLabelText('Lipides'), { target: { value: '1' } });
    // kcal reste vide
    fireEvent.click(screen.getByText('Enregistrer'));

    assert.equal(envoyes.length, 0, 'une macro obligatoire vide ne part pas');
  });

  test('CA-5 : kcal à « 0 » ne l’éteint pas — l’écran ne juge pas la valeur, le serveur le fera', (t: TestContext) => {
    // CA-5 : plus aucun `kcal100 > 0` à l'écran.
    t.after(cleanup);
    const envoyes: AlimentTape[] = [];
    render(<EditeurAliment visible verdict={{ ...VERDICT_BASE, enregistrable: true }}
      onEnregistrer={(a) => envoyes.push(a)} onFermer={() => undefined} />);

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Riz' } });
    fireEvent.change(screen.getByLabelText('Calories'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Protéines'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Glucides'), { target: { value: '78' } });
    fireEvent.change(screen.getByLabelText('Lipides'), { target: { value: '1' } });
    fireEvent.click(screen.getByText('Enregistrer'));

    assert.equal(envoyes.length, 1,
      'seul enregistrable, rendu par le serveur, juge un zéro : l’écran ne regarde que le vide');
  });

  test('CA-5 (témoin) : enregistrable à faux éteint le bouton, même tout rempli', (t: TestContext) => {
    // CA-5
    t.after(cleanup);
    const envoyes: AlimentTape[] = [];
    render(<EditeurAliment visible aliment={alimentDouze()} verdict={{ ...VERDICT_BASE, enregistrable: false }}
      onEnregistrer={(a) => envoyes.push(a)} onFermer={() => undefined} />);

    fireEvent.click(screen.getByText('Enregistrer'));

    assert.equal(envoyes.length, 0,
      'sans ce témoin, un bouton toujours actif passerait le test précédent par accident');
  });

  test('CA-6 : le résumé du serveur s’affiche même sur un aliment à zéro', (t: TestContext) => {
    // CA-6
    t.after(cleanup);
    const aliment: AlimentSaisi = { ...alimentDouze(), kcal100: 0, prot100: 0 };
    render(<EditeurAliment visible aliment={aliment} verdict={{ ...VERDICT_BASE, resume: 'RÉSUMÉ-SERVEUR' }}
      onEnregistrer={() => undefined} onFermer={() => undefined} />);

    assert.match(document.body.textContent ?? '', /RÉSUMÉ-SERVEUR/);
  });

  test('CA-6 (témoin) : un résumé vide n’affiche rien', (t: TestContext) => {
    // CA-6
    t.after(cleanup);
    const aliment: AlimentSaisi = { ...alimentDouze(), kcal100: 0, prot100: 0 };
    render(<EditeurAliment visible aliment={aliment} verdict={{ ...VERDICT_BASE, resume: '' }}
      onEnregistrer={() => undefined} onFermer={() => undefined} />);

    assert.doesNotMatch(document.body.textContent ?? '', /RÉSUMÉ-SERVEUR/);
  });

  test('CA-7 : sans verdict, le rendement affiche « inconnu » — témoin', (t: TestContext) => {
    // CA-7
    t.after(cleanup);
    render(<EditeurAliment visible onEnregistrer={() => undefined} onFermer={() => undefined} />);

    assert.equal(screen.getByTestId('rendement').textContent, 'Rendement : inconnu');
  });

  test('CA-7 : la mesure envoie les pesées tapées, et le rendement du serveur se propose puis s’enregistre', (t: TestContext) => {
    // CA-7
    t.after(cleanup);
    const vues: SaisieAliment[] = [];
    const envoyes: AlimentTape[] = [];
    const verdict: VerdictAliment = {
      ...VERDICT_BASE,
      rendement: { valeur: 2.3, explication: 'EXPLICATION-SERVEUR', provenance: 'PROVENANCE-SERVEUR' },
    };
    render(<EditeurAliment visible verdict={verdict}
      onSaisie={(s) => vues.push(s)} onEnregistrer={(a) => envoyes.push(a)} onFermer={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Riz' } });
    for (const [etiquette, valeur] of [['Calories', '350'], ['Protéines', '7'], ['Glucides', '78'], ['Lipides', '1']] as const) {
      fireEvent.change(screen.getByLabelText(etiquette), { target: { value: valeur } });
    }
    fireEvent.click(screen.getByText('Je préfère mesurer'));

    fireEvent.change(screen.getByLabelText('Poids avant cuisson'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Poids après cuisson'), { target: { value: '230' } });

    const derniere = vues.at(-1);
    assert.equal(derniere?.peseeAvant, '100');
    assert.equal(derniere?.peseeApres, '230');
    assert.ok(derniere !== undefined && !('ratioCandidat' in derniere),
      'ratioCandidat a disparu de SaisieAliment : le rendement candidat n’est plus jugé ici');

    assert.equal(screen.getByTestId('rendement').textContent, 'EXPLICATION-SERVEUR');
    assert.match(document.body.textContent ?? '', /✓[\s\S]*PROVENANCE-SERVEUR/);

    fireEvent.click(screen.getByText('Utiliser ce résultat (2,3)'));
    fireEvent.click(screen.getByText('Enregistrer'));

    assert.equal(envoyes.length, 1);
    assert.equal(envoyes.at(-1)?.peseeAvant, '100');
    assert.equal(envoyes.at(-1)?.peseeApres, '230');
  });

  test('CA-15 : un refus d’écriture (422) s’affiche sous le bon champ, sans effacer la saisie', (t: TestContext) => {
    // CA-15
    t.after(cleanup);
    render(<EditeurAliment visible aliment={alimentDouze()}
      refusEcriture={[{ champ: 'kcal100', message: 'REFUS-422' }]}
      onEnregistrer={() => undefined} onFermer={() => undefined} />);

    assert.match(screen.getByTestId('refus-kcal100').textContent ?? '', /REFUS-422/);
    assert.equal((screen.getByLabelText('Calories') as HTMLInputElement).value, '12',
      'un refus d’écriture ne doit pas effacer ce qui a été tapé');
  });

  test('CA-R6 : en panne, aucun refus ne s’affiche, et le rendement redevient « inconnu »', (t: TestContext) => {
    // CA-R6
    t.after(cleanup);
    render(<EditeurAliment visible aliment={alimentDouze()} verdictEnPanne
      verdict={{ ...VERDICT_BASE, refus: [{ champ: 'kcal100', message: 'NE-DOIT-PAS-APPARAITRE' }] }}
      onEnregistrer={() => undefined} onFermer={() => undefined} />);

    assert.equal(screen.queryByTestId('refus-kcal100'), null,
      'en panne, on ne sait rien vérifier : afficher un refus serait mentir sur ce qui a été contrôlé');
    assert.doesNotMatch(document.body.textContent ?? '', /NE-DOIT-PAS-APPARAITRE/);
    assert.match(document.body.textContent ?? '', /serveur n.{0,2}a pas répondu/i,
      'la règle 7 : dire l’incertitude plutôt qu’un cadre vide ou un ancien avis');
    assert.equal(screen.getByTestId('rendement').textContent, 'Rendement : inconnu');
  });
});
