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

-- Un aliment créé par un utilisateur lui reste privé : sur des valeurs
-- nutritionnelles, l'erreur de l'un ne doit pas fausser la diète des autres.
UPDATE aliment SET public = FALSE WHERE cree_par IS NOT NULL AND public IS TRUE;

SELECT count(*) FILTER (WHERE fibres_100 IS NOT NULL) AS avec_fibres,
       count(*) FILTER (WHERE pesee_avant IS NOT NULL) AS ratio_mesure,
       count(*) FILTER (WHERE cree_par IS NULL)        AS communs,
       count(*)                                        AS total
FROM   aliment;
