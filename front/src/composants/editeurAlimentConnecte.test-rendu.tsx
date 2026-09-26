/**
 * La création d'un aliment, montée COMME L'ÉCRAN LA MONTE.
 *
 * LA PANNE, RELEVÉE PAR LA REVUE LE 17 SEPTEMBRE 2026. « Ajouter un aliment »
 * ouvrait l'éditeur avec les quatre macros déjà écrites « 0 ». `frigo.tsx`
 * passait `ALIMENT_VIDE` — un aliment dont chaque valeur vaut zéro — et
 * l'éditeur ne laisse ses champs vides que s'il ne reçoit AUCUN aliment. Un
 * saumon saisi avec ses calories et ses protéines, lipides oubliés, partait
 * donc en base à 0 g de lipides, et le calculateur composait dessus (règles 6
 * et 7). Le contrôle de cohérence ne pouvait pas l'arrêter : sans fibres, un
 * écart négatif n'est jamais « incohérent ».
 *
 * `editeurAliment.test-rendu.tsx` ne l'avait pas vu : il monte l'éditeur nu,
 * sur une huile existante. C'est ici qu'on le monte par le composant que
 * l'écran appelle vraiment, avec ce que l'écran lui passe.
 */
import { type TestContext, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EditeurAlimentConnecte } from './editeurAlimentConnecte';
import { ErreurApi } from '../api/erreurApi';

/** Une mutation qui retient ce qu'on lui envoie, sans réseau. */
function mutation(envois: unknown[]) {
  return {
    isPending: false,
    error: null,
    mutate: (corps: unknown) => { envois.push(corps); },
  } as never;
}

/** Le champ posé sous une étiquette : `Champ` n'associe pas de `<label>`. */
function champ(etiquette: string): HTMLInputElement {
  const saisie = screen.getByText(etiquette).parentElement?.querySelector('input');
  assert.ok(saisie, `aucun champ sous « ${etiquette} »`);

  return saisie;
}

/** L'éditeur tel que `app/(onglets)/frigo.tsx` l'ouvre sur « Ajouter un aliment ». */
function creer(t: TestContext): unknown[] {
  t.after(cleanup);
  const crees: unknown[] = [];
  render(
    <EditeurAlimentConnecte
      source="base"
      creation
      edite={null}
      aCompleter={null}
      quantite=""
      onQuantiteChange={() => undefined}
      onFermer={() => undefined}
      onCreationEnvoyee={() => undefined}
      onEditionFaite={() => undefined}
      creer={mutation(crees)}
      majAliment={mutation([])}
      definir={mutation([])}
      enregistrer={mutation([])}
      poserQuantite={mutation([])}
    />,
  );

  return crees;
}

const saisir = (etiquette: string, valeur: string) =>
  fireEvent.change(champ(etiquette), { target: { value: valeur } });

test('une création s\'ouvre avec des macros vides, pas à zéro', (t: TestContext) => {
  creer(t);

  for (const etiquette of ['Calories', 'Protéines', 'Glucides', 'Lipides']) {
    assert.equal(champ(etiquette).value, '',
      `« ${etiquette} » s'ouvre déjà rempli : un oubli partirait comme une valeur`);
  }
});

/* UN CHAMP VIDE NE DOIT PAS AVOIR L'AIR D'UN ZÉRO. Les quatre macros portaient
   « 0 » en texte indicatif, gris clair : à l'œil, un champ vide ressemblait à
   un champ rempli de zéro — précisément la confusion de la règle 6. Relevé par
   `verification-bout-en-bout` le 17 septembre 2026. */
test('un champ de macro vide ne montre pas un zéro en indication', (t: TestContext) => {
  creer(t);

  for (const etiquette of ['Calories', 'Protéines', 'Glucides', 'Lipides']) {
    assert.doesNotMatch(champ(etiquette).placeholder, /^\s*0([.,]0*)?\s*$/,
      `« ${etiquette} » vide affiche « ${champ(etiquette).placeholder} », qu'on lit comme une valeur`);
  }
});

