# Audit fitcarnet — 7 septembre 2026

Audit complet en lecture seule : sécurité, données et infrastructure, architecture front,
couverture de tests. Aucun fichier du projet n'a été modifié pendant l'audit.

Les quatre rapports détaillés, avec le raisonnement complet et les scénarios reproduits :

| Rapport | Constats |
|---|---|
| [01 — Sécurité API](01-securite-api.md) | 0 critique · 1 élevée · 2 moyennes · 9 faibles |
| [02 — Données et infrastructure](02-donnees-infra.md) | 1 critique · 5 élevées · 5 moyennes · 6 faibles |
| [03 — Architecture front](03-front.md) ⚠️ | 0 critique · 5 élevées · 14 moyennes · 14 faibles — **ce rapport décrit l'arborescence d'AVANT le lot 6 et n'a pas été réécrit**. `hooks.ts` n'existe plus (éclaté en `src/api/hooks/`), et tous ses numéros de ligne sont périmés. Il reste utile pour le *raisonnement* de chaque constat, jamais pour localiser du code |
| [04 — Tests et robustesse](04-tests-qualite.md) | 2 critiques · 3 élevées · 6 moyennes · 6 faibles |

**Total : 3 critiques, 14 élevées, ~27 moyennes, ~35 faibles** (après dédoublonnage entre rapports).

