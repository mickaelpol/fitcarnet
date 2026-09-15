import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * UN ÉCRAN QUI NOMME SES EXERCICES DOIT REFUSER D'AFFICHER SANS LE CATALOGUE.
 *
 * LA PANNE, LE 15 SEPTEMBRE 2026. `app/seance/[id].tsx` gardait
 * `seanceApi.isError` et pas `exercices.isError`. Une requête de catalogue en
 * échec pendant que la séance charge — un cas de tous les jours, un tunnel de
 * métro suffit — donnait une `Map parId` VIDE. Chaque bloc perdait alors son
 * nom (`?? 'cet exercice'`) et retombait sur le mode « charge »
 * (`?? 'charge'`, dans `calcul/blocSeance.ts`). La séance s'affichait donc
 * FAUSSE au lieu de ne pas s'afficher : des exercices sans nom, tous en mode
 * charge, un décompte de séries calculé sur un mode inventé — et pas un mot à
 * l'écran pour dire qu'il y avait une panne. Règle 7 : un chiffre faux est
 * pire qu'un refus de répondre.
 *
 * Le repli `?? 'charge'` de `blocSeance.ts` reste JUSTE et son test aussi :
 * au niveau du module, un exercice absent du catalogue doit bien retomber
 * quelque part. Ce qui était faux, c'est que l'ÉCRAN laisse ce repli arriver
 * jusqu'aux yeux de l'utilisateur.
 *
 * POURQUOI CE TEST EST ICI, ET PAS À CÔTÉ DE L'ÉCRAN. Un test posé dans `app/`
 * n'est jamais exécuté : `tsconfig.tests.json` ne compile que `src/`, et
 * `rootDir: "src"` interdit même d'y atteindre un écran. La technique est
 * celle de `src/theme/charte.test.ts` — lire les sources et vérifier une règle
 * que ni le typage ni un test unitaire ne peuvent atteindre.
 *
 * CE QU'IL PROUVE ET CE QU'IL NE PROUVE PAS. Il prouve que la garde est
 * ÉCRITE, pas qu'elle est bien placée. C'est peu, et c'est déjà ce qui
 * manquait : la garde existait mot pour mot dans `app/modele/[id].tsx`, écran
 * jumeau du même catalogue, et personne ne s'était aperçu qu'elle manquait
 * chez le voisin. Motif n° 1 de la revue de code — « le jumeau oublié ».
 *
 * LA LISTE DES ÉCRANS N'EST PAS ÉCRITE À LA MAIN, et c'est le seul moyen que
 * l'écran suivant soit couvert lui aussi (motif n° 8). Le critère est
 * `parId` : construire cette table, c'est déclarer qu'on va traduire des
 * identifiants d'exercices en NOMS affichés. `app/admin-fusion.tsx` n'en
 * construit pas — sans catalogue il montre un sélecteur vide, ce qui est
 * pauvre mais pas faux, et ce n'est pas la même faute.
 */

/** Les `.tsx` de `app/`, récursivement. */
function ecrans(chemin: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(chemin)) {
    if (entree === 'node_modules' || entree.startsWith('.')) continue;
    const complet = join(chemin, entree);
    if (statSync(complet).isDirectory()) trouves.push(...ecrans(complet));
    else if (entree.endsWith('.tsx')) trouves.push(complet.replace(/\\/g, '/'));
  }

  return trouves;
}

/**
 * LE CODE SEUL, SANS LES COMMENTAIRES — et ce n'est pas de la coquetterie.
 *
 * Ce test cherchait `source.includes('exercices.isError')` dans le fichier
 * BRUT. Or ce dépôt cite ses identifiants en toutes lettres dans sa prose :
 * l'en-tête ci-dessus le fait deux fois. Un futur écran qui *mentionne* la
 * garde dans un commentaire — ou qui la laisse commentée en la désactivant —
 * passait au vert sans l'avoir. Le test ne prouvait donc même pas que la
 * garde était du code. Relevé par la revue le 15 septembre 2026.
 */
const sansCommentaires = (source: string): string => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

const TOUS = ecrans('app').map((f) => ({
  f, source: sansCommentaires(readFileSync(f, 'utf8')),
}));

/** Ceux qui traduisent un identifiant d'exercice en nom affiché. */
const NOMMENT_LEURS_EXERCICES = TOUS.filter(
  ({ source }) => source.includes('useExercices()') && source.includes('parId'),
);

describe('le catalogue en panne ne doit jamais donner une séance fausse', () => {
  it('trouve bien les écrans concernés', () => {
    /* Sans ce témoin, une arborescence déplacée rendrait les suivants verts
       en ne parcourant plus rien — le « test qui ne peut pas échouer ». */
    assert.ok(TOUS.length > 10, `${TOUS.length} écrans parcourus, c'est trop peu`);
    assert.ok(NOMMENT_LEURS_EXERCICES.length >= 2,
      `${NOMMENT_LEURS_EXERCICES.length} écran(s) indexent le catalogue par id, c'est trop peu`);
  });

  it('chacun garde exercices.isError', () => {
    const sansGarde = NOMMENT_LEURS_EXERCICES
      .filter(({ source }) => !source.includes('exercices.isError'))
      .map(({ f }) => f);

    assert.deepEqual(sansGarde, [],
      'Ces écrans nomment leurs exercices depuis le catalogue mais n\'en gardent '
      + 'pas la panne : sans catalogue ils affichent une séance FAUSSE — blocs '
      + 'sans nom, tous en mode « charge » — au lieu de dire qu\'il y a une '
      + 'panne. Copier la garde d\'app/modele/[id].tsx :\n'
      + sansGarde.join('\n'));
  });

  it('chacun garde aussi exercices.isLoading', () => {
    /* L'ERREUR N'EST QUE LA MOITIÉ DU PROBLÈME. Entre le premier rendu et la
       réponse du catalogue, `parId` est vide sans qu'aucune erreur ne soit
       levée : c'est `isLoading` qui empêche la séance fausse PENDANT la
       requête, et `isError` seulement une fois la panne établie. Les deux
       écrans actuels ont les deux gardes ; ce témoin manquait, donc le
       prochain écran pouvait naître avec une seule. Relevé par la revue le
       15 septembre 2026. */
    const sansGarde = NOMMENT_LEURS_EXERCICES
      .filter(({ source }) => !source.includes('exercices.isLoading'))
      .map(({ f }) => f);

    assert.deepEqual(sansGarde, [],
      'Ces écrans attendent le catalogue sans le dire : le temps de la requête, '
      + '`parId` est vide et la séance s\'affiche avec des blocs sans nom, tous '
      + 'en mode « charge ». Copier la garde d\'app/modele/[id].tsx :\n'
      + sansGarde.join('\n'));
  });
});
