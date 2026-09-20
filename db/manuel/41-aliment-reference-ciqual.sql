-- ---------------------------------------------------------------------
--  Rattacher un aliment au catalogue CIQUAL
--
--  Deuxieme pas du chantier « quitter Grocy » (20 septembre 2026). Voir le
--  commentaire complet dans `db/01-schema.sql`, et le palier 4 de
--  `docs/plan-serveur-autoritaire.md`.
--
--  EN RESUME : ce lien dit ce que l'aliment EST, jamais ce qu'il VAUT. Les
--  macros restent celles lues sur le paquet de la personne.
--
--  IDEMPOTENTE : rejouee a chaque demarrage par entrypoint-prod.sh.
--  Elle suppose `aliment_reference`, posee par la migration 40.
-- ---------------------------------------------------------------------

ALTER TABLE aliment ADD COLUMN IF NOT EXISTS reference_ciqual TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'aliment_reference_ciqual_fkey'
    ) THEN
        ALTER TABLE aliment
            ADD CONSTRAINT aliment_reference_ciqual_fkey
            FOREIGN KEY (reference_ciqual) REFERENCES aliment_reference (code)
            ON DELETE SET NULL;
    END IF;
END $$;
