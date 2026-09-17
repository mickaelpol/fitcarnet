# Aliments tous personnels — conception

*17 septembre 2026. Conception A, validée par le propriétaire, puis révisée le
même jour sur sa consigne : « faire les choses comme si c'était la première
fois, sans plus aucune trace des aliments communs, migrations comprises ».*

## Le besoin

Chaque compte remplit son frigo lui-même. Un aliment appartient toujours à un
compte, et chacun ne voit que les siens. Le code, le schéma, les migrations et
la documentation doivent décrire ce modèle **comme s'il avait toujours été
celui-là**.

## Ce qui rend l'approche « table rase » sûre

- La production n'a qu'un compte, celui du propriétaire, administrateur, dont le
  frigo est **dans Grocy** : aucun stock ni plan ne dépend d'un aliment de la
  base. Les aliments de la table `aliment` en production ne servent à personne.
- Une base neuve n'a déjà aucun aliment commun depuis le 14 septembre 2026.
- Les migrations de `db/manuel/` ne servent qu'à amener une base **existante** à
  l'état de `db/01-schema.sql`. Une base neuve naît déjà dans cet état. Retirer
  une migration déjà jouée partout ne change donc rien, **à condition que la
  production l'ait jouée**.

**Précondition, vérifiée avant le déploiement de ce chantier :** la production
tourne sur un `master` qui contient la migration 33. Sinon, déployer d'abord le
`master` actuel, puis ce chantier.

## Le modèle cible

`aliment` suit la même forme que toutes les tables rattachées à un compte :

```sql
CREATE TABLE aliment (
    id             BIGSERIAL PRIMARY KEY,
    utilisateur_id UUID NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
    nom            TEXT NOT NULL,
    categorie      …,
    …valeurs nutritionnelles, ratio, pesées, fibres (inchangées)…,
    source         TEXT NOT NULL DEFAULT 'manuel'
                   CHECK (source IN ('manuel','openfoodfacts')),
    …
);
CREATE UNIQUE INDEX aliment_nom_unique_par_compte ON aliment (utilisateur_id, lower(nom));
```

