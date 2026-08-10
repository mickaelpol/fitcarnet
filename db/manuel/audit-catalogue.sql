-- =====================================================================
--  AUDIT DU CATALOGUE COMMUN — CE QUI NE TIENT PAS DEBOUT.
--
--  Fichier de LECTURE SEULE. Aucun UPDATE, aucune transaction : on peut le
--  jouer n'importe quand, y compris sur une base de production.
--
--  Pourquoi il existe. La ligne « Semoule complete » a porte 142 kcal — les
--  valeurs d'un couscous CUIT — pendant tout le temps ou personne ne les a
--  regardees. Le catalogue commun est le point de depart de tout nouveau
--  compte : c'est la seule couche ou une erreur ne peut etre rattrapee par
--  personne. Elle merite d'etre relue autrement qu'a l'oeil.
--
--  CE QUI A RATE DANS LA PREMIERE VERSION, ecrite en fin de migration 19 :
--  elle listait les 50 lignes en marquant « a relire » sur 47 d'entre elles.
--  Un diagnostic qui signale tout ne signale rien — il deplace simplement le
--  travail sur celui qui lit. Un controle doit se taire quand tout va bien,
--  et ne parler que de ce qu'il peut defendre.
--
--  Celui-ci ne rend donc QUE les lignes qui portent au moins un defaut
--  nommable, du plus grave au plus benin. Aucune ligne en sortie = rien a
--  signaler, et c'est le resultat attendu.
--
--  Les seuils sont les memes que `front/src/calcul/plausibilite.ts`. Si tu
--  changes l'un, change l'autre.
-- =====================================================================

WITH juge AS (
  SELECT
    nom, categorie, kcal_100, prot_100, gluc_100, lip_100, fibres_100, ratio,
    -- Atwater : ce que pesent les macros declarees, en calories.
    (4 * prot_100 + 4 * gluc_100 + 9 * lip_100) AS atwater,
    (prot_100 + gluc_100 + lip_100 + COALESCE(fibres_100, 0)) AS matiere
  FROM aliment
  WHERE cree_par IS NULL
),
dits AS (
  SELECT *,
    CASE
      -- ------------------------------------------------ impossibilites
      WHEN categorie = 'fec' AND ratio < 1 THEN
        'BLOCAGE · un feculent absorbe l''eau, il ne peut pas peser moins '
        || 'cuit que sec. Ses autres valeurs decrivent probablement le CUIT.'

      WHEN categorie IN ('prot', 'leg') AND ratio > 1.05 THEN
        'BLOCAGE · une viande ou un legume perd de l''eau, il n''en gagne pas. '
        || 'Les deux pesees ont ete interverties.'

      WHEN matiere > 100.5 THEN
        'BLOCAGE · ' || ROUND(matiere, 1) || ' g de nutriments dans 100 g. '
        || 'Glucides d''origine americaine, ou fibres comptees deux fois.'

      -- ------------------------------------ le piege de la semoule
      -- Un grain qui gonfle porte forcement les calories de la matiere
      -- seche : 300 a 400 aux 100 g. En dehors, ce sont des valeurs de
      -- produit cuit prises pour du sec.
      WHEN categorie = 'fec' AND ratio > 1.3
           AND kcal_100 NOT BETWEEN 300 AND 400 THEN
        'BLOCAGE · grain gonflant a ' || ROUND(kcal_100) || ' kcal, hors de la '
        || 'bande de la matiere seche (300-400). Valeurs du produit CUIT.'

      -- ------------------------------------------------ incoherences
      WHEN ABS(kcal_100 - (4 * prot_100 + 4 * gluc_100 + 9 * lip_100))
           > GREATEST(25, 0.2 * GREATEST(kcal_100,
               4 * prot_100 + 4 * gluc_100 + 9 * lip_100)) THEN
        'INCOHERENT · ' || ROUND(kcal_100) || ' kcal annoncees, '
        || ROUND(4 * prot_100 + 4 * gluc_100 + 9 * lip_100)
        || ' calculees d''apres les macros. Une des deux est fausse.'

      -- ------------------------------------------------------- angles morts
      -- LE cas que la physique ne peut PAS trancher, et qu'il faut donc
      -- relire a la main : un feculent a rendement 1 dans la bande seche.
      -- Legitime pour des flocons d'avoine, qu'on ne cuit pas. Suspect pour
      -- un grain qu'on cuit et dont le rendement n'a jamais ete renseigne :
      -- la colonne « cuit » annoncera alors le poids sec.
      WHEN categorie = 'fec' AND ratio = 1 AND kcal_100 BETWEEN 300 AND 400 THEN
        'A VERIFIER · grain sec sans rendement. Normal si tu ne le cuis pas '
        || '(flocons). Sinon la colonne « cuit » annoncera le poids sec.'

      -- L'inverse : un feculent leger sans rendement. Une pomme de terre est
      -- parfaitement normale ici — c'est justement pour cela que la semoule a
      -- pu s'y cacher. Aucun controle automatique ne peut les distinguer.
      WHEN categorie = 'fec' AND ratio = 1 AND kcal_100 < 300 THEN
        'A VERIFIER · feculent leger sans rendement. Normal pour un tubercule '
        || '(pomme de terre, patate douce). Faux pour un grain : c''est '
        || 'exactement la forme qu''avait la semoule a 142 kcal.'

      WHEN fibres_100 IS NULL THEN
        'A VERIFIER · fibres inconnues. Une cible en glucides TOTAUX sera '
        || 'silencieusement fausse sur cet aliment.'

      ELSE NULL
    END AS defaut
  FROM juge
)
SELECT nom, categorie,
       ROUND(kcal_100) AS kcal, ROUND(gluc_100, 1) AS gluc,
       fibres_100 AS fibres, ratio, defaut
FROM   dits
WHERE  defaut IS NOT NULL
-- Le plus grave d'abord : ce qui est impossible, puis ce qui se contredit,
-- puis ce qu'aucun controle ne peut trancher a ta place.
ORDER  BY CASE
            WHEN defaut LIKE 'BLOCAGE%'    THEN 1
            WHEN defaut LIKE 'INCOHERENT%' THEN 2
            ELSE 3
          END,
          categorie, nom;
