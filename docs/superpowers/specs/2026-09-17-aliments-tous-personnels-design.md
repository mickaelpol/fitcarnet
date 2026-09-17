# Aliments tous personnels — conception

*17 septembre 2026. Conception A, validée par le propriétaire le même jour.*

## Le besoin

Chaque compte remplit son frigo lui-même. Un catalogue d'aliments communs
propose des valeurs nutritionnelles qui ne correspondent pas forcément au
produit que la personne a acheté — or ce qui s'affiche sera pesé et mangé
(règle 7). La notion d'« aliment commun » disparaît : **tout aliment a un
propriétaire, et chacun ne voit que les siens.**

## État de départ

- Depuis le 14 septembre 2026, `db/02-donnees.sql` ne sème plus d'aliment
  commun : une base neuve n'en a aucun.
- Les bases existantes en ont encore. Base de dev, relevé du 17/09 : 50 communs,
  14 personnels, 1 ligne de stock sur un commun (1 compte). La production n'a pas
  été lue ; elle en a au moins autant.
- L'API les expose par l'exception `FiltreAliment` (« commun OU le mien »).
- L'écran Frigo les propose dans « Partir d'un aliment de référence ».

## Décisions

| Question | Décision |
|---|---|
| Stock existant sur un commun | Le compte en reçoit une **copie personnelle** ; rien n'est perdu |
| Mécanisme d'isolation | `Aliment` rejoint la règle générale : `ProprieteUtilisateur` + `FiltreProprietaire`. `FiltreAliment` est supprimé |
| Garantie en base | `aliment.cree_par` passe `NOT NULL`, `ON DELETE CASCADE` |
| Colonne `public` | **Conservée, sans usage**, retirée dans un chantier ultérieur (voir « Hors périmètre ») |
| `ciqual_vers_grocy.py --exporter-catalogue` | Retiré, avec son test |
| `docs/audit-2026-09/` | Inchangé : c'est un historique |
| Droit de l'administrateur sur les aliments | Retiré : il ne voit plus que les siens |

## 1. Données — migration `db/manuel/34-aliments-tous-personnels.sql`

Idempotente, rejouée à chaque démarrage par `entrypoint-prod.sh`. Numéro 34 :
couvert par le motif `3[0-9]-*.sql` des cinq lanceurs, aucun ne change.

Dans une transaction, et seulement s'il reste un aliment `cree_par IS NULL` :

1. **Qui utilise quoi.** Pour chaque commun C, les comptes U qui l'utilisent :
   une ligne de `stock` (U, C), **ou** un `plan_repas` de U dont
   `contenu->'consomme'` contient `{"reference": "base:<C>"}`.
2. **Copie.** Pour chaque (U, C), insérer une copie de C avec `cree_par = U`,
   toutes valeurs nutritionnelles, catégorie, ratio et pesées identiques.
   Nom : celui de C ; si U possède déjà un aliment de même `lower(nom)`, le nom
   devient `<nom> (ancien commun)`. Aucune fusion silencieuse.
3. **Repointage.** `stock.aliment_id` passe de C à la copie pour U. Dans les
   plans de U, chaque `"reference": "base:<C>"` de `consomme` devient
   `"base:<copie>"` — sans quoi « J'ai cuisiné » ne retrouverait plus l'aliment.
4. **Suppression** de tous les aliments `cree_par IS NULL`. Le `ON DELETE
   RESTRICT` de `stock` garantit qu'aucune ligne n'a été oubliée : un oubli fait
   échouer la migration au lieu de perdre une donnée.

Puis, hors condition (idempotent par construction) :

