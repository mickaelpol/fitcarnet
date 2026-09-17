---
name: revue-de-code
description: Comment relire du code sur fitcarnet — les huit motifs de défaut que l'audit de septembre 2026 a réellement trouvés, par ordre de rendement, avec un cas daté pour chacun. À charger avant toute relecture, revue de modification, ou recherche de régression.
---

# Relire du code sur fitcarnet

Un audit de 79 constats a été mené le 7 septembre 2026, puis corrigé lot par lot.
Ce document ne dit pas ce qu'est du bon code en général : il dit **ce qui a
réellement mordu ici**, dans l'ordre où ça rapporte de regarder.

## Le motif dominant, et il explique la moitié des constats

> **Une décision juste, appliquée à un endroit et oubliée à un autre.**

Les défauts de ce projet ne viennent presque jamais d'une mauvaise décision. Ils
viennent d'une bonne décision **appliquée partiellement**. Trois agents l'ont
relevé indépendamment pendant l'audit.

Conséquence pratique : devant une règle, la question utile n'est pas « est-elle
juste ? » mais **« combien d'endroits devraient la porter, et les portent-ils
tous ? »**

---

## Les huit questions, par rendement décroissant

### 1. Le jumeau oublié

Un contrôle posé devant une porte, absent devant sa jumelle.

- **É1, septembre 2026.** `POST /mon-frigo/stock` vérifiait la propriété de
  l'aliment. Son jumeau `POST /mon-frigo/inventaire`, qui écrit le même stock par
  un autre chemin, ne l'avait jamais eue.
- **D7.** Le corps de `grammesSaisis` réécrit mot pour mot 35 lignes plus bas,
  sous un commentaire proclamant « UN SEUL ENDROIT DÉCIDE CE QU'EST UNE SAISIE
  VALABLE ».

**À faire** : `grep` le nom de la fonction appelée, pas seulement la route. Puis
compter les appelants. Le remède est toujours le même — **descendre le contrôle
au point de passage obligé**, pas le recopier devant chaque porte. Une règle
recopiée devant trois portes finira par manquer devant la quatrième.

### 2. Le garde qui regarde l'état au lieu de l'intention

- **Septembre 2026.** `ExerciceProcessor` posait le propriétaire « seulement
  s'il manque » — juste à la création, faux partout ailleurs, car un exercice du
  catalogue commun a précisément `creePar = NULL`. Le PATCH par lequel un
  administrateur renseigne une vidéo se l'appropriait donc, et `public = false`
  le retirait du catalogue de tout le monde. Le garde teste désormais
  l'opération (`$operation instanceof Post`).

**À faire** : devant `if (null === $x->getChamp())`, demander **ce que ce test
cherche vraiment à savoir**. Si la réponse est « est-ce une création ? », alors
c'est l'**opération** qui doit être testée, pas le champ.

### 3. Le commentaire qui ment

Relevé par trois agents de l'audit : **presque tous les constats contredisent un
commentaire du projet lui-même.** C'est une chance — l'intention est déjà écrite,
il suffit de vérifier qu'elle est tenue.

- `cleDHabitude` : « CETTE FONCTION EST LA SEULE À NORMALISER, dans tout le
  projet ». Elle avait **six** concurrentes.
- `CLAUDE.md` annonçait `front/src/calcul/texte.ts` comme module de référence.
  Le fichier n'existait pas.
- `db/01-schema.sql` : « CE FICHIER DÉCRIT LA BASE TELLE QU'ELLE EST
  AUJOURD'HUI ». Il en était à 280 lignes près.

**À faire** : lire les commentaires en majuscules et les traiter comme des
**affirmations à vérifier**, pas comme de la documentation. Chacun est une
promesse ; la moitié n'était pas tenue.

### 4. Le test qui ne peut pas échouer

L'audit en a trouvé **douze**.

- Un test qui affirme sans jamais pouvoir tomber ne protège rien, et donne
  l'illusion inverse.
- **Pire, et vu ici** : `garanties.test.ts` **réimplémentait** la recherche par
  nom qu'il était censé garantir. Le code et sa garantie pouvaient diverger sans
  qu'un seul test tombe — le test validait sa propre copie.
- Un test qui **ment sur son scénario** protège le défaut : celui d'É8 passait une
  opération `Post` en prétendant décrire un `PATCH`, ce qui masquait le garde
  du motif 2.

**À faire** : pour chaque test, se demander **quelle modification du code le
ferait tomber**. Si aucune ne vient, le test est décoratif. La preuve se fait en
cassant le code, pas en le lisant.

### 5. La formule recopiée

Règle 5 du projet. Les modules de référence font foi et sont **les seuls** à
porter leur formule.

- Epley : trois copies aux bornes divergentes → un « record » de 79,96 kg que la
  formule elle-même déclare invalide. Et son coefficient `0.0333` était encore
  écrit trois fois **dans le module de référence**.
