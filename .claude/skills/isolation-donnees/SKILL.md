---
name: isolation-donnees
description: L'isolation des données entre comptes dans fitcarnet — ProprieteUtilisateur, FiltreProprietaire, FiltreExercice, et le corollaire « vérifier la propriété sur CHAQUE chemin d'écriture ». À charger avant d'exposer une entité en API, d'écrire un contrôleur personnalisé, un processeur d'état, ou tout code qui écrit une donnée rattachée à un compte.
---

# Isolation des données entre comptes

fitcarnet est multi-comptes. **Une donnée qui fuit d'un compte à l'autre n'est pas
un défaut d'affichage : c'est la faute la plus grave que ce projet puisse commettre.**
Ce qui suit a été écrit à partir de failles réelles, chacune datée.

## Le dispositif, en trois pièces

| Pièce | Rôle |
|---|---|
| `App\Entity\ProprieteUtilisateur` | Interface de **marquage**. Une entité qui l'implémente est filtrée. |
| `App\Doctrine\FiltreProprietaire` | Extension Doctrine, **priorité 100** : pose le `WHERE utilisateur = :moi`. |
| `App\Doctrine\ChargementComplet` | Priorité 50 : ajoute les jointures anti-N+1 **par-dessus** le filtre. |
| `App\State\ProprietaireProcessor` | Pose le propriétaire à la création — le filtre ne sert à rien sans lui. |
| `api/tests/ModeleExposeTest.php` | Refuse toute entité `#[ApiResource]` non conforme absente de sa liste blanche. |

Les aliments sont des données de compte comme les autres : `Aliment` implémente
`ProprieteUtilisateur`, et chacun ne voit que les siens. `AlimentProcessor`
enveloppe `ProprietaireProcessor` et traduit un doublon de nom dans le compte
(`aliment_nom_unique_par_compte`) en 422.

**Une seule exception filtrée à part**, un référentiel partagé que le filtre
strict rendrait inutilisable. Deux autres référentiels communs dérogent dans
`ModeleExposeTest` sans filtre : les emplacements, en lecture seule
(`GetCollection` et `Get`), et les modes de cuisson, lisibles par tout compte et
modifiables par l'administrateur seul — `Post`, `Patch` et `Delete` portent
`is_granted('ROLE_ADMIN')` (`api/src/Entity/ModeCuisson.php:55-57`) :

| Entité | Filtre | Règle | Pourquoi pas le filtre strict |
|---|---|---|---|
| `Exercice` | `FiltreExercice` | **public OU le mien** | la règle porte sur `public`, ce qui autorise un exercice **publié mais attribué** — un administrateur verse au catalogue commun l'exercice de quelqu'un sans en effacer la paternité |

`Exercice` a reçu ce filtre le 14 septembre 2026 (constat É8) : `public` et
`creePar` existaient depuis l'origine sans que rien ne les renseigne ni ne les
lise, pendant que l'écran promettait « ★ exercice personnel ». Une étiquette qui
promet la confidentialité sans la fournir est pire qu'une étiquette absente.
**Conséquence assumée** : un administrateur ne voit plus les exercices privés des
autres, et ne peut donc plus les fusionner.

L'entité `Utilisateur` n'a **aucune relation sortante**, volontairement : c'est un
type auquel on se réfère, pas un module dont on dépend. Garder cette propriété.

## La règle

Toute nouvelle entité `#[ApiResource]` avec des opérations implémente
`ProprieteUtilisateur`. Sans quoi le filtre ne la voit pas et **tous les comptes
voient les données de tous**. `ModeleExposeTest` échouera — ne pas l'ajouter à la
liste blanche pour faire taire le test.

## Le corollaire, et c'est lui qui a mordu deux fois

**Vérifier la propriété sur CHAQUE chemin d'écriture, pas seulement le principal.**

Un filtre Doctrine protège la **lecture**. Il ne dit rien de ce qu'un contrôleur
personnalisé écrit à partir d'un identifiant reçu dans le corps de la requête.

- **Septembre 2026, faille É1.** `POST /api/mon-frigo/stock` vérifiait que
  l'aliment visé appartenait au demandeur. Son jumeau
  `POST /api/mon-frigo/inventaire`, qui écrit le même stock par un autre chemin,
  n'avait jamais reçu ce contrôle. Bob posait 1 g sur un aliment d'Alice, et
  l'aliment d'Alice devenait **indélébile** : `AlimentSuppressionProcessor`
  comptait les lignes de stock tous comptes confondus — il compte toujours hors
  du filtre, mais depuis la migration 35 seul le stock du propriétaire peut
  viser son aliment —, et l'application n'offrait à Alice aucun moyen de défaire
  ce blocage. Ce n'était pas une fuite — c'était pire, un blocage qu'on ne peut
  pas lever.
