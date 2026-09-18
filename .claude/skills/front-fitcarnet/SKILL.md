---
name: front-fitcarnet
description: Le front de fitcarnet — modules de calcul de référence dont on ne recopie jamais les formules, tests node:test, typage, conventions d'écran. À charger avant de toucher à front/src ou front/app. Complète les skills du plugin expo, qui couvrent le routage et l'UI native mais ignorent le métier du projet.
---

# Travailler le front de fitcarnet

Expo SDK 54, React Native web + Android, TypeScript strict. Le plugin `expo`
couvre le routage (`expo:expo-router`) et la récupération de données
(`expo:expo-data-fetching`). **Ce document couvre ce qu'il ne peut pas savoir :
le métier.**

## Les commandes, dans cet ordre

```bash
cd front && npm test          # tsc --noEmit + 646 tests, puis 33 de rendu (18 septembre 2026)
cd front && npm run verif     # typage seul, plus rapide
cd front && npm run build:web # régénère front/dist/ (versionné, servi par Caddy)
```

**`npm test` exige Node 22.** Sous Node 20, `node --test` ne développe pas les
globs et répond `Could not find '…/dist-tests/**/*.test.js'` — un message qui ne
parle jamais de version. Vérifié le 8 septembre 2026 : `nvm install 22 && nvm alias default 22`,
et un terminal déjà ouvert garde l'ancien `PATH`.

Un hook `PostToolUse` lance `npm run verif` après chaque écriture dans
`front/src` ou `front/app` : le typage casse **immédiatement**, pas au commit.

## Les modules de référence, et l'interdiction

Ces modules **font foi** et sont les seuls à porter leur formule :

| Domaine | Module |
|---|---|
| 1RM, volume, paliers | `src/calcul/performance.ts` |
| Macros, Atwater, catégories | `src/calcul/nutrition.ts` |
| Cru/cuit, fournées, habitudes | `src/calcul/cuisson.ts` |
| Composition de repas | `src/solveur/` |
| Suppression des accents | `src/calcul/texte.ts` |
| Lecture d'un nombre saisi (virgule, vide ≠ zéro) | `src/calcul/saisieNombre.ts` — et `ChampNombre` pour un champ qui garde le texte tapé |

**Aucune formule métier recopiée.** Un écran qui recalcule un 1RM importe
`performance.ts`. Trois copies d'Epley aux bornes divergentes ont produit un
« record » de 79,96 kg que la formule elle-même déclare invalide.

**La somme d'Atwater n'a qu'une écriture, et c'est désormais vérifié.** Jusqu'au
17 septembre 2026, « `nutrition.ts` seul porte la formule » était faux : la
somme « coefficient × grammes » s'écrivait quatre fois en entier
(`nutrition.ts`, `kcalDesMacros` du solveur, `kcalAtwater` de `plausibilite.ts`,
`planCoach.ts`), et une cinquième fois pour les seules fibres dans
`carteRepas.tsx` — celle-là trouvée par le test de garde ; coefficients importés,
mais fibres inconnues traitées à la façon de chacun.
Elle vit maintenant dans **`kcalDesGrammes`** (`src/calcul/nutrition.ts:45-51`) ;
`controler`, `kcalDesMacros`, `kcalAtwater`, `planCoach.ts` et `carteRepas.tsx`
l'appellent. **`src/calcul/formuleUnique.test.ts` refuse toute multiplication
par un coefficient `KCAL_…` ailleurs**, dans `src/` comme dans `app/`,
commentaires exclus — avec un témoin qui vérifie que le motif reconnaît bien la
formule de référence.

**L'exception à ne pas « factoriser »** : `cleDHabitude` utilise volontairement une
table de correspondance manuelle plutôt que `normalize('NFD')`, parce que Hermes
ne l'implémente pas partout.

**`src/calcul/texte.ts` porte `sansAccent` depuis le 15 septembre 2026** (D4).
Les quatre copies sont fusionnées. Elles utilisaient toutes `normalize('NFD')` :
quatre `TypeError` en puissance, Hermes ne l'implémentant pas partout. Le module
s'aligne sur la **table manuelle**, jamais sur `normalize` — et son test retire
`String.prototype.normalize` du prototype pour qu'une rechute tombe ici.

Les deux restes signalés le 15 au matin **sont réglés** : la table
`SANS_ACCENT` ne vit plus que dans `texte.ts` (`habitudesCuisson.ts` l'importe,
et `cuisson.ts` ne fait que réexporter `habitudesCuisson`), et la sixième copie
de `garanties.test.ts` a été remplacée par un import. Vérifié : une seule
définition dans tout le front.

