# Audit fitcarnet — 7 septembre 2026

Audit complet en lecture seule : sécurité, données et infrastructure, architecture front,
couverture de tests. Aucun fichier du projet n'a été modifié pendant l'audit.

Les quatre rapports détaillés, avec le raisonnement complet et les scénarios reproduits :

| Rapport | Constats |
|---|---|
| [01 — Sécurité API](01-securite-api.md) | 0 critique · 1 élevée · 3 moyennes · 9 faibles |
| [02 — Données et infrastructure](02-donnees-infra.md) | 1 critique · 5 élevées · 6 moyennes · 7 faibles |
| [03 — Architecture front](03-front.md) | 0 critique · 5 élevées · 14 moyennes · 14 faibles |
| [04 — Tests et robustesse](04-tests-qualite.md) | 2 critiques · 4 élevées · 6 moyennes · 7 faibles |

**Total : 3 critiques, 15 élevées, ~29 moyennes, ~37 faibles** (après dédoublonnage entre rapports).

## Ce que l'audit dit du projet

Le projet est **soigné**, et ce n'est pas une politesse : `tsc --noEmit` passe sans une erreur avec
`strict`, sans un seul `any` ni `@ts-ignore` dans tout le front ; les 320 tests front passent ; la
base porte ses invariants en contraintes SQL et pas seulement en code ; `sauvegarde-nas.sh` relit
son propre dump avec `pg_restore --list` avant de le déclarer valide, ce que beaucoup de systèmes
professionnels ne font pas ; les commentaires racontent la panne réelle avec sa date.

Les défauts trouvés ne sont pas ceux d'un projet négligé. Ce sont **des trous précis dans une
construction solide**, et ils ont presque tous la même forme : *une décision juste, appliquée à un
endroit et oubliée à un autre*. Le contrôle de propriété est fait sur un chemin d'écriture et pas
sur son jumeau. La formule d'Epley est bornée dans le module de référence et recopiée sans borne
dans deux hooks. La convention européenne des fibres est respectée dans `nutrition.ts` et ignorée
dans `plausibilite.ts`, deux fichiers voisins.

**La conséquence pratique : le remède principal n'est pas de corriger 84 lignes, c'est de supprimer
les duplications et d'installer les quatre garde-fous automatiques qui auraient attrapé la moitié de
cette liste sans intervention humaine.** D'où le lot 0 ci-dessous.

Un motif frappant, relevé par trois des quatre agents indépendamment : **la plupart des constats
contredisent un commentaire du projet lui-même**. Le désaccord n'est pas entre l'auteur et
l'auditeur — il est entre le code et sa propre documentation, ce qui rend chaque écart facile à
trancher : l'intention est déjà écrite.

---

## Les 3 constats critiques

### C1 — « J'ai cuisiné » échoue en production pour un compte Grocy
`api/src/Controller/PlansController.php:155` — **CONFIRMÉ, bug actif aujourd'hui**

`$this->grocy->inventorier($nouvellesQuantites)` appelle une méthode qui n'existe plus :
`FrigoGrocy` est une `final readonly class` dont la seule méthode d'inventaire est
`inventorierUn(int, float)` (`FrigoGrocy.php:450`). Le commit `1055cc2` a fait le remplacement
partout — `FrigoController`, `AppliqueInventaire` — sauf ici.

