# Aliments tous personnels — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** tout aliment appartient à un compte, chacun ne voit que les siens, et
le dépôt ne garde aucune trace d'un catalogue d'aliments partagé.

**Architecture :** `Aliment` rejoint la règle générale (`ProprieteUtilisateur` +
`FiltreProprietaire`). La table prend la forme des autres tables rattachées à un
compte (`utilisateur_id NOT NULL ON DELETE CASCADE`). Une migration 34 unique,
retirée après le passage de la production, amène les bases existantes.

**Tech Stack :** PHP 8.3, Symfony 7.4, API Platform 4.3, Doctrine ORM 3.6,
PHPUnit ; PostgreSQL 16 ; Expo SDK 54, TypeScript, node:test.

**Spec :** `docs/superpowers/specs/2026-09-17-aliments-tous-personnels-design.md`

## Global Constraints

- Code, commentaires, commits en français (CLAUDE.md).
- Règle 1 : toute évolution du schéma dans `db/01-schema.sql` ET dans une
  migration de `db/manuel/`, idempotente ; `verifier-schema.sh` doit dire
  « identiques ».
- **Ordre des colonnes** : `pg_dump` les liste par position. Une colonne
  renommée garde sa place ; dans `01-schema.sql`, `utilisateur_id` se place donc
  **entre `source` et `cree_le`**, là où était `cree_par` (`public`, supprimée,
  n'apparaît pas).
- Noms figés, identiques en base neuve et migrée :
  `aliment_utilisateur_id_fkey`, `aliment_source_check`,
  `aliment_nom_unique_par_compte`.
- Tests API dans le conteneur : `docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'`.
- TDD : chaque nouveau test vu échouer avant le correctif.
- Contrôle final : aucune occurrence de
  `cree_par|creePar|aliment.? commun|aliments? communs|catalogue commun|FiltreAliment|nom_commun|nom_prive|aliment_par_auteur|fitcarnet_normaliser`
  hors `.git`, `node_modules`, `sauvegardes/`, `docs/superpowers/`,
  `db/manuel/34-aliments-par-compte.sql`, et hors ce qui concerne les
  **exercices** (`exercice.cree_par`, `FiltreExercice` gardent leur modèle).

---

### Task 1 : schéma et migrations

**Files :**
- Modify : `db/01-schema.sql` (en-tête l.3-5 ; table `aliment` l.72-160 ; index l.376-381 ; commentaires d'index l.672-675 ; fonction `fitcarnet_normaliser` l.36-50)
- Create : `db/manuel/34-aliments-par-compte.sql`
- Delete : `db/manuel/10-*.sql`, `14-*.sql`, `15-*.sql`, `16-*.sql`, `17-*.sql`, `18-*.sql`, `19-*.sql`, `db/manuel/audit-catalogue.sql`
- Modify : `db/manuel/aliment-fibres.sql`, `db/manuel/31-index-de-jointure.sql`, `db/manuel/25-garde-fous.sql` (commentaire), `db/manuel/jeu-essai.sql`, `db/manuel/verifier-migrations.sh`, `installer.sh`

- [ ] **Étape 1 : `01-schema.sql`.** Dans `aliment` : `source … CHECK (source IN ('manuel','openfoodfacts'))`, suppression de `public`, `cree_par` remplacée à la même place par
  `utilisateur_id UUID NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,`.
  Index : remplacer les deux index uniques par
  `CREATE UNIQUE INDEX aliment_nom_unique_par_compte ON aliment (utilisateur_id, lower(nom));`
  et leurs `COMMENT ON INDEX` par un seul. Retirer `aliment_par_auteur` et
  réécrire le commentaire qui ne parle plus que d'`exercice_par_auteur`.
  Retirer `fitcarnet_normaliser`. En-tête : les référentiels partagés sont les
  exercices, les emplacements et les modes de cuisson ; les aliments sont privés.

- [ ] **Étape 2 : migration 34**, dans une transaction :

```sql
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'aliment' AND column_name = 'cree_par') THEN
        DELETE FROM stock s USING aliment a
         WHERE s.aliment_id = a.id AND a.cree_par IS NULL;
        DELETE FROM aliment WHERE cree_par IS NULL;

        ALTER TABLE aliment DROP CONSTRAINT IF EXISTS aliment_cree_par_fkey;
        ALTER TABLE aliment RENAME COLUMN cree_par TO utilisateur_id;
    END IF;
END $$;

ALTER TABLE aliment ALTER COLUMN utilisateur_id SET NOT NULL;
ALTER TABLE aliment DROP CONSTRAINT IF EXISTS aliment_utilisateur_id_fkey;
ALTER TABLE aliment ADD CONSTRAINT aliment_utilisateur_id_fkey
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateur(id) ON DELETE CASCADE;

ALTER TABLE aliment DROP COLUMN IF EXISTS public;
UPDATE aliment SET source = 'manuel' WHERE source NOT IN ('manuel','openfoodfacts');
ALTER TABLE aliment DROP CONSTRAINT IF EXISTS aliment_source_check;
ALTER TABLE aliment ADD CONSTRAINT aliment_source_check
    CHECK (source IN ('manuel','openfoodfacts'));

DROP INDEX IF EXISTS aliment_nom_commun_unique;
DROP INDEX IF EXISTS aliment_nom_prive_unique;
DROP INDEX IF EXISTS aliment_par_auteur;
CREATE UNIQUE INDEX IF NOT EXISTS aliment_nom_unique_par_compte
    ON aliment (utilisateur_id, lower(nom));
COMMENT ON INDEX aliment_nom_unique_par_compte IS
    'Un nom par compte. Deux comptes peuvent nommer pareil.';

DROP FUNCTION IF EXISTS fitcarnet_normaliser(text);

COMMIT;
```

  Supprimer puis recréer la clé étrangère et la contrainte `source` à chaque
  démarrage est idempotent et porte sur une table de quelques lignes.

- [ ] **Étape 3 : migrations et scripts.** Supprimer les fichiers listés.
  `aliment-fibres.sql` : retirer l'en-tête « catalogue historique », l'`UPDATE … public`
  et la colonne `communs` du SELECT final. `31` : retirer `aliment_par_auteur`
  et le reformuler pour `exercice_par_auteur` seul. `25` : « riz commun » → « riz ».
  `verifier-migrations.sh` : l'aliment injecté prend
  `utilisateur_id` = `(SELECT id FROM utilisateur WHERE email = 'essai@verif.local')`.
  `jeu-essai.sql` : plus de ménage ni de copie ; il insère lui-même six
  aliments (deux protéines, deux féculents, un légume, le skyr), valeurs CIQUAL
  du produit tel qu'on le pèse, colonne `utilisateur_id`, `ON CONFLICT
  (utilisateur_id, lower(nom)) DO NOTHING` ; SELECT de contrôle sans colonne
  « catalogue ». `installer.sh` l.121-128 : commentaire au présent.

- [ ] **Étape 4 : vérifier.**
  `db/manuel/verifier-schema.sh` → « identiques » ;
  `db/manuel/verifier-migrations.sh` → vert ;
  `db/manuel/rattraper-dev.sh` deux fois → la seconde ne change rien ;
  `\d aliment` en dev conforme.

- [ ] **Étape 5 : commit** « les aliments appartiennent a un compte : schema et migrations ».

### Task 2 : API

**Files :**
- Modify : `api/src/Entity/Aliment.php`, `api/src/State/AlimentProcessor.php`, `api/src/Service/FrigoBase.php`, `api/src/Controller/ComptesController.php`, `api/src/Controller/FrigoController.php` (commentaire l.375), `api/config/services.yaml`, `api/config/packages/api_platform.yaml`, `api/src/Doctrine/FiltreExercice.php` (docblock)
- Delete : `api/src/Doctrine/FiltreAliment.php`, `api/tests/Doctrine/FiltreAlimentTest.php`
- Test : `api/tests/Doctrine/FiltreProprietaireTest.php`, `api/tests/State/AlimentProcessorTest.php`, `api/tests/Service/StockProprieteTest.php`, `api/tests/ModeleExposeTest.php`, `api/tests/Security/SurfaceAdministrationTest.php`, `api/tests/State/ProprietaireProcessorTest.php`, `api/tests/Doctrine/FiltreExerciceTest.php`, `api/tests/Controller/InventaireProprieteTest.php`, `api/tests/Entity/BornesDuCatalogueCommunTest.php`

**Interfaces :**
- Produces : `Aliment implements ProprieteUtilisateur` — `getUtilisateur(): ?Utilisateur`, `setUtilisateur(?Utilisateur): self` ; plus de `getCreePar`, `setCreePar`, `isPublic`, `setPublic`.
- `AlimentProcessor::__construct(ProcessorInterface $proprietaire)` — `$proprietaire` est `App\State\ProprietaireProcessor`.

- [ ] **Étape 1 : tests rouges.**
  - `FiltreProprietaireTest` : ajouter

```php
    public function testUnAlimentNEstLuQueParSonProprietaire(): void
    {
        $alice = new Utilisateur();
        $qb = self::requete(Aliment::class);

        self::filtre($alice)->applyToItem($qb, self::generateur(), Aliment::class, ['id' => 1]);

        self::assertStringContainsString('o.utilisateur = :utilisateur_courant', $qb->getDQL(),
            'un aliment porte les valeurs de ce que son proprietaire a achete : personne d\'autre ne le lit');
    }
```

    et changer le témoin « entité non marquée » pour `Exercice`.
  - `StockProprieteTest` : ajouter

```php
    public function testSeulsLesAlimentsDuDemandeurSontAccessibles(): void
    {
        $requetes = [];
        $cnx = self::createStub(Connection::class);
        $cnx->method('fetchFirstColumn')->willReturnCallback(
            static function (string $sql) use (&$requetes): array {
                $requetes[] = $sql;

                return [];
            });

        (new FrigoBase($cnx))->alimentsAccessibles(self::utilisateur(), [42]);

        self::assertCount(1, $requetes);
        self::assertStringContainsString('utilisateur_id = :u', $requetes[0]);
        self::assertStringNotContainsString('IS NULL', $requetes[0],
            'un aliment sans proprietaire n\'existe pas, et ne doit ouvrir aucune porte');
    }
```

  - `AlimentProcessorTest` réécrit : (a) un Post délègue au processeur de
    propriétaire et rend son résultat ; (b) une violation d'unicité levée par
    ce processeur devient `UnprocessableEntityHttpException` dont le message
    cite le nom. Le délégué est un vrai `ProprietaireProcessor` autour d'un
    stub de persistance.
  - `ModeleExposeTest` : `testAlimentEstFiltreParSonProprietaire` —
    `assertTrue((new \ReflectionClass(Aliment::class))->implementsInterface(ProprieteUtilisateur::class))`.
  - Lancer : les nouveaux tests échouent.

- [ ] **Étape 2 : implémentation.**
  - `Aliment` : `implements ProprieteUtilisateur` ;

```php
    #[ORM\ManyToOne(targetEntity: Utilisateur::class)]
    #[ORM\JoinColumn(name: 'utilisateur_id', nullable: false, onDelete: 'CASCADE')]
    private ?Utilisateur $utilisateur = null;
    …
    public function getUtilisateur(): ?Utilisateur { return $this->utilisateur; }
    public function setUtilisateur(?Utilisateur $utilisateur): self { $this->utilisateur = $utilisateur; return $this; }
```

    retrait de `public`, `Choice(['manuel', 'openfoodfacts'])`, `Patch` et
    `Delete` en `security: 'object.getUtilisateur() == user'`, docblocks au
    présent (« Aliment d'un compte », unicité par l'index
    `aliment_nom_unique_par_compte`, « pire cas mesuré : nom 24 caractères »).
  - `AlimentProcessor` :

```php
final readonly class AlimentProcessor implements ProcessorInterface
{
    public function __construct(
        #[Autowire(service: ProprietaireProcessor::class)]
        private ProcessorInterface $proprietaire,
    ) {
    }

    public function process(mixed $data, Operation $operation, array $uriVariables = [], array $context = []): mixed
    {
        try {
            return $this->proprietaire->process($data, $operation, $uriVariables, $context);
        } catch (UniqueConstraintViolationException $e) {
            throw new UnprocessableEntityHttpException(\sprintf(
                'Tu as déjà un aliment nommé « %s ». Choisis un autre nom, '
                . 'ou corrige celui qui existe.',
                $data instanceof Aliment ? $data->getNom() : '?'), $e);
        }
    }
}
```

  - `FrigoBase` : `a.utilisateur_id = :utilisateur` ; `alimentsAccessibles` :
    `WHERE id IN (:a) AND utilisateur_id = :u` ; docblocks au présent.
  - `ComptesController::supprimer` : `utilisateur_id` ; docblock réécrit (la
    suppression explicite reste nécessaire parce que `stock.aliment_id` est en
    RESTRICT et que l'ordre des cascades n'est pas garanti).
  - Supprimer `FiltreAliment`, sa déclaration, son test.
  - `ModeleExposeTest` : retirer `Aliment` de `DEROGATIONS` ; la dérogation
    `Exercice` ne se compare plus à Aliment ; `testUnAuteurPeutCorrigerCeQuIlACree`
    ne vise plus que `Exercice`.
  - `SurfaceAdministrationTest` : `CATALOGUES_COMMUNS` sans `Aliment` ;
    `SURFACE` sans `Aliment::Patch`.
  - `ProprietaireProcessorTest` et `FiltreExerciceTest` : témoin
    `Emplacement` au lieu d'`Aliment`.
  - Commentaires de `InventaireProprieteTest`, `BornesDuCatalogueCommunTest`,
    `FrigoController`, `api_platform.yaml`, `FiltreExercice`.

- [ ] **Étape 3 : vert.** `bin/phpunit` dans le conteneur, tout passe.
- [ ] **Étape 4 : commit** « les aliments appartiennent a un compte : API ».

### Task 3 : front

**Files :**
- Modify : `front/app/(onglets)/frigo.tsx`, `front/src/api/hooks/referentiels.ts`, `front/src/api/hooks/index.ts`, `front/app/admin-utilisateurs.tsx:296`, `front/dist/`

- [ ] **Étape 1 :** `frigo.tsx` — le bouton « Ajouter un aliment » fait
  `creer.reset(); definir.reset(); setQuantiteNouvelle(''); setNouveau(ALIMENT_VIDE);` ;
  retirer `choixModele`, `modelesPossibles`, `dejaChezMoi`, `catalogue`,
  le `<ChoixDansListe>` et les imports devenus inutiles.
- [ ] **Étape 2 :** retirer `useAliments` s'il n'a plus d'appelant.
- [ ] **Étape 3 :** `admin-utilisateurs.tsx` : « Ses aliments, son stock et
  ses séances sont supprimés avec lui. » (adapter au texte existant).
- [ ] **Étape 4 :** `cd front && npm test` vert ; `npm run build:web`.
- [ ] **Étape 5 : commit** « le frigo ne propose plus de modele d'aliment ».

### Task 4 : scripts Python

- [ ] `ciqual_vers_grocy.py` : retirer `--exporter-catalogue`, `exporter_catalogue()`,
  `CHEMIN_CATALOGUE`, la section « catalogue commun » et les mentions dans
  l'historique et `CORRESPONDANCE`.
- [ ] `test_ecriture_grocy.py` : retirer `MIGRATION_VERSIONNEE` et le banc de l'export.
- [ ] `python3 -m py_compile ciqual_vers_grocy.py test_ecriture_grocy.py`.
- [ ] Commit « l'export du catalogue d'aliments disparait ».

### Task 5 : documentation

- [ ] Réécrire au présent : `CLAUDE.md` (règle 2 sans exception ; piège
  `--exporter-catalogue` retiré ; compteurs de tests), `NOUVELLE-MACHINE.md`,
  `INSTALLATION.md`, les skills `isolation-donnees`, `nutrition-fitcarnet`,
  `fonctionnalite-frigo`, `fonctionnalite-inventaire`,
  `fonctionnalite-administration`, `donnees-de-test`, `epreuve-fonctionnalite`,
  `revue-de-code`, `schema-base`, `presentation/features.md`,
  `presentation/demonstration.md`, `presentation/construire.py`,
  `docs/audit-2026-09/*` (constats C4, M-01, F-08, 10, 16, 17 retirés ou
  réécrits, compteurs ajustés), `REPRENDRE.md` (entrée du 17 septembre avec la
  marche à suivre de déploiement et le retrait de la 34).
- [ ] Contrôle final (Global Constraints) : aucune occurrence.
- [ ] Commit « la documentation ne connait plus d'aliment partage ».

### Task 6 : vérification et livraison

- [ ] `npm test`, `bin/phpunit`, `verifier-schema.sh`, `verifier-migrations.sh` : sorties collées.
- [ ] `graphify update .`
- [ ] `git push origin master`.
- [ ] Ne PAS déployer : `deployer-nas.sh` reste au propriétaire (sauvegarde
  d'abord), puis commit de retrait de la migration 34.
