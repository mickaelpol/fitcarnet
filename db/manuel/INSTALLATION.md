# Installation depuis une base vierge

Le schéma est désormais **complet dès la création** : plus aucune migration
à jouer à la main. Les fichiers `db/01-schema.sql` et `db/02-donnees.sql`
sont exécutés automatiquement par PostgreSQL au tout premier démarrage du
conteneur, et seulement à ce moment-là.

---

## 1. Démarrer la base

```bash
docker compose -f compose.dev.yml up -d db
docker compose -f compose.dev.yml logs -f db     # attendre « ready to accept connections »
```

Contrôle : 12 tables, 50 aliments, 20 exercices personnels.

```bash
docker compose -f compose.dev.yml exec db psql -U fitcarnet -d fitcarnet -c "
  SELECT 'aliments' AS quoi, count(*) FROM aliment
  UNION ALL SELECT 'exercices', count(*) FROM exercice
  UNION ALL SELECT 'emplacements', count(*) FROM emplacement;"
```

**Si la base existait déjà**, les fichiers ne sont pas rejoués. Pour repartir
de zéro — cela **efface tout** :

```bash
docker compose -f compose.dev.yml down -v
docker compose -f compose.dev.yml up -d db
```

---

## 2. Créer ton compte

```bash
docker compose -f compose.dev.yml up -d app
docker compose -f compose.dev.yml exec app php bin/console \
  fitcarnet:creer-utilisateur ton@adresse.fr "Mickaël" --admin --grocy
```

---

## 3. Tes objectifs par repas

Ouvre `db/manuel/cibles.sql` et remplace l'adresse **ligne 21** :

```sql
    v_email       TEXT := 'ton@adresse.fr';   -- <<< à adapter
```

Puis :

```bash
docker compose -f compose.dev.yml exec -T db psql -U fitcarnet -d fitcarnet \
  < db/manuel/cibles.sql
```

**Pourquoi `db/manuel/` et non `db/`** : le dossier `db/` est monté dans
`docker-entrypoint-initdb.d`, où PostgreSQL exécute *tout* fichier `.sql` à
la création de la base — quel que soit son numéro. Un fichier qui suppose un
compte existant y échouerait. `db/` ne contient donc que ce qui s'exécute
sans condition sur une base vierge ; `db/manuel/` accueille le reste.

---

## 4. Le catalogue d'exercices

```bash
curl -L -o exercises.json \
  https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json

python3 import_catalogue.py exercises.json            # simulation
python3 import_catalogue.py exercises.json --appliquer
```

1 318 exercices en français, avec leur mode et leur rattachement
Push/Pull/Legs déduits. Tes 20 exercices personnels sont préservés et
remontent en tête des listes.

---

## 5. Tes séances

```bash
python3 import_carnet.py donnees-perso/carnet.json --email ton@adresse.fr
python3 import_carnet.py donnees-perso/carnet.json --email ton@adresse.fr --appliquer
```

---

## 6. Sauvegarder

```bash
./sauvegarde.sh
```

À faire dès que l'installation est vérifiée. Le dépôt protège le code, pas
les données.

---

## Ce qui a changé

Les migrations `04-modes`, `05-catalogue`, `06-correctifs` et `07-perf` ont
été **fusionnées** dans le schéma initial. Elles ajoutaient après coup ce qui
peut être créé d'emblée : les colonnes du catalogue, le temps global des
efforts chronométrés, la déduction des modes.

Leur suppression évite l'oubli au déploiement — une base neuve est correcte
sans intervention. En contrepartie, une base **existante** ne recevra pas ces
changements : c'est sans conséquence, puisque tu les as déjà appliqués en
développement.

Pour la suite : une évolution du schéma va dans `db/` si elle s'applique à
une base vierge, dans `db/manuel/` si elle dépend d'un compte ou de données
existantes. Et elle est documentée ici.