Pour un compte `sourceFrigo = 'grocy'` (l'administrateur), le plan est marqué cuisiné et flushé
ligne 148, puis PHP lève `Error: Call to undefined method`, que le `catch (\RuntimeException)` de la
ligne 156 n'attrape pas → 500. **Le stock n'est jamais déduit**, l'écran de rattrapage n'apparaît
pas, et un second appui rend 409 « déjà cuisiné ». Le plan cesse de réserver son stock et le solveur
compose ensuite sur des quantités qui n'existent plus — exactement le « bac vide une semaine plus
tard » que ce bouton existe pour éviter.

*Correction : boucler sur `inventorierUn()` en reprenant la forme de `FrigoController.php:301`.
30 min, 1 h avec test.* **PHPStan niveau 5 l'aurait attrapé gratuitement — voir lot 0.**

### C2 — La double écriture du schéma n'est pas tenue
`db/01-schema.sql` — **CONFIRMÉ, reproduit par diff de deux bases réelles**

Deux bases ont été construites dans un PostgreSQL 16 jetable — A depuis `01-schema.sql` seul,
B depuis A plus les 21 migrations dans l'ordre d'`installer.sh` — et leurs `pg_dump --schema-only`
comparés. **Le diff fait 312 lignes.**

Absents du schéma initial : la table **`complement`** (séquence, PK, FK, 2 index, 4 CHECK), la table
**`inventaire_lot`** (séquence, PK, FK, 3 index dont `inventaire_lot_un_seul_actif`, 3 CHECK), et
sept contraintes de positivité (`aliment_valeurs_positives`, `aliment_ratio_borne`,
`aliment_pesees_positives`, `cible_valeurs_positives`, `serie_valeurs_positives`,
`modele_serie_valeurs_positives`, `stock_quantite_positive`).

Le fichier affirme pourtant en tête (lignes 7-16) « CE FICHIER DÉCRIT LA BASE TELLE QU'ELLE EST
AUJOURD'HUI ». Une base neuve n'a ni compléments, ni file d'inventaire, ni aucun garde-fou de
positivité : elle accepte `kcal_100 = -350` en silence. La production ne le voit pas parce que
`entrypoint-prod.sh` rejoue `db/manuel/` à chaque démarrage — le risque est différé, pas absent.

Constat symétrique : `db/01-schema.sql:266` déclare `modele_exercice.secondes_total_cible`, colonne
créée par aucune migration, présente dans aucune entité, référencée par aucune ligne de code.

*Correction : replier le DDL de 25/26/27 dans le schéma, régler `secondes_total_cible`, et ajouter
au dépôt le script qui construit A et B et exige un diff vide. ~2 h.*

### C3 — Aucun test ne vérifie l'isolation des données entre comptes
`api/tests/` — **CONFIRMÉ (absence)**

Aucune occurrence de `FiltreProprietaire`, `FiltreAliment`, `ProprietaireProcessor` ni `CompteActif`
dans les tests. Le code, lui, **est bon** : relu ligne à ligne, le filtre s'applique en collection
et en item, avec `1 = 0` pour un non-authentifié, le `OR` de `FiltreAliment` est correctement
parenthésé, les entités filles sont en `operations: []`, et les 8 contrôleurs scopent tous par
`getUser()`.

C'est donc un risque, pas un défaut actif — mais toute la garantie d'isolation tient à **deux
`tags:` dans `services.yaml`** et au fait que chaque nouvelle entité pense à implémenter
`ProprieteUtilisateur`. Une régression serait totalement silencieuse.

*Correction, sans base de données : (a) test unitaire de `FiltreProprietaire` avec `Security`
bouchonné ; (b) **test d'inventaire du modèle** — parcourir `src/Entity/*.php` et exiger que toute
classe `#[ApiResource]` à opérations non vides implémente `ProprieteUtilisateur` ou figure dans une
liste blanche explicite. C'est (b) qui attrape la vraie panne. 2-3 h.*

---

## Les 15 constats élevés

### Sécurité
- **É1** — ✅ **corrigé le 8 septembre 2026.** L'inventaire différé n'avait aucun contrôle de
  propriété sur l'aliment. `FrigoController.php:332-390` + `AppliqueInventaire.php:146-179`. Le
  chemin jumeau (`POST /api/mon-frigo/stock`) avait reçu `alimentAccessible()` pour corriger
  exactement cette faille ; `POST /api/mon-frigo/inventaire` ne l'avait pas eu. Un compte pouvait
  écrire une ligne de stock sur l'aliment privé d'un autre, qui ne pouvait alors plus le supprimer.

  **Ce qui a été fait.** Le contrôle est posé **au dépôt** du lot, en une requête pour tout
  l'inventaire, et refuse en 404 sans nommer la ligne fautive — distinguer « n'existe pas » de
  « n'est pas à toi » rendait l'énumération des identifiants confortable. Surtout, la règle a
  déménagé dans `FrigoBase::alimentsAccessibles()` et `definirStock()` la pose lui-même : les
  **trois** appelants sont couverts d'un coup — la route `/stock`, l'inventaire différé et le
  bouton « J'ai cuisiné » de `PlansController`, dont deux ne vérifiaient rien. Les deux appelants
  de fond attrapaient déjà `\Throwable` et nomment l'échec, donc aucun 500 nouveau.
  Tests : `tests/Controller/InventaireProprieteTest.php` et `tests/Service/StockProprieteTest.php`,
  chacun avec son témoin « mon propre aliment passe toujours ». Reste de E-01 : le message DBAL
  brut rendu au client, qui appartient à **M-03**.

### Données et infrastructure
- **É2** — `25-garde-fous.sql:37-41,85-88` fait `UPDATE … SET kcal_100 = NULL` sur une colonne
  `NOT NULL`. Reproduit : `ERROR: null value … violates not-null constraint`, contrainte non posée.
  Comme `entrypoint-prod.sh:139` utilise `ON_ERROR_STOP=1` + `exit 1` sous `set -e`, **le jour où une
  seule valeur négative existe — le cas que ce fichier dit avoir constaté — le conteneur applicatif
  ne redémarre plus.** *Correction : `= 0` au lieu de `= NULL`. 20 min.*
- **É3** — `installer.sh:167` joue les migrations sans `ON_ERROR_STOP` : psql continue après erreur
  et sort 0, l'installateur affiche « ✓ » sur un échec. C'est le mécanisme exact par lequel une
  divergence s'installe sans bruit. *15 min.*
- **É4** — `restaurer-nas.sh:34,157` n'arrête pas les travailleurs, alors que le script écrit
  lui-même qu'il ne faut pas restaurer sous une application qui écrit. Un lot `en_cours` restauré
  est repris par `reprendreLesAbandonnes()` : **d'anciennes quantités repartent vers Grocy** et le
  frigo réel est corrigé à l'envers. *30 min.*
- **É5** — Une installation de développement suivie à la lettre ne joue jamais `db/manuel/` :
  l'étape `dev` du Dockerfile n'a pas d'`ENTRYPOINT`. Combiné à C2 → 500 sur
  `relation "complement" does not exist`. *15 min, ou 0 après C2.*
- **É6** — Course sur les lots d'inventaire. `prendre()` fait bien `FOR UPDATE SKIP LOCKED` mais
  ferme sa transaction aussitôt ; la seule protection restante est un délai de 2 min sur `vu_le`.
  Un lot peut être volé à un travailleur vivant, **rompant l'invariant « un seul lot actif »** que
  la migration 26 existe pour garantir. *Correction : colonne `jeton` posée par `prendre()`. ~2 h.*

### Cohérence des données et scripts
- **É7** — `test_ecriture_grocy.py:367` écrase `db/manuel/16-catalogue-ciqual.sql`, fichier versionné
  et **corrigé à la main**, et y réintroduit le bug de `LIKE '%…%'` non ancré qui donnait 631 kcal à
  « Lait d'amandes ». Comme `entrypoint-prod.sh` rejoue les migrations, l'erreur atteint la
  production. Indice que c'est déjà arrivé : le fichier committé ne porte que 4 `UPDATE`, aux valeurs
  de la table factice du test, contre ~50 attendus. *2 h.*
- **É8** — Les exercices « personnels » sont visibles de tous. `Exercice` porte `public` et `creePar`
  mais ces champs ne sont **jamais renseignés ni lus** ; l'écran affiche pourtant
  « ★ exercice personnel » (`admin-exercices.tsx:299`). Deux colonnes qui promettent une
  confidentialité que rien n'applique. *Décision produit à trancher : filtre + processeur (~2 h), ou
  suppression des colonnes et de l'étiquette (~1 h).*
- **É9** — `grocy_macros.py:105-113` écrit dans les mêmes champs Grocy avec la **convention inverse**
  (valeurs cuites, riz basmati à 130 kcal contre 350 sec) : un produit amorcé ainsi fait peser ~3×
  trop de riz. Et son appariement sans borne de mot fait recevoir 575 kcal à « Lait d'amandes » —
  littéralement le bug corrigé à la main dans la migration 16. *1 h (supprimer) à 4 h (aligner).*

### Front — chiffres faux montrés à l'utilisateur
- **É10** — `front/src/api/client.ts` (342 lignes) n'a **aucun test** : rejeu sur 401, distinction
  panne réseau / refus serveur, corps non-JSON. Tout est bien écrit, rien n'est vérifié. *4 h.*
- **É11** — **Trois formules d'Epley** aux règles de validité différentes (`performance.ts:26-38`
  avec plafond à 15 reps, `hooks.ts:905-907` plafond recopié en dur, `hooks.ts:825-826` **sans
  plafond**). L'écran de séance consomme les deux dernières : 30 répétitions à 40 kg créent un
  « record » de **79,96 kg**, et chaque séance suivante s'affiche en recul face à un record fantôme
  que la formule elle-même déclare invalide. *~1 h.*
