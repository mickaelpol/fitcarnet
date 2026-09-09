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
cd front && npm test          # tsc --noEmit + compilation des tests + 362 tests node:test
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

**Aucune formule métier recopiée.** Un écran qui recalcule un 1RM importe
`performance.ts`. Trois copies d'Epley aux bornes divergentes ont produit un
« record » de 79,96 kg que la formule elle-même déclare invalide.

**L'exception à ne pas « factoriser »** : `cleDHabitude` utilise volontairement une
table de correspondance manuelle plutôt que `normalize('NFD')`, parce que Hermes
ne l'implémente pas partout.

## Les tests

`node:test`, compilés par `tsconfig.tests.json` vers `dist-tests/`. Son `include`
est **un motif** — `src/**/*.test.ts` — depuis qu'une liste écrite à la main a
laissé `performance.ts` sans aucun test pendant des mois, alors que trois constats
de l'audit y vivaient. Ne jamais revenir à une liste.

**Conséquence à connaître** : le motif ne couvre que `src/`. Un test posé dans
`app/` ne sera jamais exécuté, sans le moindre signal. Le code testable vit dans
`src/`, les écrans dans `app/` — c'est aussi pour cela que le découpage de
`repas.tsx` (2 316 lignes) consiste à **extraire vers `src/`**.

Convention du projet : un module pur et son `.test.ts` en regard.

## Les règles qui produisent des chiffres faux si on les oublie

Voir la skill **`nutrition-fitcarnet`** pour le détail. En deux lignes : les fibres
comptent **2 kcal/g** et séparément des glucides (`KCAL_FIBRES`), et les valeurs
décrivent le produit **tel qu'on le pèse** — le riz sec vaut 350 kcal/100 g.

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
