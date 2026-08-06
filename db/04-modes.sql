-- =====================================================================
--  fitcarnet — mode par défaut des exercices
--
--  L'extraction initiale a laissé « charge » partout. Or le mode se déduit
--  du format prescrit, exactement comme le faisait le carnet HTML :
--    « 100 for time »        -> chrono  (un temps total, une seule ligne)
--    « 2 s iso max », « tenue » -> iso   (temps de maintien par série)
--    « 4 s × 12 rép »        -> charge  (répétitions × poids)
--
--  Sans cette correction, un exercice « for time » compte pour trois séries
--  au lieu d'une, et la jauge d'avancement est fausse.
--
--  Idempotent.
-- =====================================================================

UPDATE exercice
SET    mode_defaut = CASE
           WHEN format_prescrit ILIKE '%for time%'  THEN 'chrono'
           WHEN format_prescrit ILIKE '%iso%'       THEN 'iso'
           WHEN format_prescrit ILIKE '%tenue%'     THEN 'iso'
           WHEN format_prescrit ILIKE '%contrôle%'  THEN 'chrono'
           WHEN format_prescrit ILIKE '%controle%'  THEN 'chrono'
           ELSE 'charge'
       END;

-- Contrôle : le mode retenu pour chaque exercice
SELECT  mode_defaut,
        count(*)                       AS combien,
        string_agg(nom, ' · ' ORDER BY nom) AS exercices
FROM    exercice
GROUP BY mode_defaut
ORDER BY mode_defaut;
