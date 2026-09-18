-- =====================================================================
--  fitcarnet — la colonne modele_exercice.secondes_total_cible s'en va
--
--  CONSTAT 02#12 DE L'AUDIT DE SEPTEMBRE 2026, volet « colonne fantôme ».
--
--  `db/01-schema.sql` la déclarait depuis le commit 3f737c6, SANS migration
--  jumelle : une base née avant ce commit ne l'a jamais reçue, une base neuve
--  l'avait. Les deux écritures du schéma disaient donc deux choses
--  différentes — exactement ce que la règle 1 interdit.
--
--  Elle n'a jamais servi à rien : aucune entité Doctrine, aucune requête,
--  aucune ligne de front ne la nomme (vérifié le 18 septembre 2026 par un
--  grep sur tout le dépôt, et par `doctrine:schema:update --dump-sql`, qui
--  proposait justement de la supprimer). La durée d'une série prescrite vit
--  dans `modele_serie.secondes_cible`, série par série — un total par
--  exercice ferait une seconde vérité sur la même question.
--
--  ON LA SUPPRIME PLUTÔT QUE DE LUI ÉCRIRE UNE MIGRATION ET UNE PROPRIÉTÉ :
--  une colonne qu'aucun code ne lit ne se maintient pas, elle se traîne.
--
--  Idempotent : `IF EXISTS` sur une base qui ne l'a jamais eue ne fait rien.
--  À jouer APRÈS 36.
-- =====================================================================

BEGIN;

ALTER TABLE modele_exercice DROP COLUMN IF EXISTS secondes_total_cible;

COMMIT;

-- Contrôle : la colonne ne doit plus exister nulle part.
SELECT count(*) AS colonnes_fantomes_restantes
  FROM information_schema.columns
 WHERE table_name = 'modele_exercice'
   AND column_name = 'secondes_total_cible';