- **Correction du 8 septembre 2026, à copier.** La règle a été descendue dans
  `FrigoBase::alimentsAccessibles()`, et `FrigoBase::definirStock()` la pose
  elle-même. Les **trois** appelants sont couverts d'un coup — la route `/stock`,
  l'inventaire différé, le bouton « J'ai cuisiné » de `PlansController` — au lieu
  d'un seul. Le prochain appelant naîtra protégé.
- **17 septembre 2026, la base ferme la porte à son tour.** La clé étrangère
  composite `stock_aliment_du_meme_compte_fkey` — (`aliment_id`,
  `utilisateur_id`) vers `aliment (id, utilisateur_id)`, en `ON DELETE
  RESTRICT` — refuse toute ligne de stock posée sur l'aliment d'un autre compte,
  quel que soit le chemin qui l'écrit (`db/01-schema.sql:188-190`, migration
  `db/manuel/35-stock-et-aliment-du-meme-compte.sql`, qui s'appuie sur la
  contrainte `aliment_id_utilisateur_unique`). `FrigoBase` vérifie toujours :
  c'est lui qui répond un 404 lisible, là où la base ne rendrait qu'une
  violation de contrainte.
- **17 septembre 2026 aussi, la porte que personne n'empruntait est murée.**
  `POST`, `PATCH` et `DELETE /api/stocks` existaient encore, sans appelant
  dans le front, et contournaient tout ce que `FrigoBase` vérifie —
  l'emplacement, la source du frigo, la ligne à zéro qui garde sa place ; un
  doublon y répondait 500. **`/api/stocks` est en lecture seule** (`GetCollection`
  et `Get`, `api/src/Entity/Stock.php:29-37`, figé par
  `api/tests/Entity/StockEnLectureSeuleTest.php`) : le stock ne s'écrit plus que
  par `/api/mon-frigo`. Le même jour, `POST /api/mon-frigo/stock` a appris à
  refuser un `emplacementId` inconnu en 422 (`FrigoBase::emplacementExiste`,
  `EmplacementInconnuTest`) au lieu de laisser la clé étrangère répondre un 500.

**La leçon de conception** : place le contrôle au point de passage obligé de
l'écriture, pas devant chaque porte. Une règle recopiée devant trois portes finira
par manquer devant la quatrième — c'est exactement ce qui s'est produit.

## Répondre à un refus sans offrir l'énumération

Même réponse pour « cet identifiant n'existe pas » et « il ne t'appartient pas ».
Distinguer les deux dit à un inconnu quels identifiants existent. Le projet répond
**404** avec « Cet aliment n'existe pas dans ton catalogue. », et pour un lot
d'inventaire il ne nomme pas la ligne fautive.

## Avant de valider

- [ ] L'entité implémente `ProprieteUtilisateur`, ou son exception est documentée
- [ ] `bin/phpunit` passe, `ModeleExposeTest` compris
- [ ] Chaque chemin d'écriture qui reçoit un identifiant du client vérifie la propriété
- [ ] Le contrôle est au point de passage obligé, pas recopié devant chaque route
- [ ] Un refus ne permet pas de distinguer « inexistant » de « pas à toi »
- [ ] Un test le prouve, **écrit et vu échouer d'abord** (voir la skill `tests-api`)

## Le filet, et ce qu'il couvre

**C3 fermé le 14 septembre 2026.** Quatre fichiers éprouvent le dispositif, sans
base ni noyau — `tests/Doctrine/FiltreProprietaireTest`, `FiltreExerciceTest`,
`tests/State/ProprietaireProcessorTest`, `tests/Security/CompteActifTest`. Chaque
témoin a été **vu échouer** en cassant le code qu'il protège.

Ce qu'ils figent, et qu'il ne faut pas défaire :

| Invariant | Pourquoi il compte |
|---|---|
| `applyToItem` filtre autant que `applyToCollection` | sinon `GET /api/seances/{id}` rend la séance d'un autre, liste propre |
| Non authentifié → `1 = 0` | un filtre qui « ne s'applique pas » ouvre la base entière |
| Une entité non marquée n'est pas touchée | le témoin : un filtre qui restreint tout ressemble à une protection |
| Le `OR` de `FiltreExercice` reste un bloc | `AND` lie plus fort que `OR` : disjoint, le catalogue public échappe à la recherche |
| Un propriétaire déjà posé n'est jamais écrasé | modifier la donnée d'un autre ne doit pas se l'approprier |

**Une idée reçue corrigée au passage** : on a longtemps cru les parenthèses du
`OR` de `FiltreExercice` « indispensables ». Elles ne le sont pas — Doctrine parenthèse
déjà toute partie contenant `OR` (`Query\Expr\Composite`, DDC-1237). On les garde
pour l'intention, mais ce n'est pas d'elles que dépend l'isolation.
