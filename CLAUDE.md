# fitcarnet

Application personnelle de suivi nutritionnel et de musculation, multi-comptes (accès par
invitation). API Symfony 7 + API Platform + Doctrine (`api/`), front Expo SDK 54 / React Native
web + Android (`front/`), PostgreSQL 16 (`db/`), déployée sur un NAS Synology derrière Caddy.

**Le code, les commentaires, les noms de variables et les messages de commit sont en français.**
Les identifiants métier aussi (`Aliment`, `Seance`, `cleDHabitude`). Garder cette langue.

## Où on en est — À LIRE EN PREMIER

[REPRENDRE.md](REPRENDRE.md) est le journal de bord du chantier : ce qui est
fait, par quoi continuer, les décisions déjà prises et celles qui attendent un
arbitrage. Rien de tout cela ne se déduit du code. **Le lire avant de
travailler, et le tenir à jour en repartant.**

## Sur une machine neuve

```bash
git clone ssh://git@gitea.mickael-pol.fr:2222/mickael/fitcarnet.git
cd fitcarnet && ./installer-outils.sh     # graphify, intelephense, les cinq plugins
# redémarrer Claude Code ici — c'est ce qui charge les skills
./installer.sh                            # l'application : base, conteneurs, compte
```

Le dépôt porte **tout l'outillage** : `CLAUDE.md`, les hooks et `skillOverrides`,
la déclaration des cinq plugins (`enabledPlugins` — Claude Code les pose au
premier démarrage, et `installer-outils.sh` vérifie qu'il l'a fait), les skills
propres au projet, `.graphifyignore`, et le **cache sémantique de graphify** —
480 Ko qui évitent de redépenser 125 000 tokens d'extraction. Seul le graphe
lui-même se reconstruit : `/graphify .`.

## Commandes

```bash
cd front && npm test          # tsc --noEmit + 548 tests, puis 2 de rendu — À LANCER APRÈS TOUTE MODIF FRONT
cd front && npm run verif     # typage seul, plus rapide
cd front && npm run build:web # régénère front/dist/ (versionné, voir plus bas)
cd api && bin/phpunit         # 201 tests API — sans base ni noyau, aucun effet de bord
docker compose -f compose.dev.yml up   # environnement de développement
```

## Règles non négociables

Chacune de ces règles a déjà été enfreinte au moins une fois, et l'audit de septembre 2026 en a
mesuré le coût. Elles ne sont pas des préférences de style.

### 1. Toute évolution du schéma s'écrit DEUX fois
`db/01-schema.sql` **et** une migration numérotée dans `db/manuel/`. Le schéma initial décrit la
base telle qu'elle est aujourd'hui : une base neuve doit être identique à une base migrée.
Contrôle : `db/manuel/verifier-schema.sh` construit les deux et exige un diff vide.

Les migrations sont **idempotentes** (rejouées à chaque démarrage par `entrypoint-prod.sh`) et leur
ordre est écrit à la main dans `installer.sh`. Une migration qui peut échouer empêche la production
de redémarrer : ne jamais écrire `SET colonne = NULL` sur une colonne `NOT NULL`.

### 2. Toute entité exposée en API est filtrée par propriétaire
Une nouvelle entité `#[ApiResource]` avec des opérations implémente `App\Entity\ProprieteUtilisateur`,
sans quoi `FiltreProprietaire` ne la filtre pas et **tous les comptes voient les données de tous**.
Exception documentée uniquement : `Aliment` (propriétaire facultatif → `FiltreAliment`, règle
« commun OU le mien »). Le test d'inventaire du modèle (`api/tests/ModeleExposeTest.php`) refuse
toute entité non conforme absente de sa liste blanche.

Corollaire pour les contrôleurs personnalisés : **vérifier la propriété sur CHAQUE chemin
d'écriture**, pas seulement sur le principal. La faille de septembre 2026 venait d'un contrôle
présent sur `POST /api/mon-frigo/stock` et absent sur son jumeau `POST /api/mon-frigo/inventaire`.

### 3. Les valeurs nutritionnelles décrivent le produit TEL QU'ON LE PÈSE
Le riz sec vaut 350 kcal/100 g, pas 130. Un légume se pèse cru. Le rendement cru/cuit se dérive des
pesées à la lecture, il ne se stocke pas dans les valeurs. Cette règle vaut aussi pour les scripts
d'import et pour ce qu'on écrit dans Grocy.

