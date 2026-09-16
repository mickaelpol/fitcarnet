/**
 * LE MODE CHOISI DANS UN MODÈLE DOIT COMMANDER CE QU'ON PRESCRIT.
 *
 * LA PANNE, PROUVÉE SUR ÉMULATEUR ANDROID LE 16 SEPTEMBRE 2026. Le sélecteur de
 * mode venait d'arriver dans l'éditeur de modèle, avec cette justification :
 * « un programme de gainage restait en Charge et son modèle prescrivait des
 * kilos là où il faut des secondes ». Bascule en « Tenue », capture d'écran à
 * l'appui : les quatre lignes de série affichaient toujours « — kg » et
 * « 12 rép ». Le mode partait bien en base (`modele_exercice.mode = iso`), et la
 * prescription qu'il commande ne suivait pas. `ModeleSerie.secondesCible`
 * existait dans le type et dans la table sans être saisissable nulle part.
 *
 * C'est le motif de défaut dominant du projet : `LigneSerie` bascule depuis
 * toujours (`mode === 'charge' || mode === 'chrono'` contre `mode === 'iso'`),
 * son jumeau du modèle avait été oublié.
 *
 * Rendu réel sous jsdom (react-native-web, voir `src/tests/environnement.ts`).
 */
import { type TestContext, test } from 'node:test';
import assert from 'node:assert/strict';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ModeleSerie } from '@/api/types';
import { SerieModele } from './serieModele';
import type { ModeTravail } from './choixMode';

const SERIE: ModeleSerie = { ordre: 0, repsCible: 12, poidsCible: 40, secondesCible: null };

/**
 * Le parent se comporte comme `app/modele/[id].tsx` : il garde la série ET le
 * mode, et **changer de mode ne touche qu'au mode** (là-bas,
 * `majBloc(i, { ...bloc, mode: m })`). Sans ce bouton de bascule, un test qui
 * prétend éprouver « basculer ne jette rien » ne bascule jamais — c'est ce que
 * la revue a relevé le 16 septembre 2026 sur la première version de ce fichier.
 */
function Parent({ mode: depart, serie: serieDepart = SERIE, recues }: {
  mode: ModeTravail;
  serie?: ModeleSerie;
  recues: ModeleSerie[];
}) {
  const [mode, setMode] = useState<ModeTravail>(depart);
  const [serie, setSerie] = useState<ModeleSerie>(serieDepart);

  return (
    <>
      {(['charge', 'iso', 'chrono'] as const).map((m) => (
        <button key={m} type="button" onClick={() => setMode(m)}>{`vers ${m}`}</button>
      ))}
      <SerieModele
        serie={serie}
        mode={mode}
        index={0}
        onChange={(s) => { recues.push(s); setSerie(s); }}
        onSupprimer={() => undefined}
      />
    </>
  );
}

const unite = (u: string) => screen.queryByText(u);

test('en Charge, on prescrit des répétitions et des kilos', (t: TestContext) => {
  t.after(cleanup);
  render(<Parent mode="charge" recues={[]} />);

  assert.ok(unite('rép'), 'une série en charge se prescrit en répétitions');
  assert.ok(unite('kg'));
  assert.equal(unite('s'), null, 'un chrono de tenue n\'a rien à faire ici');
});

test('en Chrono, les répétitions et les kilos restent — c\'est un « for time »', (t: TestContext) => {
  /* Le témoin qui empêche de « corriger » en cachant les kilos hors du mode
     charge : en chrono on note bien ce qu'on a soulevé, comme le fait
     `LigneSerie` depuis le début. */
  t.after(cleanup);
  render(<Parent mode="chrono" recues={[]} />);

  assert.ok(unite('rép'));
  assert.ok(unite('kg'));
});

test('en Tenue, on prescrit des secondes — et ni répétitions ni kilos', (t: TestContext) => {
  t.after(cleanup);
  render(<Parent mode="iso" recues={[]} />);

  assert.ok(unite('s'), 'le gainage se prescrit en secondes : c\'est la raison d\'être du mode');
  assert.equal(unite('kg'), null, 'des kilos sur une tenue isométrique ne veulent rien dire');
  assert.equal(unite('rép'), null);
});

test('la durée saisie en Tenue est remontée dans secondesCible', (t: TestContext) => {
  t.after(cleanup);
  const recues: ModeleSerie[] = [];
  render(<Parent mode="iso" recues={recues} />);

  fireEvent.change(screen.getByPlaceholderText('—'), { target: { value: '45' } });

  assert.equal(recues.at(-1)?.secondesCible, 45);
});

/**
 * L'ALLER-RETOUR, ET IL BASCULE POUR DE VRAI.
 *
 * La première version de ce test affirmait « basculer de mode ne doit pas jeter
 * ce qui était saisi » en gardant `mode` figé à `"iso"` : il ne prouvait que la
 * diffusion de `...serie` dans `onChange`. Relevé par la revue le 16 septembre
 * 2026 — une assertion qui peut échouer, mais pas pour la raison qu'elle
 * affiche (motif 4, forme douce).
 */
test('un aller-retour Charge → Tenue → Charge rend les kilos intacts', (t: TestContext) => {
  t.after(cleanup);
  const recues: ModeleSerie[] = [];
  render(<Parent mode="charge" recues={recues} />);

  const valeurs = () => (screen.getAllByPlaceholderText('—') as HTMLInputElement[])
    .map((c) => c.value);

  assert.deepEqual(valeurs(), ['12', '40'], 'au départ : 12 répétitions à 40 kg');

  fireEvent.click(screen.getByText('vers iso'));
  assert.deepEqual(valeurs(), [''], 'en Tenue, un seul champ, vide : aucune durée prescrite');
  fireEvent.change(screen.getByPlaceholderText('—'), { target: { value: '45' } });

  fireEvent.click(screen.getByText('vers charge'));

  assert.deepEqual(valeurs(), ['12', '40'],
    'les kilos saisis avant la bascule doivent être rendus tels quels (règle 6)');
  assert.equal(recues.at(-1)?.secondesCible, 45, 'et la durée est conservée de son côté');
});

test('le bouton de suppression se nomme, au lieu d\'annoncer « signe multiplication »', (t: TestContext) => {
  t.after(cleanup);
  render(<Parent mode="charge" recues={[]} />);

  screen.getByLabelText('Supprimer la série 1');
});