Disparaissent : `cree_par` (remplacée par `utilisateur_id`), `public`, la valeur
`'reference'` de `source`, les index `aliment_nom_commun_unique`,
`aliment_nom_prive_unique` et `aliment_par_auteur` (l'index unique commence par
`utilisateur_id` et sert aussi la clé étrangère), la fonction
`fitcarnet_normaliser` (utilisée seulement par les migrations 16 et 19 et par
l'export CIQUAL, tous retirés).

## 1. Base

### `db/01-schema.sql`
Réécrit selon le modèle cible. Commentaires « référentiel commun » réécrits :
l'en-tête ne cite plus que les exercices et les emplacements comme référentiels
partagés.

### Migrations retirées
Elles n'existent que pour l'histoire du catalogue commun ou pour des états
intermédiaires que `01-schema.sql` contient déjà :

| Fichier | Pourquoi il peut partir |
|---|---|
| `10-aliment-unicite-par-proprietaire.sql` | Index communs/privés, remplacés par l'index du modèle cible |
| `14-etat-reference-coherent.sql` | Corrections du catalogue, contraintes redéfinies par 18 puis présentes dans 01 |
| `15-legumes-peses-crus.sql` | Idem |
| `16-catalogue-ciqual.sql` | Réalignement du catalogue commun |
| `17-fibres-zero-evidentes.sql` | Idem |
| `18-un-seul-etat.sql` | Retrait de `etat_reference`, déjà joué ; son diagnostic vise les communs |
| `19-semoule-nommee-pour-ce-quelle-est.sql` | Renommage d'un aliment commun |

### Migrations nettoyées
- `aliment-fibres.sql` : retrait de l'`UPDATE … public` et du comptage des
  communs. **Indispensable** : ce fichier est joué en premier à chaque démarrage,
  et écrirait dans une colonne `public` qui n'existe plus.
- `31-index-de-jointure.sql` : retrait de `aliment_par_auteur` et de son
  commentaire.
- `25-garde-fous.sql` : commentaire « riz commun » reformulé.

### Passage de la production — `34-aliments-par-compte.sql`
Seul fichier qui sait qu'il a existé un autre modèle. Idempotent, dans une
transaction, chaque étape gardée par une lecture du catalogue système :

1. si la colonne `cree_par` existe : supprimer les lignes de `stock` qui visent
   un aliment sans propriétaire, puis ces aliments ;
2. renommer `cree_par` en `utilisateur_id`, `SET NOT NULL`, clé étrangère
   recréée en `ON DELETE CASCADE` ;
3. `DROP COLUMN IF EXISTS public` ; contrainte `source` recréée sans
   `'reference'` ;
4. `DROP INDEX IF EXISTS` des trois anciens index,
   `CREATE UNIQUE INDEX IF NOT EXISTS aliment_nom_unique_par_compte` ;
5. `DROP FUNCTION IF EXISTS fitcarnet_normaliser(text)`.

**Ce fichier est supprimé dans un second commit, une fois la production
redémarrée avec lui.** Il ne reste alors plus aucune trace dans le dépôt en
dehors de l'historique git. Numéro 34 : couvert par le motif `3[0-9]-*.sql` des
cinq lanceurs, aucun ne change.

La base de développement passe par le même fichier (`rattraper-dev.sh`).

### Scripts
- `verifier-migrations.sh` : l'aliment injecté reçoit un `utilisateur_id`.
- `jeu-essai.sql` : crée directement les aliments du compte d'essai, sans rien
  copier.
- `audit-catalogue.sql` : supprimé (il n'audite que le catalogue commun).
- `installer.sh` : le relevé d'état ne compte plus d'aliments communs.

## 2. API

- `Aliment` implémente `ProprieteUtilisateur` : propriété `utilisateur`
  (colonne `utilisateur_id`, `nullable: false`, `onDelete: 'CASCADE'`),
  `getUtilisateur`/`setUtilisateur`. Plus de `public`, plus de `creePar`,
  `source` sans `'reference'`.
- Opérations : `Patch` et `Delete` → `object.getUtilisateur() == user`.
- `FiltreAliment` supprimé (classe, déclaration `services.yaml`, test) :
  `FiltreProprietaire` s'en charge.
- `AlimentProcessor` : décore `ProprietaireProcessor` (qui pose le
  propriétaire) et ne garde que la traduction du doublon de nom en 422.
- `FrigoBase` : `utilisateur_id = :u` partout ; `alimentsAccessibles` sur la
  même règle.
- `ComptesController` : colonnes renommées ; commentaires sur les aliments qui
  « restent » retirés.
- Commentaires : `Aliment.php`, `FrigoBase.php`, `FrigoController.php`,
  `api_platform.yaml`, `FiltreExercice.php` (qui se comparait à `FiltreAliment`).

**Tests (TDD).**
- Nouveau : un aliment n'est lu que par son propriétaire (collection et item).
- `ModeleExposeTest` : `Aliment` sort de `DEROGATIONS` et de
  `testUnAuteurPeutCorrigerCeQuIlACree`.
- `SurfaceAdministrationTest` : `Aliment` sort de `CATALOGUES_COMMUNS` et
  `Aliment::Patch` de `SURFACE`.
- `AlimentProcessorTest` réécrit pour le nouveau rôle.
- Témoins d'« entité non marquée » (`FiltreProprietaireTest`,
  `ProprietaireProcessorTest`, `FiltreExerciceTest`) : une autre entité.
- `InventaireProprieteTest`, `StockProprieteTest`,
  `BornesDuCatalogueCommunTest` : commentaires ; ce dernier ne cite plus les
  « 50 aliments de référence ».

## 3. Front

- `app/(onglets)/frigo.tsx` : « Ajouter un aliment » ouvre l'éditeur vide ;
  sélecteur de modèle, `modelesPossibles`, `dejaChezMoi` et `useAliments`
  retirés.
- `src/api/hooks/referentiels.ts` et `index.ts` : `useAliments` retiré.
- `app/admin-utilisateurs.tsx:296` : les aliments d'un compte supprimé partent
  avec lui.
- `npm run build:web`.

## 4. Scripts Python

- `ciqual_vers_grocy.py` : retrait de `--exporter-catalogue` et de toute la
  section « catalogue commun » ; les mentions « du catalogue COMMUN » dans
  `CORRESPONDANCE` reformulées.
- `test_ecriture_grocy.py` : retrait du banc de l'export.

## 5. Documentation

Tout passage décrivant des aliments communs est réécrit au présent du nouveau
modèle, sans récit de l'ancien :
`CLAUDE.md` (règle 2 sans exception, piège `--exporter-catalogue`),
`REPRENDRE.md`, `NOUVELLE-MACHINE.md`, `INSTALLATION.md`, les skills
`isolation-donnees`, `nutrition-fitcarnet`, `fonctionnalite-frigo`,
`fonctionnalite-inventaire`, `fonctionnalite-administration`,
`donnees-de-test`, `epreuve-fonctionnalite`, `revue-de-code`, `schema-base`,
et `presentation/` (`features.md`, `demonstration.md`, `construire.py`).

`docs/audit-2026-09/` : voir « Question ouverte ».

## Vérification

- `cd front && npm test` ; `docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'`.
- `verifier-schema.sh` : base neuve = base migrée.
- `verifier-migrations.sh`.
- Migration 34 jouée **deux fois** sur la base de dev ; la seconde ne change rien.
- `command grep -rniE "cree_par|creePar|aliment.? commun|catalogue commun|FiltreAliment|nom_commun|nom_prive|aliment_par_auteur|fitcarnet_normaliser"`
  hors `.git`, `node_modules`, `sauvegardes/`, `docs/superpowers/` et la
  migration 34 : **aucun résultat**.
- Agent `verification-bout-en-bout` (deux comptes jetables, chacun ne voit que
  ses aliments ; ajout, correction, suppression ; inventaire), puis
  `verite-documentaire`.

## Déploiement

1. Vérifier la précondition (production sur un `master` contenant la 33).
2. `sauvegarde-nas.sh`.
3. `deployer-nas.sh` : la migration 34 s'exécute au démarrage.
4. Contrôler en production : `\d aliment` conforme au modèle cible.
5. Commit « retrait de la migration 34 », poussé et déployé.

## Question ouverte

`docs/audit-2026-09/` est le rapport d'audit de septembre : il décrit
l'application **telle qu'elle était**, catalogue commun compris (constats C4,
M-01, F-08, 10, 16, 17). Recommandation : le laisser tel quel, parce qu'un
rapport d'audit réécrit après coup ne prouve plus rien. À trancher par le
propriétaire.

## Hors périmètre

Les exercices gardent leur catalogue partagé (`FiltreExercice`).
