-- =====================================================================
--  fitcarnet — enrichissement de la table « exercice »
--
--  Prépare l'accueil d'un catalogue de 1 324 exercices importés, tout en
--  distinguant clairement les tiens :
--    source = 'perso'  -> tes exercices, avec leurs formats prescrits
--    source = 'import' -> le catalogue commun
--
--  Le nom français est facultatif : l'application affiche « nom_fr » s'il
--  existe, sinon le nom d'origine. Tu peux donc traduire au fil de l'eau
--  sans jamais casser l'affichage.
--
--  Idempotent : relançable sans effet de bord.
-- =====================================================================

ALTER TABLE exercice
    ADD COLUMN IF NOT EXISTS nom_fr            TEXT,
    ADD COLUMN IF NOT EXISTS video_url         TEXT,
    ADD COLUMN IF NOT EXISTS partie_corps      TEXT,
    ADD COLUMN IF NOT EXISTS equipement        TEXT,
    ADD COLUMN IF NOT EXISTS muscle_cible      TEXT,
    ADD COLUMN IF NOT EXISTS muscles_secondaires TEXT,
    ADD COLUMN IF NOT EXISTS instructions      TEXT,
    ADD COLUMN IF NOT EXISTS source            TEXT NOT NULL DEFAULT 'perso',
    ADD COLUMN IF NOT EXISTS reference_source  TEXT;

COMMENT ON COLUMN exercice.nom_fr IS
  'Nom français facultatif ; à défaut, « nom » est affiché.';
COMMENT ON COLUMN exercice.video_url IS
  'Lien YouTube de démonstration, renseigné par l''administrateur.';
COMMENT ON COLUMN exercice.reference_source IS
  'Identifiant chez la source d''origine, pour retrouver la correspondance.';

-- Ce qui existait avant l'import, c'est le tien.
UPDATE exercice SET source = 'perso' WHERE source IS NULL;

-- Les exercices personnels remontent en tête des listes.
CREATE INDEX IF NOT EXISTS exercice_tri
    ON exercice ((source = 'perso') DESC, nom);

-- Recherche insensible aux accents sur les deux noms.
CREATE INDEX IF NOT EXISTS exercice_nom_fr_recherche
    ON exercice USING gin (to_tsvector('french', f_unaccent(coalesce(nom_fr, nom))));

CREATE INDEX IF NOT EXISTS exercice_partie_corps ON exercice (partie_corps);
CREATE INDEX IF NOT EXISTS exercice_equipement   ON exercice (equipement);

-- Un même exercice ne doit pas être importé deux fois.
CREATE UNIQUE INDEX IF NOT EXISTS exercice_source_unique
    ON exercice (source, reference_source)
    WHERE reference_source IS NOT NULL;

-- Contrôle
SELECT source, count(*) AS combien,
       count(video_url)  AS avec_video,
       count(nom_fr)     AS avec_nom_fr
FROM   exercice
GROUP BY source
ORDER BY source;
