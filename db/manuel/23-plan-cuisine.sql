-- =====================================================================
--  UN PLAN PREVU N'EST PAS UN PLAN CUISINE.
--
--  LE BUG, TEL QU'IL S'EST PRESENTE
--
--  Deux batch cooking d'affilee comptaient DEUX FOIS le meme frigo. On
--  compose lundi-mercredi, on enregistre ; on compose jeudi-samedi, et le
--  solveur repart du meme stock — celui d'avant. Le premier plan avait beau
--  vider les 800 g de poulet, le second annoncait « objectifs atteints » sur
--  du poulet qui n'existait plus. Personne n'etait prevenu : les deux plans
--  etaient justes separement, et faux ensemble.
--
--  C'est la pire forme d'erreur pour cette application — un resultat exact
--  sur un stock imaginaire, decouvert devant le frigo vide.
--
--  CE QUE CETTE COLONNE CHANGE
--
--  Un plan enregistre a desormais deux etats :
--
--    - cuisine_le NULL  -> PREVU. La nourriture est encore dans le frigo,
--      mais elle est promise. Le plan RESERVE son stock : les compositions
--      suivantes ne peuvent plus compter dessus.
--    - cuisine_le renseigne -> CUISINE. La nourriture a physiquement quitte
--      le frigo, et le stock a ete decremente pour de vrai au moment de
--      l'appui. Le plan ne reserve plus rien — sans quoi on deduirait deux
--      fois.
--
--  POURQUOI UN GESTE, ET PAS UNE DEDUCTION AUTOMATIQUE A L'ENREGISTREMENT
--
--  Parce qu'enregistrer et cuisiner ne sont pas le meme moment. On enregistre
--  un plan le samedi soir en preparant sa liste de courses ; on cuisine le
--  dimanche apres-midi. Decrementer des le samedi ferait mentir le frigo
--  pendant vingt heures — et un plan enregistre puis abandonne laisserait un
--  stock faux que rien ne viendrait corriger.
--
--  La reservation couvre l'entre-deux : elle empeche de compter deux fois
--  sans rien ecrire d'irreversible. Supprimer un plan prevu la libere.
--
--  POURQUOI CE N'EST PAS UNE MODIFICATION DE L'INSTANTANE
--
--  `contenu` reste immuable, et `plan_repas` n'a toujours pas de PATCH. Cette
--  colonne ne dit rien de CE QUI a ete cuisine — elle dit QUAND. C'est un
--  fait nouveau qu'on ajoute a cote de l'instantane, pas une retouche de
--  l'instantane. Le jeudi, on lit toujours exactement ce qui a ete decide le
--  dimanche.
--
--  A jouer APRES 22. Idempotent.
-- =====================================================================

BEGIN;

ALTER TABLE plan_repas
  ADD COLUMN IF NOT EXISTS cuisine_le timestamptz;

COMMENT ON COLUMN plan_repas.cuisine_le IS
  'NULL = prevu, le plan reserve son stock ; renseigne = cuisine, le stock a deja ete decremente';

-- La seule requete nouvelle : « que reste-t-il de promis ? », posee a chaque
-- composition. Un index partiel plutot qu'un index complet — les plans deja
-- cuisines ne sont jamais dans cette reponse, et ce sont eux qui
-- s'accumulent avec le temps.
CREATE INDEX IF NOT EXISTS plan_repas_prevus
  ON plan_repas (utilisateur_id)
  WHERE cuisine_le IS NULL;

COMMIT;

SELECT
  count(*)                              AS plans,
  count(*) FILTER (WHERE cuisine_le IS NULL) AS prevus
FROM plan_repas;
