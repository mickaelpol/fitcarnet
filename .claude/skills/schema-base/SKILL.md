---
name: schema-base
description: Faire évoluer le schéma PostgreSQL de fitcarnet — double écriture db/01-schema.sql ET migration numérotée dans db/manuel/, idempotence obligatoire, numérotation que cinq lanceurs reconnaissent par motif, rattrapage de la base de dev, et les deux contrôles qui doivent passer au vert. À charger avant toute modification de table, colonne, contrainte ou index.
---

# Faire évoluer le schéma

## La règle : toute évolution s'écrit DEUX fois

1. `db/01-schema.sql` — le schéma tel qu'il est **aujourd'hui**, pour une base neuve
2. une **migration numérotée** dans `db/manuel/` — pour les bases existantes

Une base neuve doit être identique à une base migrée. Deux contrôles, sans appel :

```bash
db/manuel/verifier-schema.sh       # construit les deux bases et exige un diff vide
db/manuel/verifier-migrations.sh   # joue les migrations sur des données aberrantes
```

**Le seul résultat acceptable de `verifier-schema.sh` est
« ✓ Base neuve et base migrée sont identiques. »** Les 280 lignes d'écart
du 8 septembre 2026 (constat **C2**) ont été résorbées le 14 septembre. Tout
écart est désormais une **régression** : une évolution écrite d'un seul côté.
Ne jamais le classer en « écart connu ».

Vérifié le 16 septembre 2026, migrations 10 à 33 comprises : les deux scripts
passent, et une base de dev rattrapée donne un `pg_dump --schema-only`
identique à celui d'une base neuve.

### Ils tournent sur `postgres:16`, pas sur l'alpine

Les deux scripts lancent un PostgreSQL jetable avec l'image **`postgres:16`**
(Debian, 451 Mo), alors que le dev et la production tournent sur
`postgres:16-alpine`. Sur une machine qui n'a que l'alpine, le premier
lancement télécharge l'image — ou échoue si Docker n'a pas de réseau :

```bash
docker pull postgres:16
```

**Décision du 16 septembre 2026 : on adapte la machine, pas les scripts.** Ils
sont utilisés tels quels sur l'autre poste ; ne pas proposer de les passer en
alpine. La comparaison ne dépend pas de l'image : les deux bases sont vidées
par le même conteneur.

## Les migrations sont IDEMPOTENTES, sans exception

`entrypoint-prod.sh` **rejoue tout `db/manuel/` à chaque démarrage** du conteneur.
Deux conséquences qu'on paie cher si on les oublie :

- **Une migration qui échoue empêche la production de redémarrer.** Ne jamais
  écrire `SET colonne = NULL` sur une colonne `NOT NULL` : la migration
  `25-garde-fous.sql` l'a fait, la contrainte n'a jamais été posée, et la base a
  refusé de repartir (`ERROR: null value … violates not-null constraint`).
  Les lanceurs tournent avec `ON_ERROR_STOP=1` : une erreur arrête tout, elle
  n'est plus avalée.
- **Une migration qui écrit des données écrase les corrections manuelles à chaque
  redémarrage.** C'est le constat 10, et il tient toujours :
  `16-catalogue-ciqual.sql` réécrit **cinq** aliments communs (amande, brocoli,
  quinoa, riz basmati, riz complet) à chaque démarrage. Une correction faite à la
  main sur l'un d'eux revient à la suivante — il faut la faire **dans le
  fichier**. Depuis le 14 septembre, `db/02-donnees.sql` ne sème plus d'aliment
  commun : sur une base neuve, cette migration ne trouve rien à réécrire.

