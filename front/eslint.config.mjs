/**
 * UNE SEULE RÈGLE, ET ELLE A UNE DATE.
 *
 * Le 19 septembre 2026, `app/invitation/[jeton].tsx` a cessé d'afficher quoi que
 * ce soit sur un lien VALABLE : deux `useRef` posés après les retours anticipés
 * du composant, donc des hooks appelés conditionnellement. Le lien *expiré*,
 * lui, s'affichait parfaitement.
 *
 * Ce jour-là : `tsc --noEmit` compilait, 680 tests étaient verts, et l'écran
 * d'entrée de tout nouvel arrivant était mort. Il a fallu un navigateur ouvrant
 * l'URL avec un vrai jeton pour le voir. TypeScript ne connaît pas la règle des
 * hooks, et aucun test de rendu ne monte les écrans de `app/` —
 * `tsconfig.tests.json` ne couvre que `src/`.
 *
 * POURQUOI UNE SEULE RÈGLE, ET PAS `eslint-config-expo`. Le dépôt portait déjà
 * six directives `eslint-disable` alors qu'aucun linter n'y avait jamais tourné
 * — du code écrit comme si quelqu'un regardait. Ouvrir tout d'un coup rendrait
 * des centaines d'avertissements, et un garde-fou qui crie finit désactivé.
 * `exhaustive-deps` et les règles TypeScript d'Expo s'ouvriront quand on aura
 * décidé de les traiter, pas avant.
 *
 * `rules-of-hooks`, elle, ne rend RIEN aujourd'hui : mesuré sur les 188
 * fichiers de `app/` et `src/`. Toute sortie est donc un vrai défaut.
 */
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**', 'node_modules/**', '.expo/**', 'android/**', 'ios/**'] },
  {
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    languageOptions: { parser: tseslint.parser },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error' },
  },
];
