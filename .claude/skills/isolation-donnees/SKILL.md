---
name: isolation-donnees
description: L'isolation des données entre comptes dans fitcarnet — ProprieteUtilisateur, FiltreProprietaire, FiltreAliment, et le corollaire « vérifier la propriété sur CHAQUE chemin d'écriture ». À charger avant d'exposer une entité en API, d'écrire un contrôleur personnalisé, un processeur d'état, ou tout code qui écrit une donnée rattachée à un compte.
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
| `api/tests/ModeleExposeTest.php` | Refuse toute entité `#[ApiResource]` non conforme absente de sa liste blanche. |

**Une seule exception documentée** : `Aliment`. Son propriétaire est facultatif —
un aliment sans `cree_par` est commun à tous. `FiltreAliment` applique donc la
règle « **commun OU le mien** » au lieu du filtre strict.

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
  l'aliment visé était commun ou celui du demandeur. Son jumeau
  `POST /api/mon-frigo/inventaire`, qui écrit le même stock par un autre chemin,
  n'avait jamais reçu ce contrôle. Bob posait 1 g sur l'aliment privé d'Alice, et
  l'aliment d'Alice devenait **indélébile** : `AlimentSuppressionProcessor` compte
  les lignes de stock tous comptes confondus, et l'application n'offrait à Alice
  aucun moyen de défaire ce blocage. Ce n'était pas une fuite — c'était pire, un
  blocage qu'on ne peut pas lever.
- **Correction du 8 septembre 2026, à copier.** La règle a été descendue dans
  `FrigoBase::alimentsAccessibles()`, et `FrigoBase::definirStock()` la pose
  elle-même. Les **trois** appelants sont couverts d'un coup — la route `/stock`,
  l'inventaire différé, le bouton « J'ai cuisiné » de `PlansController` — au lieu
  d'un seul. Le prochain appelant naîtra protégé.

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

## Ce qui reste ouvert

**C3 de l'audit** : aucun test ne vérifie l'isolation elle-même. Le code est bon,
relu ligne à ligne, mais toute la garantie tient à deux `tags:` dans
`services.yaml`. `ModeleExposeTest` couvre l'inventaire des entités ; il manque le
test de `FiltreProprietaire`. C'est le prochain constat du lot 3.
