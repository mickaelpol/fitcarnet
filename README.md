# fitcarnet

Suivi nutritionnel et de musculation, multi-comptes, auto-hébergé.
Compose des repas qui atteignent des cibles de macros à partir de ce qu'il y a
vraiment dans le frigo, et suit la progression en salle.

Projet personnel. Le code, les commentaires et les messages de commit sont en
français — les identifiants métier aussi (`Aliment`, `Seance`, `cleDHabitude`).

---

## Ce que l'application fait

**Composer un repas.** On donne des cibles — 45 g de protéines, 80 g de
glucides, 20 g de lipides — et le solveur rend des grammages atteignables avec
le stock du moment. C'est un vrai système linéaire résolu par élimination de
Gauss, pas un tâtonnement : à court de brocoli il sert des haricots, arrondit
les quantités **avant** de recalculer les macros pour que le chiffre affiché
soit celui qu'on pèse, et **explique chaque écart** à la cible.

**Planifier plusieurs jours.** Le stock se partage sur la période, les fournées
de batch cooking se répartissent, et la liste de courses répond à la vraie
question : de quoi ai-je besoin pour manger ce que je *voulais* manger, et non
ce que mon frigo m'impose.

**Suivre le frigo.** Deux sources interchangeables derrière la même interface :
la table `stock` de la base, ou une instance [Grocy](https://grocy.info)
distante. Le champ `utilisateur.source_frigo` aiguille l'une ou l'autre.

**Suivre les séances.** Modèles réutilisables, séries prévues et réalisées
côte à côte, 1RM estimé par Epley — **uniquement sur les séries courtes**, parce
qu'au-delà de quinze répétitions aucune formule n'est fiable.

### Deux règles qui expliquent beaucoup de choix

**Les valeurs nutritionnelles décrivent le produit tel qu'on le pèse.** Le riz
blanc sec vaut 350 kcal/100 g ; cuit à l'eau, le même riz n'en porte plus que
155 aux 100 g, parce qu'il pèse alors **2,26 fois plus** — il a absorbé 1,26 fois
son poids en eau (CIQUAL 2025, convention du règlement UE n° 1169/2011). Ce sont
les valeurs du **sec** qui sont stockées. Le rendement cru/cuit se dérive des
pesées à la lecture ; il ne se stocke pas.

**Un chiffre faux est pire qu'un refus de répondre.** Ce qui s'affiche sera pesé
et mangé. En cas de doute, l'application montre l'incertitude ou refuse.

---

## Pile technique

| Couche | Choix |
|---|---|
| **API** | Symfony 7.4 · API Platform 4.3 · Doctrine ORM 3.6 · PHP 8.3 sur FrankenPHP |
| **Front** | Expo SDK 54 · React Native 0.81 · React 19 · TypeScript strict · expo-router 6 · TanStack Query |
| **Base** | PostgreSQL 16 — schéma écrit à la main, contraintes et invariants portés par la base |
| **Déploiement** | Docker Compose sur NAS Synology, derrière Caddy |

Android et web. Pas d'iOS : la distribution se fait par APK.

---

## Démarrage

**Poste de développement neuf** → [NOUVELLE-MACHINE.md](NOUVELLE-MACHINE.md),
qui couvre les prérequis, l'outillage et l'application, dans l'ordre.

**En résumé :**

```bash
git clone ssh://git@gitea.mickael-pol.fr:2222/mickael/fitcarnet.git
cd fitcarnet
cp .env.exemple .env        # DB_PASSWORD, APP_SECRET, JWT_PASSPHRASE
./installer-outils.sh       # graphify, intelephense, superpowers-symfony
#  ← démarrer Claude Code ici : il installe les plugins officiels déclarés
./installer.sh --email ton@adresse.fr   # base, migrations, compte, catalogue
cd front && npm install
```

---

## Commandes

```bash
cd front && npm test        # tsc --noEmit + 747 tests, puis 75 de rendu
cd front && npm run verif   # typage seul, plus rapide
cd front && npm run build:web   # régénère front/dist/ (versionné, servi par Caddy)

docker compose -f compose.dev.yml up          # environnement de développement
docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'          # 634 tests API
docker exec fitcarnet-app-dev sh -c 'cd /app && vendor/bin/phpstan analyse'

db/manuel/verifier-schema.sh      # base neuve == base migrée ?
db/manuel/verifier-migrations.sh  # les migrations tiennent-elles sur des données réelles ?
db/manuel/verifier-jeux.sh        # les jeux d'essai et de démonstration se chargent-ils ?
python3 test_import_carnet.py     # l'import du carnet, sur une base jetable
```

---

## Structure

```
api/          Symfony — 9 contrôleurs, 17 ressources API, 13 services, 7 processeurs
front/        Expo — 16 écrans, 38 composants, le solveur de repas, 18 modules de calcul
  src/solveur/    composition de repas : algèbre, garanties, tests de propriété
  src/calcul/     nutrition, cuisson, performance, plausibilité
db/           01-schema.sql (19 tables) + manuel/ (20 migrations numérotées, aliment-fibres.sql,
              deux jeux de données, cibles.sql, et cinq scripts de contrôle et de rattrapage)
docker/       Dockerfile, Caddyfile, point d'entrée de production
docs/         audit-2026-09/ — 79 constats classés
.claude/      outillage : skills du projet, agents, hooks, réglages
```

---

## Qualité

**1 096 tests** au 18 septembre 2026 — 680 côté front (647 + 33 de rendu), 416 côté API ; **1 369 au 25 septembre**, 787 côté front (741 + 46) et 564 côté API, plus 18 épreuves de bout en bout — et des
garde-fous qui tournent sans qu'on y pense :

- **PHPStan** niveau 5 sur l'API ;
- **`ModeleExposeTest`** refuse toute entité exposée qui n'implémente pas
  `ProprieteUtilisateur` sans dérogation écrite — c'est le seul filet contre une
  fuite de données entre comptes ;
- **`verifier-schema.sh`** construit une base neuve et une base migrée dans deux
  conteneurs jetables, et exige un diff vide ;
- **`verifier-migrations.sh`** rejoue les migrations sur des données volontairement
  aberrantes, pour qu'une migration ne casse pas le démarrage en production ;
- **`verifier-jeux.sh`** et **`test_import_carnet.py`** jouent pour de vrai, sur une
  base jetable, ce qu'aucun test d'API ne voit : les jeux de données de la
  démonstration et l'import du carnet.

Deux hooks lancent le typage front et l'analyse PHP après chaque édition.

**TDD sans exception** : le test échoue d'abord, le correctif le fait passer
ensuite. Sinon on « corrige » un bug en ajustant le test qui fige la mauvaise
valeur.

---

## Documentation

| Document | Pour quoi |
|---|---|
| [REPRENDRE.md](REPRENDRE.md) | **où en est le chantier** : ce qui reste, les décisions prises, celles qui attendent |
| [NOUVELLE-MACHINE.md](NOUVELLE-MACHINE.md) | monter un poste de développement de zéro |
| [INSTALLATION.md](INSTALLATION.md) | installer les données pas à pas |
| [DEPLOIEMENT.md](DEPLOIEMENT.md) | mettre en production sur le NAS **et livrer une nouvelle version** |
| [CALCULATEUR.md](CALCULATEUR.md) | le calculateur de repas : parcours et décisions |
| [CLAUDE.md](CLAUDE.md) | les sept règles non négociables du projet |
| [docs/audit-2026-09/](docs/audit-2026-09/README.md) | audit complet, 79 constats et leur plan de correction |
| [docs/journal-2026-09.md](docs/journal-2026-09.md) | l'ancien journal de bord, archivé : l'histoire détaillée du 7 au 17 septembre 2026 |

---

## Conventions

Les commentaires de ce projet **racontent la panne réelle et sa date**. C'est
volontaire : c'est ce qui rend une divergence repérable des mois plus tard, et
ce qui a permis à l'audit de retrouver l'origine de chaque défaut.

Les sept règles non négociables sont dans [CLAUDE.md](CLAUDE.md) — double
écriture du schéma, filtrage par propriétaire, valeurs pesées, convention
européenne des fibres, aucune formule métier recopiée, vide ≠ zéro, et le refus
d'un chiffre faux.

**Une seule arborescence fait foi**, sous WSL2 ou Linux. Jamais de second clone
synchronisé par copie de fichiers : deux copies désynchronisées ont déjà coûté
un bug en production. Ce qui circule passe par git.

---

## Licence

Projet personnel, sans licence de distribution.
Les silhouettes musculaires dérivent de
[body-highlighter](https://github.com/hicham-elabbassi/body-highlighter) (MIT) —
voir `front/src/muscles/LICENCE-body-highlighter.txt`.
