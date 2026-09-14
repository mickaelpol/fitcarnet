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

**+ C4**, découvert le 14 septembre 2026 en corrigeant É7 et **tranché le jour même** : le catalogue d'aliments de départ portait des valeurs de fixture de test. Il a été supprimé plutôt que reconstitué. Voir ci-dessous.

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

### C3 — ✅ corrigé le 14 septembre 2026 — Aucun test ne vérifiait l'isolation entre comptes
`api/tests/` — **CONFIRMÉ (absence), désormais couvert par 18 témoins**

**Ce qui a été fait.** Quatre fichiers, sans base ni noyau, un par pièce du dispositif :
`FiltreProprietaireTest` (5), `FiltreAlimentTest` (5), `ProprietaireProcessorTest` (4),
`CompteActifTest` (4). Chaque témoin a été **mis en échec** en cassant le code qu'il protège,
avant d'être conservé — la restriction retirée de `applyToItem`, le `1 = 0` supprimé, le garde
`is_a()` court-circuité, le propriétaire écrasé, le compte désactivé laissé passer.

**Deux choses apprises en chemin, qui ne figuraient nulle part :**

- Le commentaire de `FiltreAliment` disait ses parenthèses « indispensables ». Elles ne le sont
  pas : Doctrine parenthèse déjà toute partie contenant `OR` au moment de combiner les conditions
  (`Query\Expr\Composite`, correctif DDC-1237). Les retirer ne change pas un caractère du DQL.
  Elles sont conservées — elles disent l'intention — mais le commentaire a été corrigé, et le test
  éprouve désormais l'invariant plutôt que la mécanique.
- `ProprietaireProcessor` ne pose le propriétaire que s'il est absent. Vérifié : la propriété
  `utilisateur` n'appartient à aucun groupe de `denormalizationContext`, un client ne peut donc pas
  la transmettre. Le garde protège un PATCH, pas une usurpation.

<details><summary>Le constat d'origine</summary>


Aucune occurrence de `FiltreProprietaire`, `FiltreAliment`, `ProprietaireProcessor` ni `CompteActif`
dans les tests. Le code, lui, **est bon** : relu ligne à ligne, le filtre s'applique en collection
et en item, avec `1 = 0` pour un non-authentifié, le `OR` de `FiltreAliment` est correctement
parenthésé, les entités filles sont en `operations: []`, et les 8 contrôleurs scopent tous par
`getUser()`.

C'est donc un risque, pas un défaut actif — mais toute la garantie d'isolation tient à **deux
`tags:` dans `services.yaml`** et au fait que chaque nouvelle entité pense à implémenter
`ProprieteUtilisateur`. Une régression serait totalement silencieuse.

</details>

*Correction proposée à l'époque : (a) test unitaire de `FiltreProprietaire` avec `Security`
bouchonné ; (b) **test d'inventaire du modèle** — parcourir `src/Entity/*.php` et exiger que toute
classe `#[ApiResource]` à opérations non vides implémente `ProprieteUtilisateur` ou figure dans une
liste blanche explicite. C'est (b) qui attrape la vraie panne. 2-3 h.*

---

### C4 — ✅ tranché le 14 septembre 2026 — Le catalogue d'aliments de départ est supprimé
`db/02-donnees.sql` — **découvert en corrigeant É7, résolu par une décision produit**

**Le constat.** L'écrasement de É7 n'avait pas seulement supprimé 49 `UPDATE` : il avait laissé à
leur place les valeurs de la **table factice du banc d'essai**. Vérifié contre la table de l'Anses :
le riz portait 1,58 g de lipides au lieu de 0,79, et 3,20 g de fibres au lieu de 1,53. Deux lignes
portaient en outre des valeurs de **cuit** dans une base qui pèse du cru — boulgour à 83 kcal quand
le boulgour sec en fait 347 — ce que le seed signalait déjà lui-même.

**Ce que j'avais mal jugé, et qui a été corrigé par l'auteur du projet.** J'avais compté « 44
aliments sur 50 sans fibres » comme un défaut. C'en est un seulement si l'application confond
absence et zéro — or elle ne le fait pas : `controler()` distingue `fibresConnues`, élargit son
seuil de tolérance et l'écrit à l'écran (« sans les fibres le contrôle reste approximatif »). C'est
la règle 6 correctement appliquée. Il n'y avait rien à corriger de ce côté.