test('des lipides oubliés ne partent pas, ni vides ni comme 0 g', (t: TestContext) => {
  const crees = creer(t);

  saisir('Nom', 'Saumon');
  saisir('Calories', '200');
  saisir('Protéines', '20');
  saisir('Glucides', '0');
  fireEvent.click(screen.getByText('Enregistrer'));

  /* RÉÉCRIT DEUX FOIS LE 26 SEPTEMBRE 2026 : l'écran a d'abord envoyé le vide
     tel quel (CA-5), puis le propriétaire a voulu un contrôle léger qui évite
     l'aller-retour — une macro vide éteint « Enregistrer ». Ce qui compte ne
     change pas : jamais un zéro que personne n'a donné. */
  assert.equal(crees.length, 0,
    'un saumon sans lipides saisis ne doit pas partir : « je ne sais pas » n\'est pas un chiffre');
});

test('les quatre macros saisies, la création part — le témoin de l\'inverse', (t: TestContext) => {
  const crees = creer(t);

  saisir('Nom', 'Saumon');
  saisir('Calories', '200');
  saisir('Protéines', '20');
  saisir('Glucides', '0');
  saisir('Lipides', '13');
  fireEvent.click(screen.getByText('Enregistrer'));

  assert.equal(crees.length, 1,
    'sans ce témoin, un bouton toujours désactivé passerait pour une correction');
  assert.deepEqual(
    (({ kcal100, prot100, gluc100, lip100, fibres100 }) => ({ kcal100, prot100, gluc100, lip100, fibres100 }))(
      crees[0] as Record<string, unknown>),
    { kcal100: '200', prot100: '20', gluc100: '0', lip100: '13', fibres100: '' },
  );
});

/* ========================================================================= *
 * LE CONTRAT ARRÊTÉ LE 26 SEPTEMBRE 2026 : LES TEXTES TELS QUE TAPÉS.
 *
 * `EditeurAliment.onEnregistrer` reçoit un `AlimentTape` — nom, kcal100,
 * prot100, gluc100, lip100, fibres100, ratio, peseeAvant, peseeApres en
 * CHAÎNES telles que tapées. `EditeurAlimentConnecte` les envoie telles
 * quelles à `creer.mutate` / `majAliment.mutate`, et la quantité TELLE QUE
 * TAPÉE (chaîne, '' si vide) à `definir.mutate({ alimentId, quantite })`.
 *
 * Plus aucune lecture numérique ici : c'est le serveur qui lit « 12,5 »
 * (`RendementExplique.php`, `POST /api/verification/aliment`), pas ce
 * composant. Voir `lectureAuServeur.test.ts`, qui garde qu'aucun des deux
 * fichiers ne réintroduit `nombreSaisi`, `parseFloat`, `Number(` ou
 * `ratioDepuisPesees`.
 *
 * ET UN REFUS DU SERVEUR NE FERME PLUS L'ÉDITEUR EN SILENCE : `ErreurApi`
 * porte désormais `refus: Grief[]`, affiché sous chaque champ concerné
 * (`data-testid="refus-<champ>"`), et un statut 0 — serveur injoignable — le
 * dit clairement plutôt que de relayer un message technique.
 * ========================================================================= */

/** Une mutation configurable : erreur à simuler, résultat de succès à rejouer. */
function mutationAvec(envois: unknown[], opts: {
  error?: unknown;
  resultat?: unknown;
} = {}) {
  return {
    isPending: false,
    error: opts.error ?? null,
    mutate: (corps: unknown, options?: { onSuccess?: (r: unknown) => void }) => {
      envois.push(corps);
      if (opts.resultat !== undefined) options?.onSuccess?.(opts.resultat);
    },
  } as never;
}