### 4. Convention EUROPÉENNE des fibres
Fibres à **2 kcal/g**, comptées séparément des glucides. `KCAL_FIBRES` dans
`front/src/calcul/nutrition.ts` fait foi. Ne jamais utiliser l'Atwater américain
(`4P + 4G + 9L` sans fibres) : il déclare incohérents les aliments riches en fibres dont les
valeurs sont pourtant justes.

### 5. Aucune formule métier recopiée
Les modules de référence font foi et sont les seuls à porter la formule :

| Domaine | Module de référence |
|---|---|
| 1RM, volume, paliers | `front/src/calcul/performance.ts` |
| Macros, Atwater, catégories | `front/src/calcul/nutrition.ts` |
| Cru/cuit, fournées, habitudes | `front/src/calcul/cuisson.ts` |
| Composition de repas | `front/src/solveur/` |
| Suppression des accents | `front/src/calcul/texte.ts` |

Un hook qui recalcule un 1RM importe `performance.ts`. Trois copies d'Epley aux bornes divergentes
ont produit un « record » de 79,96 kg que la formule elle-même déclare invalide.

**`front/src/calcul/texte.ts` existe depuis le 15 septembre 2026** (constat D4).
Il a longtemps figuré dans ce tableau sans exister : la ligne annonçait une
correction qui n'avait pas été faite. Les quatre copies de `sansAccent` sont
désormais fusionnées.

**Elles appelaient toutes `normalize('NFD')`** — soit quatre `TypeError` en
puissance, Hermes ne l'implémentant pas partout. Le module s'aligne donc sur la
table manuelle de `cleDHabitude`, et son test **retire `String.prototype.normalize`
le temps de l'appel** : toute réécriture en `normalize` tombe sur le poste, et non
sur un téléphone.

Deux choses restent à faire, et elles sont notées : la table est écrite **deux
fois**, dans `texte.ts` et dans `cuisson.ts` (`SANS_ACCENT` est exporté pour que
la fusion tienne en une ligne), et une **sixième copie** dort dans
`src/solveur/garanties.test.ts:394` — un test qui réimplémente ce qu'il garantit.

Exception : `cleDHabitude` utilise **volontairement** une table de correspondance manuelle plutôt
que `normalize('NFD')`, parce que Hermes ne l'implémente pas partout. Ne pas « factoriser » celle-là.

### 6. Vide ≠ zéro
Un champ vide veut dire « je ne sais pas », un zéro veut dire « zéro ». La saisie garde le texte
tapé par l'utilisateur ; « sans cuisson » est un choix, pas une absence de réponse. Ne jamais
substituer une valeur par défaut silencieuse à une donnée manquante.

### 7. Un chiffre faux est pire qu'un refus de répondre
C'est une application de nutrition : ce qui est affiché sera pesé et mangé. En cas de doute sur un
calcul, afficher l'incertitude ou refuser, jamais une valeur plausible non vérifiée. Toute
déviation par rapport à la cible doit être expliquée à l'écran.

## Architecture, en bref

- **Isolation des données** : `ProprieteUtilisateur` (interface de marquage) + `FiltreProprietaire`
  (extension Doctrine, priorité 100, pose le `WHERE`) + `ChargementComplet` (priorité 50, ajoute les
  jointures anti-N+1 par-dessus). L'entité `Utilisateur` n'a **aucune relation sortante** : c'est un
  type auquel on se réfère, pas un module dont on dépend. Garder cette propriété.
- **Session** : JWT court (1 h) + jeton de rafraîchissement révocable. Les pare-feux `session`,
  `invitation` et `etat` sont **volontairement hors** du pare-feu JWT — leur ordre dans
  `security.yaml` est signifiant, le premier motif qui correspond gagne.
- **Inventaire** : déposé en lot (`inventaire_lot`), appliqué en tâche de fond par
  `TraiterInventaires` (2 exemplaires, `FOR UPDATE SKIP LOCKED`).
- **`front/dist/` est versionné volontairement** (exception explicite dans `.gitignore`) : c'est le
  build web servi par Caddy. Le régénérer avec `npm run build:web`, jamais le copier d'ailleurs.

## Pièges connus

