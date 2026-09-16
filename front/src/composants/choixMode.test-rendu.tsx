/**
 * LE CHOIX DU MODE DE TRAVAIL, PARTAGÉ ENTRE LA SÉANCE ET LE MODÈLE.
 *
 * Le 16 septembre 2026, le propriétaire a relevé que son document annonçait
 * « plusieurs modes de travail » sur un modèle, alors que l'écran n'offrait
 * aucun choix : le mode était reprisl du mode par défaut de l'exercice au
 * moment de l'ajout (`modele/[id].tsx`, `mode: ex.modeDefaut`), et seul l'écran
 * de séance portait le sélecteur.
 *
 * Décision : le sélecteur devient choisissable dans le modèle aussi. Il est donc
 * EXTRAIT ici plutôt que recopié — une seconde copie aurait divergé de la
 * première, comme les quatre champs de nombre du 15 septembre.
 *
 * L'ÉTAT SÉLECTIONNÉ EST ANNONCÉ, et pas seulement peint : `accessibilityState`
 * le dit à un lecteur d'écran, et c'est aussi ce qui rend ce test possible sans
 * inspecter des styles.
 */
import { type TestContext, test } from 'node:test';
import assert from 'node:assert/strict';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChoixMode } from './choixMode';

function Parent({ depart = 'charge' as const, recus }: {
  depart?: 'charge' | 'iso' | 'chrono';
  recus: string[];
}) {
  const [mode, setMode] = useState<'charge' | 'iso' | 'chrono'>(depart);

  return <ChoixMode mode={mode} onChange={(m) => { recus.push(m); setMode(m); }} />;
}

/* Un groupe de boutons radio : le libellé est dans un enfant, l'état est porté
   par le bouton lui-même. `aria-selected` avait été essayé et ne sortait pas du
   rendu — react-native-web ne l'émet pas sur un bouton. */
const bouton = (libelle: string) => screen.getByText(libelle).closest('[role="radio"]') as HTMLElement;
const choisi = (libelle: string) => bouton(libelle).getAttribute('aria-checked');

test('les trois modes de travail sont proposés', (t: TestContext) => {
  t.after(cleanup);
  render(<Parent recus={[]} />);

  for (const libelle of ['Charge', 'Tenue', 'Chrono']) screen.getByText(libelle);
});

test('le mode en cours est annoncé comme sélectionné, et lui seul', (t: TestContext) => {
  t.after(cleanup);
  render(<Parent depart="iso" recus={[]} />);

  assert.equal(choisi('Tenue'), 'true');
  assert.notEqual(choisi('Charge'), 'true', 'deux modes actifs à la fois ne veulent rien dire');
  assert.notEqual(choisi('Chrono'), 'true');
});

test('choisir un mode le remonte, avec sa valeur interne', (t: TestContext) => {
  /* Les libellés sont pour l'utilisateur, les valeurs pour la base : « Tenue »
     s'enregistre `iso`. Confondre les deux écrirait un mode que l'API refuse. */
  t.after(cleanup);
  const recus: string[] = [];
  render(<Parent recus={recus} />);

  fireEvent.click(bouton('Tenue'));
  assert.deepEqual(recus, ['iso']);
  assert.equal(choisi('Tenue'), 'true');

  fireEvent.click(bouton('Chrono'));
  assert.deepEqual(recus, ['iso', 'chrono']);
});

test('rechoisir le mode déjà actif ne casse rien', (t: TestContext) => {
  t.after(cleanup);
  const recus: string[] = [];
  render(<Parent recus={recus} />);

  fireEvent.click(bouton('Charge'));

  assert.deepEqual(recus, ['charge']);
  assert.equal(choisi('Charge'), 'true');
});
