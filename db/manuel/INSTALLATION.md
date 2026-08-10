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

## Août 2026 — le schéma décrit enfin la base d'aujourd'hui

`db/01-schema.sql` décrivait l'état INITIAL du projet. Tout ce qui est venu
après — les fibres, les jetons de rafraîchissement, les modes de cuisson, les
plans enregistrés — vivait uniquement dans `db/manuel/`. Installer sur une
machine neuve demandait donc quatorze migrations à la main, dans le bon ordre,
et une seule oubliée donnait une application qui démarre et casse plus tard.

**Désormais `db/01-schema.sql` suffit à obtenir la base d'aujourd'hui.**

`db/manuel/` ne disparaît pas : c'est le seul chemin pour faire évoluer une
base qui EXISTE DÉJÀ, puisque PostgreSQL ne rejoue `db/` qu'à la création du
volume. Tous ces fichiers sont idempotents, donc `./installer.sh` les joue
dans les deux cas sans avoir à savoir lequel il a devant lui.

Les migrations de DONNÉES (14 à 19) ne sont pas repliées dans le schéma et ne
peuvent pas l'être : elles corrigent des valeurs saisies, pas une structure.
Les 14 et 15 portent maintenant une garde qui les rend sans objet sur une base
où `etat_reference` n'a jamais existé.

`db/02-donnees.sql` a été regénéré : ses cinquante aliments sont le RÉSULTAT
de la chaîne 14→19 rejouée sur l'ancien jeu, relevé tel quel. Personne n'a
retapé un chiffre. Deux lignes restent fausses et le fichier le dit —
« Boulgour » et « Pates completes » portent encore des valeurs de cuit, que la
migration 18 a refusé de convertir faute de retomber dans la bande du grain
sec.

**L'ordre des migrations est écrit à la main dans `installer.sh`**, et ce n'est
plus un tri alphabétique. `aliment-fibres.sql` passait après `23-…` alors qu'il
crée la colonne dont 16, 17 et 19 ont besoin : sur une base vierge, trois
migrations échouaient. `jeu-essai.sql` — un jeu de démonstration — était joué
comme une migration sur toute installation, et `audit-catalogue.sql`, qui est
un rapport de lecture, aussi. Les trois sont désormais hors de la boucle.

---

Pour la suite : une évolution du schéma va dans `db/01-schema.sql` **ET** dans
un fichier numéroté de `db/manuel/` — le premier pour les bases neuves, le
second pour celles qui existent déjà. Les deux doivent produire la même chose,
et c'est vérifiable : construire une base par chaque chemin et comparer les
deux `pg_dump --schema-only`.
