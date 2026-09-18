# Où on en est — reprendre le travail

Ce fichier dit **ce qui reste à faire, dans l'ordre**, et **les décisions en
vigueur** — ce que ni le code ni les commits ne racontent. À lire en arrivant,
à tenir à jour en repartant.

Il a été réécrit de zéro le 18 septembre 2026. L'ancien journal, avec
l'histoire détaillée du 7 au 17 septembre (les pannes, leurs dates, comment
elles ont été trouvées), est archivé dans
[docs/journal-2026-09.md](docs/journal-2026-09.md) : on y cherche le *pourquoi*
d'une ligne de code, pas ce qui reste à faire.

---

## L'état, au 18 septembre 2026

- **Tout est poussé sur Gitea**, et donc déployé : la tâche planifiée du NAS
  tire `master` toutes les 5 minutes. **La production a été contrôlée le
  18 septembre** — schéma conforme aux migrations 34-35-36, parcours réel
  éprouvé sur un compte jetable puis retiré (section 2.1).
- **Tests** : 606 côté front plus 33 de rendu, 356 côté API (918 assertions),
  tous verts. PHPStan : 7 erreurs connues, pas une de plus.
- **Contrôles de base**, tous verts : `verifier-schema.sh` (base neuve
  identique à base migrée), `verifier-migrations.sh`, `verifier-jeux.sh`,
  `test_import_carnet.py`.
- **Dernier chantier** : chaque aliment appartient à un compte (17 septembre),
  puis deux passes des trois agents de contrôle et leurs correctifs.
- **Audit de septembre** : 79 constats, **71 clos, 8 ouverts**, aucun
  critique ni élevé (section 2.4).

---

## 1. En arrivant sur un poste

Deux postes travaillent sur ce dépôt, synchronisés **par Gitea seulement** :
`~/perso/fitcarnet` sur l'un, `~/fitcarnet` sur l'autre. Chacun a **sa propre
base de dev et son propre `node_modules`**.

```bash
git pull
docker compose -f compose.dev.yml up -d
db/manuel/rattraper-dev.sh       # APRÈS TOUT PULL qui apporte une migration
cd front && npm install          # si package.json a bougé, ou si les tests de rendu ne compilent pas
```

Puis vérifier qu'on part d'un socle sain :

```bash
cd front && npm test                                                  # 606 + 33, 0 échec
docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'          # 330 tests, 864 assertions
db/manuel/verifier-schema.sh                                          # « identiques »
db/manuel/verifier-migrations.sh                                      # vert
db/manuel/verifier-jeux.sh                                            # vert
```

Un rouge **avant** d'avoir touché à quoi que ce soit vient de l'environnement,
pas du code : le régler d'abord.

**Le premier message à donner à Claude**, selon ce qu'on reprend :

> Lis `REPRENDRE.md`. On contrôle la production et on retire la migration 34
> (section 2.1). Ne travaille pas sur une autre branche que `master` sans me
> le demander.

> Lis `REPRENDRE.md` et `presentation/demonstration.md`. On prépare le
> tournage : d'abord les trois arbitrages de la section 2.3, puis les comptes
> de démonstration sur le NAS, puis bobine par bobine.

> Lis `REPRENDRE.md`. On attaque les constats d'audit ouverts de la
> section 2.4, en TDD, un commit par constat.

---

## 2. Ce qui reste à faire, dans l'ordre

### 2.1 ~~Contrôler la production, retirer la migration 34~~ — fait le 18 septembre

**Schéma de production vérifié** (`\d aliment`, `\d stock`) : `utilisateur_id`
NOT NULL, l'index `aliment_nom_unique_par_compte`, la contrainte
`aliment_id_utilisateur_unique`, et côté stock la clé composite
`stock_aliment_du_meme_compte_fkey` — **sans** `stock_aliment_id_fkey` ni
`stock_quantite_check`, ce dernier remplacé par `stock_quantite_positive`. Les
migrations 34, 35 et 36 sont donc passées. Déploiement du 18 septembre à 11:43,
tous les conteneurs sains ; `/api` répond 401 sans jeton, `/api/etat` dit `ok`.

