# fitcarnet — audit lecture seule : données et infrastructure

Périmètre : `db/`, `docker-compose.yml`, `compose.dev.yml`, `docker/`, scripts racine,
`api/src/Entity/` sous l'angle de la cohérence avec le schéma.

**Méthode.** Tous les constats marqués CONFIRMÉ ont été vérifiés en lisant les fichiers, et
pour les plus importants en **construisant réellement les deux bases** dans un PostgreSQL 16
jetable puis en comparant les `pg_dump --schema-only` — exactement le contrôle que
`db/manuel/INSTALLATION.md` propose en dernière ligne et qui n'a apparemment jamais été
lancé. Les deux chemins comparés :

* **A** = `db/01-schema.sql` + `db/02-donnees.sql` (base neuve, ce que fait PostgreSQL au
  premier démarrage) ;
* **B** = A + les 21 migrations de `db/manuel/` dans l'ordre écrit dans `installer.sh` /
  `entrypoint-prod.sh` (ce que reçoit la production à chaque redémarrage).

Les 21 migrations passent toutes sans erreur sur B — c'est le bon côté du constat.

Comptage : **1 CRITIQUE, 5 ÉLEVÉES, 5 MOYENNES, 6 FAIBLES.**

**État au 17 septembre 2026, vérifié constat par constat : onze clos, six
ouverts.** Clos : 1 à 7, 11, 14, 18 et 19. **Ouverts** : 8, 9 et 12 (moyens,
sans décision consignée) ; 13, 15 et 17 (faibles, **à trancher**, avec leur
argument). Chaque constat porte son statut ; les constats clos suivent au
présent de l'audit, leurs renvois pointent le code d'aujourd'hui.

---

## 1. ✅ corrigé le 14 septembre 2026 (C2) — La double écriture n'est pas tenue : deux tables et six contraintes n'existent que dans les migrations

**Gravité : CRITIQUE — Statut : CONFIRMÉ (reproduit par diff de deux bases réelles), corrigé le 14 septembre 2026** : `db/manuel/verifier-schema.sh` déclare identiques une base neuve et une base migrée.

