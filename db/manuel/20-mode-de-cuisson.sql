-- =====================================================================
--  LES MODES DE CUISSON — UNE TABLE, PARTAGEE PAR TOUS LES COMPTES.
--
--  Prepare l'etape 3, le batch cooking : regrouper en fournees ce qui se cuit
--  ensemble suppose de savoir COMMENT chaque aliment sera cuit.
--
--  POURQUOI UNE TABLE, ET PAS UN CHAMP SUR L'ALIMENT
--
--  Une premiere version posait `cuisson` et `cuisson_degres` sur la fiche de
--  l'aliment. Elle a ete abandonnee avant d'etre jouee, pour deux raisons :
--
--   1. Le frigo a DEUX sources. Les comptes ordinaires lisent la table
--      `aliment`, le compte administrateur lit Grocy. Un champ sur la fiche
--      aurait donc existe en double — une colonne SQL et un champ
--      personnalise Grocy — avec deux vocabulaires libres de diverger. C'est
--      exactement la structure qui a produit le desastre de `etat_reference`
--      (voir 18-un-seul-etat.sql). Une table centrale n'a pas ce defaut :
--      elle est la meme quelle que soit la provenance de l'aliment.
--
--   2. Le mode de cuisson n'est pas une propriete de l'aliment, c'est une
--      decision du moment. Les memes pommes de terre passent au four un soir
--      et a la vapeur le lendemain. Le stocker sur la fiche revenait a figer
--      un choix qu'on refait a chaque plan.
--
--  Le mode se choisit donc AU MOMENT DE COMPOSER, dans un selecteur peuple
--  par cette table. Rien n'est demande a l'ajout d'un aliment.
--
--  UNE SEULE COLONNE POUR DECRIRE UNE CUISSON, ET C'EST VOULU
--
--  « Four 180 °C » est un libelle, pas un mode plus une temperature. Poser en
--  plus une colonne `degres` reviendrait a ecrire deux fois le meme fait — et
--  ce projet sait desormais ce que ca coute : deux champs pour une seule
--  verite finissent par se contredire, et il faut ensuite du code pour
--  arbitrer. Le libelle suffit a l'affichage, et l'IDENTIFIANT suffit au
--  regroupement : deux aliments partagent une fournee s'ils pointent la meme
--  ligne. « Four 180 » et « Four 200 » sont deux lignes, donc deux fournees —
--  ce qui est exactement ce qu'on veut dire.
--
--  QUI PEUT EN AJOUTER
--
--  Tout le monde LIT, seul l'administrateur ECRIT. Un utilisateur qui veut
--  « plancha » le demande. C'est deliberement plus rigide qu'un champ libre :
--  une liste ouverte finirait avec « four », « Four », « au four » et
--  « four 180 », soit quatre fournees la ou il en faut une.
--
--  A jouer APRES 19. Idempotent.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS mode_cuisson (
  id     serial PRIMARY KEY,
  -- Ce qu'on lit dans le selecteur, et rien d'autre.
  libelle text     NOT NULL,
  -- L'ordre d'affichage. On ne trie pas par ordre alphabetique : « Air
  -- fryer » n'a aucune raison de passer avant « Vapeur », et on veut les
  -- cuissons les plus courantes en haut.
  ordre   smallint NOT NULL DEFAULT 100
);

-- Un libelle unique, sans quoi deux lignes identiques feraient deux fournees
-- pour la meme casserole.
CREATE UNIQUE INDEX IF NOT EXISTS mode_cuisson_libelle
  ON mode_cuisson (lower(libelle));

-- LE SOCLE N'EST POSE QUE SUR UNE TABLE VIDE, ET C'EST UNE CORRECTION.
--
-- `ON CONFLICT DO NOTHING` ne conflit que sur le libelle EXACT. Or l'ecran
-- d'administration permet de renommer et de supprimer des modes — et ce
-- fichier est rejoue a CHAQUE demarrage du conteneur.
--
-- Renommer « Poele » en « Poele a feu vif » faisait donc revenir « Poele » au
-- redemarrage : deux fournees pour la meme casserole, exactement ce que
-- l'en-tete de ce fichier dit vouloir eviter. Et supprimer un mode emportait
-- les habitudes qui le visaient (ON DELETE CASCADE) avant de le faire
-- revenir vide au redemarrage suivant.
--
-- Un socle sert a demarrer, pas a imposer. Une fois qu'un seul mode existe,
-- la table appartient a l'administrateur.
INSERT INTO mode_cuisson (libelle, ordre)
SELECT * FROM (VALUES
  ('Vapeur',            10),
  ('Eau bouillante',    20),
  ('Poêle',             30),
  ('Four 180 °C',       40),
  ('Four 200 °C',       50),
  ('Four 220 °C',       60),
  ('Air fryer 180 °C',  70),
  ('Air fryer 200 °C',  80)
) AS socle(libelle, ordre)
WHERE NOT EXISTS (SELECT 1 FROM mode_cuisson);

-- Si une version precedente de ce fichier a ete jouee, ses colonnes sur
-- l'aliment n'ont plus lieu d'etre. Aucune donnee utile ne s'y trouve : elles
-- n'ont jamais ete renseignees par l'application.
ALTER TABLE aliment DROP CONSTRAINT IF EXISTS aliment_cuisson_connue;
ALTER TABLE aliment DROP CONSTRAINT IF EXISTS aliment_degres_coherents;
ALTER TABLE aliment DROP COLUMN IF EXISTS cuisson;
ALTER TABLE aliment DROP COLUMN IF EXISTS cuisson_degres;

COMMIT;

SELECT id, libelle, ordre FROM mode_cuisson ORDER BY ordre, libelle;
