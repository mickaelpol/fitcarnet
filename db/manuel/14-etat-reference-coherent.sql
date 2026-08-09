-- =====================================================================
--  L'etat de reference ne se saisit plus : il se deduit de la categorie.
--
--  Il y avait deux regles pour la meme chose. Grocy DEDUISAIT l'etat de la
--  categorie ; la base le LISAIT dans cette colonne, qui pouvait dire le
--  contraire. Les deux sources rendaient pourtant le meme objet au
--  calculateur : un compte ordinaire dont la ligne portait « cru » sur un
--  feculent mangeait jusqu'a trois fois trop de glucides, en silence.
--
--  Le code ne lit plus cette colonne (voir App\Service\EtatReference). Elle
--  reste, parce qu'elle est lisible et qu'elle documente la ligne — mais on
--  l'aligne, et la contrainte empeche desormais d'y ecrire l'incoherence.
--
--  Idempotent : rejouable sans dommage.
-- =====================================================================

BEGIN;

-- 1. Ce que la base contenait de faux, avant de le corriger.
--    Le SELECT est la pour laisser une trace dans la sortie psql.
SELECT 'a corriger' AS quoi, categorie, etat_reference, count(*) AS lignes
FROM   aliment
WHERE  etat_reference IS DISTINCT FROM
       (CASE WHEN categorie = 'prot' THEN 'cru' ELSE 'cuit' END)
GROUP  BY categorie, etat_reference
ORDER  BY categorie;

-- 2. Alignement.
UPDATE aliment
SET    etat_reference = CASE WHEN categorie = 'prot' THEN 'cru' ELSE 'cuit' END
WHERE  etat_reference IS DISTINCT FROM
       (CASE WHEN categorie = 'prot' THEN 'cru' ELSE 'cuit' END);

-- 3. La contrainte. Une viande se pese CRUE ; tout le reste se rapporte a ce
--    qu'on pose dans l'assiette.
ALTER TABLE aliment DROP CONSTRAINT IF EXISTS aliment_etat_reference_coherent;
ALTER TABLE aliment ADD  CONSTRAINT aliment_etat_reference_coherent
  CHECK (etat_reference = CASE WHEN categorie = 'prot' THEN 'cru' ELSE 'cuit' END);

-- 4. Le rendement a un SENS, pas seulement une plage.
--    Une proteine perd de l'eau, un feculent en absorbe. Une valeur a
--    contresens inverse les deux colonnes de l'ecran.
--    Les bornes sont larges a dessein : 4,68 sur un riz tres hydrate est une
--    mesure, pas une faute, et 0,53 sur une truite tres cuite non plus.
ALTER TABLE aliment DROP CONSTRAINT IF EXISTS aliment_ratio_sens;
ALTER TABLE aliment ADD  CONSTRAINT aliment_ratio_sens
  CHECK (
    ratio > 0
    AND (categorie <> 'prot' OR ratio <= 1.05)
    AND (categorie <> 'fec'  OR ratio >= 1)
  );

-- 5. Cent grammes de produit ne contiennent pas plus de cent grammes de
--    nutriments. Le cas reel : des glucides repris d'une table americaine —
--    ou ils incluent DEJA les fibres — poses a cote d'une colonne fibres.
--    L'amande y passe de 92 g a 104,5 g pour 100 g.
ALTER TABLE aliment DROP CONSTRAINT IF EXISTS aliment_matiere_plausible;
ALTER TABLE aliment ADD  CONSTRAINT aliment_matiere_plausible
  CHECK (prot_100 + gluc_100 + lip_100 + COALESCE(fibres_100, 0) <= 100.5);

COMMIT;

-- 6. Ce qu'il reste a regarder a la main : les couples rendement/macros qui
--    ne peuvent pas etre vrais ensemble. On ne les corrige pas ici — seul
--    l'utilisateur sait laquelle des deux valeurs il a mesuree.
SELECT nom, categorie, ratio, kcal_100, gluc_100,
       ROUND(kcal_100 * ratio) AS kcal_sec_implicite,
       'un grain sec fait 300 a 400 kcal/100 g' AS repere
FROM   aliment
WHERE  categorie = 'fec' AND ratio > 1.3
  AND (kcal_100 * ratio < 300 OR kcal_100 * ratio > 400)
ORDER  BY nom;