- `entrypoint-prod.sh` rejoue `db/manuel/` à **chaque** démarrage : un fichier de migration qui
  écrit des données écrase les corrections manuelles à chaque redémarrage.
- Les scripts de la racine ne sont pas des jouets : `installer.sh`, `restaurer-nas.sh`,
  `deployer-nas.sh`, `publier*.sh` déploient ou détruisent. Ne jamais les lancer pour « voir ».
- `ciqual_vers_grocy.py --exporter-catalogue` écrit dans `db/manuel/16-catalogue-ciqual.sql`,
  fichier versionné, et y remet des `LIKE '%…%'` non ancrés que la version committée a corrigés
  à la main. C'est voulu pour une régénération décidée ; ce ne l'était pas pour
  `test_ecriture_grocy.py`, qui l'appelle. Depuis le 14 septembre 2026 le banc passe `--sortie`
  vers un temporaire et vérifie en fin de course que le fichier versionné n'a pas bougé.
  Tout nouveau code qui appelle `--exporter-catalogue` doit passer `--sortie`.
- `tsconfig.tests.json` n'inclut plus une liste écrite à la main mais **un motif**,
  `src/**/*.test.ts` — la liste manuelle avait laissé `performance.ts` sans test
  pendant des mois. Le piège qui reste : le motif ne couvre que `src/`, donc un
  test posé dans `front/app/` n'est **jamais exécuté**, sans le moindre signal.

## Méthode de travail

- **TDD** : le test échoue d'abord, puis le correctif le fait passer. Sans quoi on « corrige » un
  bug en ajustant le test qui fige la mauvaise valeur.
- **Ne jamais déclarer terminé sans preuve** : coller la sortie de `npm test` ou de `bin/phpunit`,
  pas une affirmation.
- Les commentaires de ce projet racontent **la panne réelle et sa date**. Continuer ainsi : c'est ce
  qui rend les divergences repérables des mois plus tard.
- **Une seule arborescence, et une seule : `~/perso/fitcarnet` sous WSL2**, poussée sur Gitea.
  Le projet se travaille en terminal, avec Claude Code. **Claude Cowork n'est pas utilisable
  ici** : il refuse les chemins `\\wsl.localhost\...`, et la parade — un clone Windows
  synchronisé — est précisément ce qui a coûté le bug de septembre 2026, un renommage de
  méthode propagé à deux appelants sur trois. Ne jamais recréer de copie : ni sous Windows,
  ni ailleurs. Ce qui doit circuler passe par git.

## Skills : laquelle, quand

**Les six skills du dépôt portent ce que personne d'autre ne peut écrire.** Elles
sont dans `.claude/skills/`, toutes actives, et disent le métier et les pièges de
*ce* projet :

| Skill | Ce qu'elle porte |
|---|---|
| `isolation-donnees` | La règle 2, ses trois pièces, et le corollaire « chaque chemin d'écriture » |
| `tests-api` | PHPUnit sans base ni noyau, services `final readonly`, `createStub` |
| `front-fitcarnet` | Modules de référence, `node:test`, Node 22, `front/dist/` |
| `nutrition-fitcarnet` | Fibres à 2 kcal/g, produit tel qu'on le pèse, vide ≠ zéro |
| `schema-base` | Double écriture du schéma, idempotence, ordre dans `installer.sh` |
| `postgres` | Index, plan de requête, `VACUUM` |

Le 9 septembre 2026, dix skills « du projet » ont été **supprimées** : génériques,
sans une ligne sur fitcarnet, toutes écrites pour une architecture hexagonale que
`api/src` n'a pas — et redondantes avec `superpowers-symfony`, dont les 44 skills
ciblent la vraie pile. Le tri d'alors était à l'envers : les coupées étaient celles
du travail quotidien, les actives celles d'une refonte jamais commencée.

**`skillOverrides` ne peut rien contre les skills des plugins.** Vérifié le
8 septembre 2026 : une entrée `expo:expo-dom` ou `superpowers-symfony:tdd-with-pest`
ne coupe rien, ni depuis le dépôt ni depuis `~/.claude/settings.json`. Le seul
levier est `claude plugin disable` — le plugin entier. Les vingt-deux entrées de
ce genre ont été retirées : elles faisaient croire à une économie qui n'existait
pas (~2 950 tokens de contexte payés à chaque session malgré tout). Ne pas en
réécrire. Sur les skills du dépôt, en revanche, `skillOverrides` fonctionne — il
n'y en a simplement plus une seule à couper.

