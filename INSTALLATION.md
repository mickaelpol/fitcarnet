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

> **Zéro aliment sur une base neuve est le résultat attendu.** Chaque aliment
> appartient à un compte, et chaque compte saisit les siens : les valeurs
> nutritionnelles ne sont pas une constante, deux paquets de la même marque
> diffèrent, et l'étiquette donne les bonnes. `db/02-donnees.sql` ne sème que
> le partagé — emplacements, façons de cuire, et vingt exercices de départ.

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

Le mot de passe est demandé **sans écho**, et il doit respecter la règle du
projet : **12 caractères au minimum, une minuscule, une majuscule, un chiffre et
un caractère spécial**. Durcie le 18 septembre 2026 — c'était 10 sans exigence
de composition. Si le tien ne passe pas, la commande dit **tout** ce qui lui
manque, pas seulement le premier défaut. La règle n'a qu'un endroit où elle
vit : `api/src/Service/MotDePasse.php`, servi par
`POST /api/verification/mot-de-passe`. *(Cette ligne a nommé
`api/regles/motdepasse.json` jusqu'au 21 septembre 2026, un mois après sa
suppression.)*

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

Le script exige le pilote PostgreSQL (`pip install psycopg2-binary`).
`python3 test_import_carnet.py` le rejoue sur une base jetable : jusqu'au
17 septembre 2026, il écrivait une colonne supprimée et n'importait rien.

---

## 6. Sauvegarder

```bash
./sauvegarde.sh
```

À faire dès que l'installation est vérifiée. Le dépôt protège le code, pas
les données. Le seul format est le `.dump`, qui se restaure avec
`./sauvegarde.sh --restaurer` ; il n'y a plus d'export « catalogue ».

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

**L'ordre des migrations est écrit à la main dans `installer.sh`**, et ce n'est
plus un tri alphabétique : `aliment-fibres.sql`, qui crée la colonne
`fibres_100`, passe en tête, avant les migrations numérotées. `jeu-essai.sql` —
un jeu de démonstration — n'est pas une migration et reste hors de la boucle.

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
