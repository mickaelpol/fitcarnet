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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EditeurAliment, type AlimentSaisi } from './editeurAliment';
import { C } from '@/theme';

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

/* ======================================================================== */
/* LES PESÉES DE LA MESURE PASSENT PAR CHAMPNOMBRE — 26 SEPTEMBRE 2026       */
/* ======================================================================== */

/**
 * LA PANNE. « Poids avant cuisson » et « Poids après cuisson » sont deux
 * `<Champ>` pilotés par un `useState('')` tenu à la main — la reconstruction
 * texte-depuis-nombre que `ChampNombre` existe justement pour éviter (voir
 * `champNombre.tsx`, 15 septembre 2026). Deux symptômes concrets :
 *
 *  - à l'ouverture, une pesée déjà connue s'affiche au POINT (`String(42.5)`
 *    donne « 42.5 ») au lieu du séparateur français ;
 *  - une saisie illisible (« 4,2,1 », « abc », « -3 ») ne borde rien de rouge :
 *    aucun `illisible` n'est jamais posé sur ces deux champs, contrairement à
 *    ceux des macros, qui l'ont depuis le 17 septembre. La règle 6 — une
 *    absence n'est pas un zéro — reste vraie côté données (`nombreSaisi`
 *    renvoie déjà `null`), mais l'écran ne le MONTRE pas.
 */
