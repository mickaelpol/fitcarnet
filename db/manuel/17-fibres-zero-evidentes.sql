-- =====================================================================
--  Les deux dernieres fibres manquantes du catalogue commun.
--
--  Apres 16, deux aliments communs restent sans fibres : « Skyr 0% » et
--  « Sardines au naturel ». Ni l'un ni l'autre n'a d'equivalent utilisable
--  dans Ciqual — le skyr n'y figure pas, et la sardine en conserve varie
--  trop d'une marque a l'autre pour qu'on lui impose une ligne de table.
--
--  Mais « sans fibres » ne veut pas dire la meme chose que « fibres
--  inconnues ». Un poisson et un produit laitier nature n'ont pas de
--  fibres : c'est zero, pas une estimation. Une valeur NULL, elle, empeche
--  la verification de convention glucidique (AlimentDisponible::incoherences)
--  de se prononcer, et laisse une cible exprimee en glucides TOTAUX se
--  tromper en silence.
--
--  On ne touche donc QUE la colonne fibres, et QUE pour ces deux-la. Les
--  kcal, proteines, glucides et lipides restent ceux d'aujourd'hui : ils
--  viennent d'une etiquette, c'est a l'utilisateur de les corriger si sa
--  marque differe. C'est exactement la regle posee pour les sardines.
--
--  Aucun effet sur un aliment appartenant a un compte (`cree_par IS NULL`).
--
--  A jouer APRES 16-catalogue-ciqual.sql. Idempotent.
-- =====================================================================

BEGIN;

SELECT 'avant' AS quand,
       count(*) FILTER (WHERE fibres_100 IS NULL) AS sans_fibres
  FROM aliment
 WHERE cree_par IS NULL;

-- Un poisson : zero fibre par construction, quelle que soit la conserve.
UPDATE aliment
   SET fibres_100 = 0
 WHERE cree_par IS NULL
   AND fibres_100 IS NULL
   AND categorie = 'prot'
   AND fitcarnet_normaliser(nom) LIKE '%sardine%';

-- Un laitier nature : zero fibre tant qu'il n'est pas aromatise. Si tu
-- passes un jour a un skyr aux fruits ou enrichi en inuline, corrige-le
-- depuis l'onglet « mon frigo » — cette valeur ne se defendra plus.
UPDATE aliment
   SET fibres_100 = 0
 WHERE cree_par IS NULL
   AND fibres_100 IS NULL
   AND categorie = 'lait'
   AND fitcarnet_normaliser(nom) LIKE '%skyr%';

SELECT 'apres' AS quand,
       count(*) FILTER (WHERE fibres_100 IS NULL) AS sans_fibres
  FROM aliment
 WHERE cree_par IS NULL;

COMMIT;

-- Ce qu'il reste sans fibres, s'il en reste.
SELECT nom, categorie
  FROM aliment
 WHERE cree_par IS NULL AND fibres_100 IS NULL
 ORDER BY nom;