- **É12** — Un « reste » déclaré **rétrécit la liste de courses**. `composer.ts:713-718,754-760` :
  `plafonds` survit à la passe « frigo plein » censée n'en avoir aucun. Reproduit : sans reste,
  liste = `[Riz, 20 g]` ; en déclarant « il me reste 80 g de riz », liste = `[]`, pour un plan
  cuisiné **identique**. Fait sous-acheter, et ça ne se voit qu'au supermarché. *15 min + 1 test.*
  ⚠️ *Ce code fait partie du travail non encore committé — c'est le meilleur moment.*
- **É13** — `plausibilite.ts:49-50` applique la formule **américaine** d'Atwater (fibres ignorées),
  celle que `nutrition.ts:4-7` interdit explicitement quatre fichiers plus loin. Reproduit sur des
  graines de chia : « 486 kcal déclarées, mais ses macros en font 378 » — alors que dans la
  convention de l'app le calcul juste donne 445,8 et qu'**aucune des deux valeurs saisies n'est
  fausse**. Le module dont la raison d'être est de repérer les données qui mentent accuse une donnée
  juste, sur toute la famille des oléagineux. *10 min (+ ajuster `plausibilite.test.ts:165`).*
- **É14** — **Session morte sans porte de sortie.** Trois décisions correctes qui s'enferment :
  `client.ts:145-146` rend `false` sans appeler `terminerSession()` ; le portier de `_layout.tsx:70`
  ne teste que la présence d'une chaîne, donc un JWT expiré compte comme « connecté » ;
  et `compte.tsx:24-26` place le `if (isError)` **avant** le seul bouton de déconnexion de toute
  l'application. Seule issue pour l'utilisateur : effacer les données de l'app. *~30 min.*
