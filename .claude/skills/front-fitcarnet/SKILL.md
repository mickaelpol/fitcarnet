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
cd front && npm test          # tsc --noEmit + 647 tests, puis 33 de rendu (18 septembre 2026)
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

**CE QUI N'EST PLUS DANS LE FRONT — refonte des 20 et 21 septembre 2026.** Ces
règles-là ont un module de référence **sur le serveur**, et l'écran se contente
d'afficher ce qu'il reçoit. Cette page a listé `src/calcul/motDePasse.ts` et
`src/calcul/plausibilite.ts` comme modules de référence **après leur
suppression** : c'est le défaut `texte.ts` à l'identique, une ligne qui annonce
un fichier absent.

| Domaine | Où la règle vit maintenant | Ce que l'écran appelle |
|---|---|---|
| Force d'un mot de passe, et ce qui lui manque | `api/src/Service/MotDePasse.php` | `POST /api/verification/mot-de-passe` (publique) |
| Cohérence d'un aliment, ses 14 anomalies, la couleur du bandeau | `api/src/Service/VerdictAliment.php` et `AnomaliesAliment.php` | `POST /api/verification/aliment` |
| Rendement cru/cuit | la même route | idem |
| « Un chrono ne compte que pour une série » | `api/src/Entity/SeanceExercice.php` | rien : le serveur envoie un **poids** par série, l'écran additionne |

**NE JAMAIS RÉÉCRIRE UN CHIFFRE DE CES RÈGLES DANS UN ÉCRAN** — ni « 12
caractères », ni un seuil de kcal. C'est ce qui a laissé l'écran d'invitation
annoncer une règle que le serveur n'appliquait plus. Le serveur renvoie
**la phrase**, pas seulement les clés : l'afficher telle quelle.

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

## `expo doctor` : une exclusion assumée, et une seule

`package.json` porte :

```json
"expo": { "install": { "exclude": ["@react-navigation/native-stack"] } }
```

**Ce n'est pas un contournement, c'est une fausse alerte mesurée** (19 septembre
2026). `expo doctor` comparait la version installée — **7.19.2** — à la version
*recommandée* par le SDK 54, `^7.3.16`, et criait « minor version mismatch ». Or
`^7.3.16` signifie « ≥ 7.3.16 et < 8.0.0 » : **7.19.2 est dans la plage**. On est
en avance, pas en retard, et `npx expo install --fix` aurait **rétrogradé** la
déclaration.

**Ne pas ajouter d'autre paquet à cette liste sans la même démonstration.** Une
exclusion rend un contrôle muet ; celle-ci est justifiée parce que le contrôle
avait tort. Le jour où `native-stack` passera en 8.x, il faudra la retirer et
regarder pour de vrai.

Le reste du diagnostic se prend, lui : le 19 septembre, trois patchs de retard
dont **`expo-updates` 29.0.20, un correctif de sécurité** — un manifeste piégé
pouvait « écrire et supprimer des fichiers hors du dossier des mises à jour ».
Ce projet utilise l'OTA (`app.json` : `updates.enabled`, `checkAutomatically:
ON_LOAD` ; `publier-android.sh:244` : `eas update --branch production`), donc ce
composant tourne à chaque lancement. **Lire le changelog avant de décider qu'un
patch est cosmétique** : `expo-constants` ne changeait rien, `expo-updates`
fermait un trou.

## Un hook après un `return`, et l'écran devient blanc

**`tsc` compile, les 680 tests passent, et l'écran ne s'affiche plus.** Mesuré le
19 septembre 2026 sur `app/invitation/[jeton].tsx` : deux `useRef` ajoutés pour
faire passer le focus d'un champ au suivant, posés **après** les retours
anticipés de l'écran (`if (invitation.isLoading) return …`, lien expiré, compte
créé). React exige que tous les hooks soient appelés à chaque rendu, dans le même
ordre ; un hook qu'on n'atteint que sur un chemin fait tomber le rendu de ce
chemin-là.

Ce qui rend ce défaut méchant, c'est **quel** chemin tombe :

| Lien | Ce qui s'affiche |
|---|---|
| expiré ou déjà utilisé | l'écran « CE LIEN N'EST PLUS VALABLE », parfaitement |
| **valable** | **rien** — page blanche, aucun champ |

Autrement dit : tout marche, sauf le cas pour lequel l'écran existe. Les
captures d'un cas d'erreur rassurent, la suite de tests reste verte — `tsc` ne
connaît pas la règle des hooks, et aucun test de rendu ne montait cet écran.

**Ce qui l'a attrapé ce jour-là** : un script Playwright qui ouvre l'URL avec un
**vrai** jeton et attend un `input`. Rien d'autre ne pouvait le voir. Et ce qui
a donné la réponse en une ligne, c'est d'écouter `pageerror` — sans quoi on ne
lit qu'un `TimeoutError` sur `waitForSelector`, qui ne dit pas pourquoi.

**La règle : tous les hooks en haut, avant le premier `return`.** Sans
exception, et y compris quand le hook ne sert qu'au chemin du bas.

### Et depuis, c'est la machine qui le refuse

`front/eslint.config.mjs`, branché dans `npm test` et dans `npm run verif`.
**Une seule règle activée**, `react-hooks/rules-of-hooks`, et c'est délibéré :
le dépôt portait déjà **six** directives `eslint-disable` alors qu'aucun linter
n'y avait jamais tourné — du code écrit comme si quelqu'un regardait. Ouvrir
`eslint-config-expo` en entier rendrait des centaines d'avertissements, et un
garde-fou qui crie finit désactivé.

Les six directives orphelines ont été **remplacées par leur raison, en
français** : elles nommaient des règles qu'aucun greffon ne définissait, donc
elles ne protégeaient rien et faisaient échouer le lint. Ce qu'elles portaient
de vrai — « ce `require` est voulu, Metro résout les ressources audio à la
construction » — est maintenant un commentaire que personne ne peut prendre pour
une protection.

**La règle a été éprouvée AVANT d'être posée**, en redescendant les deux
`useRef` sous le premier `return` :

```
67:27  error  React Hook "useRef" is called conditionally…  react-hooks/rules-of-hooks
68:29  error  React Hook "useRef" is called conditionally…  react-hooks/rules-of-hooks
```

Sur l'état réel des 188 fichiers : **zéro**. Toute sortie de ce linter est donc
un vrai défaut, jamais du bruit à filtrer. Le jour où l'on voudra
`exhaustive-deps`, ce sera une décision séparée, avec le temps de traiter ce
qu'elle rendra.

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
node --test "dist-tests/**/*.test.js"                    # 647 tests, SANS DOM
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