Pour l'aiguillage :

| Travail | Skill à prendre |
|---|---|
| Corriger un bug, ajouter un comportement | **`superpowers:test-driven-development`**, sans exception |
| Relire du code, chercher une régression | **`revue-de-code`** — les huit motifs de défaut du projet, avec un cas daté pour chacun |
| Exposer une entité, écrire un contrôleur ou un processeur | **`isolation-donnees`** — avant de coder, pas après |
| Écrire un test API | **`tests-api`** d'abord — le motif du projet ; **`superpowers-symfony:tdd-with-phpunit`** pour le générique PHPUnit (le projet n'est pas en Pest) |
| Toucher à `front/src` ou `front/app` | **`front-fitcarnet`** |
| Un calcul, un import d'aliments, un chiffre affiché | **`nutrition-fitcarnet`** |
| Table, colonne, contrainte, migration | **`schema-base`** |
| Cadrer une demande vague ou vaste | **`superpowers:brainstorming`** (celle de `superpowers`, pas celle de `superpowers-symfony`) |
| API Platform : ressource, filtre, processeur, sérialisation | **`superpowers-symfony:api-platform-*`** — elles ciblent la v4, celle du projet |
| Doctrine : relations, migrations, transactions, N+1 | **`superpowers-symfony:doctrine-*`** |
| Écran, navigation, données | **`expo:expo-router`**, **`expo:expo-data-fetching`** |
| Après un `eas update` : est-il arrivé sur les téléphones | **`expo:eas-update-insights`** — aucune skill ne couvre la publication elle-même, c'est `publier.sh` |
| Index, plan de requête, VACUUM | **`postgres`** |
| Déployer, publier, restaurer | **rien d'automatique** : lire `DEPLOIEMENT.md` et `MISE-A-JOUR.md` |

## Agents

| Agent | Quand l'invoquer |
|---|---|
| **`revue-fitcarnet`** | Avant de pousser, sur une modification en cours, ou pour éprouver un pan de code. Lecture seule : il rapporte, il ne corrige pas. Il applique les **huit motifs de défaut réellement trouvés** par l'audit — le jumeau oublié, le garde qui regarde l'état au lieu de l'intention, le commentaire qui ment, le test qui ne peut pas échouer… — via la skill `revue-de-code`. Une revue générique ne trouve rien sur ce projet ; celle-ci sait où regarder. |
| **`verification-bout-en-bout`** | Après une modification qui touche l'API ou la base, et avant une livraison ou une démonstration. Éprouve l'application **qui tourne** — connexion, appels, état en base — puis retire toute trace de son passage et le prouve. Sa règle absolue : **n'écrire jamais sur une donnée qu'il n'a pas créée** (skill `donnees-de-test`). |
| **`verite-documentaire`** | Après un chantier, avant une passation. Confronte ce que la documentation **affirme** au dépôt réel : fichiers annoncés, revendications d'unicité, compteurs, `fichier:ligne`. Quatre affirmations fausses ont été trouvées par accident en deux jours ; il les cherche exprès. |
| `hexagonal-architect`, `hexagonal-reviewer` | Installés pour la refonte hexagonale, **non commencée**. Sans objet tant que `api/src` suit la structure Symfony classique. |

**Hexagonal / DDD.** La migration vers l'architecture hexagonale reste un objectif
assumé, et **elle n'a toujours pas commencé** : `api/src` suit la structure Symfony
classique (`Controller`, `Service`, `Entity`, `Repository`, `State`). Ne pas
appliquer ces patrons à du code existant sans une décision explicite — et ne jamais
mélanger cette refonte avec une correction de bug dans le même commit.

Ce qui reste pour le jour J : les deux agents `hexagonal-architect` et
`hexagonal-reviewer` (`.claude/agents/`), qui notent la conformité d'un module, et
les skills `superpowers-symfony:ports-and-adapters`, `:cqrs-and-handlers`,
`:value-objects-and-dtos`. Les quatre skills projet qui doublonnaient tout cela ont
été supprimées le 9 septembre 2026.

**graphify** a sa propre section plus bas.

## Audit

`docs/audit-2026-09/` — 84 constats classés, avec scénarios reproduits et plan de correction en lots.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