- `sansAccent` : **six** copies, toutes en `normalize('NFD')` — que Hermes
  n'implémente pas toujours. Six `TypeError` en puissance.
- Atwater : recopié dans le solveur et l'écran des objectifs.

**À faire** : `grep` la constante numérique, pas seulement le nom de la fonction.
`0.0333`, `4 *`, `9 *` trouvent ce que `grep epley` rate.

### 6. Vide traité comme zéro

Règle 6. Un champ vide veut dire « je ne sais pas », un zéro veut dire « zéro ».

Le bon exemple, à imiter : `controler()` dans `nutrition.ts` distingue
`fibresConnues`, élargit son seuil de tolérance et **l'écrit à l'écran** —
« Cohérent, mais sans les fibres le contrôle reste approximatif ».

**À faire** : chercher `?? 0`, `|| 0`, `parseFloat(...) || 0`. Chacun est un
endroit où « je ne sais pas » devient « zéro » sans le dire.

### 7. Le chiffre faux affiché

Règle 7, et c'est la plus grave sur une application de nutrition : ce qui
s'affiche sera pesé et mangé.

- **16 septembre 2026.** Trois champs pour un seul fait — les macros, `ratio`
  et `etat_reference` — pouvaient se contredire : des féculents décrits cuits
  étaient lus comme secs, et un compte mangeait jusqu'à **trois fois** trop de
  glucides. La colonne a disparu ; les valeurs décrivent toujours le produit tel
  qu'on le pèse.
- « Le riz sec vaut 350 kcal/100 g, pas 130 » : la phrase de la règle 3,
  répétée dans douze documents, était à moitié fausse. 130 est une valeur
  **USDA** ; CIQUAL donne 155 pour le riz blanc cuit (16 septembre 2026).

**À faire** : devant tout nombre en dur, demander **d'où il vient**. Une valeur
sans source traçable est suspecte. Et un refus explicite vaut mieux qu'une valeur
plausible non vérifiée.

### 8. La liste écrite à la main

Une énumération manuelle marche jusqu'au jour où quelqu'un ajoute un élément.

- **Le glob des migrations** s'arrêtait à `2[0-9]-*.sql`. La migration 30
  n'aurait été jouée **nulle part** — ni à l'installation, ni au démarrage de la
  production, ni par le script de vérification, qui aurait donc annoncé que tout
  allait bien. Il s'arrête aujourd'hui à `3[0-9]` : **le piège remordra à 40**,
  dans trois fichiers.
- `tsconfig.tests.json` énumérait ses tests à la main : `performance.ts` est resté
  sans test pendant des mois, alors que trois constats y vivaient.

**À faire** : devant une liste, chercher qui la met à jour. Si la réponse est
« un humain qui doit y penser », c'est un défaut en attente.

---

## Deux pièges de plateforme, qui ne se voient pas au typage

- **`@/` ne survit pas à la compilation des tests.** Un module de `src/` qui
  importe une **valeur** doit le faire en chemin relatif : `tsc -p
  tsconfig.tests.json` ne réécrit pas l'alias, et ça casse au `node --test`, pas
  au typage. Un `import type` est effacé et peut rester en `@/`.
- **Hermes n'implémente pas toujours `normalize`.** Toute suppression d'accents
  passe par `src/calcul/texte.ts`, jamais par `normalize('NFD')`.

---

## Ce qui va bien, et qu'il ne faut pas « corriger »

Un relecteur qui ne connaît pas ces choix les prendra pour des défauts :

- **`front/dist/` est versionné volontairement** — c'est le build servi par Caddy.
- **`cleDHabitude` utilise une table manuelle** plutôt que `normalize`, à cause de
  Hermes. Ne pas la « factoriser » vers `normalize`.
- **Le solveur arrondit les quantités PUIS recalcule les macros** : ce qui est
  affiché est ce qui sera pesé. L'ordre est délibéré.
- **`doctrine:schema:validate` ne passera jamais** : le schéma est écrit à la
  main, la base porte plus que les entités. Son `--dump-sql` propose
  `DROP TABLE invitation`.
- **7 erreurs PHPStan sont attendues** (c'était 8 : M-02 en a fait disparaître une). Aucune ne doit apparaître sur un fichier
  qu'on vient de toucher — c'est le seul critère.

---

## Comment rapporter

- **Un constat = un scénario reproductible.** « Ce code est fragile » n'est pas un
  constat ; « si l'utilisateur saisit 0, le plafond devient nul et le solveur
  compose sur du vide » en est un.
- **Dire ce qui a été vérifié et ce qui ne l'a pas été.** Deux constats de l'audit
  se sont révélés faux à la vérification, et un export « mort » avait six
  occurrences et des tests.
- **Ne pas gonfler la gravité.** L'audit distingue « défaut actif » de « risque » :
  C3 était une absence de test sur du code correct, pas une fuite.
- **Citer `fichier:ligne`**, toujours.
