-- =====================================================================
--  fitcarnet — temps global d'un exercice chronométré
--
--  Un « 100 for time » a un temps TOTAL, et en dessous le détail des
--  séries avec leurs charges : 93 répétitions à 32 kg puis 7 à 35 kg.
--  Les deux coexistent, et les deux comptent dans la progression.
-- =====================================================================

ALTER TABLE seance_exercice
    ADD COLUMN IF NOT EXISTS secondes_total INTEGER;

ALTER TABLE modele_exercice
    ADD COLUMN IF NOT EXISTS secondes_total_cible INTEGER;

COMMENT ON COLUMN seance_exercice.secondes_total IS
  'Temps total d''un effort chronométré ; les séries en détaillent la composition.';

-- Reprise des données importées : le temps saisi sur la première série d'un
-- exercice chronométré devient le temps global.
UPDATE seance_exercice se
SET    secondes_total = s.secondes
FROM   serie s
WHERE  s.seance_exercice_id = se.id
  AND  s.ordre = 0
  AND  s.secondes IS NOT NULL
  AND  se.secondes_total IS NULL
  AND  coalesce(se.mode, (SELECT mode_defaut FROM exercice e WHERE e.id = se.exercice_id)) = 'chrono';

-- Contrôle
SELECT  count(*) FILTER (WHERE secondes_total IS NOT NULL) AS avec_temps_total,
        count(*)                                          AS total
FROM    seance_exercice;