## `noUncheckedIndexedAccess` est à `true` depuis le 18 septembre 2026

Constat M13 fermé. `tableau[i]` se lit `T | undefined`, partout dans `front/`.
Les 47 erreurs révélées ce jour-là ont été corrigées **sans un seul `!` ni `as`
ajouté**, et c'est la règle à tenir : une assertion remet le `undefined`
exactement où il était, avec un mensonge en plus.

Ce qu'il faut faire à la place, dans l'ordre où ça se pose :

| La case peut manquer… | …et alors |
|---|---|
| dans un calcul (`src/solveur/algebre.ts`) | **on lève**. `ligneDe` / `caseDe` relisent l'invariant « la matrice est carrée » à chaque accès. Un `?? 0` dans une élimination de Gauss ne fait pas échouer le calcul, il le fait **réussir sur un autre système** — et rend des grammes à peser |
| à l'affichage (`disqueRM.tsx`, `etatRequetes.ts`) | on **refuse de nommer** : le tiret cadratin, ou `SANS_MESSAGE`. Jamais un « 0 % » qui désigne une charge jamais calculée |
| parce que le type est trop lâche (`Record<string, number>`) | on **resserre le type** : `Record<keyof Variables, number>` n'a plus de case manquante, et attrape en prime une clé mal orthographiée |
| dans un test | on l'**affirme** : `assert.ok(x !== undefined, 'ce qui manque')`, jamais `x!` |

`tsconfig.tests.json` ne porte pas le drapeau et n'a pas à le porter : il ne sert
qu'à émettre, et `npm test` lance `tsc --noEmit` (donc `tsconfig.json`, qui
couvre `src/` **et** `app/`) avant lui.

## Les tests

`node:test`, compilés par `tsconfig.tests.json` vers `dist-tests/`. Son `include`
est **un motif** — `src/**/*.test.ts` — depuis qu'une liste écrite à la main a
laissé `performance.ts` sans aucun test pendant des mois, alors que trois constats
de l'audit y vivaient. Ne jamais revenir à une liste.

**Conséquence à connaître** : le motif ne couvre que `src/`. Un test posé dans
`app/` ne sera jamais exécuté, sans le moindre signal. Le code testable vit dans
`src/`, les écrans dans `app/` — c'est aussi pour cela que le découpage de
`repas.tsx` (2 397 lignes au dernier commit d'avant, 2 316 le jour de l'audit ;
650 après, fait au lot 6 ; 655 le 17 septembre 2026) consiste à **extraire vers
`src/`**.

Convention du projet : un module pur et son `.test.ts` en regard.

## L'alias `@/` ne survit pas à la compilation des tests

**Un module de `src/` qui importe une VALEUR doit le faire en chemin relatif.**
`tsc -p tsconfig.tests.json` ne réécrit pas `@/` : le `require('@/calcul/texte')`
part tel quel dans `dist-tests/` et casse en `MODULE_NOT_FOUND` — **au moment du
`node --test`, pas au typage**. `npm run verif` passe, `npm test` tombe.

```ts
import type { Seance } from '@/api/types';   // OK : un import type est EFFACÉ
import { idDe } from '../api/types';         // OK : une valeur, en relatif
import { idDe } from '@/api/types';          // CASSE dans dist-tests/
```

Les fichiers de `app/` ne sont jamais compilés vers `dist-tests/` : l'alias y est
sans danger. Le piège ne concerne que `src/`.

Relevé le 15 septembre 2026, après que deux agents y sont tombés le même jour.

## Les composants se testent, depuis le 15 septembre 2026

**Deux passes, et deux suffixes.** `npm test` lance :

```bash
node --test "dist-tests/**/*.test.js"                    # 646 tests, SANS DOM
node --import ./dist-tests/tests/environnement.js \
     --test "dist-tests/**/*.test-rendu.js"              # 33 tests de rendu
```

Un test de calcul s'appelle `*.test.ts`. **Un test de composant s'appelle
`*.test-rendu.tsx`** — le suffixe n'est pas cosmétique, c'est lui qui décide de
la passe, et le motif `*.test.js` ne peut pas l'attraper.

**Pourquoi deux passes, et pas un DOM pour tout le monde.** Essayé, mesuré :
avec un DOM global, `npm test` ne rendait plus la main. TanStack Query lit
`typeof window` pour savoir s'il tourne sur un serveur ; avec un DOM il bascule
en mode navigateur, `gcTime` passe d'`Infinity` à cinq minutes, et
`persistance.test.ts` laissait un `Timeout` de cinq minutes derrière lui — tous
témoins verts. **Un environnement de test qui change le comportement du code
testé n'en est pas un.**

