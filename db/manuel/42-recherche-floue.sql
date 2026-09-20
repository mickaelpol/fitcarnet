-- ---------------------------------------------------------------------
--  pg_trgm : rattraper les fautes de frappe du selecteur d'aliments
--
--  Le selecteur « ca ressemble a… » cherchait par sous-chaine. Mesure le
--  20 septembre 2026 sur le frigo de production : le produit `Colomiers` — un
--  Coulommiers auquel il manque un `u` — n'etait PAS trouve en tapant son
--  propre nom. Or c'est exactement le cas qui a motive ce chantier.
--
--      similarity('colomiers', 'coulommiers') = 0,467
--
--  `pg_trgm` est une extension NATIVE de PostgreSQL (1.6 dans l'image
--  postgres:16) : rien a installer, rien a telecharger.
--
--  L'INDEX GIN N'EST PAS DECORATIF : sans lui, chaque frappe compare les
--  trigrammes de 3 484 lignes. Avec, la recherche reste instantanee pendant
--  qu'on tape.
--
--  IDEMPOTENTE : rejouee a chaque demarrage par entrypoint-prod.sh.
-- ---------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS aliment_reference_ressemblance
    ON aliment_reference USING gin (lower(nom) gin_trgm_ops);