> **Au 18 septembre 2026 : 62 constats clos, 17 ouverts** — vérifiés un par un
> dans le code ce jour-là. **Aucun critique ni élevé n'est ouvert** : les 18
> sont 12 moyens et 6 faibles. Par rapport : 01 — 0 ouvert sur 12 ; 02 — 6 sur
> 17 ; 03 — 8 sur 33 ; 04 — 4 sur 17. **Trois sont à trancher** (02#13,
> 02#15, 02#17), les quinze autres n’ont aucune décision consignée. La liste,
> avec la preuve de chacun, est dans « [Ce qui reste ouvert](#ce-qui-reste-ouvert-au-17-septembre-2026) ».

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

**La conséquence pratique : le remède principal n'est pas de corriger 79 lignes, c'est de supprimer
les duplications et d'installer les quatre garde-fous automatiques qui auraient attrapé la moitié de
cette liste sans intervention humaine.** D'où le lot 0 ci-dessous.

Un motif frappant, relevé par trois des quatre agents indépendamment : **la plupart des constats
contredisent un commentaire du projet lui-même**. Le désaccord n'est pas entre l'auteur et
l'auditeur — il est entre le code et sa propre documentation, ce qui rend chaque écart facile à
trancher : l'intention est déjà écrite.

---

## Les 3 constats critiques

### C1 — ✅ corrigé le 7 septembre 2026 — « J'ai cuisiné » échouait en production pour un compte Grocy
`api/src/Controller/PlansController.php:155` — **CONFIRMÉ à l'audit, corrigé depuis** (lot 1) : la
déduction Grocy passe désormais par `DeductionGrocy`, une ligne à la fois
(`PlansController.php:155-161`). Le constat d'origine suit, au présent de l'audit.

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

*Correction : boucler sur `inventorierUn()` en reprenant la forme de `FrigoController.php:324`.
30 min, 1 h avec test.* **PHPStan niveau 5 l'aurait attrapé gratuitement — voir lot 0.**

### C2 — ✅ corrigé le 14 septembre 2026 — La double écriture du schéma n'était pas tenue
`db/01-schema.sql` — **CONFIRMÉ à l'audit par diff de deux bases réelles, corrigé depuis** (lot 4) :
`db/manuel/verifier-schema.sh` construit les deux bases et les déclare identiques. Le constat
d'origine suit, au présent de l'audit.

Deux bases ont été construites dans un PostgreSQL 16 jetable — A depuis `01-schema.sql` seul,
B depuis A plus les 24 migrations dans l’ordre d'`installer.sh` — et leurs `pg_dump --schema-only`
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

Constat symétrique : `db/01-schema.sql:294` déclare `modele_exercice.secondes_total_cible`, colonne
créée par aucune migration, présente dans aucune entité, référencée par aucune ligne de code —
**toujours vrai au 17 septembre 2026**, voir 02#12.

*Correction : replier le DDL de 25/26/27 dans le schéma, régler `secondes_total_cible`, et ajouter
au dépôt le script qui construit A et B et exige un diff vide. ~2 h.*

### C3 — ✅ corrigé le 14 septembre 2026 — Aucun test ne vérifiait l'isolation entre comptes
`api/tests/` — **CONFIRMÉ (absence), désormais couvert par 14 témoins**

**Ce qui a été fait.** Trois fichiers, sans base ni noyau, un par pièce du dispositif :
`FiltreProprietaireTest` (6 — le sixième, « un aliment n'est lu que par son propriétaire », date
du 17 septembre 2026), `ProprietaireProcessorTest` (4), `CompteActifTest` (4). Chaque
témoin a été **mis en échec** en cassant le code qu'il protège, avant d'être conservé — la
restriction retirée de `applyToItem`, le `1 = 0` supprimé, le garde `is_a()` court-circuité, le propriétaire écrasé, le compte désactivé laissé passer.

**Une chose apprise en chemin, qui ne figurait nulle part :** `ProprietaireProcessor` ne pose le
propriétaire que s'il est absent. Vérifié : la propriété `utilisateur` n'appartient à aucun groupe
de `denormalizationContext`, un client ne peut donc pas la transmettre. Le garde protège un PATCH,
pas une usurpation.

<details><summary>Le constat d'origine</summary>


Aucune occurrence de `FiltreProprietaire`, `ProprietaireProcessor` ni `CompteActif` dans les
tests. Le code, lui, **est bon** : relu ligne à ligne, le filtre s'applique en collection et en
item, avec `1 = 0` pour un non-authentifié, les entités filles sont en `operations: []`, et les
8 contrôleurs scopent tous par `getUser()`.

C'est donc un risque, pas un défaut actif — mais toute la garantie d'isolation tient à **deux
`tags:` dans `services.yaml`** et au fait que chaque nouvelle entité pense à implémenter
`ProprieteUtilisateur`. Une régression serait totalement silencieuse.

</details>

*Correction proposée à l'époque : (a) test unitaire de `FiltreProprietaire` avec `Security`
bouchonné ; (b) **test d'inventaire du modèle** — parcourir `src/Entity/*.php` et exiger que toute
classe `#[ApiResource]` à opérations non vides implémente `ProprieteUtilisateur` ou figure dans une
liste blanche explicite. C'est (b) qui attrape la vraie panne. 2-3 h.*

---

## Les 14 constats élevés

### Sécurité
- **É1** — ✅ **corrigé le 8 septembre 2026.** L'inventaire différé n'avait aucun contrôle de
  propriété sur l'aliment. `FrigoController.php:356-439` + `AppliqueInventaire.php:146-179`. Le
  chemin jumeau (`POST /api/mon-frigo/stock`) avait reçu `alimentAccessible()` pour corriger
  exactement cette faille ; `POST /api/mon-frigo/inventaire` ne l'avait pas eu. Un compte pouvait
  écrire une ligne de stock sur l'aliment d'un autre, qui ne pouvait alors plus le supprimer.

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
- **É2** — ✅ **corrigé le 7 septembre 2026** (lot 1) : la migration pose `= 0`. Le constat
  d'origine : `25-garde-fous.sql:37-41,85-88` fait `UPDATE … SET kcal_100 = NULL` sur une colonne
  `NOT NULL`. Reproduit : `ERROR: null value … violates not-null constraint`, contrainte non posée.
  Comme `entrypoint-prod.sh:139` utilise `ON_ERROR_STOP=1` + `exit 1` sous `set -e`, **le jour où une
  seule valeur négative existe — le cas que ce fichier dit avoir constaté — le conteneur applicatif
  ne redémarre plus.** *Correction : `= 0` au lieu de `= NULL`. 20 min.*
- **É3** — ✅ **corrigé le 7 septembre 2026** (lot 1) : `installer.sh` joue désormais chaque
  migration avec `ON_ERROR_STOP=1`. Le constat d'origine : `installer.sh:167` (ligne de l'audit) joue les migrations
  sans `ON_ERROR_STOP` : psql continue après erreur
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
- **É8** — ✅ **corrigé le 14 septembre 2026.** Les exercices « personnels » étaient visibles de
  tous : `Exercice` portait `public` et `creePar` sans que rien ne les renseigne ni ne les lise —
  `setCreePar()` n'avait pas un seul appelant — pendant que l'écran affichait
  « ★ exercice personnel ».

  **Décision prise : les rendre vraiment privés.** `ExerciceProcessor` pose l'auteur et
  `public = false` à la création, `FiltreExercice` applique « **public OU le mien** » en collection
  et en item. La règle porte sur `public`, et non sur l'absence d'auteur : la nuance ouvre une
  troisième possibilité, l'exercice **publié mais attribué**, par où un administrateur verse au
  catalogue d'exercices l'exercice bien rédigé de quelqu'un sans en effacer la paternité.
  **Ce mécanisme de publication n'existe pas encore** : `public` n'a aucun groupe de
  sérialisation, aucun `PATCH` ne peut le basculer — relevé par la revue le 15 septembre 2026
  (`Exercice.php:83-92`) et laissé « en suspens, et c'est volontaire » (`:74-78`).

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

  10 témoins, chacun vu échouer. Le `PATCH` restait alors réservé à `ROLE_ADMIN`, et l'auteur d'un
  exercice privé ne pouvait pas le corriger lui-même — **corrigé le 15 septembre 2026 par F-09** :
  le `PATCH` s'ouvre à l'auteur (`Exercice.php:94-102`).
- **É9** — ✅ **réglé le 8 septembre 2026** (lot 5) : `grocy_macros.py` a été supprimé. Le constat
  d'origine : `grocy_macros.py:105-113` écrivait dans les mêmes champs Grocy avec la **convention inverse**
  (valeurs cuites, riz basmati à 130 kcal contre 350 sec) : un produit amorcé ainsi fait peser ~3×
  trop de riz. Et son appariement sans borne de mot fait recevoir 575 kcal à « Lait d'amandes ».
  *1 h (supprimer) à 4 h (aligner).*

### Front — chiffres faux montrés à l'utilisateur
- **É10** — ✅ **corrigé le 15 septembre 2026** (lot 7) : `front/src/api/client.test.ts`. Le
  constat d'origine : `front/src/api/client.ts` (342 lignes) n'a **aucun test** : rejeu sur 401, distinction
  panne réseau / refus serveur, corps non-JSON. Tout est bien écrit, rien n'est vérifié. *4 h.*
- **É11** — ✅ **corrigé le 7 septembre 2026** (lot 2) : la formule n'est plus écrite que dans
  `front/src/calcul/performance.ts`. Le constat d'origine : **trois formules d'Epley** aux règles
  de validité différentes (`performance.ts:26-38`
  avec plafond à 15 reps, `hooks.ts:905-907` plafond recopié en dur, `hooks.ts:825-826` **sans
  plafond**). L'écran de séance consomme les deux dernières : 30 répétitions à 40 kg créent un
  « record » de **79,96 kg**, et chaque séance suivante s'affiche en recul face à un record fantôme
  que la formule elle-même déclare invalide. *~1 h.*
- **É12** — ✅ **corrigé le 7 septembre 2026** (lot 2). Le constat d'origine : un « reste »
  déclaré **rétrécit la liste de courses**. `composer.ts:713-718,754-760` :
  `plafonds` survit à la passe « frigo plein » censée n'en avoir aucun. Reproduit : sans reste,
  liste = `[Riz, 20 g]` ; en déclarant « il me reste 80 g de riz », liste = `[]`, pour un plan
  cuisiné **identique**. Fait sous-acheter, et ça ne se voit qu'au supermarché. *15 min + 1 test.*
- **É13** — ✅ **corrigé le 7 septembre 2026** (lot 2) : `kcalAtwater` compte les fibres à
  2 kcal/g — et depuis le 17 septembre 2026, la somme elle-même vient de `kcalDesGrammes`, seule
  écriture dans le front. Le constat d'origine : `plausibilite.ts:49-50` (ligne de l'audit) applique la formule **américaine**
  d'Atwater (fibres ignorées),
  celle que `nutrition.ts:4-7` interdit explicitement quatre fichiers plus loin. Reproduit sur des
  graines de chia : « 486 kcal déclarées, mais ses macros en font 378 » — alors que dans la
  convention de l'app le calcul juste donne 445,8 et qu'**aucune des deux valeurs saisies n'est
  fausse**. Le module dont la raison d'être est de repérer les données qui mentent accuse une donnée
  juste, sur toute la famille des oléagineux. *10 min (+ ajuster `plausibilite.test.ts:165`).*
