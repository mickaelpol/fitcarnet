---
name: nutrition-fitcarnet
description: Les conventions nutritionnelles de fitcarnet — fibres à 2 kcal/g comptées à part, valeurs décrivant le produit tel qu'on le pèse, rendement cru/cuit dérivé et non stocké. À charger avant de toucher à un calcul de macros, un import d'aliments, une écriture dans Grocy, ou tout ce qui affiche un chiffre à l'utilisateur.
---

# Les conventions nutritionnelles

**C'est une application de nutrition : ce qui est affiché sera pesé et mangé.**
Les quatre règles ci-dessous ont chacune été enfreinte au moins une fois, et
l'audit de septembre 2026 en a mesuré le coût.

## 1. Convention EUROPÉENNE des fibres

Les fibres valent **2 kcal/g** et sont comptées **séparément** des glucides.
`KCAL_FIBRES` dans `front/src/calcul/nutrition.ts` fait foi.

**Ne jamais utiliser l'Atwater américain** (`4P + 4G + 9L`, fibres ignorées) : il
déclare incohérents des aliments riches en fibres dont les valeurs sont pourtant
justes. Deux constats de l'audit viennent de là — `plausibilite.ts` appliquait la
formule américaine, et `cibles_incoherentes` comptait les fibres à 4 kcal/g.

~~Reste ouvert (M1 et M4 du lot 2) : deux formules Atwater encore recopiées.~~
**Corrigé le 15 septembre 2026**, et cette phrase était périmée depuis — relevée
le 16 en écrivant les fiches de fonctionnalité. Les deux appellent désormais
`kcalDesMacros` (`front/src/solveur/solveur.ts:31`), qui tient ses coefficients
de `nutrition.ts` ; `app/objectifs.tsx:87` l'importe. **Ne pas aller « corriger »
un défaut qui n'existe plus.**

## 2. Les valeurs décrivent le produit TEL QU'ON LE PÈSE

Le riz blanc sec vaut **350 kcal/100 g**, pas 155 — 155, c'est le même riz une
fois cuit, gonflé d'eau (rendement **2,26**). Un légume se pèse **cru**.

> **Les chiffres viennent de `Table_Ciqual_2025.xlsx`**, la table ANSES, à la
> racine du dépôt. **Deux colonnes d'énergie y cohabitent** : prendre « Énergie,
> Règlement UE n° 1169/2011 », qui compte les fibres à 2 kcal/g comme la règle 1
> de cette skill. « N × facteur Jones » donne 348 au même riz — un écart muet de
> 2 kcal qui suffit à faire croire à une faute de saisie.
>
> Valeurs utiles (colonne UE) : riz blanc cru **350** · riz blanc cuit **155** ·
> riz complet cru **350** · riz complet cuit **187** · riz thaï ou basmati cru
> **351** · riz basmati cuit **148** · riz sauvage cuit **102**.
>
> *Deux erreurs corrigées le 16 septembre 2026.* « Pas 130 » : 130 est la valeur
> **USDA** du riz blanc long cuit, qui circule partout en français sans sa
> source. Et « basmati » : le « Riz basmati » du catalogue est apparié à l'entrée
> **« Riz blanc, cru »** (`ciqual_vers_grocy.py:294`) — c'est de 350 / 155 que
> vient son 2,26, pas des valeurs du basmati, qui donneraient 2,37.

Le rendement cru/cuit se **dérive des pesées à la lecture** ; il ne se stocke pas
dans les valeurs nutritionnelles. Un aliment dont on a stocké les valeurs « cuit »
est un aliment dont plus personne ne sait ce qu'il décrit.

Cette règle vaut aussi pour **les scripts d'import** et pour ce qu'on écrit dans
**Grocy**.

## 3. Ta balance passe avant CIQUAL

Une pesée réelle prime sur la table de référence. C'est ce que prouvent
`RendementMesureTest` côté API et `plausibilite.ts` côté front : la provenance de
la valeur remonte jusqu'à l'écran, pour que l'utilisateur sache d'où vient le
chiffre qu'on lui montre.

## 4. Vide ≠ zéro

Un champ vide veut dire « je ne sais pas ». Un zéro veut dire « zéro ». « Sans
cuisson » est un choix, pas une absence de réponse. Aucune valeur par défaut
silencieuse ne remplace une donnée manquante — elle serait indiscernable d'une
mesure.

## 5. Un chiffre faux est pire qu'un refus de répondre

En cas de doute sur un calcul : afficher l'incertitude, ou refuser. **Jamais une
valeur plausible non vérifiée.** Toute déviation par rapport à la cible doit être
expliquée à l'écran plutôt que lissée.

## Où vivent les formules

`front/src/calcul/nutrition.ts` (macros, Atwater, catégories) et
`front/src/calcul/cuisson.ts` (cru/cuit, fournées, habitudes) sont les **seuls**
porteurs de ces formules. Un écran, un hook ou un script qui recalcule importe le
module — il ne recopie pas. Voir la skill `front-fitcarnet`.

## Attention aux scripts d'import

`test_ecriture_grocy.py` **écrit** dans `db/manuel/16-catalogue-ciqual.sql`, un
fichier versionné. Et `entrypoint-prod.sh` rejoue `db/manuel/` à **chaque**
démarrage : une migration qui écrit des données écrase les corrections manuelles à
chaque redémarrage du conteneur. Le constat 10 de l'audit décrit exactement ça —
la migration 16 réécrit quatre aliments communs à chaque démarrage.