Écrire donc : `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
`DROP CONSTRAINT IF EXISTS` puis `ADD CONSTRAINT`, `CREATE INDEX IF NOT EXISTS`,
et des `WHERE` qui bornent les `UPDATE` de données aux lignes qui ne les ont pas
encore reçus.

## Ce que les lanceurs jouent, et dans quel ordre

Les lanceurs ne portent pas une liste fichier par fichier, mais **un ordre
explicite fait de motifs** :

```bash
db/manuel/aliment-fibres.sql   # d'abord : crée fibres_100, dont 16, 17 et 19 ont besoin
db/manuel/1[0-9]-*.sql
db/manuel/2[0-9]-*.sql
db/manuel/3[0-9]-*.sql
```

Il en découle trois règles :

- **Un fichier numéroté de 10 à 39 est joué sans rien toucher d'autre**, dans
  l'ordre de son numéro.
- **Un fichier dont le nom commence par une lettre n'est PAS joué**, et c'est
  voulu : `jeu-essai.sql` et `jeu-demo.sql` sont des jeux de démonstration,
  `audit-catalogue.sql` un rapport de lecture, `cibles.sql` les objectifs d'un
  compte, à jouer à la main une fois le compte créé. L'ancien tri alphabétique
  jouait `jeu-essai.sql` comme une migration, sur toute installation. Un numéro
  sous 10 ne correspond à aucun motif non plus.
- **Une migration 40 ne serait jouée NULLE PART.** Le motif s'arrête à
  `3[0-9]`, et il vit dans **CINQ fichiers** :

  ```bash
  grep -rn '3\[0-9\]' installer.sh docker/entrypoint-prod.sh \
      db/manuel/verifier-migrations.sh db/manuel/verifier-schema.sh \
      db/manuel/rattraper-dev.sh
  ```

  Oublier `verifier-schema.sh` est le pire des cinq : il annoncerait
  « identiques » sans avoir joué la migration, et son ✓ ne prouverait plus
  rien. C'est ce qui est arrivé à la migration 30 le 14 septembre 2026.
  **La prochaine migration porte le numéro 34** ; il reste six numéros avant
  d'avoir à étendre les cinq fichiers.

## Le développement ne rejoue JAMAIS `db/manuel/`

`compose.dev.yml` ne monte `./db` que dans `docker-entrypoint-initdb.d`, que
PostgreSQL ne joue qu'à la **création du volume**. Une migration écrite après
n'atteint donc jamais la base locale. La production, elle, guérit seule :
`entrypoint-prod.sh` les rejoue à chaque démarrage.

**Après avoir écrit une migration, et après chaque `git pull` qui en apporte
une :**

```bash
db/manuel/rattraper-dev.sh
```

Ce que coûte l'oubli, mesuré le 15 septembre 2026 : `POST /api/connexion` en
**HTTP 500 pour tous les comptes**, l'application entièrement inutilisable, et
750 tests au vert. Le message était `SQLSTATE[42703]: Undefined column "vu_le"`
— jamais « il manque la migration 32 ». Le 16 septembre, une base de dev montée
une semaine plus tôt manquait encore les migrations 30 à 33 après un pull.

## Ne jamais lancer les scripts de la racine « pour voir »

`installer.sh`, `restaurer-nas.sh`, `deployer-nas.sh`, `publier*.sh` **déploient ou
détruisent**. `installer.sh --repartir-de-zero` avale les erreurs de `down -v`
(constat 19). Lire `DEPLOIEMENT.md` avant, jamais après — il porte depuis le
16 septembre 2026 la section « Si tu touches à la base de données », venue de
`MISE-A-JOUR.md`.

## Ne JAMAIS lancer `doctrine:schema:update`

`bin/console doctrine:schema:update --force` **détruirait des données**.
Vérifié le 14 septembre 2026 : son `--dump-sql` propose `DROP TABLE invitation`,
`DROP TABLE inventaire_lot`, la suppression de cinq index et la conversion de
tous les `TIMESTAMPTZ` en `TIMESTAMP(0)` sans fuseau.

Ce n'est pas un défaut du schéma, c'est la conséquence de la règle 1 : **le
schéma est écrit à la main et la base porte plus que les entités**. `invitation`
et `inventaire_lot` sont manipulées en SQL direct, aucune entité ne les décrit ;
Doctrine en conclut qu'elles sont de trop.

Corollaire : **`doctrine:schema:validate` ne passera jamais au vert sur ce
projet**, et son échec ne veut rien dire. Le lot 0 de l'audit le proposait comme
garde-fou — la proposition était mauvaise. Les deux vrais contrôles sont
`verifier-schema.sh` et `verifier-migrations.sh`.

Une divergence déclarative subsiste et reste **sans effet** : les entités
déclarent `datetime_immutable` là où la base est `TIMESTAMPTZ`. Doctrine lit et
écrit correctement ; changer le mapping ferait courir plus de risque que la
divergence n'en pose.

## Index et plans de requête

Pour l'optimisation (index manquants, plan de requête, `VACUUM`), passer par la
skill **`postgres`**.

Le constat 11 (dix clés étrangères sans index) est traité par
`31-index-de-jointure.sql`, qui en indexe **cinq, et c'est délibéré** — les
chemins chauds et les `ON DELETE RESTRICT`. Les cinq autres
(`stock.emplacement_id`, `seance.modele_id`,
`cuisson_habituelle.mode_cuisson_id`, `invitation.invite_par`,
`invitation.utilisateur_id`) restent sans index : tables courtes, jointures
rares. Ne pas les « compléter » sans une requête qui en a besoin.

## Avant de valider

- [ ] `db/01-schema.sql` **et** la migration numérotée sont écrits tous les deux
- [ ] La migration porte un numéro entre 10 et 39 — au-delà, le motif est
      étendu dans les **cinq** lanceurs
- [ ] Elle est rejouable telle quelle, deux fois de suite, sans erreur
- [ ] Elle n'écrit aucune donnée qu'un humain pourrait vouloir corriger ensuite
- [ ] `verifier-schema.sh` répond **« identiques »** — rien d'autre
- [ ] `verifier-migrations.sh` répond **« Les migrations passent sur des
      données réelles »**
- [ ] `db/manuel/rattraper-dev.sh` a été joué sur la base de dev