**Épreuve d'écriture, sur un compte jetable** (`epreuve-verif@test.local`, créé
sans `--grocy`, retiré ensuite — les comptes existants lisent Grocy et
n'écrivent donc pas dans la table `aliment`) : frigo vide à l'arrivée, aliment
créé **avec un propriétaire**, ligne de stock acceptée sur son propre aliment,
suppression **refusée** tant que le stock existe (« Cet aliment est encore dans
un frigo (1 ligne de stock) »), puis quantité mise à zéro par l'inventaire,
appliquée en tâche de fond, et suppression acceptée. Compteurs identiques avant
et après : 4 comptes, 0 aliment, 0 stock.

**`db/manuel/34-aliments-par-compte.sql` est retiré** (commit à part).
`verifier-schema.sh` : base neuve et base migrée identiques.
`verifier-migrations.sh` : tous les garde-fous posés. **La prochaine migration
prend le numéro 37** — jamais le 34 libéré (skill `schema-base`).

**Conséquence acceptée** : une sauvegarde d'avant le 17 septembre ne redémarre
plus seule — la 35 s'arrête et demande de rejouer la 34 depuis l'historique
(`git show 1068054:db/manuel/34-aliments-par-compte.sql`). `DEPLOIEMENT.md` le
dit à l'endroit de la restauration.

**À savoir pour la démonstration** : la production ne contient **aucun aliment**
(la 34 a supprimé ceux sans propriétaire, et les deux comptes lisent Grocy). Un
compte de démonstration devra donc recevoir `jeu-essai.sql` puis `jeu-demo.sql`.

### 2.1 bis — une limite du front, mesurée et laissée telle quelle

**Le calculateur rend ses résultats dans un `ScrollView`**, qui dessine TOUT
d'un coup (`app/(onglets)/repas.tsx`, et de même dans `planRelu`,
`etapeReglage`, `etapeBatch`). La documentation React Native déconseille le
`ScrollView` pour une longue liste — mais **virtualiser n'apporterait presque
rien ici** : la liste extérieure, ce sont les JOURS, et un plan réaliste en
compte trois à sept. Le poids est à l'intérieur de chaque jour (quatre repas ×
leurs aliments, avec leurs champs de saisie), et virtualiser à ce niveau-là
demande des listes imbriquées, que React Native gère mal.

**Ce qui n'est pas borné** : rien n'empêche de cocher un mois entier au
calendrier. Le jour où l'écran devient lent, c'est cette limite qu'il faut
regarder — pas la liste des jours.

Les cinq `FlatList` du projet ont toutes leur `keyExtractor`. Seule celle des
**1 338 exercices** a vu son `renderItem` sortir du JSX (18 septembre) : elle
seule se redessinait entièrement à chaque frappe dans la recherche. Les autres
gardent le leur en ligne — leurs appelants passent des fonctions recréées à
chaque rendu, une mémoïsation intérieure n'y changerait rien.

### 2.2 À faire par toi, sur le NAS

**Régénérer la clé d'API Grocy.** Elle a été collée dans une conversation le
15 septembre 2026 : elle est à considérer comme publiée. Grocy → Paramètres →
Clés d'API → révoquer puis recréer, et reporter la nouvelle dans le `.env` du
NAS.

**Sortir les sauvegardes du NAS — constat d'audit 02#8.** Base et sauvegardes
vivent toutes deux sur `/volume1` : une panne de volume, un rançongiciel ou une
suppression du dossier `docker/` emporte les deux d'un coup. Aucune ligne de
code ne peut corriger cela — il faut une tâche DSM (Hyper Backup ou un `rsync`)
qui copie `/volume1/docker/sauvegardes-fitcarnet` **ailleurs**. Puis, une fois :
reprendre le dernier `.dump` **depuis la destination** et le relire avec
`./restaurer-nas.sh --essai`. Le détail est dans `DEPLOIEMENT.md`, section
« Ce que ces sauvegardes NE protègent pas ».

