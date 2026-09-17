---
name: donnees-de-test
description: Éprouver fitcarnet sur l'application réelle sans abîmer les données — créer des comptes et des aliments jetables, se connecter à l'API, et surtout tout retirer ensuite. À charger avant toute vérification bout en bout, tout scénario d'isolation entre comptes, ou toute écriture dans la base de développement.
---

# Éprouver l'application sans abîmer les données

Les tests unitaires ne prouvent pas que l'application répond. Le 14 septembre
2026, 543 tests étaient au vert alors que rien ne garantissait que
`/api/exercices` fonctionnait encore après l'ajout d'un filtre Doctrine.

Ce document dit comment monter un scénario réel **et revenir exactement à
l'état initial**.

## La règle qui n'a pas été suivie, et ce qu'elle a coûté

> **Relever la valeur AVANT de l'écraser. Toujours.**

Le 14 septembre, un `PATCH` de vérification a été fait sur l'exercice `id = 1`
— une donnée réelle — sans relever `nom_fr` d'abord. Il a fallu restaurer une
sauvegarde du 11 août dans une base jetable pour retrouver la valeur. Elle était
vide, donc plus de peur que de mal ; si l'utilisateur l'avait renseignée entre
les deux, elle était perdue.

**Le remède tient en une phrase : n'écris jamais sur une donnée que tu n'as pas
créée.** Crée la tienne, éprouve-la, retire-la.

## Créer un compte jetable

Le hachage se demande à Symfony, on ne l'invente pas :

```bash
docker exec fitcarnet-app-dev sh -c \
  'cd /app && bin/console security:hash-password "MotDePasseTest123!" --no-interaction'
```

`utilisateur.nom` est **NOT NULL** — l'oublier fait échouer l'insertion :

```sql
INSERT INTO utilisateur (id, email, mot_de_passe, nom, roles, actif, cree_le)
VALUES (gen_random_uuid(), 'alice-verif@test.local', '<le hash>',
        'Alice Verif', 'ROLE_USER', true, now());
```

**Un suffixe `@test.local` sur toutes les adresses** : c'est ce qui permet de
tout retrouver au nettoyage, et de prouver qu'il ne reste rien.

## Se connecter

```bash
JETON=$(curl -s -X POST http://localhost:8080/api/connexion \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice-verif@test.local","motDePasse":"MotDePasseTest123!"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

curl -s -H "Authorization: Bearer $JETON" http://localhost:8080/api/exercices
```

Le JWT dure une heure. Pour un `POST` API Platform, l'en-tête est
`Content-Type: application/ld+json` ; pour un `PATCH`,
`application/merge-patch+json`.

## Nettoyer — et l'ordre compte

```sql
-- 1. le stock qui vise leurs aliments : stock.aliment_id est ON DELETE RESTRICT
DELETE FROM stock WHERE aliment_id IN
  (SELECT a.id FROM aliment a JOIN utilisateur u ON u.id = a.utilisateur_id
    WHERE u.email LIKE '%-verif@test.local');

-- 2. leurs aliments
DELETE FROM aliment WHERE utilisateur_id IN
  (SELECT id FROM utilisateur WHERE email LIKE '%-verif@test.local');

-- 3. les comptes : inventaire_lot, stock et le reste partent en CASCADE
DELETE FROM utilisateur WHERE email LIKE '%-verif@test.local';
```

**Pourquoi cet ordre.** Chaque aliment appartient à un compte
(`aliment.utilisateur_id`, `ON DELETE CASCADE`) : supprimer le compte emporte ses
aliments. Mais `stock.aliment_id` est en `RESTRICT`, et PostgreSQL ne garantit pas
l'ordre de deux cascades parties du même compte — d'où le stock, puis les
aliments, puis le compte, comme le fait `ComptesController::supprimer`.

### Prouver qu'il ne reste rien

Ne pas se contenter de lancer les `DELETE` : compter après.

```sql
SELECT 'comptes de test restants : ' || count(*)
  FROM utilisateur WHERE email LIKE '%@test.local'
UNION ALL SELECT 'aliments : ' || count(*) FROM aliment
UNION ALL SELECT 'exercices : ' || count(*) FROM exercice
UNION ALL SELECT 'comptes : ' || string_agg(email, ', ') FROM utilisateur;
```

Les chiffres doivent être **identiques à ceux relevés avant de commencer**. Les
relever d'abord fait donc partie du protocole.

## Les pièges de suppression, vérifiés

- **`stock.aliment_id` est en `ON DELETE RESTRICT`** — c'est la seule clé
  étrangère qui pointe vers `aliment`. Un aliment avec du stock ne se supprime
  pas ; le message est explicite.
- **`plan_repas.contenu` est du JSON.** Aucune clé étrangère ne le protège : un
  aliment supprimé qui y figure laisse le plan incohérent **sans la moindre
  erreur SQL**. Vérifier avant de supprimer un aliment qu'aucun plan ne le cite.
- **`cuisson_habituelle.aliment` est un TEXTE**, pas une clé étrangère. Une
  habitude survit à la suppression de l'aliment et pointe dans le vide.

## Retrouver une valeur écrasée

Si le mal est fait, ne pas restaurer sur la base réelle. Monter une base jetable :

```bash
docker cp sauvegardes/fitcarnet_<date>.dump fitcarnet-db-dev:/tmp/s.dump
docker exec fitcarnet-db-dev sh -c "
  createdb -U fitcarnet verif_tmp
  pg_restore -U fitcarnet -d verif_tmp --no-owner /tmp/s.dump >/dev/null 2>&1
  psql -U fitcarnet -d verif_tmp -tAc \"SELECT nom_fr FROM exercice WHERE id = 1;\"
  dropdb -U fitcarnet verif_tmp; rm -f /tmp/s.dump"
```

## Un scénario d'isolation, en entier

Le motif à reprendre — c'est celui qui a prouvé qu'É8 tenait vraiment :

1. créer **deux** comptes, `alice-verif@` et `bob-verif@` ;
2. relever les compteurs avant (`SELECT count(*) FROM exercice`) ;
3. Alice crée sa donnée par l'**API**, pas en SQL — c'est le chemin réel ;
4. vérifier en base que les colonnes attendues sont posées (`public` et `cree_par` pour un exercice, `utilisateur_id` pour un aliment) ;
5. Alice voit N+1, **Bob voit N** ;
6. `GET /api/<ressource>/<id>` par Bob rend **404**, par Alice **200** ;
7. nettoyer, et recompter.

Le point 6 est le plus important : un filtre posé en collection et oublié en item
laisse une liste propre et une fuite par identifiant.

## Ce qu'on ne lance jamais

`installer.sh`, `restaurer-nas.sh`, `deployer-nas.sh`, `publier*.sh`,
`sauvegarde-nas.sh`. Ils déploient ou détruisent.

`./sauvegarde.sh` en local est sans danger — et une sauvegarde avant de
commencer coûte trois secondes.