Ce qui a été installé, et ce qui a été écarté :

| | |
|---|---|
| `jsdom` + `global-jsdom` | `happy-dom` remplace `setTimeout` par le sien et laisse un handle ouvert. Poser les globales à la main meurt sur `ShadowRoot is not defined`. jsdom **29**, pas 30 : la 30 exige Node ≥ 22.22 |
| `@testing-library/react` | la version **DOM**. Celle pour React Native exige Jest — preset, matchers, environnement |
| ~~`react-test-renderer`~~ | **déprécié en React 19**, et ne résout pas le vrai blocage |
| ~~Jest~~ | non nécessaire. Vérifié, pas supposé |

`src/tests/environnement.ts` fait le reste : jsdom, puis `module.registerHooks`
(API Node 22.15+) pour aiguiller `react-native` → `react-native-web` et résoudre
`@/`. **On teste le rendu web** — celui que Caddy sert déjà, pas une cible
imaginaire.

## Un garde-fou perdu en chemin, et il faut le savoir

Activer `"jsx"` dans `tsconfig.tests.json` a **supprimé une protection** :
jusqu'ici, un module de `src/` atteint par un test ne pouvait RIEN importer d'un
`.tsx`, pas même un type (TS6142). C'est ce qui forçait la bonne règle — **un
type partagé entre un module pur et un composant vit dans un `.ts`**.

La règle reste juste, mais rien ne la fait plus respecter : un `.test.ts` peut
désormais importer une valeur depuis un `.tsx`, et l'erreur n'apparaîtra plus au
typage — elle apparaîtra à l'exécution, en erreur de syntaxe Flow au fond de
`react-native`, où elle est bien plus difficile à lire.

**Parade non faite, à décider** : un second `tsconfig` dédié aux tests de rendu
rétablirait le garde-fou pour les autres. Une quinzaine de minutes.

## Ce qui reste hors de portée

Presque tout Expo est publié **non transpilé** (TS ou JSX brut, c'est le travail
de Metro) : `expo-router`, `expo-secure-store`, `expo-updates`,
`expo-notifications`, `expo-font`, `react-native-gesture-handler`,
`react-native-safe-area-context`, `react-native-svg`… Chacun demande une doublure.
Passent tels quels : `@tanstack/react-query` et `async-storage`.

Conséquence pratique : **tester un écran de `app/` coûte son lot de doublures**,
et `rootDir: "src"` interdit encore de les compiler. Le vrai levier reste celui du
lot 6 — **descendre la logique dans `src/`**. Le portier de `_layout.tsx` en est
l'exemple : trois lignes de décision noyées dans sept dépendances natives.

## Les règles qui produisent des chiffres faux si on les oublie

Voir la skill **`nutrition-fitcarnet`** pour le détail. En deux lignes : les fibres
comptent **2 kcal/g** et séparément des glucides (`KCAL_FIBRES`), et les valeurs
décrivent le produit **tel qu'on le pèse** — le riz blanc sec vaut
350 kcal/100 g, contre 155 une fois cuit (CIQUAL 2025, colonne « Règlement UE
n° 1169/2011 »).

## Vide ≠ zéro

Un champ vide veut dire « je ne sais pas ». Un zéro veut dire « zéro ». La saisie
**garde le texte tapé** par l'utilisateur ; « sans cuisson » est un choix, pas une
absence de réponse. Ne jamais substituer une valeur par défaut silencieuse à une
donnée manquante.

## Un chiffre faux est pire qu'un refus de répondre

Ce qui s'affiche sera pesé et mangé. En cas de doute sur un calcul, afficher
l'incertitude ou refuser — jamais une valeur plausible non vérifiée. Toute
déviation par rapport à la cible doit être **expliquée à l'écran**.

## `front/dist/` est versionné, volontairement

Exception explicite dans `.gitignore` : c'est le build web servi par Caddy. Le
régénérer avec `npm run build:web`, **jamais** le copier d'ailleurs.

## Avant de valider

- [ ] `npm test` collé dans la réponse, 0 échec
- [ ] Aucune formule recopiée : l'import vient du module de référence
- [ ] Le nouveau test est sous `src/`, en regard de son module
- [ ] Un champ vide reste vide ; aucune valeur par défaut silencieuse
- [ ] Si `front/dist/` devait changer, il a été **régénéré**