- **É14** — ✅ **corrigé en deux temps** (lot 1) : un volet le 7 septembre 2026, les deux autres le
  15 (voir plus bas). Le constat d'origine : **session morte sans porte de sortie.** Trois
  décisions correctes qui s'enferment :
  `client.ts:145-146` rend `false` sans appeler `terminerSession()` ; le portier de `_layout.tsx:70`
  ne teste que la présence d'une chaîne, donc un JWT expiré compte comme « connecté » ;
  et `compte.tsx:24-26` place le `if (isError)` **avant** le seul bouton de déconnexion de toute
  l'application. Seule issue pour l'utilisateur : effacer les données de l'app. *~30 min.*
- **É15** — ✅ **corrigé le 7 septembre 2026** (lot 2) ; la règle de concurrence vit depuis dans
  `front/src/composants/envoiSerialise.ts`. Le constat d'origine : `sauvegardeAuto.ts:33-53`
  abandonne l'envoi si un autre est en vol, **sans réessai
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
| **2 — chiffres faux** | ✅ | É11, É12, É13, É15, M2, M3 · **M1 et M4 faits le 15 septembre** — M1 affichait un écart de 2 kcal/g de fibres en mode glucides totaux (7,5 g suffisaient à accuser une cible atteignable) ; M4 a reçu un seuil **relatif**, choisi sur 134 860 pivots mesurés |
| **3 — sécurité et isolation** | ✅ | É1, C3, É8, M-02, M-03 · **M-02 complet le 15 septembre** : `GET /api/mes-sessions` et `DELETE /api/mes-sessions/{id}` |
| **4 — base reproductible** | ◐ | C2, É5, É6 et les index de jointure · `verifier-schema.sh` : **✓ identiques** · **reste ouverte** la dérive entités ↔ schéma que le plan y rangeait (02#12) |
| **5 — scripts dangereux** | ✅ | É4, `sauvegarde.sh` (É9 fait le 8 sept.) |
| **6 — architecture front** | ✅ | **Les douze rangs sont faits.** Trois écrans de 3 935 → **1 295** lignes · `composer.ts` **830** → 135 (817 au commit de l'audit, 830 après le correctif É12 du même soir, 827 au premier rang du lot) · `cuisson.ts` **611** → 22 · `hooks.ts` en 10 modules · **D1-D10 closes** · seul `choixRatio.tsx` reste, et il était mal rangé (il appartient à `editeurAliment.tsx`, section 7) |
| **7 — tests manquants** | ✅ | `client.ts` : 22 témoins à la clôture, chacun prouvé par une **mutation** qui le tue (29 mutations au banc) ; **28** au 17 septembre 2026 (`it(` dans `client.test.ts`), dont ceux du délai de garde `fetchAvecDelai`. `@testing-library/react` est installé : É14 et F13 ne sont plus bloqués, et `editeurAliment.test-rendu.tsx` ouvre la voie. Reste du câblage non couvert, sans urgence |
| **8 — le reste** | ◐ | Les onze du front et les neuf de sécurité sont faits ; 02#14, 02#18 et 02#19 aussi. **Restent ouverts** 02#13, 02#15, 02#17 (à trancher), 04#14, 04#15, 04#19, et la permission `RECORD_AUDIO` en double (M8) que le plan y rangeait. F-04 ne tenait plus (réglé par É8), F8 a été **refusé avec argument** — mais en cherchant ce qui transitait vraiment dans le cache, on y a trouvé **le mot de passe en clair** |

Tests au 15 septembre, au terme du chantier : **600 front** (577 + 23 de rendu, en deux passes) · **252 API · 661 assertions · 7 erreurs PHPStan**
(aucune sur les fichiers corrigés). Au 17 septembre 2026 en fin de journée : **639 front** (606 + 33 de
rendu) · **330 API · 864 assertions · 7 erreurs PHPStan**.

**Et une épreuve que les tests ne remplacent pas** :
`presentation/tournage/verifier-ecrans.mjs` pilote un vrai navigateur — connexion,
cinq écrans, portier d'administration, **zéro erreur de console, zéro requête en
échec**. C'est ce genre de témoin qui a trouvé le `GET /api/moi` sans jeton sur
l'écran de connexion, invisible pour jsdom comme pour `tsc`.

Un point laissé ouvert volontairement :
- ~~**É14** n'a reçu qu'un volet sur trois~~ — **les trois sont faits le 15 septembre 2026.**
  Le premier suffit à rouvrir la session ; le portier de `_layout.tsx` est en place ; et le
  bouton de déconnexion de `compte.tsx`, jusque-là enfermé derrière un `return` précoce sur
  l'erreur, est rendu **hors de toute condition** par `src/composants/cadreCompte.tsx`. Une
  panne de `/api/moi` — ou une requête qui pend : `client.ts` n'avait alors aucun délai de garde,
  il en a un depuis le 15 septembre 2026 au soir (`fetchAvecDelai`, `client.ts:231`) — ne retire
  plus la seule sortie de la session. Cinq témoins de rendu.
- ~~**La table des paliers du disque RM**~~ — **tranchée le 15 septembre 2026.** Une seule
  table, centrée sur **70-90 %**, la zone où l'on progresse et la seule où la formule dit vrai.
  Neuf paliers par pas de 2,5 %, donnant neuf cibles de répétitions distinctes. En dessous de
  70 %, la charge s'affiche et la prédiction disparaît — le seuil est **dérivé** de
  `REPS_MAX_POUR_1RM`, pas écrit à la main. `pasConseille` descend à 1 kg pour les petites
  charges, où onze paliers ne donnaient que cinq charges distinctes.

## Ce qui reste ouvert au 17 septembre 2026

Dix-huit constats, vérifiés un par un dans le code ce jour-là. Aucun critique, aucun élevé.
04#9 (date d'une séance en UTC), qui y figurait, est clos le soir même : `src/calcul/dates.ts`.

**À trancher — la décision appartient au propriétaire, avec son argument :**

| Constat | Gravité | Ce qui retient |
|---|---|---|
| **02#13** — ni limites de ressources ni rotation des journaux | faible | `docker-compose.yml` se déploie en production au prochain push : une limite mal choisie arrêterait l'application réelle |
| **02#15** — `compose.dev.yml` publie `5432:5432` | faible | le port sert : `import_carnet.py` et `import_catalogue.py` visent `localhost:5432` |
| **02#17** — aucune purge des invitations expirées | faible | la réinvitation n'est plus bloquée (une nouvelle invitation remplace l'ancienne) ; reste la purge, non décidée |

**Ouverts, sans décision consignée :**

| Constat | Gravité | Preuve au 17 septembre 2026 |
|---|---|---|
| **02#8** — sauvegardes sur le même volume que la base | moyenne | correction hors dépôt ; rien ne la consigne |
| **02#9** — `deployer-nas.sh` redémarre l'application et les travailleurs d'un seul `restart` | moyenne | `deployer-nas.sh:195-197` |
| **03 M5** — jetons en clair dans `localStorage` sur le web | moyenne | `front/src/api/client.ts:64-93` |
| **03 M6** — chargement infini quand une requête voisine échoue | moyenne | **partiel** : `seance/[id].tsx` corrigé ; `modele/[id].tsx:74-78`, `admin-utilisateurs.tsx` et les cibles de `repas.tsx` non |
| **03 M8** — `RECORD_AUDIO` inutile, déclaré deux fois | moyenne | `front/app.json:17-22` |
| **03 M9** — `@react-navigation/native-stack` importé sans être déclaré | moyenne | `front/src/composants/enTete.tsx:1` |
| **03 M10** — course au chargement des jetons | moyenne | `front/src/api/client.ts:106-113` |
| **03 M11** — `useMoi` ne réessaie pas après une panne réseau | moyenne | `front/src/api/hooks/auth.ts:133-142` |
| **03 M12** — saisie d'inventaire perdue au changement d'onglet | moyenne | `front/app/(onglets)/frigo.tsx:54-59` |
| **03 M13** — `noUncheckedIndexedAccess` désactivé | moyenne | `front/tsconfig.json:5` |
| **04#7** — deux juges du rendement, API et front | moyenne | l'impossible est aligné (16 septembre) ; les bandes du plausible et le seuil de 100,5 g restent écrits deux fois |
| **04#14** — `DeductionDuPlan` : la seconde ligne écrase la première | faible | `DeductionDuPlanTest.php:143-160` affirme toujours `800` |
| **04#15** — le bouchon de `FrigoGrocyCreationTest` répond `[]` à tout | faible | `FrigoGrocyCreationTest.php:176` |
| **04#19** — divisions et conversions non gardées dans `ciqual_vers_grocy.py` | faible | `:914`, `:944`, `:729-731`, `:348`, `:818` |

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
M-02 et M-03 du rapport sécurité.

### Lot 4 — Base reproductible · ~4 h
C2 (double écriture) · É5 (install dev) · É6 (course sur les lots) · index de clés étrangères
manquants · divergences entités ↔ schéma.

### Lot 5 — Scripts dangereux · ~3 h
É4 (restauration sous travailleurs actifs) · É9 (`grocy_macros.py`) · `sauvegarde.sh` sans fichier `.partiel`.

### Lot 6 — Architecture front · ~2-3 jours
Découpage de `repas.tsx` (2 316 lignes, 4 écrans, 17 `useState`) et de `hooks.ts` (1 228 lignes),
suppression des 10 duplications réelles. Le détail actionnable, module par module, est dans
[03-front.md](03-front.md). Les quatre premiers rangs de ce lot corrigent à eux seuls cinq constats
dont deux élevés.

### Lot 7 — Tests manquants · ~6 h
É10 (client HTTP) · `performance.ts` · le câblage des chemins critiques non couverts.

### Lot 8 — Le reste
Les ~35 constats faibles, dont beaucoup sont des corrections de 5 minutes (code mort, commentaires
périmés, permission `RECORD_AUDIO` inutile déclarée en double).