- **É15** — `sauvegardeAuto.ts:33-53` abandonne l'envoi si un autre est en vol, **sans réessai
  programmé**. En salle : on coche une série, on tape la charge suivante, on appuie sur Retour →
  la charge n'est jamais envoyée, et rien ne le signale. C'est exactement le cas que le commentaire
  des lignes 55-58 dit couvrir. *~1 h.*

---

## Où en est le chantier

Au 7 septembre 2026, 15 commits sur `master`, tout poussé sur Gitea.

| Lot | État | Détail |
|---|---|---|
| **0 — garde-fous** | ✅ | `CLAUDE.md`, PHPStan niveau 5, `ModeleExposeTest`, `verifier-schema.sh`, `verifier-migrations.sh`, glob des tests, 2 hooks |
| **1 — ce qui est cassé** | ✅ 4/4 | C1, É2, É3, É14 — chacun avec un test écrit et vu échouer d'abord |
| **2 — chiffres faux** | ✅ 4 élevés + 2 moyens | É11, É12, É13, É15, M2, M3 · **restent M1 et M4** |
| **3 — sécurité et isolation** | 🟨 1/6 · ~4 h | **É1 fait** · restent C3, É8, M-01 à M-03 — **en cours** |
| **4 — base reproductible** | ⬜ ~4 h | C2 : `verifier-schema.sh` signale toujours **280 lignes** d'écart |
| **5 — scripts dangereux** | ⬜ ~3 h | É4, É7, É9, `sauvegarde.sh` |
| **6 — architecture front** | ⬜ 2-3 j | `repas.tsx` (2 397 l.), `hooks.ts` (1 228 l.), 10 duplications |
| **7 — tests manquants** | ⬜ ~6 h | É10 (client HTTP) et le câblage non couvert |
| **8 — le reste** | ⬜ | ~37 constats faibles |

