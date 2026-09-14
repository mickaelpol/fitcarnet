-- ---------------------------------------------------------------------
--  CETTE MIGRATION NE VISE PLUS QU'UN CATALOGUE HISTORIQUE.
--
--  Le 14 septembre 2026, `db/02-donnees.sql` a cessé de semer les 50 aliments
--  communs : les valeurs nutritionnelles ne sont pas une constante, chacun
--  saisit celles de ce qu'il a acheté. Une base neuve n'a donc plus d'aliment
--  commun, et cette migration n'y trouvera rien à corriger — elle est
--  idempotente, elle passera sans bruit.
--
--  Elle est CONSERVÉE pour les bases existantes, où ces aliments sont encore
--  là et où ses corrections gardent tout leur sens. `entrypoint-prod.sh`
--  rejoue db/manuel/ à chaque démarrage : la retirer changerait ce qui
--  s'exécute en production, et effacerait la trace d'une correction réelle.
-- ---------------------------------------------------------------------

-- =====================================================================
--  UN SEUL ETAT : LES VALEURS DECRIVENT LE PRODUIT TEL QU'ON LE PESE.
--
--  C'est la migration qui rembourse une dette, pas celle qui ajoute une
--  fonctionnalite. Elle ne change rien a ce que l'application calcule — et
--  c'est precisement ce qu'elle doit prouver.
--
--  CE QUI N'ALLAIT PAS
--
--  Un aliment portait trois champs pour un seul fait : ses macros, son
--  rendement de cuisson, et un `etat_reference` disant si les macros
--  decrivaient le produit cru ou cuit. Trois champs, donc trois facons de se
--  contredire. Il a fallu quatre migrations, un service PHP, un module de
--  garde-fous de 258 lignes et un grand bandeau rouge pour rattraper leurs
--  desaccords — dont un message qui devait DEMANDER a l'utilisateur laquelle
--  de ses deux valeurs etait la vraie. Une question a laquelle personne n'a
--  envie de repondre en ouvrant son frigo.
--
--  CE QU'ON FAIT
--
--  Les feculents portaient leurs valeurs CUITES ; tout le reste portait deja
--  celles du produit pese. On repasse donc les feculents au sec, et on
--  supprime la colonne.
--
--  LA CONVERSION EST EXACTE, ET C'EST LE POINT.
--
--  La cuisson n'ajoute ni ne retire de nutriment : elle ajoute de l'eau. Elle
--  dilue tout dans les memes proportions. Repasser du cuit au pese est donc
--  une multiplication par le rendement, la meme pour chaque macro :
--
--      riz cuit  : 130 kcal, 28,2 g de glucides pour 100 g, rendement 3
--      riz sec   : 390 kcal, 84,6 g de glucides pour 100 g, rendement 3
--
--  C'est le MEME riz, decrit a l'autre bout de la casserole. Le solveur
--  cherchait 33,3 g a peser, il cherche toujours 33,3 g. Pas une portion ne
--  bouge, pas une cible n'est a refaire.
--
--  ON NE CONVERTIT QUE CE QU'ON PEUT PROUVER.
--
--  Un grain sec, c'est de la matiere seche, et la matiere seche fait 300 a
--  400 kcal aux 100 g. Toujours. La conversion n'est donc appliquee que si
--  son resultat tombe dans cette bande. Une ligne qui n'y tombe pas portait
--  deja des valeurs fausses AVANT cette migration : la multiplier donnerait
--  une autre valeur fausse, avec en prime l'air d'avoir ete verifiee. On la
--  laisse intacte et on la LISTE en fin de script.
--
--  CE QUI DISPARAIT
--
--  La colonne `etat_reference`, et avec elle la contrainte de coherence posee
--  par 14 puis 15. Ces deux migrations restent au depot pour l'historique
--  mais n'ont plus d'objet : les rejouer apres 18 echouerait, la colonne
--  n'existant plus. C'est voulu.
--
--  La contrainte de SENS du rendement, elle, reste : une pesee peut avoir ete
--  saisie a l'envers, et une viande ne grossit pas en cuisant.
--
--  A jouer APRES 17-fibres-zero-evidentes.sql. IDEMPOTENT : rejouee, elle ne
--  reconvertit rien — la conversion est gardee par la bande seche, et tout le
--  bloc est saute si la colonne a deja disparu.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------- avant
SELECT 'avant' AS quand,
       count(*) FILTER (WHERE categorie = 'fec' AND ratio > 1.3)         AS grains_gonflants,
       count(*) FILTER (WHERE categorie = 'fec' AND ratio > 1.3
                          AND kcal_100 BETWEEN 300 AND 400)              AS deja_secs
