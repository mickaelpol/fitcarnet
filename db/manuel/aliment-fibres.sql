-- =====================================================================
--  fitcarnet — fibres et traçabilité du ratio sur les aliments
--
--  Les fibres servent au contrôle de cohérence : en convention européenne
--  elles comptent 2 kcal/g et sont séparées des glucides. Sans elles, la
--  vérification « 4·P + 4·G + 2·F + 9·L = kcal » perd sa fiabilité sur les
--  légumes, oléagineux et céréales complètes.
--
--  Idempotent.
-- =====================================================================

ALTER TABLE aliment
    ADD COLUMN IF NOT EXISTS fibres_100  NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS pesee_avant NUMERIC(7,1),
    ADD COLUMN IF NOT EXISTS pesee_apres NUMERIC(7,1);

COMMENT ON COLUMN aliment.fibres_100 IS
  'Fibres pour 100 g, facultatif ; comptées 2 kcal/g, hors glucides.';
COMMENT ON COLUMN aliment.pesee_avant IS
  'Poids avant cuisson lors de la mesure du ratio ; NULL si valeur courante.';

SELECT count(*) FILTER (WHERE fibres_100 IS NOT NULL) AS avec_fibres,
       count(*) FILTER (WHERE pesee_avant IS NOT NULL) AS ratio_mesure,
       count(*)                                        AS total
FROM   aliment;
