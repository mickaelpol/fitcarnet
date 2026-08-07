-- =====================================================================
--  fitcarnet — les contraintes d'ordre deviennent DIFFERABLES
--
--  Le probleme. Modifier une seance echouait systematiquement :
--    duplicate key value violates unique constraint
--    "seance_exercice_seance_id_ordre_key"
--    DETAIL: Key (seance_id, ordre)=(20, 0) already exists.
--
--  La cause n'est pas dans l'application. Quand Doctrine remplace une
--  collection, il emet les INSERT AVANT les DELETE dans la meme
--  transaction. Le temps d'un instant, deux lignes portent (seance, 0), et
--  une contrainte ordinaire est verifiee a CHAQUE instruction : elle
--  refuse, alors que l'etat final aurait ete valide.
--
--  Le meme piege frappe un simple reordonnancement : echanger les positions
--  0 et 1 passe forcement par un doublon transitoire.
--
--  La correction. DEFERRABLE INITIALLY DEFERRED reporte la verification au
--  COMMIT. L'unicite reste garantie — elle est seulement constatee sur
--  l'etat final plutot que sur chaque etape intermediaire.
--
--  Verifie sur PostgreSQL 16 : contrainte ordinaire -> ERROR des l'INSERT ;
--  contrainte differable -> insertion, suppression, COMMIT, une seule ligne.
--
--  Idempotent.
--
--  A jouer :
--    docker compose -f compose.dev.yml exec -T db \
--      psql -U fitcarnet -d fitcarnet < db/manuel/11-contraintes-differables.sql
-- =====================================================================

DO $$
DECLARE
    v_table    TEXT;
    v_colonnes TEXT;
    v_nom      TEXT;
    v_deja     BOOLEAN;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['seance_exercice', 'modele_exercice'] LOOP
        v_colonnes := CASE v_table
            WHEN 'seance_exercice' THEN 'seance_id, ordre'
            ELSE 'modele_id, ordre'
        END;

        SELECT c.conname, c.condeferrable INTO v_nom, v_deja
        FROM   pg_constraint c
        JOIN   pg_class t ON t.oid = c.conrelid
        WHERE  t.relname = v_table
          AND  c.contype = 'u'
          AND  array_length(c.conkey, 1) = 2
        LIMIT  1;

        IF v_nom IS NULL THEN
            RAISE NOTICE '% : aucune contrainte d''unicite a deux colonnes, ignore.', v_table;
            CONTINUE;
        END IF;

        IF v_deja THEN
            RAISE NOTICE '% : « % » est deja differable.', v_table, v_nom;
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', v_table, v_nom);
        EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (%s) DEFERRABLE INITIALLY DEFERRED',
            v_table, v_nom, v_colonnes);
        RAISE NOTICE '% : « % » rendue differable.', v_table, v_nom;
    END LOOP;
END $$;

-- Controle : les deux doivent afficher « t ».
SELECT t.relname AS "table", c.conname AS contrainte, c.condeferrable AS differable
FROM   pg_constraint c
JOIN   pg_class t ON t.oid = c.conrelid
WHERE  t.relname IN ('seance_exercice', 'modele_exercice')
  AND  c.contype = 'u'
ORDER  BY t.relname;