/**
 * L'éditeur de création, avec de quoi observer `definir.mutate` et injecter
 * une erreur sur `creer`. `creer` rejoue toujours son `onSuccess` avec un
 * aliment fabriqué : c'est ce qui déclenche `definir.mutate` dans
 * `editeurAlimentConnecte.tsx`.
 */
function creerPersonnalise(t: TestContext, opts: {
  creerErreur?: unknown;
  quantite?: string;
} = {}): { crees: unknown[]; definitions: unknown[] } {
  t.after(cleanup);
  const crees: unknown[] = [];
  const definitions: unknown[] = [];
  render(
    <EditeurAlimentConnecte
      source="base"
      creation
      edite={null}
      aCompleter={null}
      quantite={opts.quantite ?? ''}
      onQuantiteChange={() => undefined}
      onFermer={() => undefined}
      onCreationEnvoyee={() => undefined}
      onEditionFaite={() => undefined}
      creer={mutationAvec(crees, {
        error: opts.creerErreur ?? null,
        resultat: { id: 42, reference: 'base:42' },
      })}
      majAliment={mutationAvec([])}
      definir={mutationAvec(definitions)}
      enregistrer={mutationAvec([])}
      poserQuantite={mutationAvec([])}
    />,
  );

  return { crees, definitions };
}

const remplirLesQuatreMacros = () => {
  saisir('Nom', 'Saumon');
  saisir('Calories', '200');
  saisir('Protéines', '12,5');
  saisir('Glucides', '0');
  saisir('Lipides', '13');
};

test('CA-14 : la quantité tapée « 12,5 » part en texte vers definir.mutate', (t: TestContext) => {
  const { definitions } = creerPersonnalise(t, { quantite: '12,5' });
  remplirLesQuatreMacros();
  fireEvent.click(screen.getByText('Enregistrer'));

  assert.equal(definitions.length, 1, 'la création doit déclencher un definir.mutate');
  assert.equal(typeof definitions[0]?.['quantite' as never], 'string',
    'la quantité doit être une CHAÎNE, comme tapée — pas un nombre issu d’un parseFloat local');
  assert.equal((definitions[0] as { quantite: unknown }).quantite, '12,5',
    `definir.mutate doit recevoir quantite === '12,5', reçu : ${JSON.stringify(definitions[0])}`);
});

test('CA-14 : le témoin — une quantité vide part comme une chaîne vide, pas 0', (t: TestContext) => {
  const { definitions } = creerPersonnalise(t, { quantite: '' });
  remplirLesQuatreMacros();
  fireEvent.click(screen.getByText('Enregistrer'));

  assert.equal(definitions.length, 1);
  assert.equal((definitions[0] as { quantite: unknown }).quantite, '',
    `une quantité non saisie doit partir '' et non 0, reçu : ${JSON.stringify(definitions[0])}`);
});

// CA-9/CA-10
test('les protéines tapées « 12,5 » partent en texte vers creer.mutate', (t: TestContext) => {
  const { crees } = creerPersonnalise(t);
  remplirLesQuatreMacros();
  fireEvent.click(screen.getByText('Enregistrer'));

  assert.equal(crees.length, 1);
  assert.equal((crees[0] as { prot100: unknown }).prot100, '12,5',
    `creer.mutate doit recevoir prot100 === '12,5' (texte tel que tapé), reçu : `
    + `${JSON.stringify(crees[0])}`);
});

// CA-15
test('un refus 422 sur "prot100" s\'affiche sous le champ, et l\'éditeur reste ouvert', (t: TestContext) => {
  const erreur = new ErreurApi(422, 'Valeur refusée');
  (erreur as unknown as { refus: { champ: string; message: string }[] }).refus =
    [{ champ: 'prot100', message: 'REFUS-422' }];

  creerPersonnalise(t, { creerErreur: erreur });

  const bloc = screen.getByTestId('refus-prot100');
  assert.match(bloc.textContent ?? '', /REFUS-422/,
    'le grief que le serveur renvoie pour "prot100" doit apparaître sous ce champ');
  assert.ok(screen.queryByText('Enregistrer'),
    'un refus 422 ne doit pas fermer l\'éditeur : il faut pouvoir corriger et renvoyer');
});

