# Audit couverture de tests et robustesse — fitcarnet

Audit en lecture seule. Aucun fichier du projet modifié. Deux suites tentées à l'exécution (résultats bruts plus bas) ; les scripts Python de la racine n'ont **pas** été exécutés (consigne).

Périmètre lu : `api/tests/` (8 fichiers, 1 336 lignes), `front/src/**/*.test.ts` (16 fichiers, 4 275 lignes), `test_ciqual.py`, `test_ecriture_grocy.py`, et la logique métier correspondante (`api/src/`, `front/src/`, `front/app/`). `front/dist/` et `node_modules/` ignorés.

---

## 1. Couverture des chemins critiques

| Chemin critique | État | Fichiers de test |
|---|---|---|
| **Isolation des données entre comptes** | **NON COUVERT** | *aucun* — zéro occurrence de `FiltreProprietaire`, `ProprietaireProcessor` ou `CompteActif` dans `api/tests/` |
| Authentification (connexion par mot de passe, compte désactivé) | **NON COUVERT** | *aucun* |
| Rafraîchissement de jeton | **NON COUVERT** | *aucun* côté API ; côté front `uneSeuleFois.test.ts` ne couvre que le dédoublonnage d'appels concurrents, pas `renouveler()` |
| Déconnexion / révocation de jeton | **NON COUVERT** | *aucun* |
| Acceptation d'invitation | **PARTIELLEMENT** — helpers purs seulement ; le contrôleur (course, transaction, adresse prise de l'invitation et non du formulaire) n'est pas testé | `api/tests/Service/InvitationTest.php` (21 tests) |
| Protection du compte administrateur | **PARTIELLEMENT** — la fonction pure est bien couverte ; son câblage dans `ComptesController` ne l'est pas (et il a un défaut, constat 12) | `api/tests/Service/ProtectionDuCompteTest.php` (8 tests) |
| Solveur de repas (`front/src/solveur/`) | **COUVERT**, et solidement | `garanties.test.ts`, `solveur.test.ts`, `composer.test.ts`, `periode.test.ts` |
| Nutrition / cuisson (`front/src/calcul/`) | **COUVERT** | `nutrition.test.ts`, `cuisson.test.ts`, `plausibilite.test.ts`, `planCoach.test.ts`, `selectionRepas.test.ts` |
| Rendement cru/cuit | **COUVERT des deux côtés** — mais par **deux implémentations distinctes** aux seuils divergents (constat 7) | `RendementMesureTest.php`, `AlimentDisponibleTest.php`, `plausibilite.test.ts`, bloc « Le rendement ne change PAS ce qu'il faut peser » de `garanties.test.ts` |
| **1RM / progression** (`front/src/calcul/performance.ts`) | **NON COUVERT** — le fichier n'est même pas dans `tsconfig.tests.json` | *aucun* |
| Inventaire du frigo (calcul des écarts) | **COUVERT** | `front/src/calcul/frigo.test.ts` (13 tests) |
| Synchronisation Grocy, y compris échecs réseau | **PARTIELLEMENT** — `inventorierUn` et `creerProduit` bien couverts, panne réseau comprise ; `lire()`, `AppliqueInventaire`, `InventaireLots`, `TraiterInventaires` ne le sont pas | `InventaireUneLigneTest.php` (6 tests), `FrigoGrocyCreationTest.php` (8 tests) |
| **Déduction de stock à partir d'un plan** | **Calcul : COUVERT** (10 tests, excellents) / **Câblage : NON COUVERT, et cassé** (constat 1) | `api/tests/Service/DeductionDuPlanTest.php` |
| Client HTTP du front (401 + rejeu, JSON illisible, fin de session) | **NON COUVERT** | *aucun* (`adresse.test.ts` ne couvre que la construction d'URL) |
| Habitudes de cuisson (validation d'un lot) | **COUVERT** | `LotDHabitudesTest.php` (12 tests) |

---

## 2. Résultat brut de l'exécution des suites

### Front — `npm test` depuis `front/` : **PASSE**

Le script est `tsc --noEmit && rm -rf dist-tests && tsc -p tsconfig.tests.json && node --test "dist-tests/**/*.test.js"`.
Le typage complet du projet passe (sinon la commande s'arrêterait avant les tests).

```
# tests 320
# suites 78
# pass 320
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 470.213188
```

**320 réussis, 0 échec, 0 ignoré, 0 désactivé.** Aucun `skip`, `todo`, `only` ni `@ts-ignore` dans les tests.

### API — PHPUnit : **NON EXÉCUTABLE sur ce poste**

```
PHPUnit requires the "dom", "filter", "json", "libxml", "mbstring", "tokenizer",
"xmlwriter" extensions, but the "dom", "mbstring", "xmlwriter" extensions are not available.
```

PHP 8.4.8 CLI est présent mais `/usr/lib/php/20240924/` ne contient ni `dom.so`, ni `mbstring.so`, ni `xmlwriter.so` — elles ne sont pas seulement désactivées, elles ne sont pas installées. Installer une dépendance est hors périmètre.

**Sûreté vérifiée par lecture** : les 8 classes de test étendent toutes `PHPUnit\Framework\TestCase` (jamais `KernelTestCase` ni `WebTestCase`), et `tests/bootstrap.php` le documente explicitement (« Les tests de ce projet sont des tests UNITAIRES : ils n'ouvrent ni base, ni noyau, ni réseau »). Les accès Grocy passent par `MockHttpClient`. **Elles ne toucheraient donc pas la base de développement** — elles sont simplement injouables ici. Sur un poste avec les extensions, `api/bin/phpunit` est sans danger.

### Scripts Python — non exécutés

Consigne respectée.

---

## 3. Constats, du plus grave au moins grave

**État au 17 septembre 2026, vérifié constat par constat : douze clos, cinq
ouverts.** Clos : 1, 2, 4, 5, 6, 8, 10, 11, 12, 13, 16 et 18. **Ouverts** : 7 et 9
(moyens), 14, 15 et 19 (faibles) — aucun n'a de décision consignée. Chaque
constat porte son statut ; les constats clos suivent au présent de l'audit.

---

### 1. ✅ corrigé le 7 septembre 2026 (C1) — **« J'ai cuisiné » appelle une méthode qui n'existe plus, et le plan est déjà marqué**
**Gravité : CRITIQUE — Statut : CONFIRMÉ**
`api/src/Controller/PlansController.php:155`

```php
$echecs = $this->grocy->inventorier($nouvellesQuantites);
```

`App\Service\FrigoGrocy` est une `final readonly class` sans parent ni `__call`, et elle ne définit **pas** `inventorier()`. Sa seule méthode d'inventaire est `inventorierUn(int, float)` (`api/src/Service/FrigoGrocy.php:450`). Vérifié par balayage automatique de tous les `$this->prop->methode()` de `api/src/` : c'est le **seul** appel introuvable du projet.

Le commit `1055cc2` (« inventaire en tâche de fond ») a remplacé `inventorier(array)` par `inventorierUn(int,float)` et a mis à jour `FrigoController` et `AppliqueInventaire` — **il n'a pas touché `PlansController`** (`git show 1055cc2 --name-only` ne le liste pas).

**Ce qui se passe.** Pour un compte dont `sourceFrigo = 'grocy'` (le compte administrateur), appuyer sur « J'ai cuisiné » :
1. `$plan->marquerCuisine(); $this->em->flush();` — le plan est **déjà écrit en base** (ligne 148, ordre volontaire et documenté) ;
2. ligne 155, PHP lève `Error: Call to undefined method App\Service\FrigoGrocy::inventorier()` ;
3. le `catch (\RuntimeException $e)` ligne 156 **n'attrape pas** un `\Error` — la requête meurt en 500 ;
4. **le stock n'est jamais déduit**, et l'écran de rattrapage (`ignores`) n'est jamais rendu ;
5. un second appui rend **409 « déjà cuisiné »** : le geste n'est pas rejouable.

Résultat : le frigo Grocy reste au chiffre d'avant, le plan cesse de réserver son stock, et le solveur compose les repas suivants sur des quantités qui n'existent plus. Exactement le défaut que ce bouton existe pour corriger, et exactement le « bac vide une semaine plus tard » décrit dans le docblock de `DeductionDuPlan`. `DeductionDuPlanTest` teste parfaitement le calcul — mais rien ne teste qu'on sait l'appliquer.

**Correction.** Remplacer par une boucle sur `inventorierUn()`, en reprenant la forme déjà écrite dans `FrigoController.php:324` et `AppliqueInventaire.php:165` (qui rendent le motif d'échec plutôt qu'une exception, ce qui alimente naturellement `$echecs`) :
```php
foreach ($nouvellesQuantites as $idProduit => $quantite) {
    $motif = $this->grocy->inventorierUn($idProduit, $quantite);
    if (null !== $motif) { $echecs[$idProduit] = $motif; }
}
```
Puis un test de `PlansController` (ou, à défaut d'infrastructure, un test unitaire du service extrait). **Effort : 30 min pour le correctif, 1 h avec un test qui empêche la récidive.**

Recommandation de fond : ce bug aurait été attrapé gratuitement par PHPStan/Psalm, qui n'est pas installé (`api/composer.json` n'a ni l'un ni l'autre). **~1 h pour ajouter PHPStan niveau 5 en dev.**

---

### 2. ✅ corrigé le 14 septembre 2026 (C3) — **Aucun test ne vérifie l'isolation des données entre comptes**
**Gravité : CRITIQUE — Statut : CONFIRMÉ**
`api/src/Doctrine/FiltreProprietaire.php`, `api/src/State/ProprietaireProcessor.php`, `api/src/Security/CompteActif.php`, `api/config/services.yaml:18-28`

C'est le point le plus important de cet audit, et la réponse est nette : **zéro test**. Aucun fichier de `api/tests/` ne mentionne l'une de ces trois classes.

Le code lui-même est **bon** — je l'ai lu ligne à ligne :
- `FiltreProprietaire` s'applique en collection **et** en item, et pose `1 = 0` pour un non-authentifié ;
- les entités filles (`Serie`, `SeanceExercice`, `ModeleExercice`, `ModeleSerie`) portent `#[ApiResource(operations: [])]` : pas d'exposition directe ;
- `Aliment` : `Patch` et `Delete` en propriété stricte, `utilisateur` hors du groupe `aliment:ecrire` ;
- les 8 contrôleurs scopent tous par `$this->getUser()` — vérifié un par un.

Mais **rien ne le tient**. Toute la garantie repose sur deux `tags:` dans `services.yaml` et sur le fait que chaque nouvelle entité pense à implémenter `ProprieteUtilisateur`. Un renommage de tag, une priorité changée, une entité oubliée, un contrôleur ajouté sans `WHERE utilisateur_id` : rien ne le signalerait, et la panne est silencieuse — un utilisateur voit les données d'un autre sans que personne ne le sache.

Deux garde-fous sans base de données sont possibles tout de suite :
- **un test unitaire de `FiltreProprietaire`** avec un `QueryBuilder` réel sur un `EntityManager` bouchonné et un `Security` bouchonné, vérifiant les deux branches (`1 = 0` non authentifié, `andWhere('… .utilisateur = :utilisateur_courant')` authentifié) ;
- **un test d'inventaire du modèle** : parcourir `src/Entity/*.php`, et pour chaque classe portant `#[ApiResource]` avec des opérations non vides, exiger qu'elle implémente `ProprieteUtilisateur`, ou qu'elle figure dans une liste blanche explicite (`Exercice`, `Emplacement`, `ModeCuisson`, `Utilisateur`). Ce test-là attrape la vraie panne : l'entité qu'on ajoute six mois plus tard sans y penser.

**Effort : 2-3 h pour les deux.** Un test d'intégration HTTP « A ne voit pas le stock de B » demanderait une base de test dédiée ; à évaluer séparément (~1 j).

---

### 4. ✅ corrigé le 14 septembre 2026 (É8) — **Les exercices « personnels » d'un compte sont visibles de tous les autres**
**Gravité : ÉLEVÉE — Statut : CONFIRMÉ**
`api/src/Entity/Exercice.php:50-103` (opérations), `:280-281` (`public`), `:283-285` (`creePar`) — lignes d'aujourd'hui ; `front/app/admin-exercices.tsx:299` à l'audit

`Exercice` porte `private bool $public = true;` et `private ?Utilisateur $creePar = null;`. Or, sur tout `api/src/`, `creePar` n'est lu ni écrit nulle part, hors deux commentaires. Concrètement :

- aucune extension Doctrine ne restreint la collection `Exercice` ;
- `new Post(security: "is_granted('ROLE_USER')")` n'a **aucun processeur** : `creePar` reste `null` et `public` reste `true` à la création ;
- `GetCollection` rend donc les 1 338 entrées **plus tous les exercices créés par n'importe quel compte**, triés `source DESC` — c'est-à-dire les « perso » en tête.

Et l'écran les étiquette explicitement « ★ exercice personnel » (`front/app/admin-exercices.tsx:299`, `:613`). Un utilisateur crée « Développé couché — variante épaule opérée », et un autre compte le voit, marqué comme personnel.

C'est en partie délibéré (le commentaire du `Patch` dit « le catalogue est commun »), mais alors **les deux colonnes `public` et `creePar` sont du code mort qui promet une confidentialité que rien n'applique** — et elles contredisent frontalement la règle posée pour `Aliment`, dont aucun ne sort du compte qui l'a saisi.

**Correction, au choix, mais il faut choisir :** soit un `FiltreExercice` (`public = true OR creePar = :user`) plus un processeur qui pose `creePar`/`public` à la création — **~2 h** ; soit supprimer les deux colonnes et assumer un catalogue commun, en changeant l'étiquette de l'écran — **~1 h**. Dans les deux cas, un test.

---

### 5. ✅ réglé le 8 septembre 2026 (É9, script supprimé) — **`grocy_macros.py` écrit dans les mêmes champs Grocy avec la convention inverse, et par appariement en sous-chaîne**
**Gravité : ÉLEVÉE — Statut : CONFIRMÉ**
`grocy_macros.py:105-113` et `:176`

Deux problèmes qui se cumulent, dans un script d'amorçage qui écrit dans **les mêmes champs personnalisés Grocy** que `ciqual_vers_grocy.py` :

1. **Convention incompatible.** `grocy_macros.py:105` : `# --- feculents : valeurs CUITES, ratio = cuit / sec ---`, avec « riz basmati » à 130 kcal. Toute la refonte de l'API (`RendementPlausible.php`, `AlimentDisponible.php`, `plausibilite.ts`) repose sur l'inverse : « les valeurs décrivent TOUJOURS le produit tel qu'on le pèse », donc 350 kcal pour du riz sec. Un produit amorcé par `grocy_macros.py` fait donc **peser environ trois fois trop** de riz, silencieusement — précisément la panne que la refonte a éliminée côté application.
2. **Appariement par sous-chaîne sans borne de mot** (`:176`) : `all(mot in cle for mot in reference.split())`. « Lait d'amandes » (clé `lait d amandes`) apparie la référence `amandes` et reçoit 575 kcal / 49,5 g de lipides.

Accessoirement, `grocy_macros.py` ignore `fibres100` (`CHAMPS`, `:73-85`) alors que `ciqual_vers_grocy.py:593` le crée et l'écrit ; et « semoule complete » y subsiste (`:113`) alors que `test_ciqual.py:197-199` exige justement sa disparition des tables de l'autre script. Les deux scripts ont divergé sans que rien ne le signale.

**Correction.** Décider lequel des deux scripts fait foi. Si `ciqual_vers_grocy.py` fait foi (c'est ce que dit le reste du projet), **supprimer `grocy_macros.py`** ou le réduire à un appel du premier. **Effort : 1 h pour la suppression ; 4 h pour l'aligner si on tient à le garder.**

---

### 6. ✅ corrigé le 15 septembre 2026 (É10, `client.test.ts`) — **Le chemin d'authentification du front n'a aucun test**
**Gravité : ÉLEVÉE — Statut : CONFIRMÉ**
`front/src/api/client.ts` (342 lignes, 0 test)

`client.ts` porte toute la mécanique de session — et elle est bien écrite (chaque décision est commentée par la panne qu'elle a corrigée) :
- rejeu unique sur 401 après renouvellement (`api()`, ligne ~205) ;
- fin de session **uniquement** sur 401 franc, jamais sur panne réseau (`renouveler()`, ligne ~155) ;
- corps non-JSON traité comme une réponse en erreur et non comme une exception (le cas Caddy du 21 août, ligne ~270) ;
- `terminerSession()` qui vide les deux jetons et notifie le portier.

Rien de tout cela n'est testé. `tsconfig.tests.json` n'inclut que `src/api/adresse.ts` (construction d'URL) et `src/api/uneSeuleFois.ts` (dédoublonnage). Les régressions possibles sont exactement celles que les commentaires décrivent comme déjà vécues : déconnecter tout le monde sur une coupure réseau, ou garder un jeton mort en se croyant connecté.

Un cas limite non couvert que j'ai relevé en lisant : si le jeton d'accès existe mais que le jeton de rafraîchissement est absent, `renouveler()` rend `false` **sans** appeler `terminerSession()` — l'application reste « connectée » et prend un 401 à chaque requête, indéfiniment.

**Correction.** Extraire `fetch` en dépendance injectable (ou passer par un `globalThis.fetch` remplaçable dans le test) et écrire 6-8 cas : 401 puis renouvellement réussi puis rejeu ; 401 puis renouvellement refusé (401) → session terminée ; renouvellement en panne réseau → **pas** de déconnexion ; réponse HTML → `ErreurApi` lisible ; 204 ; rafraîchissement absent. **Effort : 4 h.**

---

### 7. CLOS — **Deux juges du rendement, un dans l'API et un dans le front, aux seuils différents**
**Gravité : MOYENNE — Statut : VERROUILLÉ LE 18 SEPTEMBRE 2026**, par la
seconde correction que ce constat proposait lui-même — « ajouter dans chaque
suite un test de table qui compare les bornes à une liste unique et explicite ».

La liste est `api/regles/rendement.json` : quinze cas nommés, les deux bornes,
et le seuil de matière. Elle n'est lue par aucun code — seulement par
`api/tests/Service/RendementPartageTest.php` **et**
`front/src/calcul/rendementPartage.test.ts`. Le jour où l'un des deux juges
change d'avis sans l'autre, une des deux suites tombe en nommant le cas.

Les bords sont éprouvés en tant que tels, pas seulement par des exemples : une
borne déplacée de 1,05 à 1,5 laisserait « prot à 1,2 » refusé si l'on avait
oublié d'écrire ce cas-là. Le seuil de 100,5 g est éprouvé par le comportement
des deux côtés, puisqu'il n'est lisible ni de l'un ni de l'autre.

**Ce qui reste volontairement asymétrique** : les bandes douces du front —
« ce rendement est inhabituel », en `info` ou `avertissement` — n'ont pas
d'équivalent dans l'API, et c'est le partage des rôles. L'API **décide** quel
rendement est retenu ; le front **affiche** un doute. L'unification complète
(faire remonter les motifs par `incoherences()` et retirer du front ce qui
recalcule) reste possible, mais elle n'est plus nécessaire pour éviter la
dérive silencieuse : c'est elle que ce constat visait.

Ce qui suit est l'état d'avant.
`api/src/Service/RendementPlausible.php:48-76` vs `front/src/calcul/plausibilite.ts:91-105` et `:280-382`

Les deux répondent à la même question — « ce rendement est-il possible ? » — et ne répondent pas pareil :

| Catégorie | API `RendementPlausible::sens()` | Front `verifierAliment()` |
|---|---|---|
| `prot` | refuse `> 1.05` ; **aucune borne basse** | hors `[0.6 ; 1.05]` → `info` |
| `leg` | refuse `> 1.05` ; **aucune borne basse** | hors `[0.3 ; 1.05]` → `avertissement` |
| `fec` | refuse `< 1` ; **aucune borne haute** | `< 1` → `blocage` ; `> 5` → `avertissement` |
| `fruit`/`lait`/`huile`/`ole` | rien | `ratio ≠ 1` → `avertissement` |

Et la conséquence n'est pas symétrique : la version **API décide quel rendement est retenu** (`AlimentDisponible::__construct` : la pesée de l'utilisateur ne gagne que si `sens()` la valide), tandis que la version **front ne fait qu'afficher**. Une pesée de viande à 0,4 est donc *retenue* par l'API et *signalée* par le front : deux verdicts sur la même donnée, sur le même écran.

Même chose pour le seuil « plus de 100 g de matière dans 100 g » : `100.5` écrit deux fois, à `api/src/Service/AlimentDisponible.php:141` et `front/src/calcul/plausibilite.ts:215`.

Chaque implémentation est correctement testée de son côté (`RendementMesureTest.php`, `AlimentDisponibleTest.php`, `plausibilite.test.ts`) — c'est précisément ce qui rend la divergence invisible : les deux suites sont vertes.

**Correction.** L'API décide, le front affiche : faire remonter les motifs par `AlimentDisponible::incoherences()` (qui existe déjà et transite dans `versTableau()`) et retirer du front les contrôles de rendement qui recalculent la même chose. À défaut, ajouter dans chaque suite un test de table qui compare les bornes à une liste unique et explicite. **Effort : 4-6 h pour l'unification ; 1 h pour le test-verrou.**

---

### 8. ✅ corrigé (fibres le 7 septembre 2026, formule unique le 17) — **Deux contrôles Atwater dans le front, avec des verdicts qui peuvent se contredire**
**Gravité : MOYENNE — Statut : CONFIRMÉ, corrigé** : `kcalAtwater` compte les fibres depuis le 7 septembre 2026 (É13), et depuis le 17 les deux contrôles appellent la même somme, `kcalDesGrammes` — la correction proposée ci-dessous, mot pour mot. Leurs tolérances restent distinctes (8 % / 20 % et `max(25 kcal, 20 %)`). Renvois d'aujourd'hui :
`front/src/calcul/nutrition.ts:63-114` vs `front/src/calcul/plausibilite.ts:68-70` et `:222-230`

- `nutrition.controler()` : `4·prot + 4·gluc + **2·fibres** + 9·lip`, tolérance **8 %** (20 % sans fibres). Appelé par `editeurAliment.tsx:224` et `frigo.tsx:635` (aujourd'hui `ligneFrigo.tsx:29`).
- `plausibilite.kcalAtwater()` : `4·prot + 4·gluc + 9·lip`, **sans les fibres**, tolérance `max(25 kcal, 20 %)`. Appelé par `repas.tsx:410` via `verifierCatalogue`.

Un aliment riche en fibres peut donc être déclaré **cohérent** dans l'éditeur et **`calories_incoherentes`** sur l'écran repas — ou l'inverse. Sur un aliment à 10 g de fibres, l'écart entre les deux formules est de 20 kcal, soit exactement l'ordre de grandeur du seuil `max(25, …)`.

**Correction.** Une seule fonction énergétique exportée depuis `nutrition.ts` (fibres comprises, la convention européenne que le fichier revendique), utilisée par `plausibilite.ts`. **Effort : 2 h, tests compris.**

---

### 9. ✅ corrigé le 17 septembre 2026 — **La date d'une nouvelle séance est calculée en UTC**
**Gravité : MOYENNE — Statut : CORRIGÉ le 17 septembre 2026** : la fonction avait déménagé dans `front/src/composants/useSeanceEditable.ts`, inchangée ; elle appelle désormais `dateLocale` (`front/src/calcul/dates.ts`), testée avec le fuseau de Paris simulé (`dates.test.ts`).
`front/app/seance/[id].tsx:24` à l'audit, utilisée en `:134`

```ts
const aujourdhui = () => new Date().toISOString().slice(0, 10);
```

`toISOString()` rend l'heure **UTC**. En France (UTC+1 l'hiver, UTC+2 l'été), toute séance créée entre 00 h 00 et 01 h 00 (ou 02 h 00) locale est datée **de la veille**. Rien ne le signale : la date part telle quelle au serveur, s'affiche dans le calendrier, et fausse les comparaisons de progression (`hooks.ts:819` et `:854` comparent `s.date.slice(0,10)`).

Le reste du projet fait pourtant bien attention : `calendrier.tsx` travaille en heure locale, et `(onglets)/seances.tsx:14` force `T12:00:00` précisément pour éviter le décalage. C'est un oubli isolé.

**Correction.** `new Date().toLocaleDateString('sv-SE')` (format ISO en heure locale), ou construire depuis `getFullYear/getMonth/getDate`. Mieux : mettre cette fonction dans `src/calcul/` et la tester avec un fuseau simulé. **Effort : 30 min, 1 h avec le test.**

---

### 10. ✅ corrigé le 7 septembre 2026 — **Le 1RM n'est pas testé, et son fichier n'est pas compilable par la suite de tests**
**Gravité : MOYENNE — Statut : CONFIRMÉ**
`front/src/calcul/performance.ts` (123 lignes) ; `front/tsconfig.tests.json`

`performance.ts` porte cinq calculs affichés à l'utilisateur — `epley`, `rmDesSeries`, `volumeDesSeries`, `estimerDepuisEssai`, `chargePour`/`repsAu` — et **aucun test**. Le fichier n'est pas dans la liste `include` de `tsconfig.tests.json`, donc il ne serait même pas compilé si l'on ajoutait un `.test.ts` à côté sans toucher au tsconfig.

Le code est sain (`REPS_MAX_POUR_1RM = 15` avec la justification, le cas `reps === 1` traité à part pour ne pas ajouter les 3,3 % d'Epley). Mais ce sont des chiffres montrés à l'utilisateur et utilisés pour décider d'une charge en salle, et ils reposent sur des bornes silencieuses : `repsAu(0)` rendrait `Infinity`, `arrondirCharge(x, 0)` rendrait `NaN`, et `rmDesSeries` d'une liste vide rend `null` (correct, mais non vérifié).

**Correction.** Ajouter `src/calcul/performance.ts` et `performance.test.ts` au `include`, et écrire ~10 cas : série longue écartée, série vide, poids nul, `reps === 1`, aller-retour `estimerDepuisEssai` → `chargePour`, bornes de `repsAu`. **Effort : 2 h.**

---

### 11. ✅ corrigé le 17 septembre 2026 — **Douze vérifications de `test_ciqual.py` sont des tautologies qui ne peuvent pas échouer**
**Gravité : MOYENNE — Statut : CONFIRMÉ, corrigé le 17 septembre 2026** : le test a été réécrit pour appeler le script (voir son commentaire, `test_ciqual.py:123-137`). Le constat d'origine :
`test_ciqual.py:111-129` à l'audit

```python
attendu = CIBLE_GLUCIDES * 100 / RIZ_SEC["gluc"]
for rendement in (1.87, 2.26, 3.0, 4.68, 5.5):
    a_peser = CIBLE_GLUCIDES * 100 / RIZ_SEC["gluc"]   # expression identique, rendement absent
    servi   = a_peser * rendement
    verifier(..., presque(a_peser, attendu, 1e-9))     # a == a
    verifier(..., presque(servi, attendu * rendement, 1e-9))  # a*r == a*r
```

`rendement` n'entre pas dans `a_peser` : l'invariant est vrai par construction du test, pas par propriété du code. Idem `:122-123` (`attendu*4.68 > 2*attendu*1.87`, arithmétique pure) et `:128-129` (`round(350/155, 2) ≈ 2.26`, arithmétique pure sur des littéraux). Ces 12 vérifications sur ~38 gonflent le compteur affiché sans rien couvrir. Le commentaire `:99-110` l'admet à demi-mot (« c'est une impossibilité d'écriture […] le test ci-dessous le constate au lieu de le surveiller ») — mais un test qui « constate » une tautologie devrait être supprimé, pas conservé.

Sur les ~38 `verifier()` de ce fichier, **3 seulement appellent une fonction du script cible** (`sens_du_rendement`, `desaccords`, `valeurs_saisies_a_la_main`) ; le reste vérifie la cohérence des **tables de données**, ce qui est utile mais n'est pas de la couverture de code.

À l'inverse, `test_ecriture_grocy.py` (48 vérifications) est un vrai test bout-en-bout : il lance de vrais sous-processus contre un Grocy bouchonné en local, et couvre la protection `source_valeurs = "moi"`, le refus d'un grain apparié à une entrée cuite, le rendement à contresens, et l'idempotence au rejeu. C'est de la bonne matière.

**Correction.** Supprimer `test_ciqual.py:111-129`. **Effort : 15 min.**

---

### 12. ✅ corrigé le 17 septembre 2026 — **On refuse de supprimer un administrateur déjà désactivé, à tort**
**Gravité : MOYENNE — Statut : CONFIRMÉ, corrigé le 17 septembre 2026** : la règle reçoit `cibleEstActive` — la seconde correction proposée —, et une cible désactivée n'est plus le dernier administrateur de personne (`ProtectionDuCompte.php:89-98`, témoin `testUnAdministrateurDesactiveSeSupprimeQuandIlNeResteQuUnActif`). Le constat d'origine :
`api/src/Controller/ComptesController.php:296-302` (`administrateursActifs()`), appelé en `:152` et `:214`

Le contrat documenté était `@param int $adminsActifs nombre d'administrateurs ACTIFS, **cible comprise**` (`ProtectionDuCompte.php:30`, qui dit aujourd'hui « cible comprise si elle l'est »). Mais la requête compte `WHERE actif = true AND roles LIKE '%ROLE_ADMIN%'` : quand la cible est un administrateur **déjà désactivé**, elle n'est pas comptée.

Scénario : deux administrateurs, moi (actif) et un autre (désactivé). `adminsActifs = 1`, `cibleEstAdmin = true` → `dernierAdministrateur(true, 1) = true` → suppression **refusée** au motif que « c'est le dernier administrateur actif », alors que je suis actif et que la cible ne l'est pas. Le geste devient impossible depuis l'application, ce qui est précisément ce que cette classe cherche à éviter.

`ProtectionDuCompteTest` teste huit cas de la fonction pure, tous corrects — le défaut est dans le **câblage**, que rien ne teste.

**Correction.** Compter les administrateurs actifs **autres que la cible** (`AND id <> :cible`) et adapter le seuil à `< 1`, ou passer `cibleEstActive` en argument. **Effort : 1 h, test compris.**

---

### 13. ✅ corrigé le 7 septembre 2026 (lot 0) — **`tsconfig.tests.json` liste les fichiers un par un : un nouveau test peut ne jamais tourner**
**Gravité : FAIBLE — Statut : CONFIRMÉ**
`front/tsconfig.tests.json`

L'`include` énumère explicitement chaque `.ts` et chaque `.test.ts` (à l'exception de `src/solveur/**/*.ts`). Aujourd'hui les 16 fichiers de test y sont bien tous — vérifié. Mais ajouter `src/composants/etatChrono.test.ts` sans toucher au tsconfig produirait un test **silencieusement jamais exécuté** : `tsc -p` ne le compilerait pas, `node --test dist-tests/**` ne le trouverait pas, et la sortie afficherait simplement un total inchangé.

**Correction.** Remplacer par `["src/**/*.ts"]` et exclure ce qui ne compile pas en isolation, ou ajouter un test-verrou qui compare le nombre de `*.test.ts` sur disque au nombre de fichiers dans `dist-tests`. **Effort : 1 h.**

---

### 14. CLOS — **`DeductionDuPlan` : deux lignes sur la même référence, la seconde écrase — et le test l'entérine**
**Gravité : FAIBLE — Statut : CORRIGÉ LE 18 SEPTEMBRE 2026.** Les grammes
s'additionnent par référence **avant** le calcul du restant ; le test, renommé
`testDeuxLignesSurLeMemeAlimentSAdditionnent`, exige `[5 => 500.0]` et a été vu
rouge sur `800.0` avant le correctif. Une seule écriture par produit, donc un
seul mouvement d'inventaire côté Grocy.

Ce qui suit est l'état d'avant.
`api/src/Service/DeductionDuPlan.php:88` ; `api/tests/Service/DeductionDuPlanTest.php:159-176` à l'audit

`$quantites[identifiantSource($reference)] = round($restant / $parUnite, 3)` : chaque ligne recalcule depuis le stock **initial**. Deux lignes de 300 g et 200 g sur 1 000 g de riz donnent 800, pas 500 — 300 g de riz qui n'existent plus restent inscrits au frigo.

Le test `testDeuxLignesSurLeMemeAlimentNeSeCumulentPas` **affirme** `[5 => 800.0]` et documente le choix. La protection réelle est en amont : `consommationDuPlan()` (`front/src/calcul/cuisson.ts:390-408`) agrège bien par `aliment.id` — vérifié. Le risque est donc théorique aujourd'hui, mais il repose entièrement sur le front, et le seul test qui aurait pu l'attraper côté serveur entérine le contraire.

**Correction.** Cumuler les grammes par référence avant de calculer le restant (trois lignes), et corriger le test en `[5 => 500.0]`. **Effort : 30 min.**

---

### 15. CLOS — **Le bouchon HTTP de `FrigoGrocyCreationTest` répond `[]` à tout chemin inconnu**
**Gravité : FAIBLE — Statut : CORRIGÉ LE 18 SEPTEMBRE 2026.** Un chemin absent de
`$reponses` lève désormais une `LogicException` qui nomme la méthode et le chemin.
Et le garde a été **vu mordre** : `testLeBancRefuseUnCheminNonPrevu` monte le banc
sans aucune réponse déclarée et exige l'échec — un garde qu'on n'a jamais vu
tomber n'est pas un garde.

Ce qui suit est l'état d'avant.
`api/tests/Service/FrigoGrocyCreationTest.php:158-172` à l'audit

`return new MockResponse(json_encode($reponses[$chemin] ?? []));` — si le code appelait demain un endpoint Grocy supplémentaire (ou en renommait un), le bouchon rendrait un tableau vide sans broncher et les tests resteraient verts. C'est le genre de mock assez permissif pour valider un code faux.

Le reste de ce fichier est bon : les corps envoyés sont capturés et vérifiés champ par champ, et les cas de refus vérifient en plus qu'**aucun** `POST /objects/products` n'est parti.

**Correction.** Lever une exception explicite sur un chemin non prévu dans `$reponses`. **Effort : 15 min.**

---

### 16. ✅ corrigé le 16 septembre 2026 — **Le docblock de `Aliment` décrit l'ancienne convention, abandonnée**
**Gravité : FAIBLE — Statut : CONFIRMÉ, corrigé le 16 septembre 2026** : le docblock dit la règle, et raconte l'erreur qu'il portait (`Aliment.php:24-42`). Le constat d'origine :
`api/src/Entity/Aliment.php:22-27` à l'audit

> « proteines : valeurs CRUES, ratio = cuit/cru ; **feculents : valeurs CUITES**, ratio = cuit/sec »

C'est exactement l'inverse de la règle posée par la refonte, martelée dans `RendementPlausible.php:20-24`, `AlimentDisponible.php:36-40` et `plausibilite.ts:26-28` : « les macros décrivent TOUJOURS le produit tel qu'on le pèse ». Ce commentaire est sur l'entité qui définit le schéma — c'est le premier endroit qu'on lit avant de saisir un aliment, et il conseille précisément l'erreur (valeurs cuites sur un féculent) que `plausibilite.ts` bloque ensuite sous le code `valeurs_deja_cuites`. Même remarque pour la fin de la ligne 26 : « personne ne peut en supprimer », alors qu'une opération `Delete` existe (aujourd'hui `Aliment.php:60-63`).

**Correction : 15 min.**

---

### 18. ✅ corrigé le 15 septembre 2026 (D4, `texte.ts`) — **Cinq implémentations de « sans accent » dans le front, dont trois avec un littéral fragile**
**Gravité : FAIBLE — Statut : CONFIRMÉ**

- `front/src/calcul/frigo.ts:40`, `front/app/admin-exercices.tsx:118`, `front/src/solveur/garanties.test.ts:395` : `replace(/[̀-ͯ]/g, '')` — la plage de diacritiques est écrite avec des **caractères combinants bruts** dans le source, illisible et sensible à tout retraitement d'encodage ;
- `front/src/solveur/composer.ts:183` et `front/src/composants/choixAliment.tsx:50` : la même chose en `/[̀-ͯ]/g`, forme correcte ;
- `front/src/calcul/cuisson.ts:491-501` : une table de 25 lettres à la main, avec une justification solide (Hermes n'implémente pas toujours `normalize`) — et le commentaire affirme « CETTE FONCTION EST LA SEULE À NORMALISER, dans tout le projet », ce qui n'est plus vrai.

Les usages diffèrent (clé d'habitude vs filtre de recherche) et aucun ne fausse un chiffre. Mais si `normalize` est réellement absent sur certaines versions d'Hermes, les quatre autres implémentations **échouent silencieusement sur Android** : `'Épinards'.normalize` lèverait, ou la recherche « epinard » ne trouverait rien.

**Correction.** Exporter la fonction de `cuisson.ts` (celle qui ne dépend d'aucun moteur) et l'utiliser partout. **Effort : 1 h.**

---

### 19. CLOS — **Divisions et conversions non gardées dans `ciqual_vers_grocy.py`, au milieu d'une phase d'écriture**
**Gravité : FAIBLE — Statut : CORRIGÉ LE 18 SEPTEMBRE 2026**, les cinq points
et les trois remarques qui suivaient. 181 vérifications au départ, **271** à
l'arrivée.

Le plus grave était le deuxième : une valeur illisible faisait `None * ratio`,
donc un `TypeError` non rattrapé **en plein `--appliquer`**, après que des
écritures étaient déjà parties vers Grocy. Le produit fautif est maintenant
refusé et nommé — champ et valeur — et la boucle continue. La preuve a été
faite par mutation : remettre une minute la ligne d'origine reproduit le
`TypeError` au milieu de la boucle d'écriture.

Les fibres d'une étiquette qui n'en parle pas valent `None` et non `0` : règle 6
du projet, inconnu n'est pas zéro. Le `0` des lipides du skyr, lui, reste un
vrai zéro lu sur l'emballage, et une vérification le fige exprès.

`GRAINS_SECS` **sert enfin** à ce que son commentaire promettait :
`incoherences_des_tables()` refuse au démarrage un rendement nul, négatif ou
absent — sans quoi un ratio à 0 serait écrit dans Grocy, où il dit que 100 g de
sec donnent 0 g de cuit. Un test AST exige que ce garde-fou soit réellement
appelé dans `main()`, pour que l'histoire ne se répète pas. `tolerer_pieges`,
jamais passé à `True`, est supprimé ; la clé `"skyr"` de `CORRESPONDANCE`,
inatteignable car interceptée plus tôt par `ETIQUETTES`, aussi — et le test qui
la remplace est général : **aucune** clé ne doit être déjà interceptée.

**Non éprouvé** : `test_ecriture_grocy.py` ne se lance pas ici (il écrit vers
Grocy). Vérification statique faite à sa place — aucun produit « skyr » dans son
faux Grocy, toutes ses valeurs numériques, pas de `--chercher`, classeur non
vide, et les tables réelles passent le nouveau garde-fou.

Ce qui suit est l'état d'avant.
`ciqual_vers_grocy.py:992`, `:1022`, `:849`, `:349`, `:895` à l'audit

- `:992` et `:1022` — `abs(calcule - ratio) / ratio`, `ratio` venant directement de la table `CORRESPONDANCE` (`:206-273`), sans garde. Une entrée à `0` fait planter tout l'import ;
- `:849` — la boucle de conversion saute `None` et `""` mais pas une chaîne inconvertible : `nombre("n/a")` rend `None`, puis `None * ratio` lève un `TypeError` **non rattrapé, en plein `--appliquer`**, après que des écritures sont déjà parties vers Grocy ;
- `:349` — `next(lignes)` nu : `StopIteration` sur un classeur vide, alors que toutes les autres erreurs de lecture sont soigneusement messagées (`:343-345`) ;
- `:895` — `sys.argv[sys.argv.index("--chercher") + 1]` : `IndexError` si l'option est le dernier argument ;
- `:936` — l'étiquette écrit `"fibres": 0` en dur, ce qui contredit la règle affirmée en `:1144-1147` (« inconnu ne doit pas devenir zéro »).

Également relevé : `GRAINS_SECS` (`:182`) n'est jamais utilisé bien que son commentaire annonce un garde-fou ; `SEC_MINI, SEC_MAXI` est défini deux fois à l'identique (`:483` et `:801`) ; `tolerer_pieges` (`:414`) n'est jamais passé à `True` ; `"skyr"` dans `CORRESPONDANCE` (`:225`) est inatteignable car intercepté plus tôt par `ETIQUETTES` (`:188`, `:931-938`).

**Effort : 2 h pour l'ensemble.**

---

## 4. Dette visible — synthèse

**Aucun `TODO`, `FIXME`, `HACK` ni `XXX`** dans `api/src/`, `front/src/`, `front/app/` ni les scripts Python (le seul faux positif est `GROCY_API_KEY=xxx` dans un exemple d'usage). **Aucun test désactivé, ignoré, `skip`, `todo` ou `only`.** Trois `eslint-disable` seulement, tous justifiés.

La dette est réelle mais **écrite en prose française dans les commentaires**, donc invisible à tout outil qui cherche des marqueurs : `ciqual_vers_grocy.py:459-477` (fonctions supprimées, commentaire conservé), `test_ciqual.py:99-110` (batterie de tests retirée, tautologies laissées à la place).

**Fonctions dupliquées entre `api/` et `front/`, avec risque réel de divergence :**

| Duplication | Emplacements | Divergence |
|---|---|---|
| Plausibilité d'un rendement | `RendementPlausible.php:48` / `plausibilite.ts:280-382` | **Oui, avérée** (constat 7, toujours ouvert) |
| Seuil « 100,5 g de matière » | `AlimentDisponible.php:141` / `plausibilite.ts:215` | Pas encore |
| Contrôle énergétique Atwater | `nutrition.ts:63` / `plausibilite.ts:68` — **deux fois dans le front** à l'audit | **Oui, avérée** à l'audit (constat 8) ; une seule somme, `kcalDesGrammes`, depuis le 17 septembre 2026 |
| Convention macros crues/cuites | `ciqual_vers_grocy.py` / `grocy_macros.py` | **Oui, opposée** (constat 5) |
| Normalisation d'accents | 5 implémentations dans le front | Pas de conséquence numérique (constat 18) |

**Code mort confirmé :** `Exercice.public` et `Exercice.creePar` (jamais renseignés, jamais lus — constat 4) ; `GRAINS_SECS`, `tolerer_pieges`, la clé `"skyr"` et le doublon `SEC_MINI/SEC_MAXI` dans `ciqual_vers_grocy.py` ; `RIZ_SEC` défini deux fois dans `test_ciqual.py`.

---

## 5. Ce qui va bien

1. **`garanties.test.ts` tient sa promesse, et c'est rare.** J'ai vérifié les trois propriétés annoncées et elles sont réellement testées : *arrondi avant macros* — `macrosAffichees()` reconstruit les macros depuis `q.aCuire`, c'est-à-dire depuis **l'affichage**, et les compare à 0,01 près à celles annoncées ; côté code, `solveur.ts:259-265` arrondit bien avant de calculer. *Jamais de quantité négative* — testé, avec `Number.isFinite` en plus. *Toute déviation expliquée* — trois invariants distincts (`ok` ⇔ trois macros dans la tolérance, un repas raté porte un diagnostic non-`info`, un repas juste ne porte aucun blocage). En prime, un **méta-test** (`La batterie couvre vraiment quelque chose`) exige > 800 scénarios, > 100 réussis, > 100 ratés, > 50 plafonnements et > 20 échanges : sans lui, un jeu de données dégénéré rendrait tous les autres invariants vrais et vides. C'est le test le mieux conçu du projet. *Précision* : la batterie construit **1 000 scénarios** (250 frigos × 4 repas), pas 5 000 — le fichier lui-même et `ETAT.md:60` disent bien « mille », le chiffre de 5 000 ne vient pas du projet.

2. **Les tests disent *pourquoi*, avec la panne qu'ils empêchent.** `DeductionDuPlanTest` (« pas 200 mais 0,5 — sans cette conversion, deux pots deviendraient deux cents pots »), `InventaireUneLigneTest` (« ce qui s'est passé le 14 août 2026 »), `ProtectionDuCompteTest` (« `<= 1` et pas `=== 1` »). Chacun est un cas vécu figé, pas une ligne de couverture. C'est la meilleure défense contre la régression, et c'est cohérent d'un bout à l'autre.

3. **Les tests de l'API sont volontairement sans base ni noyau, et c'est un choix payant.** `LotDHabitudes` et `ProtectionDuCompte` ont été *extraits de leurs contrôleurs* pour cette raison, et le disent. `tests/bootstrap.php` rend même la suite jouable sur un clone frais sans `.env`. Résultat : 8 fichiers, ~90 cas, aucun effet de bord, exécutables partout — sauf ici, faute d'extensions PHP.

4. **La gestion d'erreur du client HTTP est au-dessus de la moyenne.** Corps non-JSON traité comme une réponse en erreur et non comme une exception, panne réseau qui nomme l'adresse qui a échoué, `terminerSession()` réservé au 401 franc, dédoublonnage des renouvellements concurrents. Chaque décision porte la panne qu'elle a corrigée. Il ne manque que les tests (constat 6).

5. **L'ordre des écritures est réfléchi là où ça compte.** `PlansController` marque le plan cuisiné **avant** de toucher au stock, avec l'argumentaire complet : des deux pannes possibles, on choisit celle qui se voit plutôt que celle qui déduit deux fois. `FrigoBase::definirStock` enveloppe son `DELETE` + `INSERT` dans une transaction après avoir perdu 800 g de congélateur. Ce genre de raisonnement est plus rare que des tests.
