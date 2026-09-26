import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

/**
 * LA LECTURE D'UN ALIMENT SAISI NE SE FAIT PLUS DANS L'ÉDITEUR — elle vient du
 * serveur, avec le reste du métier (règle « tout doit passer par le serveur »,
 * décision du 20 septembre 2026).
 *
 * DEUX GARDES ICI, POSÉES LE 26 SEPTEMBRE 2026 :
 *
 *   - CA-16 : `editeurAliment.tsx` et `editeurAlimentConnecte.tsx` envoient
 *     désormais les champs TELS QUE TAPÉS (`string`), et ne relisent plus un
 *     nombre ni un rendement cru/cuit localement. `nombreSaisi`, `parseFloat`,
 *     `Number(` et `ratioDepuisPesees` n'ont donc plus leur place dans ces deux
 *     fichiers : cette logique vit désormais côté serveur
 *     (`RendementExplique.php`, `POST /api/verification/aliment`).
 *
 *   - CA-8 : `nutrition.ts` n'exporte plus `ratioDepuisPesees`, `provenanceRatio`
 *     ni `expliquerRatio` — parties avec le reste du jugement de rendement —
 *     et plus aucun test du front ne les importe.
 *
 * Même technique que `formuleUnique.test.ts` et `coherenceCibleUnique.test.ts` :
 * les sources SANS leurs commentaires, puisque ce dépôt raconte ses pannes dans
 * sa prose et qu'un garde qui se lirait lui-même ne garderait plus rien.
 */

const RACINE = resolve(process.cwd(), '..');
const lire = (chemin: string): string => readFileSync(join(RACINE, chemin), 'utf8');

const sansCommentaires = (source: string): string => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

const EDITEUR = 'front/src/composants/editeurAliment.tsx';
const CONNECTE = 'front/src/composants/editeurAlimentConnecte.tsx';
const NUTRITION = 'front/src/calcul/nutrition.ts';
const NUTRITION_TEST = 'front/src/calcul/nutrition.test.ts';

const MOTIFS: { nom: string; motif: RegExp }[] = [
  { nom: 'nombreSaisi', motif: /\bnombreSaisi\s*\(/ },
  { nom: 'parseFloat', motif: /\bparseFloat\s*\(/ },
  { nom: 'Number(', motif: /\bNumber\s*\(/ },
  { nom: 'ratioDepuisPesees', motif: /\bratioDepuisPesees\s*\(/ },
];

describe('CA-16 : l’éditeur ne relit plus un nombre saisi ni un rendement cru/cuit', () => {
  it('LE TÉMOIN : chaque motif reconnaît bien ce qu’il doit interdire', () => {
    /* Sans ce cas, un motif devenu obsolète (une réécriture de la fonction, un
       espace en plus) laisserait la suite verte et muette — le défaut que
       l'audit a nommé « le test qui ne peut pas échouer ». */
    const fabrique = [
      'const q = nombreSaisi(texte);',
      'const r = parseFloat(texte);',
      'const s = Number(texte);',
      'const t = ratioDepuisPesees(avant, apres);',
    ].join('\n');

    for (const { nom, motif } of MOTIFS) {
      assert.match(fabrique, motif, `le motif « ${nom} » ne reconnaît plus sa propre cible`);
    }

    /* Témoin négatif : `Number.isNaN(` ne doit pas déclencher le motif
       « Number( » — sans quoi le garde interdirait un appel parfaitement
       légitime, présent ailleurs dans `editeurAlimentConnecte.tsx`. */
    assert.doesNotMatch('Number.isNaN(q)', /\bNumber\s*\(/,
      'le motif « Number( » se déclenche à tort sur Number.isNaN(...)');
  });

  for (const fichier of [EDITEUR, CONNECTE]) {
    it(`${fichier} n’importe et n’appelle plus aucun de ces quatre noms`, () => {
      const source = sansCommentaires(lire(fichier));

      for (const { nom, motif } of MOTIFS) {
        assert.doesNotMatch(source, motif,
          `${fichier} contient encore « ${nom} » : la lecture d'un nombre saisi et le `
          + 'rendement cru/cuit sont désormais rendus par le serveur '
          + '(RendementExplique.php, POST /api/verification/aliment) ; l’éditeur envoie '
          + 'les champs TELS QUE TAPÉS, en texte.');
      }
    });
  }
});

describe('CA-8 : nutrition.ts ne juge plus le rendement d’une pesée', () => {
  it('LE TÉMOIN : le motif reconnaît bien les déclarations qu’il doit interdire', () => {
    const fabrique = [
      'export function ratioDepuisPesees(avant: number, apres: number) { return null; }',
      'export function provenanceRatio(avant: number | null, apres: number | null) { return null; }',
      'export function expliquerRatio(ratio: number) { return \'\'; }',
    ].join('\n');

    for (const nom of ['ratioDepuisPesees', 'provenanceRatio', 'expliquerRatio']) {
      assert.match(fabrique, new RegExp(`export function ${nom}\\b`),
        `le motif ne reconnaît plus « export function ${nom} »`);
    }
  });

  it('nutrition.ts n’exporte plus ratioDepuisPesees, provenanceRatio ni expliquerRatio', () => {
    const source = sansCommentaires(lire(NUTRITION));

    for (const nom of ['ratioDepuisPesees', 'provenanceRatio', 'expliquerRatio']) {
      assert.doesNotMatch(source, new RegExp(`export function ${nom}\\b`),
        `nutrition.ts déclare encore « export function ${nom} » : cette logique est partie `
        + 'côté serveur, dans RendementExplique.php — voir aussi ratioDit.test.ts.');
    }
  });

  it('plus aucun test du front n’importe ces trois fonctions retirées', () => {
    /* Le fichier qui les éprouvait, `nutrition.test.ts`, ne portait QUE ça :
       il est retiré avec elles. S'il devait un jour être recréé pour autre
       chose, ce test continue de garder qu'il ne réimporte pas ce qui est
       parti. */
    if (!existsSync(join(RACINE, NUTRITION_TEST))) return;

    const source = lire(NUTRITION_TEST);
    for (const nom of ['ratioDepuisPesees', 'provenanceRatio', 'expliquerRatio']) {
      assert.doesNotMatch(source, new RegExp(`\\b${nom}\\b`),
        `nutrition.test.ts fait encore référence à « ${nom} » : ce test doit être retiré, `
        + 'la fonction n’existant plus côté front.');
    }
  });
});