// CA-R7
test('un serveur injoignable à l\'enregistrement le dit clairement, bouton actif', (t: TestContext) => {
  /* Le message technique ne contient volontairement PAS « Rien n'a été
     enregistré » : si l'écran se contentait de relayer .message tel quel
     (ce qu'il fait aujourd'hui), ce test doit tomber sur l'absence de cette
     phrase, pas sur un hasard de rédaction du message d'origine. */
  const erreur = new ErreurApi(
    0, 'Le serveur ne répond pas (30 s) : http://api.test. Réessaie dans un instant.');

  const { crees } = creerPersonnalise(t, { creerErreur: erreur });
  remplirLesQuatreMacros();

  const texte = document.body.textContent ?? '';
  assert.match(texte, /Rien n'a été enregistré/,
    `un statut 0 doit afficher un message contenant « Rien n'a été enregistré », `
    + `pas relayer le message technique brut. Texte affiché : « ${texte} »`);

  /* `Bouton` ne pose ni `disabled` ni `aria-disabled` (dette du 26/09/2026) :
     on éprouve donc ce qui compte — un clic REPART vers le serveur. */
  const avant = crees.length;
  fireEvent.click(screen.getByText('Enregistrer'));
  assert.equal(crees.length, avant + 1,
    'le bouton doit rester actif après un serveur injoignable : rien n\'a été '
    + 'enregistré, l\'utilisateur doit pouvoir réessayer');
});

/* ===========================================================================
 * UNE ERREUR PÉRIMÉE NE REVIENT PAS DANS UN AUTRE ÉDITEUR — 26 septembre 2026.
 *
 * Relevé par `revue-fitcarnet`. `echec` lisait `creer.error ?? majAliment.error
 * ?? definir.error` quel que soit le mode, et « Corriger » ne remet à zéro que
 * `majAliment`. Une création dont la QUANTITÉ n'était pas partie (réseau) —
 * l'aliment, lui, bien créé — faisait afficher « Rien n'a été enregistré » en
 * ouvrant la correction d'un AUTRE aliment : faux, et règle 7. De même, les
 * refus d'une création abandonnée s'affichaient sous les champs d'un autre.
 * ========================================================================= */
test('la correction d\'un aliment n\'affiche pas l\'échec d\'une création précédente', (t: TestContext) => {
  t.after(cleanup);
  const edite = {
    reference: 'base:7', nom: 'Poulet', categorie: 'prot', kcal100: 120, prot100: 23,
    gluc100: 0, lip100: 2, fibres100: null, ratio: 0.75, stock: 0,
    grammesDisponibles: 0, unite: 'g',
  } as never;
  render(
    <EditeurAlimentConnecte
      source="base"
      creation={false}
      edite={edite}
      aCompleter={null}
      quantite=""
      onQuantiteChange={() => undefined}
      onFermer={() => undefined}
      onCreationEnvoyee={() => undefined}
      onEditionFaite={() => undefined}
      creer={mutationAvec([], {
        error: new ErreurApi(422, 'refusé', [{ champ: 'prot100', message: 'refus d\'une autre saisie' }]),
      })}
      majAliment={mutationAvec([])}
      definir={mutationAvec([], { error: new ErreurApi(0, 'Le serveur ne répond pas.') })}
      enregistrer={mutationAvec([])}
      poserQuantite={mutationAvec([])}
    />,
  );

  const texte = document.body.textContent ?? '';
  assert.doesNotMatch(texte, /Rien n'a été enregistré/,
    'l\'échec de la quantité d\'une AUTRE création ne concerne pas cette correction');
  assert.doesNotMatch(texte, /refus d'une autre saisie/,
    'les refus d\'une création abandonnée ne s\'affichent pas sous les champs d\'un autre aliment');
});