FROM   aliment;

-- La contrainte qui parle de la colonne doit tomber d'abord.
ALTER TABLE aliment DROP CONSTRAINT IF EXISTS aliment_etat_reference_coherent;

-- ------------------------------------------------------ 1. la conversion
--
-- Le bloc entier est saute si la colonne n'existe plus : c'est ce qui rend le
-- script rejouable. Les conditions internes le rendraient deja sur, mais une
-- reference a une colonne absente est une erreur de compilation en SQL, pas
-- une condition qu'on peut evaluer a faux.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'aliment' AND column_name = 'etat_reference') THEN

    -- On ne touche QUE les feculents qui gonflent et portent encore l'ancien
    -- etat. Un legume ou une viande sont references crus depuis la migration
    -- 15 ; une patate douce ne gonfle pas et porte deja ses valeurs crues.
    EXECUTE $conv$
      UPDATE aliment
         SET kcal_100   = ROUND(kcal_100   * ratio, 2),
             prot_100   = ROUND(prot_100   * ratio, 2),
             gluc_100   = ROUND(gluc_100   * ratio, 2),
             lip_100    = ROUND(lip_100    * ratio, 2),
             fibres_100 = CASE WHEN fibres_100 IS NULL THEN NULL
                               ELSE ROUND(fibres_100 * ratio, 2) END
       WHERE etat_reference = 'cuit'
         AND categorie      = 'fec'
         AND ratio          > 1.3
         AND kcal_100       > 0
         -- LA garantie : on ne convertit que si le resultat est un grain sec.
         AND kcal_100 * ratio BETWEEN 300 AND 400
    $conv$;

  END IF;
END $$;

-- --------------------------------------------- 2. ce qui reste suspect
--
-- Ce que la conversion a refuse de toucher : des valeurs qu'aucun rendement
-- n'explique. On ne les corrige pas — on ne sait pas laquelle des deux etait
-- bonne, et inventer serait pire que signaler.
CREATE TEMP TABLE suspects ON COMMIT DROP AS
SELECT nom, kcal_100, ratio, ROUND(kcal_100 * ratio, 0) AS kcal_si_multipliee,
       CASE WHEN cree_par IS NULL THEN 'catalogue commun'
            ELSE 'compte ' || cree_par END AS proprietaire
  FROM aliment
 WHERE categorie = 'fec' AND ratio > 1.3
   AND (kcal_100 < 300 OR kcal_100 > 400);

-- ---------------------------------------------------- 3. la suppression
ALTER TABLE aliment DROP COLUMN IF EXISTS etat_reference;

-- Le sens du rendement, lui, reste garde : une pesee peut etre saisie a
-- l'envers, et cela inverserait les deux colonnes de l'ecran.
ALTER TABLE aliment DROP CONSTRAINT IF EXISTS aliment_ratio_sens;
ALTER TABLE aliment ADD  CONSTRAINT aliment_ratio_sens
  CHECK (
    ratio > 0
    AND (categorie NOT IN ('prot', 'leg') OR ratio <= 1.05)
    AND (categorie <> 'fec'               OR ratio >= 1)
  );

-- ---------------------------------------------------------------- apres
SELECT 'apres' AS quand,
       count(*) FILTER (WHERE categorie = 'fec' AND ratio > 1.3)         AS grains_gonflants,
       count(*) FILTER (WHERE categorie = 'fec' AND ratio > 1.3
                          AND kcal_100 BETWEEN 300 AND 400)              AS deja_secs
FROM   aliment;

-- A relire s'il y en a : ces lignes-la portaient deja des valeurs fausses
-- AVANT cette migration, et la colonne `kcal_si_multipliee` montre que meme
-- le rendement ne les explique pas. Corrige-les depuis l'onglet « mon
-- frigo », en recopiant la ligne du paquet.
SELECT * FROM suspects ORDER BY nom;

COMMIT;
