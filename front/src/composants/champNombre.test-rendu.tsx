/**
 * UN CHAMP DE NOMBRE GARDE CE QU'ON TAPE.
 *
 * LA PANNE, PROUVÉE LE 15 SEPTEMBRE 2026 SUR ÉMULATEUR ANDROID. Dans le poids
 * d'une série, les frappes « 4 », « 2 », « , », « 5 » affichaient « 4 », « 42 »,
 * « 42 », « 425 » — et la base enregistrait 425 kg. Le champ était piloté par le
 * NOMBRE (`String(serie.poids)`) : « 42, » se lisait 42, se réécrivait « 42 », la
 * virgule disparaissait sous les doigts. Quatre champs étaient construits ainsi —
 * répétitions et poids de la série, répétitions et poids cibles du modèle.
 *
 * Ce test est un rendu réel (react-native-web sous jsdom, voir
 * `src/tests/environnement.ts`). Le parent se comporte comme `LigneSerie` : il
 * garde un NOMBRE et le repasse au champ à chaque rendu. C'est tout le piège.
 */
import { type TestContext, test } from 'node:test';
import assert from 'node:assert/strict';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChampNombre } from './champNombre';

function Parent({ depart = null, entier, recus }: {
  depart?: number | null;
  entier?: boolean;
  recus: (number | null)[];
}) {
  const [valeur, setValeur] = useState<number | null>(depart);

  return (
    <>
      {/* Ce que fait « cocher la série » : poser l'objectif de l'extérieur. */}
      <button type="button" onClick={() => setValeur(40)}>cocher</button>
      <ChampNombre
        valeur={valeur}
        onChange={(n) => { recus.push(n); setValeur(n); }}
        placeholder="—"
        unite="kg"
        entier={entier}
      />
    </>
  );
}

const champ = () => screen.getByPlaceholderText('—') as HTMLInputElement;

/** Chaque étape est le contenu ENTIER du champ après une frappe, comme sur un clavier. */
function taper(...etapes: string[]): string[] {
  return etapes.map((v) => {
    fireEvent.change(champ(), { target: { value: v } });

    return champ().value;
  });
}

test('42,5 tapé caractère par caractère reste 42,5 — et vaut 42,5', (t: TestContext) => {
  t.after(cleanup);
  const recus: (number | null)[] = [];
  render(<Parent recus={recus} />);

  assert.deepEqual(taper('4', '42', '42,', '42,5'), ['4', '42', '42,', '42,5'],
    'la virgule a disparu sous les doigts : c\'est ainsi que 42,5 kg devenait 425');
  assert.equal(recus.at(-1), 42.5);
});

test('le point décimal d\'un clavier anglais aussi', (t: TestContext) => {
  t.after(cleanup);
  const recus: (number | null)[] = [];
  render(<Parent recus={recus} />);

  assert.deepEqual(taper('4', '42', '42.', '42.5'), ['4', '42', '42.', '42.5']);
  assert.equal(recus.at(-1), 42.5);
});

test('une saisie illisible ne devient pas zéro, et reste à l\'écran', (t: TestContext) => {
  t.after(cleanup);
  const recus: (number | null)[] = [];
  render(<Parent recus={recus} />);

  taper('4', '4,', '4,2', '4,2,', '4,2,1');

  assert.equal(recus.at(-1), null, '`|| 0` transformait « je ne sais pas » en zéro kilo');
  assert.equal(champ().value, '4,2,1', 'effacer ce qu\'on a tapé cacherait l\'erreur au lieu de la montrer');
});

test('vider le champ rend « rien », pas zéro', (t: TestContext) => {
  t.after(cleanup);
  const recus: (number | null)[] = [];
  render(<Parent recus={recus} />);

  taper('4', '42', '4', '');

  assert.equal(recus.at(-1), null);
  assert.equal(champ().value, '');
});

test('une valeur posée de l\'extérieur s\'affiche', (t: TestContext) => {
  /* LE TÉMOIN DE L'INVERSE. Garder le texte tapé ne doit pas rendre le champ
     sourd : cocher une série vide la remplit avec l'objectif, et ça doit se voir. */
  t.after(cleanup);
  render(<Parent recus={[]} />);

  fireEvent.click(screen.getByText('cocher'));

  assert.equal(champ().value, '40');
});

test('une valeur déjà enregistrée s\'affiche à la française, sans arrondi', (t: TestContext) => {
  t.after(cleanup);
  render(<Parent depart={42.25} recus={[]} />);

  assert.equal(champ().value, '42,25');
});

test('des répétitions refusent un décimal au lieu de l\'arrondir en silence', (t: TestContext) => {
  t.after(cleanup);
  const recus: (number | null)[] = [];
  render(<Parent entier recus={recus} />);

  taper('8', '8,', '8,5');
  assert.equal(recus.at(-1), null);

  taper('8');
  assert.equal(recus.at(-1), 8);
});

/**
 * DES LIGNES À CLÉ PAR INDEX : la suppression d'une série fait glisser les
 * champs d'une ligne à l'autre. `app/modele/[id].tsx` rend ses séries avec
 * `key={j}`, `exerciceSeance.tsx` avec `key={i}`. Supprimer la première série
 * donne alors au MÊME composant la valeur de la suivante — et il doit la montrer,
 * pas garder le texte de la ligne disparue.
 *
 * Relevé par la revue le 15 septembre 2026 : une mutation qui ne remplaçait le
 * texte que d'un champ VIDE laissait les sept premiers tests au vert, et la
 * ligne restante affichait « 42,5 » pour une valeur de 50.
 */
function Lignes({ recus }: { recus: (number | null)[] }) {
  const [series, setSeries] = useState<(number | null)[]>([40, 50]);

  return (
    <>
      <button type="button" onClick={() => setSeries((s) => s.slice(1))}>supprimer la première</button>
      {series.map((v, i) => (
        <ChampNombre
          // eslint-disable-next-line react/no-array-index-key -- c'est précisément le cas éprouvé
          key={i}
          valeur={v}
          onChange={(n) => { recus.push(n); setSeries((s) => s.map((x, k) => (k === i ? n : x))); }}
          placeholder={`série ${i + 1}`}
        />
      ))}
    </>
  );
}

test('supprimer une série montre la valeur de celle qui prend sa place', (t: TestContext) => {
  t.after(cleanup);
  render(<Lignes recus={[]} />);

  const premiere = () => screen.getByPlaceholderText('série 1') as HTMLInputElement;
  fireEvent.change(premiere(), { target: { value: '42,' } });
  fireEvent.change(premiere(), { target: { value: '42,5' } });
  assert.equal(premiere().value, '42,5');

  fireEvent.click(screen.getByText('supprimer la première'));

  assert.equal(premiere().value, '50',
    'la ligne restante vaut 50 : afficher « 42,5 » ferait croire à une charge qui n\'est pas enregistrée');
});

test('un décimal tapé dans des répétitions RESTE à l\'écran, au lieu de s\'effacer', (t: TestContext) => {
  /* Le test précédent des répétitions ne regardait que les valeurs remontées.
     Une mutation qui oubliait `entier` dans la synchronisation effaçait « 8,5 »
     de l'écran — une erreur cachée au lieu d'être montrée — sans le faire tomber. */
  t.after(cleanup);
  render(<Parent entier recus={[]} />);

  taper('8', '8,', '8,5');

  assert.equal(champ().value, '8,5');
});
