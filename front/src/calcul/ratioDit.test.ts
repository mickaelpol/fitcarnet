import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { POIDS_INCHANGE, resumeRatio } from './nutrition';

/**
 * CE QUE LA CUISSON FAIT AU POIDS, DIT DANS LA CASE DU FRIGO.
 *
 * Deux écritures, deux SEUILS DIFFÉRENTS — relevé le 20 septembre 2026
 * (palier 0) :
 *
 *     calcul/nutrition.ts:232      Math.abs(ratio - 1) < 0.01   → « le poids ne change pas »
 *     composants/ligneFrigo.tsx    ratio === 1                  → « poids inchangé »
 *
 * Un aliment à 1,002 — ce qu'un rendement mesuré donne très vite, 500 g avant
 * et 501 g après — recevait donc deux réponses. Le seuil est désormais une
 * constante unique, `POIDS_INCHANGE`, et `resumeRatio` (la formulation courte
 * affichée dans le frigo) en part.
 *
 * `expliquerRatio` — LA FORMULATION LONGUE, CELLE DE L'ÉDITEUR — A DISPARU DE
 * CE FICHIER LE 26 SEPTEMBRE 2026, EN MÊME TEMPS QUE DE `nutrition.ts` (CA-8,
 * voir `lectureAuServeur.test.ts`). L'explication du rendement — « 100 g avant
 * cuisson donnent 226 g une fois cuits » — est désormais rédigée par le
 * serveur, dans `RendementExplique.php`, et l'éditeur l'affiche telle quelle.
 * Comparer les deux formulations n'a donc plus de sens ICI : ce qui doit
 * rester d'accord, c'est le SEUIL lui-même entre les deux langages — c'est ce
 * que garde le second bloc, sur le modèle de `coherenceCibleUnique.test.ts` et
 * `avancementUnique.test.ts`.
 */

describe('le seuil du « poids inchangé »', () => {
  it('juste en dessous du seuil, resumeRatio dit « poids inchangé »', () => {
    for (const ratio of [1, 1 + POIDS_INCHANGE / 2, 1 - POIDS_INCHANGE / 2]) {
      assert.equal(resumeRatio(ratio), 'poids inchangé',
        `${ratio} est dans la zone « inchangé »`);
    }
  });

  it('LE TÉMOIN : au-delà du seuil, resumeRatio chiffre au lieu de dire « inchangé »', () => {
    /* Sans ce cas, un « poids inchangé » rendu en toutes circonstances
       passerait le test ci-dessus tout en n'annonçant plus jamais une perte
       d'eau — et un riz qui double de poids serait présenté comme stable. */
    const dehors = 1 + POIDS_INCHANGE * 2;

    assert.notEqual(resumeRatio(dehors), 'poids inchangé');
  });
});

describe('ce que resumeRatio dit', () => {
  it('elle tient dans une case du frigo', () => {
    /* Déplié sous un aliment, à côté de « Pour 100 g » et des macros : il n'y
       a pas la place d'une phrase — c'est le rôle qui reste à ce module. */
    assert.equal(resumeRatio(2.26), '100 g → 226 g');
    assert.equal(resumeRatio(0.32), '100 g → 32 g');
  });
});

/* ------------------------------------------------------------- CA-16 (suite) */

describe('POIDS_INCHANGE ne diverge pas entre le front et le serveur', () => {
  const RACINE = resolve(process.cwd(), '..');
  const lire = (chemin: string): string => readFileSync(join(RACINE, chemin), 'utf8');
  const RENDEMENT_EXPLIQUE = 'api/src/Service/RendementExplique.php';

  /** `public const float POIDS_INCHANGE = 0.01;` (ou sans `float`). */
  function poidsInchangeDuServeur(): number | null {
    const php = lire(RENDEMENT_EXPLIQUE);
    const trouve = /const\s+(?:float\s+)?POIDS_INCHANGE\s*=\s*([\d.]+)/.exec(php)?.[1];

    return trouve === undefined ? null : Number(trouve);
  }

  it('LE TÉMOIN : le motif reconnaît une déclaration PHP de la constante', () => {
    const fabrique = 'public const float POIDS_INCHANGE = 0.01;';
    const trouve = /const\s+(?:float\s+)?POIDS_INCHANGE\s*=\s*([\d.]+)/.exec(fabrique)?.[1];

    assert.equal(trouve, '0.01',
      'le motif ne reconnaît plus « const float POIDS_INCHANGE = … » : le vérrou est muet');
  });

  it('POIDS_INCHANGE (nutrition.ts) est égal à POIDS_INCHANGE (RendementExplique.php)', () => {
    /* LE SEUL CONTRÔLE QUI VOIT CETTE DIVERGENCE. Le jour où le seuil PHP
       bouge sans que `nutrition.ts` suive, le frigo dirait « poids inchangé »
       à un endroit que le serveur, lui, ne juge déjà plus tel — deux réponses
       à la même question, ce que ce chantier cherche justement à supprimer. */
    assert.equal(poidsInchangeDuServeur(), POIDS_INCHANGE,
      `RendementExplique::POIDS_INCHANGE (PHP) a divergé de POIDS_INCHANGE `
      + `(nutrition.ts, ${POIDS_INCHANGE}).`);
  });
});