### 2.3 Avant de tourner la démonstration

Tout le dossier est écrit (`presentation/demonstration.md`, un seul point
d'entrée : `./presentation/preparer-demonstration.sh`). **Trois arbitrages
d'abord** — chacun ferait tourner une prise pour rien :

| Point | Le problème | Les deux issues |
|---|---|---|
| **Le bandeau « Fibres inconnues »** | Le plan 4.1 de la bobine 4 et la slide 06 le montrent, mais `jeu-essai.sql` renseigne les fibres de ses huit aliments : il ne peut pas apparaître (`planCalcule.ts` exige un aliment aux fibres inconnues). | Un féculent du jeu aux fibres `NULL`, ou retirer le bandeau du plan et de la slide. |
| **Les habitudes de cuisson du compte de démonstration** | Aucun fichier ne les pose, et `presentation/tournage/capturer.mjs` clique « se mangent tels quels » : sur un compte neuf, la capture du batch cooking sort sans fournée. | `jeu-demo.sql` pose des habitudes, ou le script de capture les choisit. |
| **La tuile d'audit de la slide** | `construire.py` affiche désormais « 61 / 79 clos · aucun critique ni élevé ouvert », là où la slide disait « tous clos ». | Garder ce message, ou le reformuler. |

Ensuite, dans l'ordre de `demonstration.md` (partie I) :

1. Créer les **deux comptes de démonstration en production** — un ordinaire,
   un administrateur (sans lui, les bobines 1 et 8 sont impossibles).
2. Y charger le jeu de données **en deux temps** : `jeu-essai.sql` (le frigo :
   8 aliments, 8 lignes de stock dont 6 garnies) puis `jeu-demo.sql`
   (l'histoire : 23 séances, 123 séries, 2 plans, 4 cibles). Toujours avec
   `psql -v ON_ERROR_STOP=1`, et **relire l'adresse dans les `sed`** :
   `jeu-demo.sql` efface avant de poser. La remise à zéro entre deux bobines
   se fait avec `-v ecraser=oui`.
3. Tourner les **huit bobines** avec scrcpy, **installé sur Windows** (WSL2 n'a
   aucun accès USB).
4. Remonter la vidéo à partir des prises.

La source Grocy n'est tournable que si `GROCY_URL` est renseigné sur
l'instance filmée. Sur la base de dev **du premier poste**, deux comptes
jetables servent aux captures (`demo-verif@test.local`,
`demo-admin-verif@test.local`) : les retirer une fois les captures refaites.

### 2.4 Les 8 constats d'audit ouverts

Vérifiés un par un le 17 septembre 2026. Aucun critique, aucun élevé. La
preuve de chacun (fichier et ligne) est dans
[docs/audit-2026-09/README.md](docs/audit-2026-09/README.md), section « Ce qui
reste ouvert » ; le constat complet, dans le rapport indiqué (`02` = données et
infrastructure, `03` = front, `04` = tests et qualité).

**Trois attendent ta décision :**

| Constat | Gravité | Ce qui retient |
|---|---|---|
| **02#13** — ni limites de ressources ni rotation des journaux dans `docker-compose.yml` | faible | toute modification de ce fichier se déploie en production au prochain push : une limite mal choisie arrêterait l'application réelle |
| **02#15** — `compose.dev.yml` publie `5432:5432` | faible | le port sert : `import_carnet.py` et `import_catalogue.py` visent `localhost:5432` |
| **02#17** — aucune purge des invitations expirées | faible | la réinvitation n'est plus bloquée ; reste à décider si l'on purge |

**Cinq n'ont jamais été tranchés :**

| Constat | Gravité | En une phrase |
|---|---|---|
| **03 M5** | moyenne | Sur le web, les jetons de session sont en clair dans `localStorage` (`front/src/api/client.ts`). |
| **03 M10** | moyenne | Course au chargement des jetons au démarrage (`client.ts`). |
| **03 M12** | moyenne | La saisie d'un inventaire en cours est perdue au changement d'onglet. |
| **03 M13** | moyenne | `noUncheckedIndexedAccess` est désactivé dans `front/tsconfig.json`. |
| **04#19** | faible | Divisions et conversions non gardées dans `ciqual_vers_grocy.py`. |

Pour les reprendre : un constat, un test rouge, un correctif, un commit ; puis
mettre à jour son statut dans le rapport et dans le README de l'audit.

### 2.5 Confort, dette connue, et ce qui attend un avis

| Quoi | Détail | Effort |
|---|---|---|
| **Table des paliers du 1RM** | Tranchée le 15 septembre (zone 70-90 %, pas de 2,5 %), mais trois points restent à ton avis : 95 % et 100 % retirés ; échauffement à 60/50/40 sans granularité fine ; sous 10 kg de 1RM, une ligne fusionnée peut perdre une prédiction juste à cause d'un voisin hors domaine. | à trancher |
| **Publier un exercice depuis l'administration** | `Exercice.public` n'est écrit par personne : aucun mécanisme de publication n'existe. L'ouvrir aux seuls administrateurs est la proposition « C » de la revue. | à trancher |
| **`choixRatio.tsx`** | dernier morceau du lot 6 ; il appartient à `editeurAliment.tsx`. | 1 h |
| **Le câblage des hooks React** | reste du lot 7 ; `@testing-library/react` est installé, la porte est ouverte. | ~4 h |
| **Extraire `LigneAliment` de `carteRepas.tsx`** | pour tester le composant comme `calcul/poidsServi.ts` l'est déjà. | 1 h |
| **Un second `tsconfig` pour les tests de rendu** | rendrait aux tests ordinaires la garde « pas d'import de `.tsx` ». | 1 h |
| **Les hooks de `.claude/settings.json`** | appellent graphify par un chemin absolu (`/home/micka/.local/bin/graphify`) : vrai sur les deux postes, faux sur un troisième. Non modifié. | 5 min |
| **Le graphe sémantique** | `graphify update .` est à jour pour le code ; la partie tirée des documents demande `/graphify . --update` (consomme des tokens ; `api/src` en fait partie, voir `CLAUDE.md`). | ~30 min |
| **`presentation/features.md`** | « ~288 capacités », inventaire du 14 septembre : ses renvois vers les fichiers non touchés depuis restent périmés, comme son en-tête le dit. | 2 h |
| **Le réseau sortant des conteneurs** | constaté cassé le 9 septembre sur le poste d'alors (NAT Docker sous WSL2 : `composer install` impossible dans le conteneur). Non revérifié depuis. | à vérifier |

**Laissés en l'état, en connaissance de cause** — à reprendre seulement si le
besoin se présente :

- Un champ **connu mais non inscriptible** est ignoré en silence
  (`"utilisateur": …` dans un `POST /api/aliments` reçoit 201, sans effet ni
  fuite). Le refuser casserait les écrans qui renvoient `id` et `creeLe` —
  c'est l'échec de `allow_extra_attributes: false`, le 15 septembre.
- « J'ai cuisiné » dit « plus dans ton frigo » d'un aliment qui n'y a jamais
  été (plan qui cite l'aliment d'un autre compte). Libellé inexact.
- Les dates ne sortent pas toutes sous la même forme (`+02:00` dans la réponse
  de « J'ai cuisiné », `+00:00` à la relecture). L'instant est le même.
- `GET /api/utilisateurs/{id}` d'un autre compte rend 403 et non 404 : on
  apprend qu'un UUID existe. Un UUID v4 ne se devine pas.
- Un décalage d'affichage d'environ 13 px dans l'éditeur d'aliment après une
  saisie (Chromium, 1280×900). Origine non recherchée.

---

## 3. Les décisions en vigueur — ne pas les rouvrir sans raison

- **Aucun SQL dans `src/Controller/`** (18 septembre 2026). Il vit dans
  `src/Repository/` — `CuissonsHabituelles`, `Comptes`, `Invitations` — avec les
  transactions qui l'accompagnent. Un contrôleur lit la requête, appelle,
  répond. C'est ce que montre la documentation Symfony 7.4 (consultée par
  context7) : du SQL brut, oui, mais dans un dépôt. Les trois dépôts ont été
  écrits **test d'abord**, et ces tests tiennent ce que le SQL portait sans le
  dire : l'ordre de suppression d'un compte, l'upsert des habitudes, et le fait
  que la liste des invitations ne sélectionne jamais l'empreinte d'un jeton.
- **La propriété d'un objet se demande au voter** `EstLeProprietaire` (attribut
  `MIEN`), pas à une comparaison écrite sur place. Il vaut pour toute entité
  `ProprieteUtilisateur`. **Les `#[IsGranted('ROLE_…')]` restent** : un rôle se
  vérifie ainsi ; un voter sert quand la décision porte sur un objet. Et il ne
  change pas la réponse — 404 dans les deux cas, « n'existe pas » et « pas à
  toi », pour ne pas apprendre à un inconnu quels identifiants existent.
- **Pousser, c'est déployer.** La tâche planifiée du NAS tire Gitea toutes les
  5 minutes. Avant un push qui touche au schéma : `sauvegarde-nas.sh` à la
  main (la sauvegarde automatique date de 4 h). Voir `DEPLOIEMENT.md`.
- **Chaque aliment appartient à un compte** (17 septembre 2026). Pas
  d'aliment commun, partagé ni « de référence » ; une base neuve n'en sème
  aucun. Conception : `docs/superpowers/specs/2026-09-17-aliments-tous-personnels-design.md`.
- **On repart sur une base saine** (17 septembre) : aucun utilisateur réel hors
  l'administrateur ; les sauvegardes d'avant le passage n'ont pas à rester
  restaurables telles quelles.
- **Les dates sont corrigées pour l'avenir seulement** (17 septembre). Les
  lignes écrites par l'API avant cette date gardent leur décalage d'une ou deux
  heures : rien ne distingue, ligne à ligne, ce que l'API a écrit de ce que la
  base a posé.
- **Il n'y a pas d'export « catalogue »** (`sauvegarde.sh --catalogue`,
  supprimé le 17 septembre) : le seul format de sauvegarde est le `.dump`, et
  restaurer la production, c'est `restaurer-nas.sh`.
- **Le stock s'écrit par `/api/mon-frigo`**, jamais par `/api/stocks`, qui est
  en lecture seule.
- **Le partage de modèle n'existe pas** (15 septembre) : il ne doit pas être
  possible dans l'application.
- **Les exercices** : catalogue commun, règle « public OU le mien » ; l'auteur
  corrige le sien, l'administrateur tous. Supprimer un compte emporte ses
  exercices personnels que plus personne ne cite.
- **L'architecture hexagonale** est un objectif assumé, **non commencé** ; elle
  ne se mélange jamais à une correction de bug dans un même commit.
- **Le TDD n'a pas d'exception** : le test échoue d'abord ; s'il passe du
  premier coup, on remet le code fautif pour le voir tomber.
- **Une seule arborescence par poste**, en terminal ; jamais de copie Windows
  (Claude Cowork refuse les chemins WSL, et deux copies ont produit le bug C1).
- **Les vérificateurs tournent sur `postgres:16`**, pas sur l'alpine : on adapte
  la machine (`docker pull postgres:16`), pas les scripts.
- **Keycloak a été supprimé** à la demande du propriétaire : ne jamais le
  relancer ni le réinstaller.
- **`presentation/fonctionnalites-par-onglet.md`** est la référence du besoin,
  écrite par le propriétaire : ne jamais la modifier.
- **graphify oriente, il ne remplace pas `grep`.**

---

## 4. Les pièges vérifiés, qui reviendront

- **Le développement ne rejoue jamais `db/manuel/`** : `compose.dev.yml` ne
  monte `./db` qu'à la création du volume. Sans `rattraper-dev.sh` après un
  pull, l'API répond 500 — le 15 septembre, dès la connexion, avec 750 tests
  verts.
- **Le glob des migrations s'arrête à `3[0-9]`** et vit dans **cinq** fichiers :
  `installer.sh`, `docker/entrypoint-prod.sh`, `db/manuel/verifier-migrations.sh`,
  `db/manuel/verifier-schema.sh`, `db/manuel/rattraper-dev.sh`. Une migration 40
  ne serait jouée nulle part.
- **`api/front` est un doublon de `front/dist`**, servi en dev, ignoré par git,
  et il périme en silence : après `npm run build:web`, faire
  `rm -rf api/front && cp -r front/dist api/front`.
- **Un test posé dans `front/app/` n'est jamais exécuté** : le motif de
  `tsconfig.tests.json` ne couvre que `src/`.
- **`npm test` exige Node 22** ; sous Node 20, l'erreur ne parle pas de version.
- **PHPUnit se lance dans le conteneur** : le PHP de l'hôte n'a ni `dom`, ni
  `mbstring`, ni `xmlwriter`.
- **Les commandes `psql` qui jouent un fichier portent `-v ON_ERROR_STOP=1`** :
  sans lui, une erreur s'affiche puis psql continue et sort en 0.
- **`Table_Ciqual_2025.xlsx` n'est pas versionnée** : la télécharger sur
  ciqual.anses.fr pour revérifier un chiffre.
- **`bin/console` exige `api/.env`**, et les clés JWT ne sont pas dans le dépôt
  (`bin/console lexik:jwt:generate-keypair --skip-if-exists`).
- **Si `fitcarnet-app-dev` tourne sans port publié**, un autre conteneur tenait
  le 8080 à sa création : libérer le port, puis
  `docker compose -f compose.dev.yml up -d --force-recreate app`.
- **Un plugin déclaré peut manquer sans un mot** : `installer-outils.sh` doit
  afficher « 5/5 plugins installés ».
- **Les scripts de la racine ne se lancent jamais « pour voir »** :
  `installer.sh`, `restaurer-nas.sh`, `deployer-nas.sh`, `publier*.sh`,
  `sauvegarde-nas.sh`.

---

## 5. Où trouver le reste

| Document | Ce qu'on y trouve |
|---|---|
| [CLAUDE.md](CLAUDE.md) | les sept règles non négociables, l'aiguillage des skills et des agents |
| [DEPLOIEMENT.md](DEPLOIEMENT.md) | publier, déployer, sauvegarder, restaurer |
| [NOUVELLE-MACHINE.md](NOUVELLE-MACHINE.md) | monter un poste de zéro |
| [docs/audit-2026-09/](docs/audit-2026-09/README.md) | les 79 constats, leur statut daté, la preuve de chaque constat ouvert |
| [presentation/demonstration.md](presentation/demonstration.md) | la démonstration : jeu de données, comptes, huit bobines, montage |
| [docs/journal-2026-09.md](docs/journal-2026-09.md) | l'ancien journal, archivé : l'histoire détaillée du 7 au 17 septembre |
| `docs/superpowers/` | la conception et le plan du chantier « aliments par compte » |

---

## 6. En repartant

1. Mettre à jour ce fichier : cocher ce qui est fait, ajouter ce qui a été
   décidé ou découvert. Le prochain à ouvrir le projet n'aura que ce qui est
   écrit.
2. `graphify update .`
3. Pousser — **c'est déployer**.