5. `DROP INDEX IF EXISTS aliment_nom_commun_unique`.
6. `ALTER COLUMN cree_par SET NOT NULL`.
7. Remplacer la clé étrangère `cree_par` par `ON DELETE CASCADE` (supprimer et
   recréer sous le même nom, uniquement si sa règle n'est pas déjà CASCADE).

Les index partiels `aliment_nom_prive_unique` et `aliment_par_auteur`
(`WHERE cree_par IS NOT NULL`) sont **conservés tels quels** : leur prédicat est
désormais toujours vrai, et `jeu-essai.sql` s'appuie sur le premier dans son
`ON CONFLICT`.

**Double écriture (règle 1).** `db/01-schema.sql` reçoit le même état final :
`cree_par NOT NULL ON DELETE CASCADE`, plus d'index `aliment_nom_commun_unique`
ni de `COMMENT ON INDEX` associé, commentaires « référentiel commun »
réécrits.

**Migrations antérieures.**
- `10-aliment-unicite-par-proprietaire.sql` ne crée plus
  `aliment_nom_commun_unique` : sinon la production le recréerait puis le
  supprimerait à chaque démarrage. Commentaire daté expliquant pourquoi.
- `aliment-fibres.sql`, `14` à `19`, `31` : inchangées. Leurs `UPDATE … WHERE
  cree_par IS NULL` deviennent sans effet, ce qui est idempotent.

**Scripts de contrôle.**
- `verifier-migrations.sh:109-110` insère un aliment sans `cree_par` : lui
  donner un propriétaire.
- `jeu-essai.sql`, `audit-catalogue.sql` : retirer ce qui copie ou audite les
  communs.

## 2. API

- `Aliment` implémente `ProprieteUtilisateur`. La propriété Doctrine devient
  `utilisateur` (colonne `cree_par` inchangée), `JoinColumn(nullable: false,
  onDelete: 'CASCADE')`. `getCreePar`/`setCreePar` disparaissent au profit de
  `getUtilisateur`/`setUtilisateur`.
- Opérations : `Patch` et `Delete` → `security: 'object.getUtilisateur() == user'`.
  Plus de `ROLE_ADMIN`.
- `AlimentProcessor` : pose `utilisateur` sur un Post (au lieu de `creePar`) et
  garde la traduction du doublon de nom en 422, aux deux opérations.
- Suppression de `FiltreAliment` et de sa déclaration dans
  `config/services.yaml`.
- `FrigoBase::alimentsAccessibles` : `cree_par = :u` seul.
- Commentaires à rectifier : `Aliment.php` (l.25, l.40, l.49-57, l.62-63,
  l.87-98), `FrigoBase.php` (l.14-16, l.43-48, l.82), `FrigoController.php:375`,
  `ComptesController.php` (l.35-37, l.176-192), `api_platform.yaml:5-7`,
  `FiltreExercice.php:28-36`.

**Tests (TDD : chaque nouveau test vu échouer avant le correctif).**
- Nouveau : un aliment sans propriétaire n'est lu par aucun compte — la
  collection et l'item passent par `FiltreProprietaire`.
- Nouveau : `alimentsAccessibles` refuse un aliment qui n'est pas au demandeur,
  quel que soit son `cree_par`.
- `ModeleExposeTest` : retirer `Aliment` de `DEROGATIONS` ; adapter
  `testUnAuteurPeutCorrigerCeQuIlACree` (Aliment → `getUtilisateur`).
- `SurfaceAdministrationTest` : retirer `Aliment` de `CATALOGUES_COMMUNS` et
  `Aliment::Patch` de `SURFACE`.
- `FiltreAlimentTest` : supprimé avec la classe.
- `AlimentProcessorTest` : retirer le cas « aliment commun » ; le reste suit le
  renommage.
- `FiltreProprietaireTest:98-112`, `ProprietaireProcessorTest:69-82`,
  `FiltreExerciceTest:112-123` : Aliment n'est plus un témoin d'entité non
  marquée — en prendre une autre (`Exercice` ou `Emplacement`).
- Commentaires de `InventaireProprieteTest`, `StockProprieteTest`,
  `BornesDuCatalogueCommunTest` rectifiés.

## 3. Front

- `app/(onglets)/frigo.tsx` : « Ajouter un aliment » ouvre directement l'éditeur
  vide. Suppression du sélecteur « Partir d'un aliment de référence », de
  `modelesPossibles`, `dejaChezMoi` et de l'appel `useAliments`.
- `src/api/hooks/referentiels.ts` : suppression de `useAliments` et de son
  réexport, s'il n'a plus d'appelant.
- `app/admin-utilisateurs.tsx:296` : le message « Les aliments que cette
  personne a créés restent, ils servent à tout le monde » est faux depuis que
  `ComptesController` les supprime ; il dit désormais qu'ils sont supprimés avec
  le compte.
- `npm run build:web` pour régénérer `front/dist/`.

## 4. Scripts Python

- `ciqual_vers_grocy.py` : suppression de `--exporter-catalogue`,
  `exporter_catalogue()` et `CHEMIN_CATALOGUE`. Le fichier 16 reste versionné,
  tel quel, comme trace historique.
- `test_ecriture_grocy.py` : suppression du banc de l'export (l.247-250,
  l.384-460).

## 5. Documentation

Mettre à jour tout passage qui décrit les aliments communs comme existants :

- `CLAUDE.md` : règle 2 sans exception `Aliment` ; retirer le piège
  `--exporter-catalogue`.
- `REPRENDRE.md` : entrée datée du chantier.
- `NOUVELLE-MACHINE.md`, `INSTALLATION.md` (« 50 aliments »).
- Skills : `isolation-donnees`, `nutrition-fitcarnet`, `fonctionnalite-frigo`,
  `fonctionnalite-inventaire`, `fonctionnalite-administration`,
  `donnees-de-test`, `epreuve-fonctionnalite`, `revue-de-code`, `schema-base`.
- `presentation/` : `features.md`, `demonstration.md`, `construire.py`
  (puis régénération du HTML, qui n'est pas versionné).

## Vérification

- `cd front && npm test` ; `docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'`.
- `db/manuel/verifier-schema.sh` (base neuve = base migrée) et
  `db/manuel/verifier-migrations.sh`.
- Migration 34 jouée **deux fois** sur la base de dev : la seconde ne change rien.
  Avant la première, relever le stock et les plans du compte concerné ; après,
  constater que la quantité est intacte et pointe sur une copie personnelle.
- Agent `verification-bout-en-bout` : deux comptes, aucun ne voit les aliments de
  l'autre ; ajout, correction, suppression d'un aliment ; inventaire.
- Agent `verite-documentaire` après la mise à jour des documents.

## Risque de déploiement

Au premier démarrage de la production après `deployer-nas.sh`, la migration 34
**supprime les aliments communs de la production**. Irréversible sans
sauvegarde : lancer `sauvegarde-nas.sh` juste avant le déploiement. Si la
migration échoue (`ON_ERROR_STOP`), la production ne redémarre pas — la
transaction garantit qu'elle n'a rien laissé à moitié.

## Hors périmètre

- **Retrait de la colonne `public`.** Elle est écrite par `aliment-fibres.sql`
  (rejoué en premier à chaque démarrage) et par `jeu-essai.sql` : la supprimer
  exige d'abord de neutraliser ces écritures, sans quoi la production ne
  redémarre plus.
- Les exercices gardent leur catalogue commun (`FiltreExercice`) : ce chantier
  ne concerne que les aliments.
- Une fonction « dupliquer un de mes aliments ».