**La décision, et son motif.** Le catalogue de départ est **supprimé**, plutôt que reconstitué. Les
valeurs nutritionnelles ne sont pas une constante universelle : deux paquets du même produit ne
portent pas les mêmes chiffres, et en France l'étiquette les donne — fibres comprises, là où les
tables américaines les omettent. Un utilisateur qui rentre de courses a sous les yeux les valeurs
justes pour *ce qu'il a acheté* ; une moyenne nationale posée d'avance ne peut que le tromper, en
lui donnant l'impression que la question est réglée. Pour un compte Grocy, la question ne se pose
pas : `FrigoGrocy` déclare le userfield « Fibres / 100 g », le crée s'il manque, le lit et l'écrit.

Reconstituer 53 `UPDATE` aurait de surcroît demandé des correspondances arbitraires. Preuve par
l'exemple : Ciqual contient « Riz thaï ou basmati, cru » (351 · 78,4 · 0,63 · 1,06), mais la
migration visait « Riz blanc, cru » — **même la version saine d'août utilisait la mauvaise entrée**.

**Ce qui a été fait.** Le bloc `INSERT INTO aliment` retiré de `db/02-donnees.sql` ; les
emplacements, modes de cuisson et exercices — structurels — conservés. Les migrations 14 à 19 sont
**gardées telles quelles**, idempotentes : sans catalogue elles ne trouvent rien à corriger, et sur
une base existante elles gardent leur raison d'être. Chacune porte désormais un en-tête le disant.
`installer.sh` n'annonce plus « 0 aliments » comme une anomalie.

