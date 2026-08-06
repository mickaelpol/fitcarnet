-- =====================================================================
--  fitcarnet — correctifs après l'import du catalogue
-- =====================================================================

-- Les exercices sans rattachement Push/Pull/Legs portaient une chaîne vide,
-- sérialisée en [""] au lieu d'un tableau vide. NULL est plus juste.
UPDATE exercice SET groupes = NULL WHERE groupes = '';

-- Contrôle : combien d'exercices par rattachement
SELECT  coalesce(groupes, '(aucun)') AS rattachement,
        count(*) AS combien
FROM    exercice
GROUP BY 1
ORDER BY 2 DESC;
