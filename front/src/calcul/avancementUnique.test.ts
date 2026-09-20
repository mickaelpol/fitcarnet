import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

import type { SeanceExercice } from '../api/types';
import { avancementDe } from './blocSeance';

/**
 * LA RÈGLE DU CHRONO N'A QU'UNE ÉCRITURE, ET ELLE EST SUR LE SERVEUR.
 *
 * « Un exercice chrono ne compte que pour UNE série » — un « for time » n'a
 * qu'un temps total, ses lignes supplémentaires ne sont pas des séries à faire.
 *
 * ELLE ÉTAIT ÉCRITE DEUX FOIS jusqu'au 21 septembre 2026 :
 *
 *   1. `api/src/Entity/Seance.php`, `getAvancement()` — pour la liste des séances
 *   2. `front/src/calcul/blocSeance.ts`, `avancementDe()` — pour l'écran d'une
 *      séance, qui refait le compte à chaque case cochée
 *
 * C'était le dernier double juge du projet, et le seul qui n'était tenu par
 * RIEN : ni fichier de règles, ni test croisé. Les trois autres — mot de passe,
 * rendement, cohérence — avaient au moins un `api/regles/*.json` lu par les deux
 * suites. Celui-ci, relevé le 19 septembre, n'était déclaré nulle part.
 *
 * CE QUI EMPÊCHAIT DE SIMPLEMENT LIRE `seance.avancement` : cocher une série
 * doit bouger le compteur IMMÉDIATEMENT, sans aller-retour, hors ligne compris.
 *
 * LA SORTIE : le serveur donne à chaque série son POIDS (`poidsDansLAvancement`,
 * 1 ou 0) et à chaque bloc le poids d'une série qu'on ajouterait maintenant
 * (`poidsDUneNouvelleSerie`). Le front ne fait plus qu'une ADDITION sur des
 * données fournies. Ce n'est plus une règle métier, c'est de l'arithmétique —
 * et le compteur reste instantané.
 *
 * POURQUOI UN GARDE ET NON UN FICHIER DE RÈGLES. Un fichier de règles suppose
 * qu'un futur front pense à le lire : c'est une duplication *gardée*, pas
 * supprimée. Ici il n'y a plus rien à synchroniser, donc rien à garder d'accord
 * — seulement à empêcher que ça revienne. Même dispositif qu'`epleyUnique`.
 */

/* Depuis `front/`, là où `npm test` s'exécute. */
const RACINE = resolve(process.cwd(), '..');

const EXTENSIONS = /\.(ts|tsx)$/;
const IGNORES = new Set(['node_modules', 'dist', '.expo', '.git', 'dist-tests']);

function sources(chemin: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(chemin)) {
    if (IGNORES.has(entree) || entree.startsWith('.')) continue;
    const complet = join(chemin, entree);
    if (statSync(complet).isDirectory()) trouves.push(...sources(complet));
    else if (EXTENSIONS.test(entree)) trouves.push(complet.replace(/\\/g, '/'));
  }

  return trouves;
}

/* Ce dépôt raconte ses pannes dans ses commentaires — celui-ci écrit « chrono »
   une dizaine de fois plus haut. Sans ce retrait, le garde se déclencherait sur
   sa propre explication, et on finirait par le désactiver. */
const sansCommentaires = (source: string): string => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

const FICHIERS = sources(join(RACINE, 'front/src'))
  .concat(sources(join(RACINE, 'front/app')))
  .map((f) => ({
    f: f.slice(RACINE.length + 1),
    source: sansCommentaires(readFileSync(f, 'utf8')),
  }))
  .filter(({ f }) => !/\.test(-rendu|-data)?\.tsx?$/.test(f));

const AVANCEMENT = 'front/src/calcul/blocSeance.ts';

/**
 * LE DÉCOMPTE PARTIEL, signature de l'ancienne écriture.
 *
 * `avancementDe` faisait exactement `mode === 'chrono' ? b.series.slice(0, 1)
 * : b.series`. Toute reprise de ce geste — ne garder qu'une partie des séries
 * pour les compter — remet la règle du chrono dans le front.
 */
const DECOMPTE_PARTIEL = /\.slice\(\s*0\s*,\s*1\s*\)/;

describe('la règle du chrono ne vit que sur le serveur', () => {
  it('le témoin : le module d’avancement est bien celui qu’on garde', () => {
    const reference = FICHIERS.find(({ f }) => f === AVANCEMENT);

    assert.ok(reference, `${AVANCEMENT} introuvable depuis ${RACINE}`);
    assert.match(reference.source, /poidsDansLAvancement/,
      `${AVANCEMENT} ne lit plus le poids fourni par le serveur : soit le champ `
      + 'a été renommé, soit le front s’est remis à décider tout seul.');
    assert.ok(FICHIERS.length > 100,
      `${FICHIERS.length} fichiers parcourus, c'est trop peu : le balayage rate des dossiers`);
  });

  it('le module d’avancement ne connaît plus le mode « chrono »', () => {
    const reference = FICHIERS.find(({ f }) => f === AVANCEMENT);

    assert.doesNotMatch(reference?.source ?? '', /chrono/i,
      `${AVANCEMENT} mentionne à nouveau « chrono ». Compter les séries n’a pas `
      + 'à connaître les modes : le serveur donne déjà le poids de chacune. '
      + 'Une seconde écriture de cette règle finira par diverger sans que '
      + 'personne le voie — c’est ce qu’elle a fait pendant des mois.');
  });

  it('personne ne recompose un décompte partiel des séries', () => {
    const coupables = FICHIERS
      .filter(({ source }) => DECOMPTE_PARTIEL.test(source))
      .map(({ f }) => f);

    assert.deepEqual(coupables, [],
      'Ces fichiers ne gardent qu’une partie des séries. C’était le geste exact '
      + 'de l’ancien double juge (`series.slice(0, 1)` pour un chrono). Le poids '
      + 'de chaque série est fourni par le serveur : l’additionner suffit.');
  });

  it('un poids absent compte pour UNE, jamais pour zéro', () => {
    /* LE REPLI. Une série qu'on vient d'ajouter à l'écran n'a pas encore de
       poids rendu par le serveur. Si le repli était zéro, le total reculerait
       en ajoutant une ligne — et l'utilisateur verrait « 3 sur 2 ». */
    const bloc = {
      series: [{ faite: true }, { faite: false }],
    } as unknown as SeanceExercice;

    assert.deepEqual(avancementDe([bloc]), { faites: 1, total: 2 });
  });

  it('et le poids fourni par le serveur l’emporte sur ce repli', () => {
    /* LE CONTRE-TÉMOIN du cas ci-dessus : sans lui, un `avancementDe` qui
       ignorerait `poidsDansLAvancement` et rendrait toujours 1 passerait. */
    const chrono = {
      poidsDUneNouvelleSerie: 0,
      series: [
        { faite: false, poidsDansLAvancement: 1 },
        { faite: true, poidsDansLAvancement: 0 },
      ],
    } as unknown as SeanceExercice;

    /* La deuxième ligne cochée ne rattrape PAS la première qui ne l'est pas :
       c'est ce que faisait `slice(0, 1)`, et c'est mesuré sur la vraie route. */
    assert.deepEqual(avancementDe([chrono]), { faites: 0, total: 1 });
  });
});
