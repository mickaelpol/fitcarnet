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

Adapte l'adresse en tête de `db/manuel/cibles.sql`, puis :

```bash
docker compose -f compose.dev.yml exec -T db psql -U fitcarnet -d fitcarnet \
  < db/manuel/cibles.sql
```

> Ce chemin a été faux pendant des mois — le document annonçait
> `db/90-cibles.sql`, qui n'a jamais existé sous ce nom. L'étape échouait en
> « No such file » sur toute machine neuve. Relevé le 15 septembre 2026 par
> l'agent `verite-documentaire`. `installer.sh` faisait bien, lui, référence au
> bon fichier : c'est la procédure manuelle qui mentait.

Le fichier est numéroté 90 à dessein : il vient **après** la création du
compte, donc jamais au démarrage automatique. Il est idempotent.

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

Pour la suite : toute évolution du schéma passera par un fichier numéroté à
partir de `10-`, joué explicitement, et documenté ici.
