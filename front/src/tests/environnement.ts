/**
 * Environnement des tests de composants — préchargé par `--import`, avant tout le reste.
 *
 * POURQUOI CE FICHIER EXISTE.
 *
 * Les tests du projet tournent sous `node --test`, pas sous Jest. Un composant
 * React Native n'est donc pas rendable tel quel : trois choses manquent à Node,
 * et ce module les pose, une fois, pour chaque processus de test.
 *
 * 1. UN DOM. `react-native-web` rend du HTML et `react-dom` a besoin d'un
 *    `document`. `global-jsdom` en installe un, avec l'ENSEMBLE des globales du
 *    navigateur. Les poser à la main était la première tentative : elle est
 *    morte sur `ShadowRoot is not defined`, lu au chargement du `StyleSheet` de
 *    react-native-web. Une liste écrite à la main de globales de navigateur est
 *    toujours incomplète.
 *
 * 2. `react-native` → `react-native-web`. Le paquet `react-native` est publié
 *    en source Flow : `require('react-native')` casse dans Node sur une erreur
 *    de syntaxe. C'est Metro qui le transpile en temps normal, et il n'y a pas
 *    de Metro ici. Le seul rendu possible est donc le rendu WEB — ce que
 *    l'application sert déjà derrière Caddy, pas une cible imaginaire. Ce qui
 *    dépend du natif (`Platform.OS === 'android'`, les modules Expo) reste hors
 *    de portée : voir la liste en bas de ce fichier.
 *
 * 3. L'ALIAS `@/`. `tsc -p tsconfig.tests.json` ne réécrit pas les chemins :
 *    `require('@/theme')` part tel quel dans `dist-tests/` et casse en
 *    `MODULE_NOT_FOUND` à l'exécution. Les modules purs contournaient jusqu'ici
 *    en important en relatif ; un composant, lui, ne le peut pas — `base.tsx`
 *    et `editeurAliment.tsx` importent `@/theme` et `@/calcul/nutrition`, et ce
 *    n'est pas au test de faire changer le code de production.
 *
 * `module.registerHooks` (Node 22.15+) est l'API officielle pour ces deux
 * réécritures. Pas de rustine sur `Module._resolveFilename`.
 *
 * POURQUOI UN PRÉCHARGEMENT ET PAS UN IMPORT DANS CHAQUE TEST.
 *
 * Parce que l'ordre compterait. `tsc` émet les `require` dans l'ordre du
 * fichier : un `import './environnement'` posé en première ligne se ferait
 * remonter par le premier tri d'imports venu, et l'erreur serait une erreur de
 * syntaxe Flow au fond de `react-native` — à mille lieues de sa cause. Un
 * `--import` ne se trompe jamais d'ordre.
 *
 * ET POURQUOI SEULEMENT POUR LES `*.test-rendu.tsx`.
 *
 * Parce qu'un `window` n'est pas neutre. `npm test` lance DEUX fois
 * `node --test` : les tests purs sans ce préchargement, les tests de rendu
 * avec. Donner un DOM à tout le monde a été essayé, et mesuré le 15 septembre
 * 2026 : TanStack Query lit `typeof window` pour décider s'il tourne sur un
 * serveur, et bascule alors son `gcTime` d'`Infinity` à cinq minutes.
 * `api/persistance.test.ts` passait toujours — mais laissait derrière lui un
 * `Timeout` de cinq minutes, et `npm test` ne rendait plus la main. Un
 * environnement de test qui change le comportement du code testé n'en est pas
 * un.
 *
 * `happy-dom` a été essayé avant jsdom et écarté pour une raison voisine : il
 * remplace `setTimeout` par le sien et garde lui aussi une ressource ouverte.
 * `global-jsdom` ne touche ni aux minuteurs de Node ni à sa boucle.
 *
 * ---------------------------------------------------------------------------
 * CE QUI RESTE HORS DE PORTÉE, ET IL FAUT LE SAVOIR AVANT D'ESSAYER :
 *   - les écrans de `app/` : `rootDir` vaut `src`, ils ne sont pas compilés ici ;
 *   - `expo-router`, `expo-secure-store`, `expo-notifications` et les autres
 *     modules natifs : à doubler explicitement, comme le fait `client.test.ts` ;
 *   - tout ce qui ne se joue que sur Android : c'est le rendu web qu'on teste ;
 *   - `onLayout`, faute de `ResizeObserver` dans jsdom. react-native-web le dit
 *     lui-même, une fois par processus. On ne pose PAS de doublure vide : elle
 *     ferait croire à une mesure alors qu'aucune n'arriverait jamais, et un
 *     test qui dépend d'`onLayout` doit tomber, pas passer par accident.
 * ---------------------------------------------------------------------------
 *
 * Posé le 15 septembre 2026, pour rendre testables les composants et les hooks
 * (lot 7 de l'audit, et les deux volets restants d'É14).
 */
import globalJsdom from 'global-jsdom';
import { registerHooks } from 'node:module';
import { join } from 'node:path';

globalJsdom(undefined, { url: 'http://localhost/', pretendToBeVisual: true });

/* React refuse `act()` sans ce drapeau, et prévient à chaque rendu sans lui. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

/* `dist-tests/`, c'est-à-dire ce que `src/` devient une fois compilé. */
const RACINE = join(__dirname, '..');

registerHooks({
  resolve(specificateur, contexte, suivant) {
    if (specificateur === 'react-native') {
      return suivant('react-native-web', contexte);
    }

    if (specificateur.startsWith('@/')) {
      return suivant(join(RACINE, specificateur.slice(2)), contexte);
    }

    return suivant(specificateur, contexte);
  },
});
