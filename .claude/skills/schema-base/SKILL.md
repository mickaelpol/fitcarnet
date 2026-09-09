---
name: schema-base
description: Faire évoluer le schéma PostgreSQL de fitcarnet — double écriture db/01-schema.sql ET migration numérotée dans db/manuel/, idempotence obligatoire, ordre écrit à la main dans installer.sh. À charger avant toute modification de table, colonne, contrainte ou index.
---

# Faire évoluer le schéma

## La règle : toute évolution s'écrit DEUX fois

1. `db/01-schema.sql` — le schéma tel qu'il est **aujourd'hui**, pour une base neuve
2. une **migration numérotée** dans `db/manuel/` — pour les bases existantes

Une base neuve doit être identique à une base migrée. Le contrôle existe et il est
sans appel :

```bash
db/manuel/verifier-schema.sh   # construit les deux et exige un diff vide
db/manuel/verifier-migrations.sh
```

**État connu au 8 septembre 2026** : `verifier-schema.sh` signale **280 lignes
d'écart**. Ce n'est pas un raté d'installation, c'est le constat **C2** de l'audit,
prévu au lot 4. Ne pas le prendre pour une panne de ton environnement.

## Les migrations sont IDEMPOTENTES, sans exception

`entrypoint-prod.sh` **rejoue tout `db/manuel/` à chaque démarrage** du conteneur.
Deux conséquences qu'on paie cher si on les oublie :

- **Une migration qui échoue empêche la production de redémarrer.** Ne jamais
  écrire `SET colonne = NULL` sur une colonne `NOT NULL` : la migration
  `25-garde-fous.sql` l'a fait, la contrainte n'a jamais été posée, et la base a
  refusé de repartir (`ERROR: null value … violates not-null constraint`).
- **Une migration qui écrit des données écrase les corrections manuelles à chaque
  redémarrage.** C'est le constat 10 : la migration 16 réécrit quatre aliments
  communs, toutes les nuits, indéfiniment.

Écrire donc : `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
`DROP CONSTRAINT IF EXISTS` puis `ADD CONSTRAINT`, et `WHERE` qui borne les
`UPDATE` de données aux lignes qui ne les ont pas encore reçus.

## L'ordre est écrit à la main

`installer.sh` porte la **liste ordonnée** des migrations. Une nouvelle migration
qui n'y est pas ne sera jamais jouée à l'installation. Le numéro seul ne suffit pas.

## Ne jamais lancer les scripts de la racine « pour voir »

`installer.sh`, `restaurer-nas.sh`, `deployer-nas.sh`, `publier*.sh` **déploient ou
détruisent**. `installer.sh --repartir-de-zero` avale les erreurs de `down -v`
(constat 19). Lire `DEPLOIEMENT.md` et `MISE-A-JOUR.md` avant, jamais après.

## Index et plans de requête

Pour l'optimisation (index manquants, plan de requête, `VACUUM`), passer par la
skill **`postgres`**. Constat connu : **dix colonnes de clé étrangère sans index**
(constat 11, lot 4).

## Avant de valider

- [ ] `db/01-schema.sql` **et** la migration numérotée sont écrits tous les deux
- [ ] La migration est rejouable telle quelle, deux fois de suite, sans erreur
- [ ] Elle n'écrit aucune donnée qu'un humain pourrait vouloir corriger ensuite
- [ ] Son nom figure dans la liste ordonnée d'`installer.sh`
- [ ] `verifier-schema.sh` ne signale **rien de plus** que les 280 lignes connues