**Ce qui n'a délibérément PAS été fait** : rien n'est supprimé des bases existantes. `stock.aliment_id`
est en `ON DELETE RESTRICT`, et surtout `plan_repas.contenu` est du **JSON** — un aliment supprimé
qui y figure laisserait le plan incohérent sans la moindre erreur SQL. La suppression se fait donc
à la main, depuis l'écran, aliment par aliment.

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
- **É4** — ✅ **corrigé le 14 septembre 2026.** `restaurer-nas.sh` n'arrêtait que `fitcarnet-app` ;
  `fitcarnet-taches` tourne en `replicas: 2` et n'a donc pas de `container_name` — rien ne le
  désignait. Les travailleurs survivent au `DROP DATABASE`, et `reprendreLesAbandonnes()`, appelé
  **au démarrage**, remettait en attente les lots `en_cours` restaurés : d'anciennes quantités
  repartaient vers Grocy.

  **La formulation courte de ce constat se trompait de remède**, et le corps du constat avait
  raison : arrêter les travailleurs ne recule la panne que du temps d'un `docker start`, puisque
  c'est le *contenu restauré* qui est périmé, pas la concurrence. Le correctif est de **neutraliser
  les lots restaurés** (`statut = 'echoue'`, jeton à `NULL`, motif lisible à l'écran) ; l'arrêt sert
  à garantir la fenêtre où personne ne peut en prendre un.

  Travailleurs trouvés par **étiquette compose** et non par nom — un nom en dur casserait sur le
  préfixe de projet de Portainer et sur un troisième exemplaire. Script en `#!/bin/sh`, vérifié à
  `bash -n` et `dash -n` (DSM n'a pas `bash` garanti), logique jouée sur copie jetable avec un faux
  `docker`.
- **É5** — ✅ **résolu par C2, le 14 septembre 2026.** Une installation de développement ne joue
  toujours pas `db/manuel/` — l'étape `dev` du Dockerfile n'a pas d'`ENTRYPOINT`, et c'est sans
  conséquence désormais : `db/01-schema.sql`, monté en `docker-entrypoint-initdb.d`, porte enfin
  tout le schéma. C'est exactement la base A de `verifier-schema.sh`, qui la déclare identique à
  une base migrée. *0 min : rien à faire de plus.*
- **É6** — ✅ **corrigé le 14 septembre 2026.** Un lot pouvait être volé à un travailleur vivant :
  `prendre()` verrouille le temps de la prise puis referme sa transaction, et `vu_le` — touché à
  chaque ligne — était la seule preuve de vie. Un Grocy qui met plus de deux minutes sur une ligne
  suffisait à ce que `reprendreLesAbandonnes()` rende le lot à un second travailleur pendant que le
  premier travaillait encore.

  **Colonne `jeton`** (migration 30), tirée à la prise et présentée à chaque écriture : `avancer`,
  `terminer` et `echouer` ne s'appliquent que si le lot est encore à nous, et rendent `false`
  sinon. `AppliqueInventaire` s'arrête alors proprement plutôt que d'écraser l'avancement de son
  remplaçant puis de clore le lot avec **sa** liste d'échecs. Mieux vaut une ligne envoyée deux
  fois — `definirStock` pose une quantité absolue — qu'un lot clos sur des chiffres faux.

  **Trouvé en chemin** : les trois lanceurs de migrations s'arrêtaient au glob `2[0-9]-*.sql`. La
  migration 30 n'aurait jamais été jouée, nulle part — ni à l'installation, ni au démarrage de la
  production. Le commentaire d'`installer.sh` prévenait pourtant : « un tri alphabétique qui fait
  office d'ordre de dépendances marche jusqu'au jour où un nom commence par une lettre ».

### Cohérence des données et scripts
- **É7** — ✅ **corrigé le 14 septembre 2026**, et l'écrasement est **daté**. Le banc passe désormais
  `--sortie` vers un temporaire, et une garde compare le SHA-256 du fichier versionné avant/après :
  retirer `--sortie` fait tomber le banc (vérifié, 38/49 au lieu de 49/49).

  L'historique confirme le soupçon : `1e40ba7` (48 UPDATE) → `a09b029` (53) → `f5dbb94` (53) →
  **`c0f6f10` (4)**, un commit intitulé « Batch cooking » sans aucun rapport. Les 4 survivants sont
  exactement les 4 aliments que la table factice sait produire.

  ⚠️ **Ce que É7 cachait est plus grave que É7** — voir le constat **C4** ci-dessous.
- **É8** — ✅ **corrigé le 14 septembre 2026.** Les exercices « personnels » étaient visibles de
  tous : `Exercice` portait `public` et `creePar` sans que rien ne les renseigne ni ne les lise —
  `setCreePar()` n'avait pas un seul appelant — pendant que l'écran affichait
  « ★ exercice personnel ».

  **Décision prise : les rendre vraiment privés.** `ExerciceProcessor` pose l'auteur et
  `public = false` à la création, `FiltreExercice` applique « **public OU le mien** » en collection
  et en item. La règle porte sur `public`, et non sur l'absence d'auteur comme pour `Aliment` : la
  nuance ouvre une troisième possibilité, l'exercice **publié mais attribué**, par où un
  administrateur verse au catalogue commun l'exercice bien rédigé de quelqu'un sans en effacer la
  paternité. C'est le `PATCH` d'administration, déjà réservé à `ROLE_ADMIN`, qui publie.

  Les 1 338 exercices importés sont `public = true` : ils restent visibles de tous, **aucune
  migration de données n'a été nécessaire**.

  Deux précisions, parce qu'elles se découvriraient autrement à l'usage :
  - **Un administrateur ne voit plus les exercices privés des autres**, et ne peut donc plus les
    fusionner. C'est la définition même de « privé », et non un effet de bord.
  - L'étiquette n'apparaissait que dans les **deux écrans d'administration**. Ce qui mentait
    vraiment, c'étaient les libellés « Les miens » et « tes exercices », qui désignaient tout ce
    qui avait été ajouté via l'application quel qu'en soit l'auteur : ils disent désormais
    « ajouté dans l'app ». Distinguer « le mien » demanderait d'exposer `creePar`, ce qui n'a pas
    été fait.

  10 témoins, chacun vu échouer. Le `PATCH` reste réservé à `ROLE_ADMIN` : **l'auteur d'un exercice
  privé ne peut toujours pas le corriger lui-même** — c'était déjà le cas avant, rien ne régresse,
  mais le filtrage rend la limite plus visible.
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
| **3 — sécurité et isolation** | ✅ 6/6 | É1, C3, É8, M-01, M-03 · **M-02 partiel** : fenêtre ramenée à 90 j, la visibilité des sessions reste à faire |
| **4 — base reproductible** | ✅ | C2, É5, É6 et les index de jointure · `verifier-schema.sh` : **✓ identiques** |
| **5 — scripts dangereux** | ✅ | É4, É7, `sauvegarde.sh` (É9 fait le 8 sept.) · a révélé **C4**, tranché |
| **6 — architecture front** | ⬜ 2-3 j | `repas.tsx` (2 397 l.), `hooks.ts` (1 228 l.), 10 duplications |
| **7 — tests manquants** | ⬜ ~6 h | É10 (client HTTP) et le câblage non couvert |
| **8 — le reste** | ⬜ | ~37 constats faibles |

Tests au 14 septembre : **362 front · 149 API · 491 assertions · 8 erreurs PHPStan**
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
3. ~~**`doctrine:schema:validate`**~~ — **mauvaise proposition, écartée le 14 septembre 2026.** Elle ne
   passera jamais sur ce projet : le schéma est écrit à la main et la base porte plus que les entités
   (`invitation` et `inventaire_lot` n'en ont aucune). Son `--dump-sql` propose de les *supprimer*, et
   `--force` détruirait les données. Le contrôle utile est `verifier-schema.sh`, ci-dessous.
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