describe('les pesées de l’éditeur passent par ChampNombre', () => {
  /** Un aliment complet, valide pour l'enregistrement — seules les pesées varient. */
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

  function ouvrirMesure(t: TestContext, aliment: AlimentSaisi, onEnregistrer: (a: AlimentSaisi) => void = () => undefined) {
    t.after(cleanup);
    render(<EditeurAliment visible aliment={aliment} onEnregistrer={onEnregistrer} onFermer={() => undefined} />);
    fireEvent.click(screen.getByText('Je préfère mesurer'));
  }

  /**
   * Couleur attendue du cadre en erreur, DÉDUITE de `C.erreur` plutôt que
   * recopiée en dur : `getComputedStyle` rend une couleur `rgb(r, g, b)`,
   * jamais l'hexadécimal posé dans la feuille de style. Convertir ici évite
   * une seconde écriture de la couleur qui pourrait diverger du thème.
   */
  const hexEnRgb = (hex: string): string => {
    const n = parseInt(hex.replace('#', ''), 16);

    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  };
  const ROUGE = hexEnRgb(C.erreur);

  /** Le cadre du champ, c'est le `View` PARENT du `TextInput` — voir `base.tsx` l.158. */
  const bordeDeRouge = (champ: HTMLInputElement): boolean =>
    getComputedStyle(champ.parentElement as Element).borderColor === ROUGE;

  test('CA-1 : une pesée connue s’affiche à la française, pas au point', (t: TestContext) => {
    ouvrirMesure(t, alimentAvecPesees(42.5, 96));

    assert.equal(champAvant().value, '42,5',
      'String(42.5) donne "42.5" : le point de JavaScript, pas la virgule française');
    assert.equal(champApres().value, '96');
  });

  test('CA-2 : sans aucune pesée, les deux champs sont vides — témoin, probablement déjà vert', (t: TestContext) => {
    ouvrirMesure(t, alimentAvecPesees(null, null));

    assert.equal(champAvant().value, '', 'null ne doit ni s’afficher "0" ni "null"');
    assert.equal(champApres().value, '');
  });

  test('CA-3 : la virgule ne disparaît pas sous les doigts — témoin, probablement déjà vert', (t: TestContext) => {
    ouvrirMesure(t, alimentAvecPesees(null, null));

    assert.deepEqual(
      taper(champAvant, '4', '42', '42,', '42,5'),
      ['4', '42', '42,', '42,5'],
      'c’est exactement le bug du 15 septembre 2026 (425 kg au lieu de 42,5) : ici sur une pesée',
    );
  });

  test('CA-4 : la mesure va jusqu’à l’enregistrement — témoin, probablement déjà vert', (t: TestContext) => {
    const envoyes: AlimentSaisi[] = [];
    ouvrirMesure(t, alimentAvecPesees(null, null), (a) => { envoyes.push(a); });

    fireEvent.change(champAvant(), { target: { value: '100' } });
    fireEvent.change(champApres(), { target: { value: '230' } });
    fireEvent.click(screen.getByText(/Utiliser ce résultat/));
    fireEvent.click(screen.getByText('Enregistrer'));

    assert.equal(envoyes.length, 1);
    const recu = envoyes.at(-1);
    assert.equal(recu?.peseeAvant, 100);
    assert.equal(recu?.peseeApres, 230);
    assert.equal(recu?.ratio, 2.3);
  });

  describe('CA-5 : ce sont des ChampNombre, aucune pesée tenue à la main — porté sur le SOURCE', () => {
    /* MÊME TECHNIQUE QUE `formuleUnique.test.ts` : lire le fichier réel plutôt
       que son rendu, pour attraper une régression même si elle ne casse aucun
       des tests de comportement ci-dessus (deux témoins sur quatre le sont
       déjà). `__dirname` vaut `dist-tests/composants` à l'exécution : deux
       niveaux au-dessus rejoignent `front/`, où vit `src/`. */
    const CHEMIN = join(__dirname, '..', '..', 'src', 'composants', 'editeurAliment.tsx');
    const SOURCE = readFileSync(CHEMIN, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');

    /** La balise ouvrante juste avant une étiquette donnée — `<ChampNombre` ou `<Champ`, ou `null`. */
    function baliseDeLEtiquette(source: string, etiquette: string): string | null {
      const pos = source.indexOf(`etiquette="${etiquette}"`);
      if (pos === -1) return null;
      const avant = source.slice(0, pos);
      const dernierOuvrant = avant.lastIndexOf('<');

      return avant.slice(dernierOuvrant + 1).match(/^[A-Za-z]+/)?.[0] ?? null;
    }

    /** Un `useState('')` texte, destructuré vers ces deux noms précis. */
    function useStateVideDeclare(source: string, nomValeur: string, nomSetter: string): boolean {
      const motif = new RegExp(`\\[\\s*${nomValeur}\\s*,\\s*${nomSetter}\\s*\\]\\s*=\\s*useState\\(\\s*''\\s*\\)`);

      return motif.test(source);
    }

    it('le motif reconnaît encore sa cible — le témoin', () => {
      /* SANS CE TÉMOIN : si `etiquette="Poids avant cuisson"` disparaissait du
         fichier (renommage de l'écran), les deux assertions suivantes
         passeraient en trouvant `null`, un vert qui ne garde plus rien — le
         défaut que la règle du projet interdit. On le prouve ici sur un
         extrait FABRIQUÉ, indépendant de l'état réel du fichier, pour ne
         jamais dépendre de si `editeurAliment.tsx` est déjà corrigé ou non. */
      const bonExtrait = '<ChampNombre etiquette="Poids avant cuisson" unite="g" />';
      const mauvaisExtrait = '<Champ etiquette="Poids avant cuisson" unite="g" />';
      const useStateFabrique = "const [avant, setAvant] = useState('');";

      assert.equal(baliseDeLEtiquette(bonExtrait, 'Poids avant cuisson'), 'ChampNombre');
      assert.equal(baliseDeLEtiquette(mauvaisExtrait, 'Poids avant cuisson'), 'Champ');
      assert.equal(useStateVideDeclare(useStateFabrique, 'avant', 'setAvant'), true);
      assert.equal(useStateVideDeclare("const [x, setX] = useState(0);", 'avant', 'setAvant'), false);
    });

    it('« Poids avant cuisson » et « Poids après cuisson » sont des ChampNombre', () => {
      assert.equal(baliseDeLEtiquette(SOURCE, 'Poids avant cuisson'), 'ChampNombre',
        'c’est encore un <Champ> piloté à la main : aucune bordure rouge possible sur une saisie illisible');
      assert.equal(baliseDeLEtiquette(SOURCE, 'Poids après cuisson'), 'ChampNombre');
    });

    it('aucun état texte tenu à la main pour ces deux pesées', () => {
      assert.equal(useStateVideDeclare(SOURCE, 'avant', 'setAvant'), false,
        'useState(\'\') est le texte-tenu-à-la-main que ChampNombre remplace : l’état doit devenir un nombre');
      assert.equal(useStateVideDeclare(SOURCE, 'apres', 'setApres'), false);
    });
  });

  describe('CA-R1/CA-R2 : une pesée illisible se voit — pas seulement dans les données', () => {
    /**
     * `nombreSaisi` renvoie déjà `null` pour ces trois saisies (règle 6, non
     * en cause ici) : le sujet est que RIEN NE LE MONTRE. Ni bordure, ni
     * message — l'utilisateur tape « 4,2,1 » et ne voit qu'un champ ordinaire.
     */
    for (const invalide of ['4,2,1', 'abc', '-3']) {
      test(`CA-R1 : "${invalide}" dans "Poids avant cuisson" borde le champ de rouge et cache le bouton`, (t: TestContext) => {
        ouvrirMesure(t, alimentAvecPesees(null, null));

        fireEvent.change(champAvant(), { target: { value: invalide } });
        fireEvent.change(champApres(), { target: { value: '230' } });

        assert.equal(bordeDeRouge(champAvant()), true,
          `aucun "illisible" n’est posé sur ce champ : "${invalide}" ne se voit nulle part`);
        assert.equal(screen.queryByText(/Utiliser ce résultat/), null,
          'un ratio ne peut pas se proposer sur une pesée qui ne désigne aucun nombre');
        assert.equal(champAvant().value, invalide,
          'effacer ce qui a été tapé cacherait l’erreur au lieu de la montrer');
      });
    }

    test('CA-R2 : corriger une pesée illisible fait disparaître la bordure et revenir le bouton', (t: TestContext) => {
      ouvrirMesure(t, alimentAvecPesees(null, null));

      fireEvent.change(champAvant(), { target: { value: '4,2,1' } });
      fireEvent.change(champApres(), { target: { value: '230' } });
      assert.equal(bordeDeRouge(champAvant()), true,
        'précondition : sans bordure au départ, "elle disparaît" ne prouverait rien');
      assert.equal(screen.queryByText(/Utiliser ce résultat/), null);

      fireEvent.change(champAvant(), { target: { value: '100' } });

      assert.equal(bordeDeRouge(champAvant()), false,
        'la pesée redevient lisible : la bordure doit partir avec l’erreur');
      assert.notEqual(screen.queryByText(/Utiliser ce résultat/), null,
        'un ratio redevient calculable dès que les deux pesées se lisent');
    });
  });
});
