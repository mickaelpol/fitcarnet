-- =====================================================================
--  Un legume se pese CRU, comme une viande.
--
--  Constat de terrain : 200 g de brocoli sur la balance, cuits a la vapeur,
--  en ressortent 150. Personne ne pese un legume APRES cuisson — on pese ce
--  qu'on sort du frigo. Tant que les legumes portaient leurs valeurs
--  « cuites », la colonne « a cuire » de l'ecran ne pouvait etre juste qu'en
--  connaissant leur rendement, et ce rendement n'est pas derivable : a l'eau
--  bouillante les sucres partent dans la casserole, l'energie ne se conserve
--  pas, et le calcul donnait un epinard a 1,70 — cinq fois trop peu.
--
--  Reference au CRU, tout rentre dans l'ordre. A la vapeur seule l'eau part :
--  les proteines, glucides et fibres de 200 g de brocoli cru sont encore la
--  dans les 150 g cuits. Les compter sur le poids cru est exact, et le
--  rendement ne sert plus qu'a AFFICHER ce qu'on aura dans l'assiette — il
--  peut etre approximatif sans qu'une macro bouge.
--
--  A jouer APRES 14-etat-reference-coherent.sql. Idempotent.
-- =====================================================================

BEGIN;

-- 1. Les contraintes du 14 portaient l'ancienne regle : on les remplace
--    avant de toucher aux donnees, sinon la mise a jour se heurte a elles.
ALTER TABLE aliment DROP CONSTRAINT IF EXISTS aliment_etat_reference_coherent;
ALTER TABLE aliment DROP CONSTRAINT IF EXISTS aliment_ratio_sens;

-- 2. Ce qui va changer, pour laisser une trace dans la sortie psql.
SELECT 'passe au cru' AS quoi, count(*) AS legumes
FROM   aliment
WHERE  categorie = 'leg' AND etat_reference <> 'cru';

UPDATE aliment
SET    etat_reference = CASE WHEN categorie IN ('prot', 'leg') THEN 'cru' ELSE 'cuit' END
WHERE  etat_reference IS DISTINCT FROM
       (CASE WHEN categorie IN ('prot', 'leg') THEN 'cru' ELSE 'cuit' END);

-- 3. Le rendement d'un legume mesure desormais une PERTE.
--
--    On n'invente rien : si une pesee existe, elle fait foi ; sinon on laisse
--    1, ce qui revient a dire « je ne sais pas ce qu'il perd ». Un defaut a
--    0,80 aurait ete tentant — la vapeur retire environ un cinquieme — mais
--    il aurait aussi affiche « concombre 200 g cru -> 160 g cuit » pour un
--    legume qu'on mange cru. Un chiffre invente sur toute une categorie pour
--    corriger une partie de ses membres n'est pas un progres.
--
--    Ce rendement ne touche AUCUNE macro : depuis que le legume est reference
--    au cru, elles se comptent sur le poids pese. Il n'AFFICHE que le poids
--    attendu dans l'assiette. Une pesee suffit a le rendre exact, et
--    l'utilisateur n'a a la faire que pour les legumes qu'il cuit.
UPDATE aliment
SET    ratio = CASE
         WHEN pesee_avant IS NOT NULL AND pesee_apres IS NOT NULL
              AND pesee_avant > 0 AND pesee_apres <= pesee_avant * 1.05
           THEN ROUND(pesee_apres / pesee_avant, 3)
         WHEN ratio > 1.05 THEN 1.000
         ELSE ratio
       END
WHERE  categorie = 'leg'
  AND  ratio IS DISTINCT FROM (CASE
         WHEN pesee_avant IS NOT NULL AND pesee_apres IS NOT NULL
              AND pesee_avant > 0 AND pesee_apres <= pesee_avant * 1.05
           THEN ROUND(pesee_apres / pesee_avant, 3)
         WHEN ratio > 1.05 THEN 1.000
         ELSE ratio
       END);

-- 4. Les contraintes, dans leur version courante.
ALTER TABLE aliment ADD CONSTRAINT aliment_etat_reference_coherent
  CHECK (etat_reference
         = CASE WHEN categorie IN ('prot', 'leg') THEN 'cru' ELSE 'cuit' END);

ALTER TABLE aliment ADD CONSTRAINT aliment_ratio_sens
  CHECK (
    ratio > 0
    AND (categorie NOT IN ('prot', 'leg') OR ratio <= 1.05)
    AND (categorie <> 'fec'               OR ratio >= 1)
  );

COMMIT;

-- 5. Le resultat, a relire.
SELECT categorie, etat_reference, count(*) AS lignes,
       ROUND(MIN(ratio), 2) AS ratio_mini, ROUND(MAX(ratio), 2) AS ratio_maxi
FROM   aliment
GROUP  BY categorie, etat_reference
ORDER  BY categorie;
