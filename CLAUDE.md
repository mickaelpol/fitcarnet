# fitcarnet

Application personnelle de suivi nutritionnel et de musculation, multi-comptes (accès par
invitation). API Symfony 7 + API Platform + Doctrine (`api/`), front Expo SDK 54 / React Native
web + Android (`front/`), PostgreSQL 16 (`db/`), déployée sur un NAS Synology derrière Caddy.

**Le code, les commentaires, les noms de variables et les messages de commit sont en français.**
Les identifiants métier aussi (`Aliment`, `Seance`, `cleDHabitude`). Garder cette langue.

## Commandes

```bash
cd front && npm test          # tsc --noEmit + 320 tests node:test — À LANCER APRÈS TOUTE MODIF FRONT
cd front && npm run verif     # typage seul, plus rapide
cd front && npm run build:web # régénère front/dist/ (versionné, voir plus bas)
cd api && bin/phpunit         # tests API — sans base ni noyau, aucun effet de bord
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
- `test_ecriture_grocy.py` écrit dans `db/manuel/16-catalogue-ciqual.sql`, fichier versionné.
- `tsconfig.tests.json` doit inclure tout nouveau `.test.ts`, sinon il n'est jamais exécuté.

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

Le projet charge beaucoup de skills. Celles qui n'ont aucun usage ici sont déjà
coupées dans `.claude/settings.json` (`skillOverrides`) — inutile de les rallumer
sans raison. Pour le reste, l'aiguillage :

| Travail | Skill à prendre |
|---|---|
| Corriger un bug, ajouter un comportement | **`superpowers:test-driven-development`**, sans exception |
| Cadrer une demande vague ou vaste | **`superpowers:brainstorming`** (celle de `superpowers`, pas `symfony:`) |
| API Platform : ressource, filtre, processeur, sérialisation | **`symfony:api-platform-*`** — elles ciblent la v4, celle du projet |
| Doctrine : relations, migrations, transactions, N+1 | **`symfony:doctrine-*`** |
| Tests API | **`symfony:tdd-with-phpunit`** (le projet est en PHPUnit, pas Pest) |
| Écran, navigation, EAS update | **`expo-router`**, **`eas-update`**, **`expo-data-fetching`** |
| Index, plan de requête, VACUUM | **`postgres`** |
| Déployer, publier, restaurer | **rien d'automatique** : lire `DEPLOIEMENT.md` et `MISE-A-JOUR.md` |

**Hexagonal / DDD.** Les skills `symfony-hexagonal-architecture`,
`symfony-domain-modeling`, `symfony-ports-adapters` et `symfony-cqrs-handlers`
sont installées parce qu'une migration vers l'architecture hexagonale est un
objectif assumé. **Elle n'a pas commencé** : `api/src` suit toujours la structure
Symfony classique (`Controller`, `Service`, `Entity`, `Repository`, `State`).
Ne pas appliquer les patrons hexagonaux à du code existant sans une décision
explicite — et ne jamais mélanger cette refonte avec une correction de bug dans
le même commit.

**graphify** a sa propre section plus bas.

## Audit

`docs/audit-2026-09/` — 84 constats classés, avec scénarios reproduits et plan de correction en lots.

## graphify

Le projet porte un graphe de connaissances dans `graphify-out/` : nœuds pivots,
communautés, liens entre fichiers, **et les 84 constats de l'audit reliés au code
qu'ils désignent**. Deux hooks `PreToolUse` (`.claude/settings.json`) rappellent
ces règles avant chaque recherche ou lecture.

**S'orienter d'abord, lire ensuite.**

| Besoin | Commande |
|---|---|
| Comprendre un pan du code | `graphify query "<question>"` |
| Relation entre deux choses | `graphify path "<A>" "<B>"` |
| Un concept précis | `graphify explain "<concept>"` |
| Vue d'architecture | `graphify-out/GRAPH_REPORT.md`, en dernier recours |

**Puis `grep` et `Read` sans hésiter** pour la ligne exacte à corriger. Le graphe
oriente ; il ne remplace pas la lecture du code au moment de le modifier. Une
requête coûte plus qu'un `grep` ciblé et revient parfois tronquée : elle sert à
savoir *où regarder*, pas à retrouver un symbole dont on connaît déjà le nom.

**Le tenir à jour** : `graphify update .` après une modification de code (AST
seul, aucun appel à un modèle). Pour un changement de documentation,
`/graphify . --update` dans l'assistant, qui relance l'extraction sémantique.
Sans ça le graphe ment : il a déjà décrit une méthode supprimée pendant une
demi-journée.

**`.graphifyignore` définit le périmètre** et doit le rester. Les 58 fichiers de
skills tierces de `.claude/skills/`, les dumps de données et les binaires en sont
exclus : ingérés, ils noient les communautés du projet sous de la documentation
PostgreSQL et Symfony qui ne parle pas de fitcarnet.

*Cette section a été posée par `graphify claude install` puis récrite en
français. Une réinstallation la remplacera par la version anglaise d'origine.*
