-- =====================================================================
--  fitcarnet — chaque aliment appartient à un compte
--
--  Amène une base existante à l'état de `db/01-schema.sql` : la colonne
--  `aliment.utilisateur_id`, obligatoire, supprimée avec le compte, et un nom
--  unique par compte. Les aliments sans propriétaire sont retirés, ainsi que
--  les lignes de stock qui les visaient.
--
--  PASSAGE PONCTUEL. Ce fichier est retiré du dépôt une fois la production
--  redémarrée avec lui : une base neuve naît déjà dans cet état.
--
--  Idempotent : chaque étape regarde l'état réel avant d'agir, et ne fait
--  rien sur une base déjà conforme.
-- =====================================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'aliment' AND column_name = 'cree_par') THEN
        DELETE FROM stock s
         USING aliment a
         WHERE s.aliment_id = a.id AND a.cree_par IS NULL;
        DELETE FROM aliment WHERE cree_par IS NULL;

        ALTER TABLE aliment DROP CONSTRAINT IF EXISTS aliment_cree_par_fkey;
        ALTER TABLE aliment RENAME COLUMN cree_par TO utilisateur_id;
    END IF;

    ALTER TABLE aliment ALTER COLUMN utilisateur_id SET NOT NULL;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'aliment'::regclass
                      AND conname = 'aliment_utilisateur_id_fkey'
                      AND confdeltype = 'c') THEN
        ALTER TABLE aliment DROP CONSTRAINT IF EXISTS aliment_utilisateur_id_fkey;
        ALTER TABLE aliment ADD CONSTRAINT aliment_utilisateur_id_fkey
            FOREIGN KEY (utilisateur_id) REFERENCES utilisateur(id) ON DELETE CASCADE;
    END IF;

    ALTER TABLE aliment DROP COLUMN IF EXISTS public;

    IF EXISTS (SELECT 1 FROM pg_constraint
                WHERE conrelid = 'aliment'::regclass
                  AND conname = 'aliment_source_check'
                  AND pg_get_constraintdef(oid) LIKE '%reference%') THEN
        UPDATE aliment SET source = 'manuel' WHERE source NOT IN ('manuel', 'openfoodfacts');
        ALTER TABLE aliment DROP CONSTRAINT aliment_source_check;
        ALTER TABLE aliment ADD CONSTRAINT aliment_source_check
            CHECK (source IN ('manuel', 'openfoodfacts'));
    END IF;
END $$;

DROP INDEX IF EXISTS aliment_nom_commun_unique;
DROP INDEX IF EXISTS aliment_nom_prive_unique;
DROP INDEX IF EXISTS aliment_par_auteur;

CREATE UNIQUE INDEX IF NOT EXISTS aliment_nom_unique_par_compte
    ON aliment (utilisateur_id, lower(nom));
COMMENT ON INDEX aliment_nom_unique_par_compte IS
    'Un nom par compte. Deux comptes peuvent nommer pareil.';

DROP FUNCTION IF EXISTS fitcarnet_normaliser(text);

COMMIT;
