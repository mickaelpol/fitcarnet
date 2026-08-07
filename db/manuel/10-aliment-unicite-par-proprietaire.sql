-- =====================================================================
--  fitcarnet — l'unicite du nom d'un aliment devient PAR PROPRIETAIRE
--
--  Pourquoi. La contrainte d'origine etait globale :
--      nom TEXT NOT NULL UNIQUE
--  Elle rendait le modele des aliments prives inapplicable. Deux comptes ne
--  pouvaient pas creer chacun leur « Skyr Lidl », et personne ne pouvait
--  nommer un aliment « Saumon » puisque le commun existait deja — avec un
--  refus portant sur un nom invisible depuis son frigo.
--
--  Ce qui remplace. Deux index partiels :
--   · un nom commun reste unique parmi les communs ;
--   · un nom prive est unique CHEZ SON PROPRIETAIRE, et nulle part ailleurs.
--
--  Un index unique ordinaire sur (lower(nom), cree_par) ne suffirait pas :
--  PostgreSQL considere deux NULL comme distincts, donc les communs
--  pourraient se dupliquer entre eux sans que rien ne l'empeche.
--
--  Insensible a la casse, comme l'unicite des adresses e-mail : « Skyr » et
--  « skyr » chez le meme compte sont le meme aliment.
--
--  Idempotent.
--
--  A jouer :
--    docker compose -f compose.dev.yml exec -T db \
--      psql -U fitcarnet -d fitcarnet < db/manuel/10-aliment-unicite-par-proprietaire.sql
-- =====================================================================

-- Le nom de la contrainte varie selon la maniere dont la table a ete creee :
-- « aliment_nom_key » pour un UNIQUE en ligne, autre chose si elle a ete
-- renommee. On la cherche plutot que de la supposer.
DO $$
DECLARE
    v_contrainte TEXT;
BEGIN
    SELECT c.conname INTO v_contrainte
    FROM   pg_constraint c
    JOIN   pg_class t ON t.oid = c.conrelid
    JOIN   pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
    WHERE  t.relname = 'aliment'
      AND  c.contype = 'u'
      AND  a.attname = 'nom'
      AND  array_length(c.conkey, 1) = 1
    LIMIT  1;

    IF v_contrainte IS NOT NULL THEN
        EXECUTE format('ALTER TABLE aliment DROP CONSTRAINT %I', v_contrainte);
        RAISE NOTICE 'Contrainte globale « % » retiree.', v_contrainte;
    ELSE
        RAISE NOTICE 'Aucune contrainte globale sur aliment.nom : deja fait.';
    END IF;
END $$;

-- Un aliment commun ne peut pas en doubler un autre.
CREATE UNIQUE INDEX IF NOT EXISTS aliment_nom_commun_unique
    ON aliment (lower(nom))
    WHERE cree_par IS NULL;

-- Un aliment prive est unique chez son proprietaire, et seulement chez lui.
CREATE UNIQUE INDEX IF NOT EXISTS aliment_nom_prive_unique
    ON aliment (lower(nom), cree_par)
    WHERE cree_par IS NOT NULL;

COMMENT ON INDEX aliment_nom_commun_unique IS
  'Unicite des aliments de reference entre eux.';
COMMENT ON INDEX aliment_nom_prive_unique IS
  'Unicite du nom chez un utilisateur. Deux comptes peuvent nommer pareil.';

-- Controle.
SELECT count(*) FILTER (WHERE cree_par IS NULL) AS communs,
       count(*) FILTER (WHERE cree_par IS NOT NULL) AS prives,
       count(DISTINCT lower(nom)) AS noms_distincts,
       count(*) AS total
FROM   aliment;