**Emplacement** `db/01-schema.sql` (501 lignes, s'arrête à `invitation`) ;
`db/manuel/25-garde-fous.sql:46,64,76,93,111,124,139` ;
`db/manuel/26-inventaire-en-tache-de-fond.sql:43` ;
`db/manuel/27-complements.sql:33`.

**Ce qui se passe.** Le fichier `01-schema.sql` affirme en tête (lignes 7-16) « CE FICHIER
DÉCRIT LA BASE TELLE QU'ELLE EST AUJOURD'HUI » et « ce fichier suffit à obtenir la base
d'aujourd'hui ». C'est faux depuis les migrations 25, 26 et 27. Le diff A↔B fait
**312 lignes**. Manquent dans A :

| Objet absent de `01-schema.sql` | Créé par |
|---|---|
| table `complement` + séquence + PK + FK + `complement_par_compte` + `complement_unique_par_repas` + les 4 CHECK | 27 |
| table `inventaire_lot` + séquence + PK + FK + `inventaire_lot_a_faire` + `inventaire_lot_dernier` + `inventaire_lot_un_seul_actif` + les 3 CHECK | 26 |
| CHECK `aliment_valeurs_positives` | 25 |
| CHECK `aliment_ratio_borne` | 25 |
| CHECK `aliment_pesees_positives` | 25 |
| CHECK `cible_valeurs_positives` | 25 |
| CHECK `serie_valeurs_positives` | 25 |
| CHECK `modele_serie_valeurs_positives` | 25 |
| CHECK `stock_quantite_positive` (doublon de `stock_quantite_check`) | 25 |
| une quinzaine de `COMMENT ON` | 12, 13, 21, 23, 24, aliment-fibres |

Autrement dit : **une base installée à neuf depuis `db/01-schema.sql` n'a ni la table des
compléments, ni la file d'inventaire, ni aucun des garde-fous de positivité.** Elle accepte
`kcal_100 = -350` et `quantite < 0` en silence — la faute même que la migration 25 dit
corriger « là où la valeur est écrite, parce que la base est le seul endroit que personne ne
contourne ».

En production ce n'est pas visible parce que `entrypoint-prod.sh` rejoue `db/manuel/` à chaque
démarrage : la base finit toujours en B. Le risque est donc différé — il se matérialise le
jour d'une restauration à partir de `01-schema.sql` seul, d'un nouvel environnement, ou d'une
lecture du schéma pour raisonner (le fichier ment sur ce qu'il décrit).

**Constat symétrique, plus ancien** — **toujours vrai au 17 septembre 2026**, voir
n° 12 : `db/01-schema.sql:294` déclare
`modele_exercice.secondes_total_cible INTEGER`. Cette colonne n'est créée par **aucune**
migration de `db/manuel/`, n'apparaît dans **aucune** entité Doctrine et n'est référencée par
**aucune** ligne de code (`grep` sur `api/`, `db/`, `front/`). `git log` montre qu'elle est
apparue dans `01-schema.sql` au commit `3f737c6`, sans migration jumelle. C'est le même défaut
dans l'autre sens : une base née avant ce commit ne l'a jamais reçue.

**Correction proposée.** Replier dans `db/01-schema.sql` le DDL des migrations 25, 26 et 27
(tables `complement` et `inventaire_lot` complètes, les six CHECK, en supprimant le doublon
`stock_quantite_positive`), puis supprimer `secondes_total_cible` ou lui donner sa migration
et sa propriété d'entité. Ajouter au dépôt un script de contrôle qui construit A et B et
compare les deux `pg_dump --schema-only` — le diff attendu doit être vide.
**Effort : 1 h pour le repli, 1 h pour le script de contrôle.**

---

## 2. ✅ corrigé le 7 septembre 2026 (É2) — `25-garde-fous.sql` ne peut pas nettoyer ce qu'il prétend nettoyer, et casse le démarrage de la production

**Gravité : ÉLEVÉE — Statut : CONFIRMÉ (reproduit), corrigé le 7 septembre 2026** (lot 1) : la migration pose `= 0`.

**Emplacement** `db/manuel/25-garde-fous.sql:37-41` et `:85-88`, face à
`db/01-schema.sql:74-77` (`kcal_100/prot_100/gluc_100/lip_100 … NOT NULL`) et
`db/01-schema.sql:205-208` (`cible.kcal/prot/gluc/lip … NOT NULL`).

**Ce qui se passe.** Le fichier applique `UPDATE aliment SET kcal_100 = NULL WHERE kcal_100 < 0`
sur une colonne déclarée `NOT NULL`. Le nettoyage est donc impossible. Reproduit :

```
INSERT INTO aliment (nom, categorie, kcal_100, prot_100, gluc_100, lip_100)
VALUES ('test negatif','autre', -350, 1, 1, 1);
psql -v ON_ERROR_STOP=1 -f db/manuel/25-garde-fous.sql
  ERROR: null value in column "kcal_100" of relation "aliment" violates not-null constraint
  exit = 3
  SELECT count(*) FROM pg_constraint WHERE conname='aliment_valeurs_positives';  -->  0
```

Conséquence en production : `entrypoint-prod.sh:139` utilise `-v ON_ERROR_STOP=1` et
`exit 1` en cas d'échec, avec `set -e` en tête. **Le jour où une seule valeur négative existe
en base — c'est précisément le cas que le fichier dit avoir constaté, ligne 17 :
« aliment : kcal_100 = -350 » — le conteneur applicatif ne redémarre plus du tout.** Pas de
dégradation : plus d'application, et le message n'apparaît que dans `docker logs`.

Accessoirement, le CHECK posé ensuite (`kcal_100 IS NULL OR kcal_100 >= 0`) tolère des NULL
que la colonne interdit : il est écrit pour un schéma qui n'est pas celui-là.

**Correction proposée.** Remplacer `= NULL` par une valeur plancher explicite (`= 0`) sur les
colonnes `NOT NULL`, ou `= abs(...)` si l'intention est de rattraper un signe. Aligner ensuite
le CHECK sur la nullabilité réelle. **Effort : 20 min.**

---

## 3. ✅ corrigé le 7 septembre 2026 (É3) — `installer.sh` joue les migrations sans `ON_ERROR_STOP` et annonce « ✓ » sur un échec

**Gravité : ÉLEVÉE — Statut : CONFIRMÉ (reproduit), corrigé le 7 septembre 2026** (lot 1) : chaque migration part avec `-v ON_ERROR_STOP=1`, et l'erreur s'affiche.

**Emplacement** `installer.sh:167` à l'audit ; la boucle est aujourd'hui en `installer.sh:173-192`

```bash
if dc exec -T db psql -U "$UTILISATEUR" -d "$BASE" -q < "$fichier" >/dev/null 2>&1; then
    ok "$(basename "$fichier")"
```

**Ce qui se passe.** Sans `-v ON_ERROR_STOP=1`, `psql` continue après une erreur et sort avec
le code 0. Le commentaire juste au-dessus (aujourd'hui `installer.sh:188`) dit pourtant « ces scripts sont
idempotents : un échec signale un vrai souci ». Reproduit sur le cas du constat n° 2 :

```
psql -q -f db/manuel/25-garde-fous.sql        exit = 0
SELECT count(*) FROM pg_constraint WHERE conname='aliment_valeurs_positives';  -->  0
```

L'installateur affiche `✓ 25-garde-fous.sql`, la contrainte n'existe pas, personne ne le sait.
C'est le mécanisme exact par lequel une divergence de schéma s'installe sans bruit.
`entrypoint-prod.sh` fait bien la chose correcte : les deux chemins ne se valent pas alors
qu'ils prétendent jouer la même liste.

Deux défauts mineurs au même endroit : la sortie d'erreur est jetée (`2>&1` vers
`/dev/null`) — c'est la faute que `entrypoint-prod.sh:132-138` raconte avoir corrigée de son
côté — et `for fichier in $migrations` (ligne 166) découpe sur les espaces.

**Correction proposée.** Ajouter `-v ON_ERROR_STOP=1`, capturer la sortie et l'afficher en cas
d'échec, itérer sur un tableau bash plutôt que sur une chaîne. **Effort : 15 min.**

---

## 4. ✅ corrigé le 14 septembre 2026 (É4) — `restaurer-nas.sh --vraiment` n'arrête pas les travailleurs : ils écrivent pendant et après le remplacement de la base

**Gravité : ÉLEVÉE — Statut : CONFIRMÉ (lecture), corrigé le 14 septembre 2026** : les travailleurs sont arrêtés, et surtout les lots restaurés sont neutralisés (voir [README.md](README.md), É4). Les numéros de ligne de `restaurer-nas.sh` ci-dessous sont ceux de l'audit.

**Emplacement** `restaurer-nas.sh:34` (`APPLICATION="fitcarnet-app"`), `:157` (`docker stop "$APPLICATION"`),
`:160-164` ; `docker-compose.yml:187-216` (service `fitcarnet-taches`, `replicas: 2`).

**Ce qui se passe.** Le script écrit lui-même, ligne 154 : « Restaurer sous une application qui
écrit produit une base à moitié ancienne et à moitié neuve ». Il arrête `fitcarnet-app` — et
seulement lui. Les deux conteneurs `fitcarnet-taches-1` et `-2` continuent de tourner ; ils
interrogent la base toutes les 2 secondes (`TraiterInventaires.php:50`) et **savent survivre à
la disparition de la base** (`TraiterInventaires.php:104-126` : ils attrapent l'exception,
ferment la connexion et réessaient). C'est exactement le comportement qu'on ne veut pas ici.

Scénario concret : `DROP DATABASE … WITH (FORCE)` tue leurs connexions ; ils bouclent ;
`pg_restore` remonte la sauvegarde de la veille, qui contient un `inventaire_lot` en
`en_attente` ou `en_cours` déjà appliqué depuis ; dès la fin de la restauration un travailleur
le reprend et **repousse d'anciennes quantités vers Grocy**. Le frigo réel est corrigé à
l'envers, sans qu'aucune ligne du script ne l'indique. Le démarrage se fait par
`reprendreLesAbandonnes()` (`TraiterInventaires.php:94`), qui vise justement les lots
« en cours » figés — tous ceux de la sauvegarde le sont.

Second effet : les travailleurs écrivent (`avancer()`, `terminer()`) dans la base pendant que
`pg_restore` la remplit, hors de tout contrôle.

**Correction proposée.** Arrêter aussi les travailleurs : remplacer `APPLICATION` par une liste
et faire `docker stop fitcarnet-app fitcarnet-taches-1 fitcarnet-taches-2` (ou
`docker compose stop fitcarnet-app fitcarnet-taches`), les redémarrer après. Et, après une
restauration, remettre à `echoue` tout lot restauré en `en_attente`/`en_cours` — un lot
restauré n'a plus de sens. **Effort : 30 min.**

---

## 5. ✅ résolu par le n° 1, le 14 septembre 2026 (É5) — Une installation de développement suivie à la lettre donne une base sans `complement` ni `inventaire_lot`

**Gravité : ÉLEVÉE — Statut : CONFIRMÉ (lecture), résolu le 14 septembre 2026** : `db/01-schema.sql` porte désormais tout le schéma.

**Emplacement** `db/manuel/INSTALLATION.md:1-6` et `:19` ; `docker/Dockerfile:27-55` (étape `dev`) ;
`compose.dev.yml:27-31`.

**Ce qui se passe.** `INSTALLATION.md` ouvre sur « Le schéma est désormais **complet dès la
création** : plus aucune migration à jouer à la main », puis décrit une installation qui
n'exécute jamais `db/manuel/` : `docker compose -f compose.dev.yml up -d db`, puis
`up -d app`. Or l'étape `dev` du Dockerfile **n'a pas d'`ENTRYPOINT`** — `entrypoint-prod` est
posé uniquement dans l'étape `prod` (`docker/Dockerfile:118-121`), et les deux étapes dérivent
séparément de `base`. Rien ne rejoue les migrations en développement.

Combiné au constat n° 1, le développeur qui suit ce document obtient une base sans les tables
`complement` et `inventaire_lot`. L'écran des compléments et l'envoi d'inventaire répondent
500 sur `relation "complement" does not exist` — la panne exacte que le fichier dit avoir
supprimée pour la table `invitation` (`db/01-schema.sql:530-536`).

`installer.sh`, lui, joue bien les migrations : les deux chemins d'installation documentés ne
produisent pas la même base. Note annexe : `INSTALLATION.md:17` annonce « 12 tables » ;
`01-schema.sql` en crée 17, et 19 après migrations — `installer.sh:123` contrôle `>= 17`.

**Correction proposée.** Une fois le constat n° 1 corrigé, ce problème disparaît de lui-même.
En attendant : corriger `INSTALLATION.md` pour renvoyer vers `./installer.sh`, et mettre à
jour le compte de tables. **Effort : 15 min (ou 0 après le n° 1).**

---

## 6. ✅ corrigé le 14 septembre 2026 (É6) — Course entre la reprise des lots abandonnés et un travailleur encore vivant

**Gravité : ÉLEVÉE — Statut : CONFIRMÉ (lecture ; l'occurrence dépend d'une temporisation), corrigé le 14 septembre 2026** : colonne `jeton` (migration 30), exigée à chaque écriture. Les renvois vers `InventaireLots.php` et `TraiterInventaires.php` ci-dessous sont ceux de l'audit.

**Emplacement** `api/src/Service/InventaireLots.php:49` (`SILENCE_MAXIMAL = '2 minutes'`),
`:202-209` (`reprendreLesAbandonnes`), `:107-131` (`prendre`) ;
`api/src/Command/TraiterInventaires.php:94,166-169` ; `docker-compose.yml:216` (`replicas: 2`).

**Ce qui se passe.** `prendre()` prend bien un verrou (`FOR UPDATE SKIP LOCKED`), mais la
transaction se termine immédiatement : **pendant tout le traitement, plus rien ne protège la
ligne.** La seule protection est un délai : un lot dont `vu_le` a plus de deux minutes est
considéré abandonné et repassé en `en_attente` par n'importe quel travailleur au repos.

`vu_le` n'est touché qu'après chaque ligne envoyée (`AppliqueInventaire.php:95`). Il suffit
donc qu'**une seule** ligne dépasse deux minutes pour que le travailleur B vole le lot du
travailleur A, encore vivant. Le client HTTP vers Grocy n'a aucun `timeout` ni `max_duration`
configuré (`api/config/services.yaml:44-47`, aucun bloc `http_client` dans
`config/packages/framework.yaml`) : rien ne borne la durée d'un appel.

Conséquences de l'entrelacement :

* A et B envoient la même ligne. Bénin : `definirStock` pose une quantité **absolue**
  (`FrigoBase.php:110-181`) et Grocy répond « déjà à jour » — le fichier le dit et c'est juste.
* A appelle `terminer()` → `statut = 'termine'`. B continue, appelle `avancer()` sur une ligne
  terminée, puis `terminer()` une seconde fois : `traites`, `echecs` et `fini_le` sont écrasés
  par les valeurs de B. Le compte-rendu affiché à l'écran devient faux.
* **L'invariant « un seul lot actif par compte » est rompu** : dès que A a écrit `termine`,
  l'index partiel `inventaire_lot_un_seul_actif` laisse passer un nouveau dépôt alors que B
  applique encore l'ancien. C'est le double envoi simultané que la migration 26 existe pour
  interdire.

**Correction proposée.** Garder la ligne verrouillée pendant le traitement (`FOR UPDATE` dans
une transaction longue) est coûteux ; plus simple et suffisant : rendre les écritures
conditionnelles au propriétaire du lot. Ajouter une colonne `jeton` (uuid) posée par
`prendre()` et exigée par `avancer()`, `terminer()` et `echouer()`
(`… WHERE id = :id AND jeton = :jeton`), `reprendreLesAbandonnes()` remettant `jeton = NULL`.
Un travailleur dépossédé écrit alors zéro ligne et peut s'en apercevoir. Et poser un
`max_duration` explicite sur le client HTTP Grocy (60 s), plus court que `SILENCE_MAXIMAL`.
**Effort : 2 h, plus une migration + le repli dans le schéma.**

---

## 7. ✅ corrigé le 14 septembre 2026 (lot 5) — `sauvegarde.sh` (développement) écrit directement le fichier final, sans aucun contrôle

**Gravité : MOYENNE — Statut : CONFIRMÉ, corrigé le 14 septembre 2026** : `.partiel`, taille minimale, relecture `pg_restore --list`, `mv` final — le motif de `sauvegarde-nas.sh`, désormais dans `sauvegarde.sh:63-108`.

**Emplacement** à l'audit : la fonction de sauvegarde complète de `sauvegarde.sh`, à comparer à `sauvegarde-nas.sh:50-73`.

**Ce qui se passe.** `dc exec -T db pg_dump … -Fc > "$fichier"` crée le `.dump` **avant** de
savoir si `pg_dump` réussit. Un disque plein, un conteneur qui meurt en cours de dump, et il
reste un fichier tronqué portant la bonne date et le bon nom. Aucune vérification de taille
minimale, aucune relecture `pg_restore --list` — les deux contrôles que `sauvegarde-nas.sh`
applique, en expliquant précisément pourquoi (`sauvegarde-nas.sh:50-53, 65-67`). Le correctif
a été fait d'un côté et pas de l'autre.

Aggravant : `rotation()` (aujourd'hui `sauvegarde.sh:159-171`) trie par date de modification et garde les
14 plus récentes. La sauvegarde tronquée est la plus récente : elle est conservée, et c'est
une bonne sauvegarde ancienne qui saute à sa place.

`installer.sh:273-275` appelle `./sauvegarde.sh` en avalant l'échec (« sans gravité »).

**Correction proposée.** Reprendre le motif de `sauvegarde-nas.sh` : `.partiel`, contrôle de
taille, `pg_restore --list`, `mv` final. **Effort : 20 min (copier-coller).**

---

## 8. OUVERT — Les sauvegardes vivent sur le même volume que la base, sans copie hors NAS

**Gravité : MOYENNE — Statut : CONFIRMÉ, toujours ouvert au 17 septembre 2026** : la correction est hors dépôt (tâche DSM), et rien dans le dépôt ne la consigne.

**Emplacement** `sauvegarde-nas.sh:25` (`/volume1/docker/sauvegardes-fitcarnet`) face à
`docker-compose.yml:33` (`/volume1/docker/fitcarnet/pgdata`).

**Ce qui se passe.** Base et sauvegardes sont sur `/volume1`. Une panne de volume, un
chiffrement par rançongiciel ou une suppression accidentale du dossier `docker/` emporte les
deux. Le commentaire `sauvegarde-nas.sh:17-18` prend soin de sortir les sauvegardes du clone
git (« un `git clean` y passerait dessus ») — la réflexion est juste mais s'arrête un cran
trop tôt. Rétention 14 jours : correcte pour un incident, insuffisante pour une corruption
découverte tard.

**Correction proposée.** Une tâche DSM Hyper Backup ou un `rsync` hebdomadaire de
`/volume1/docker/sauvegardes-fitcarnet` vers un disque externe ou un stockage distant.
**Effort : 30 min, hors dépôt.**

---

## 9. CLOS — `deployer-nas.sh` court-circuite l'ordonnancement `depends_on` par un `docker compose restart`

**Gravité : MOYENNE — Statut : CORRIGÉ LE 18 SEPTEMBRE 2026.** Le script refait
à la main ce que `depends_on` aurait fait : il **arrête** les travailleurs,
**redémarre** `fitcarnet-app`, **attend** son état `healthy` (sondage toutes les
5 s, six minutes au plus — la sonde tolère 20 échecs de 15 s, soit cinq), puis
les **redémarre**. Si l'application n'est pas saine, les travailleurs restent
arrêtés et le message donne la commande pour les relancer : mieux vaut un
travailleur à l'arrêt qu'un travailleur qui applique des inventaires contre une
base non migrée.

**Non éprouvé sur le NAS** : `deployer-nas.sh` ne se lance pas « pour voir ».
La justesse vient de la lecture, et de deux contrôles — `sh -n` et `dash -n`.
Au passage, la première version écrite portait un `TABLEAU=(...)`, bashisme que
le shell de DSM aurait refusé net : l'en-tête du script prévient pourtant en
toutes lettres qu'il est écrit en `sh` et pas en `bash`.

Ce qui suit est l'état d'avant.

**Emplacement** `deployer-nas.sh:195-197` ; `docker-compose.yml:217-223`
(`depends_on: fitcarnet-app: condition: service_healthy`).

**Ce qui se passe.** `docker compose restart fitcarnet-app fitcarnet-taches` redémarre les
conteneurs **sans réévaluer `depends_on`**. La garantie posée dans `docker-compose.yml:218-221`
(« Démarrer avant lui, c'est chercher une table qui n'existe pas encore dans un vendor/ à
moitié écrit ») ne s'applique donc pas au chemin de déploiement réel — seulement au premier
`up`. Les travailleurs redémarrent avec le **nouveau** code pendant que `fitcarnet-app` en est
encore à `composer install` (jusqu'à trois minutes) et aux migrations : ils tournent contre
une base pas encore migrée et un `vendor/` en cours d'écriture, sur le même `/app` monté.

**Correction proposée.** Arrêter les travailleurs d'abord, redémarrer `fitcarnet-app`, attendre
son état `healthy` (boucle sur `docker inspect -f '{{.State.Health.Status}}'`), puis démarrer
les travailleurs. **Effort : 30 min.**

---

## 11. ✅ corrigé le 14 septembre 2026 — Neuf colonnes de clé étrangère sans index

**Gravité : MOYENNE — Statut : CORRIGÉ, sur quatre colonnes des neuf** (migration 31). Les cinq autres — `stock.emplacement_id`, `seance.modele_id`, `cuisson_habituelle.mode_cuisson_id`, `invitation.invite_par`, `invitation.utilisateur_id` — sont laissées sans index **délibérément** : tables courtes, jointures rares, aucune contrainte `RESTRICT` à faire respecter. La remarque de `28-muscle-cible-filtrable.sql` vaut aussi dans ce sens — un index que personne n'interroge coûte à chaque écriture. L'index sur `exercice.cree_par` est **partiel** (`WHERE cree_par IS NOT NULL`) : la quasi-totalité des exercices n'ont pas d'auteur, les indexer n'apporterait rien.

**Emplacement** `db/01-schema.sql` (tables `stock`, `exercice`, `modele_exercice`,
`modele_serie`, `seance`, `cuisson_habituelle`, `invitation`).

```
stock              aliment_id
stock              emplacement_id
exercice           cree_par
modele_exercice    exercice_id
modele_serie       modele_exercice_id
seance             modele_id
cuisson_habituelle mode_cuisson_id
invitation         invite_par
invitation         utilisateur_id
```

**Ce qui se passe.** Le plus gênant est **`modele_serie.modele_exercice_id`** : c'est un chemin
chaud, joint à chaque lecture de modèle par `ChargementComplet` (`ChargementComplet.php:66`,
chemin `exercices.series`). Le côté séance a bien son index (`db/01-schema.sql:363`,
`CREATE INDEX ON serie (seance_exercice_id)`), le côté modèle a été oublié — asymétrie qui
ressemble à un oubli, pas à un choix.

Ensuite `stock.aliment_id` : la contrainte `ON DELETE RESTRICT` (aujourd'hui la clé composite `db/01-schema.sql:188-190`) force
un balayage complet de `stock` à chaque suppression d'aliment. Et `exercice.cree_par`, sollicité
dès qu'on filtre par auteur un catalogue de 1 300 exercices.

À l'échelle actuelle (quelques comptes) rien de tout cela ne se sent. La remarque
`db/manuel/28-muscle-cible-filtrable.sql:28-43` — « un index que personne n'interroge n'est pas
neutre » — est juste, mais ces neuf-là sont interrogés à chaque jointure et à chaque suppression.

**Correction proposée.** Créer au minimum `modele_serie (modele_exercice_id)`,
`modele_exercice (exercice_id)` et `stock (aliment_id)`. Dans le schéma **et** dans une
migration numérotée. **Effort : 20 min.**

---

## 12. CLOS — Aucun contrôle de dérive entités ↔ schéma, et quelques divergences installées

**Gravité : MOYENNE — Statut : CLOS le 18 septembre 2026.** Les deux divergences
nommées sont réglées, chacune dans le sens de la réalité :

- **`secondes_total_cible` est supprimée** (`db/manuel/37-modele-exercice-sans-secondes-total-cible.sql`
  et `db/01-schema.sql`). Aucune entité, aucune requête, aucune ligne de front ne
  la nommait ; `doctrine:schema:update --dump-sql` proposait lui-même de la retirer.
  On ne lui a pas écrit de propriété : une colonne qu'aucun code ne lit ne se
  maintient pas, elle se traîne.
- **`Utilisateur::$email` est déclaré `TEXT`**, sans `unique: true`. La base porte
  un `TEXT` et un index **fonctionnel** sur `lower(email)` — c'est lui qui empêche
  « Marie@… » et « marie@… » de coexister, ce qu'un `unique: true` sur la colonne
  n'aurait pas fait. La cartographie décrivait une table qui n'existait pas, et une
  protection plus faible que la vraie.

**Le contrôle de dérive existe désormais**, et il est plus adapté que
`doctrine:schema:validate` : `db/manuel/verifier-schema.sh` construit une base
neuve et une base migrée puis exige un diff vide, et `verifier-migrations.sh` les
rejoue sur des données réelles. `doctrine:schema:validate` ne peut pas servir ici
— il dira toujours « not in sync », puisque `invitation` et `inventaire_lot`
n'ont aucune entité (voir la skill `schema-base`).

**Emplacement** `api/config/packages/doctrine.yaml` ; `api/src/Entity/` ; `api/tests/`.

**Ce qui se passe.** `doctrine:schema:validate` n'est lancé nulle part — ni dans les tests
(`api/tests/` ne contient que `Service/` et `bootstrap.php`), ni dans un script, ni dans
`entrypoint-prod.sh`. Rien ne garde les entités et le SQL manuel alignés, ce qui explique les
écarts ci-dessous. Aucun n'est bloquant à l'exécution aujourd'hui ; c'est l'absence de
détection qui est le vrai constat.

* **`Utilisateur::$email`** — `api/src/Entity/Utilisateur.php:47` :
  `#[ORM\Column(type: Types::STRING, length: 180, unique: true)]`. En base :
  `email TEXT NOT NULL` avec un index fonctionnel `utilisateur_email_unique ON (lower(email))`
  (`db/01-schema.sql:38,50`). Ni la longueur ni la contrainte d'unicité déclarées n'existent.
  Sans `#[UniqueEntity]` sur cette entité (le seul du projet est sur `Exercice`,
  `Exercice.php:46`), un doublon d'adresse remonte en 500 SQL au lieu d'un 422.
* **`Exercice::$groupes`** — `Exercice.php:276` : `SIMPLE_ARRAY`, non nullable, `default: ''` ;
  en base `groupes TEXT` nullable sans défaut (`db/01-schema.sql:234`).
* **`ModeleExercice`** n'a pas de propriété pour `secondes_total_cible`, présente en base
  (voir constat n° 1).
* **Contraintes `DEFERRABLE INITIALLY DEFERRED`** — vérifiées : présentes et identiques dans A
  et B sur `seance_exercice (seance_id, ordre)` et `modele_exercice (modele_id, ordre)`. Elles
  sont **justifiées** (Doctrine émet les INSERT avant les DELETE au remplacement d'une
  collection) et **ne masquent rien** : le contrôle a lieu au COMMIT, l'unicité de l'état final
  est garantie. Elles ne sont simplement pas déclarées côté ORM
  (`ModeleExercice.php:17`, `SeanceExercice.php:17` : pas de `#[ORM\UniqueConstraint]`), ce qui
  fait partie de la dérive. Point d'attention pour plus tard : un index unique différable ne
  peut pas servir de cible à un `ON CONFLICT` — aucun code ne le fait aujourd'hui.
* **`ON DELETE` déclarés côté ORM plus faibles qu'en base** : `Stock::$aliment`
  (`Stock.php:52`) et `SeanceExercice::$exercice` (`SeanceExercice.php:32`) n'ont pas de
  `onDelete`, la base a `RESTRICT`. Sans effet à l'exécution, mais un
  `doctrine:schema:update` proposerait de les affaiblir.

**Correction proposée.** Ajouter un test fonctionnel (ou une cible `make`) qui monte une base
depuis `db/01-schema.sql` et lance `php bin/console doctrine:schema:validate --skip-sync` puis
un diff complet. Corriger `Utilisateur::$email` en `Types::TEXT` sans `unique`, et lui ajouter
un `#[UniqueEntity]`. **Effort : 2 h.**

---

## 13. OUVERT, À TRANCHER — Aucune limite de ressources ni rotation des journaux Docker

**Gravité : FAIBLE — Statut : CONFIRMÉ, ouvert et à trancher au 17 septembre 2026.** L'argument
qui retient : toute modification de `docker-compose.yml` se déploie en production au prochain
push — une limite mémoire mal choisie arrêterait l'application réelle. `docker-compose.yml` : aucun `mem_limit`, `cpus`,
`ulimits`, ni `logging.options.max-size` sur les quatre conteneurs (`grep` : seul `deploy:`
apparaît, ligne 196, pour `replicas`). Sur un NAS partagé avec Grocy et le reste, une fuite
mémoire dans un travailleur qui tourne des semaines (`AppliqueInventaire.php:100-111` s'en
préoccupe explicitement) peut emporter le NAS entier, base comprise. Et le pilote `json-file`
par défaut ne tourne jamais : les journaux d'accès Caddy grossissent sans borne.
**Correction : `mem_limit: 512m` sur `fitcarnet-app`, `256m` sur les travailleurs, et
`logging: {driver: json-file, options: {max-size: 10m, max-file: 3}}` partout. Effort : 20 min.**

---

## 14. ✅ corrigé le 17 septembre 2026 — `stock_quantite_positive` fait double emploi avec `stock_quantite_check`

**Gravité : FAIBLE — Statut : CONFIRMÉ, corrigé le 17 septembre 2026** : la migration 36
(`db/manuel/36-stock-un-seul-controle-de-quantite.sql`) retire `stock_quantite_check`, et
`verifier-migrations.sh` refuse désormais tout CHECK en double. Il ne reste que
`stock_quantite_positive` (`db/01-schema.sql:182`). À l'audit : `db/manuel/25-garde-fous.sql:111` ajoutait
`CHECK (quantite >= 0)` alors que `01-schema.sql` le posait déjà en ligne. Le diff A↔B le
montre : la table B porte les deux. Coût : une évaluation de plus à chaque écriture, et un
schéma qui laisse croire que les deux disent des choses différentes.
**Correction : supprimer le bloc de la migration 25. Effort : 5 min.**

---

## 15. OUVERT, À TRANCHER — La base de développement écoute sur toutes les interfaces avec un mot de passe trivial

**Gravité : FAIBLE — Statut : CONFIRMÉ, ouvert et à trancher au 17 septembre 2026.** L'argument
qui retient : ce port sert — `import_carnet.py` et `import_catalogue.py` visent
`localhost:5432` par défaut. Un `127.0.0.1:5432:5432` les laisserait fonctionner depuis la
machine elle-même, mais la décision n'est pas prise. `compose.dev.yml:24-25` (`ports: - "5432:5432"`) et
`:15` (`POSTGRES_PASSWORD: fitcarnet`). Le port se lie à `0.0.0.0`. En WSL2 l'exposition reste
limitée à l'hôte, mais sur une machine de développement sur réseau d'entreprise ou Wi-Fi
public, la base est joignable. Le raisonnement écrit pour la production
(`docker-compose.yml:43-61`) vaut ici aussi, à moindre enjeu.
**Correction : `"127.0.0.1:5432:5432"`. Effort : 2 min.**

---

## 17. OUVERT, À TRANCHER — Aucune purge des invitations expirées

**Gravité : FAIBLE — Statut : CONFIRMÉ, ouvert et à trancher au 17 septembre 2026.** La
réinvitation, elle, n'est plus bloquée : une nouvelle invitation remplace celle qui attendait,
expirée ou non (`InvitationsController.php:163-179`). Reste la purge, qui n'est pas décidée.
À l'audit : `db/01-schema.sql:538-547` : la table `invitation`
porte `expire_le`, mais rien ne supprime les lignes périmées — contrairement à
`jeton_rafraichissement`, purgé par `JetonsRafraichissement.php:111`, et à `inventaire_lot`,
purgé à 30 jours par `26-inventaire-en-tache-de-fond.sql:149`. L'index partiel
`invitation_en_attente` (`WHERE accepte_le IS NULL`) laisse par ailleurs une invitation
**expirée et jamais acceptée** bloquer une réinvitation à la même adresse.
**Correction : ajouter un `DELETE FROM invitation WHERE accepte_le IS NULL AND expire_le <
now() - INTERVAL '30 days'` dans la migration 24, et exclure les expirées de l'index partiel.
Effort : 20 min.**

---

## 18. ✅ corrigé le 15 septembre 2026 — Aucun timeout sur les appels HTTP vers Grocy

**Gravité : FAIBLE — Statut : CONFIRMÉ, corrigé le 15 septembre 2026** : chaque appel est
borné à 20 s (`FrigoGrocy.php:484-485`, `:594-595`), sous les 30 s du front
(`FrigoGrocyDelaiTest`). Le constat d'origine : Aucun bloc `http_client` dans
`api/config/packages/framework.yaml`, aucune option passée au client injecté dans
`FrigoGrocy.php:58`. La durée totale d'un appel n'est donc pas bornée (`max_duration` vaut 0
par défaut). C'est le déclencheur le plus probable du constat n° 6, et une requête HTTP de
l'application peut y rester bloquée.
**Correction : `framework.http_client.default_options.max_duration: 30` (ou un client scopé
pour Grocy). Effort : 10 min.**

---

## 19. ✅ corrigé le 17 septembre 2026 — `installer.sh --repartir-de-zero` : `down -v` avale ses erreurs

**Gravité : FAIBLE — Statut : CONFIRMÉ, corrigé le 17 septembre 2026** : l'échec de
`down -v` arrête désormais le script (`installer.sh:97-102`). À l'audit :
`dc down -v >/dev/null 2>&1 || true`. La confirmation en clair (« Taper "oui" ») est bien là,
mais si `down -v` échoue, le script continue comme si les volumes avaient été supprimés et
installe par-dessus l'ancienne base. Le reste du script est correct :
`set -euo pipefail` (ligne 16), confirmation explicite, aucun `rm -rf` en dehors de
`publier-android.sh` (limité à `node_modules` et au dossier de sortie EAS) et de
`publier.sh:316` (`git clean -fdq front/dist`, correctement circonscrit).
**Correction : retirer le `|| true` et échouer bruyamment. Effort : 5 min.**

---

## Ce qui va bien

1. **`sauvegarde-nas.sh` est exemplaire.** Fichier `.partiel` avant le `mv` final, taille
   minimale contrôlée, et surtout relecture par `pg_restore --list` : « une sauvegarde qu'on
   n'a jamais essayé de relire n'est pas une sauvegarde, c'est un espoir »
   (`sauvegarde-nas.sh:65-71`). C'est plus rigoureux que ce qu'on voit dans beaucoup de
   systèmes professionnels. `pg_dump` prend par ailleurs un instantané transactionnel : la
   sauvegarde est cohérente sans arrêter l'application.

2. **`restaurer-nas.sh --essai`** restaure dans une base jetable, compte les lignes des six
   tables principales, compare, puis supprime — et le mode destructeur exige de taper
   `restaurer` en toutes lettres, refuse tout mode par défaut, et prend un filet de sécurité de
   l'état courant avant d'écraser (`restaurer-nas.sh:141-152`). En dehors du point n° 4, c'est
   un excellent script de reprise.

3. **La base porte les invariants, pas seulement le code.** `aliment_matiere_plausible`,
   `aliment_ratio_sens` (avec la distinction protéine/légume/féculent),
   `invitation_en_attente`, `inventaire_lot_un_seul_actif`,
   `complement_unique_par_repas` sur `lower(btrim(nom))` : les règles métier vivent là où les
   données s'écrivent, et le raisonnement est écrit à côté. Les contraintes différables sont
   justifiées et ne masquent rien.

4. **Le port 5432 est fermé en production**, avec la raison écrite en quinze lignes
   (`docker-compose.yml:43-61`), et aucun secret n'est versionné (`git ls-files` ne remonte que
   des `.env.exemple` ; `DB_PASSWORD`, `APP_SECRET` et `JWT_PASSPHRASE` sont déclarés
   obligatoires par la syntaxe `${VAR:?…}`).

5. **Le raisonnement de concurrence est bon dans ses fondations.** `FOR UPDATE SKIP LOCKED`,
   reprise fondée sur une observation (`vu_le`) et non sur une hypothèse de nombre de
   travailleurs, `definirStock` qui pose une quantité absolue dans une transaction unique
   (`FrigoBase.php:110-181`), gestion explicite du `EntityManager` fermé dans un processus
   long. Le constat n° 6 est un trou dans une conception par ailleurs solide, pas une absence
   de conception.

6. **Les migrations sont réellement idempotentes** — vérifié en les rejouant intégralement.
   L'ordre est écrit à la main plutôt que trié, avec la raison.