Tests au 7 septembre : **362 front · 102 API · 422 assertions · 8 erreurs PHPStan**
(aucune sur les fichiers corrigés).

Deux points laissés ouverts volontairement :
- **É14** n'a reçu qu'un volet sur trois. Le premier suffit à rouvrir la session ; les deux
  ceintures de sécurité (`compte.tsx`, `_layout.tsx`) attendent une bibliothèque de test de
  composants, que le projet n'a pas.
- **La table des paliers du disque RM** (`disqueRM.tsx`) diffère de celle du calculateur.
  Décision d'affichage à trancher : à 40 %, la formule annonce 45 répétitions alors que
  `REPS_MAX_POUR_1RM` vaut 15.

Une refonte vers l'architecture hexagonale est un objectif assumé, **non commencée**. Voir la
section « Skills » de `CLAUDE.md` : elle ne doit jamais se mélanger à une correction de bug.

## Plan de correction proposé

### Lot 0 — Les garde-fous qui empêchent la récidive  · ~3 h · **à faire en premier**

Quatre outils absents, qui auraient attrapé seuls une bonne part de cette liste :

1. **PHPStan niveau 5** sur `api/` — attrape C1 gratuitement, et tout appel de méthode inexistante.
2. **Glob dans `tsconfig.tests.json`** — le fichier énumère chaque test à la main : un nouveau
   `.test.ts` non listé n'est jamais exécuté, sans le moindre signal (c'est pourquoi
   `performance.ts`, où vivent É11, M2 et M3, n'a aucun test).
3. **`doctrine:schema:validate`** — n'existe nulle part ; détecte les divergences entités ↔ schéma.
4. **Le script de comparaison des deux bases** que `INSTALLATION.md` propose en dernière ligne et
   qui n'avait manifestement jamais été lancé — c'est lui qui a révélé C2.

Investir ici d'abord change la nature de tout le reste : les lots suivants sont alors vérifiés par
la machine au lieu de l'être à l'œil.

### Lot 1 — Ce qui est cassé maintenant · ~2 h
C1 (bouton « J'ai cuisiné ») · É2 (redémarrage prod impossible) · É3 (installateur qui ment) ·
É14 (session morte).

### Lot 2 — Les chiffres faux montrés à l'utilisateur · ~3 h
É11 (record fantôme) · É12 (sous-achat) · É13 (fibres) · É15 (saisie perdue) · M1 à M4 du rapport
front. C'est le cœur du sujet pour une application de nutrition : un chiffre faux affiché avec
assurance est pire qu'un refus de répondre.

### Lot 3 — Sécurité et isolation · ~5 h
É1 (propriété sur l'inventaire) · C3 (tests d'isolation) · É8 (décision produit sur les exercices) ·
M-01 à M-03 du rapport sécurité.

### Lot 4 — Base reproductible · ~4 h
C2 (double écriture) · É5 (install dev) · É6 (course sur les lots) · index de clés étrangères
manquants · divergences entités ↔ schéma.

### Lot 5 — Scripts dangereux · ~3 h
É4 (restauration sous travailleurs actifs) · É7 (test qui écrase une migration) · É9
(`grocy_macros.py`) · `sauvegarde.sh` sans fichier `.partiel`.

### Lot 6 — Architecture front · ~2-3 jours
Découpage de `repas.tsx` (2 316 lignes, 4 écrans, 17 `useState`) et de `hooks.ts` (1 228 lignes),
suppression des 10 duplications réelles. Le détail actionnable, module par module, est dans
[03-front.md](03-front.md). Les quatre premiers rangs de ce lot corrigent à eux seuls cinq constats
dont deux élevés.

### Lot 7 — Tests manquants · ~6 h
É10 (client HTTP) · `performance.ts` · le câblage des chemins critiques non couverts.

### Lot 8 — Le reste
Les ~37 constats faibles, dont beaucoup sont des corrections de 5 minutes (code mort, commentaires
périmés, permission `RECORD_AUDIO` inutile déclarée en double).
