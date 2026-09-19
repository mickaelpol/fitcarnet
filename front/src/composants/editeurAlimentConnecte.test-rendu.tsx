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

test('des lipides oubliés ne partent pas comme 0 g', (t: TestContext) => {
  const crees = creer(t);

  saisir('Nom', 'Saumon');
  saisir('Calories', '200');
  saisir('Protéines', '20');
  saisir('Glucides', '0');
  fireEvent.click(screen.getByText('Enregistrer'));

  assert.equal(crees.length, 0,
    'un saumon sans lipides saisis a été créé : « je ne sais pas » est devenu « zéro gramme »');
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
    { kcal100: 200, prot100: 20, gluc100: 0, lip100: 13, fibres100: null },
  );
});
