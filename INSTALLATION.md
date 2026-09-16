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

Contrôle : **19 tables**, et **aucun aliment** — c'est voulu, voir plus bas.

```bash
docker compose -f compose.dev.yml exec db psql -U fitcarnet -d fitcarnet -c "
  SELECT 'tables' AS quoi, count(*) FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  UNION ALL SELECT 'aliments', count(*) FROM aliment
  UNION ALL SELECT 'exercices', count(*) FROM exercice
  UNION ALL SELECT 'emplacements', count(*) FROM emplacement;"
```

> **Ce contrôle annonçait « 12 tables, 50 aliments » jusqu'au 16 septembre 2026,
> et il faisait croire à une installation ratée.** Le schéma en compte 19, et
> `db/02-donnees.sql` n'insère plus un seul aliment depuis le 14 septembre : les
> valeurs nutritionnelles ne sont pas une constante, deux paquets de la même
> marque diffèrent. Zéro aliment sur une base neuve est le résultat **attendu**.

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

Le fichier vit dans `db/manuel/` à dessein : il vient **après** la création du
compte, donc jamais au démarrage automatique. Il est idempotent.

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

**1 338 exercices** en français, avec leur mode et leur rattachement
Push/Pull/Legs déduits. Tes exercices personnels sont préservés et remontent en
tête des listes. *(Le chiffre a été mesuré en base le 16 septembre 2026 ; ce
document annonçait 1 318, `NOUVELLE-MACHINE.md` 1 338 — c'est ce dernier qui
avait raison.)*

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
et c'est vérifiable : `db/manuel/verifier-schema.sh` construit une base par
chaque chemin et exige un diff vide.

> **Ce chapitre et le paragraphe « Pourquoi `db/manuel/` » viennent de
> `db/manuel/INSTALLATION.md`, fusionné ici le 16 septembre 2026.** Les deux
> documents portaient le même titre et 93 lignes identiques sur 115 ; celui de
> `db/manuel/` n'avait pas bougé depuis le 11 août et gardait, lui seul, la
> justification du répertoire — que quatre fichiers du dépôt citent.
