-- =====================================================================
--  fitcarnet — traçabilité du ratio cuit / cru
--
--  Le ratio seul ne dit pas d'où il vient : valeur courante choisie dans
--  une liste, ou mesure réelle ? Conserver les deux pesées rend le chiffre
--  vérifiable, et permet de le comparer si l'utilisateur remesure.
--
--  Idempotent.
-- =====================================================================

ALTER TABLE aliment
    ADD COLUMN IF NOT EXISTS pesee_avant NUMERIC(7,1),
    ADD COLUMN IF NOT EXISTS pesee_apres NUMERIC(7,1);

COMMENT ON COLUMN aliment.pesee_avant IS
  'Poids avant cuisson lors de la mesure ; NULL si le ratio vient d''une valeur courante.';
COMMENT ON COLUMN aliment.pesee_apres IS
  'Poids après cuisson lors de la même mesure.';

-- Contrôle
SELECT count(*) FILTER (WHERE pesee_avant IS NOT NULL) AS ratios_mesures,
       count(*)                                        AS aliments
FROM   aliment;
