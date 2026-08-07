-- =====================================================================
--  fitcarnet — schéma PostgreSQL
--  Principe : un référentiel COMMUN (aliments, exercices, emplacements)
--             et des données PRIVÉES par utilisateur (stock, cibles,
--             séances, modèles).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------------------------------------------------------------------
--  Utilisateurs
-- ---------------------------------------------------------------------
CREATE TABLE utilisateur (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- CITEXT évité : Doctrine ne connaît pas ce type. L'unicité insensible
    -- à la casse est assurée par l'index fonctionnel plus bas.
    email           TEXT        NOT NULL,
    mot_de_passe    TEXT        NOT NULL,          -- hash (password_hash)
    nom             TEXT        NOT NULL,
    -- Liste de rôles séparés par des virgules (type SIMPLE_ARRAY de Doctrine).
    -- Un vrai tableau PostgreSQL exigerait un type Doctrine tiers, sans bénéfice
    -- ici : aucune requête SQL ne filtre sur les rôles.
    roles           TEXT        NOT NULL DEFAULT 'ROLE_USER',
    source_frigo    TEXT        NOT NULL DEFAULT 'base'
                    CHECK (source_frigo IN ('base', 'grocy')),  -- 'grocy' réservé à l'admin
    actif           BOOLEAN     NOT NULL DEFAULT TRUE,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX utilisateur_email_unique ON utilisateur (lower(email));
COMMENT ON COLUMN utilisateur.source_frigo IS
  'base = stock stocké ici ; grocy = les ingrédients viennent de l''instance Grocy (admin uniquement)';

-- ---------------------------------------------------------------------
--  Référentiel commun : aliments
-- ---------------------------------------------------------------------
CREATE TABLE aliment (
    id              BIGSERIAL PRIMARY KEY,
    nom             TEXT        NOT NULL UNIQUE,
    categorie       TEXT        NOT NULL
                    CHECK (categorie IN ('prot','fec','leg','ole','huile','lait','fruit','autre')),
    -- valeurs pour 100 g dans l'état de référence
    kcal_100        NUMERIC(7,2) NOT NULL,
    prot_100        NUMERIC(6,2) NOT NULL,
    gluc_100        NUMERIC(6,2) NOT NULL,
    lip_100         NUMERIC(6,2) NOT NULL,
    -- féculents : cuit/sec (riz 3, patate douce 1) | protéines : cuit/cru (0.85, 0.75)
    ratio           NUMERIC(5,3) NOT NULL DEFAULT 1,
    etat_reference  TEXT        NOT NULL DEFAULT 'cuit' CHECK (etat_reference IN ('cru','cuit')),
    code_barres     TEXT,
    source          TEXT        NOT NULL DEFAULT 'manuel'
                    CHECK (source IN ('manuel','openfoodfacts','reference')),
    public          BOOLEAN     NOT NULL DEFAULT TRUE,
    cree_par        UUID        REFERENCES utilisateur(id) ON DELETE SET NULL,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON aliment (categorie);
CREATE INDEX ON aliment (code_barres) WHERE code_barres IS NOT NULL;
-- Recherche insensible aux accents.
-- unaccent() n'est pas IMMUTABLE : PostgreSQL refuse de l'utiliser dans un index.
-- On l'enveloppe dans une fonction déclarée immuable, ce qui est sûr tant que
-- l'on ne modifie pas le dictionnaire unaccent.
CREATE OR REPLACE FUNCTION f_unaccent(text)
    RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

CREATE INDEX aliment_nom_recherche
    ON aliment USING gin (to_tsvector('french', f_unaccent(nom)));

-- ---------------------------------------------------------------------
--  Emplacements de rangement (frigo, congélateur, placard…)
-- ---------------------------------------------------------------------
CREATE TABLE emplacement (
    id       SMALLSERIAL PRIMARY KEY,
    code     TEXT NOT NULL UNIQUE,
    libelle  TEXT NOT NULL,
    ordre    SMALLINT NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------
--  « Mon frigo » : stock privé
-- ---------------------------------------------------------------------
CREATE TABLE stock (
    id             BIGSERIAL PRIMARY KEY,
    utilisateur_id UUID     NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
    aliment_id     BIGINT   NOT NULL REFERENCES aliment(id)     ON DELETE RESTRICT,
    emplacement_id SMALLINT NOT NULL REFERENCES emplacement(id),
    quantite       NUMERIC(9,2) NOT NULL DEFAULT 0 CHECK (quantite >= 0),  -- en grammes
    peremption     DATE,
    maj_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (utilisateur_id, aliment_id, emplacement_id)
);
CREATE INDEX ON stock (utilisateur_id);

-- ---------------------------------------------------------------------
--  Cibles macro par repas et par utilisateur
-- ---------------------------------------------------------------------
CREATE TABLE cible (
    id             BIGSERIAL PRIMARY KEY,
    utilisateur_id UUID NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
    repas          TEXT NOT NULL CHECK (repas IN ('R1','R2','R3','R4')),
    kcal           NUMERIC(7,2) NOT NULL,
    prot           NUMERIC(6,2) NOT NULL,
    gluc           NUMERIC(6,2) NOT NULL,
    lip            NUMERIC(6,2) NOT NULL,
    UNIQUE (utilisateur_id, repas)
);

-- ---------------------------------------------------------------------
--  Référentiel commun : exercices
-- ---------------------------------------------------------------------
CREATE TABLE exercice (
    id               BIGSERIAL PRIMARY KEY,
    nom              TEXT NOT NULL UNIQUE,
    -- Nom français facultatif : l'application affiche « nom_fr » s'il existe,
    -- sinon « nom ». Permet de traduire le catalogue importé au fil de l'eau.
    nom_fr           TEXT,
    format_prescrit  TEXT,                     -- « 4 s × 12 rép », « 100 for time »…
    mode_defaut      TEXT NOT NULL DEFAULT 'charge'
                     CHECK (mode_defaut IN ('charge','iso','chrono')),
    groupes          TEXT,                      -- « Push,Pull,Legs » (SIMPLE_ARRAY)

    -- Démonstration : lien YouTube, renseigné par l'administrateur.
    -- La vidéo reste hébergée chez YouTube et jouée dans son lecteur officiel.
    video_url        TEXT,

    -- Classement, venu du catalogue importé
    partie_corps     TEXT,
    equipement       TEXT,
    muscle_cible     TEXT,
    muscles_secondaires TEXT,
    instructions     TEXT,

    -- 'perso' = tes exercices, avec leurs formats prescrits
    -- 'import' = catalogue commun
    source           TEXT NOT NULL DEFAULT 'perso'
                     CHECK (source IN ('perso','import')),
    reference_source TEXT,                      -- identifiant chez la source

    public           BOOLEAN NOT NULL DEFAULT TRUE,
    cree_par         UUID REFERENCES utilisateur(id) ON DELETE SET NULL,
    cree_le          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Les exercices personnels remontent en tête : « perso » > « import ».
CREATE INDEX exercice_tri ON exercice ((source = 'perso') DESC, nom);
CREATE INDEX exercice_partie_corps ON exercice (partie_corps);
CREATE INDEX exercice_equipement   ON exercice (equipement);

-- Un même exercice ne peut pas être importé deux fois.
CREATE UNIQUE INDEX exercice_source_unique
    ON exercice (source, reference_source)
    WHERE reference_source IS NOT NULL;
-- Pas d'index sur « groupes » : le filtrage par groupe se fait côté API,
-- jamais en SQL.

-- ---------------------------------------------------------------------
--  Modèles de séance
-- ---------------------------------------------------------------------
CREATE TABLE modele (
    id             BIGSERIAL PRIMARY KEY,
    utilisateur_id UUID NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
    nom            TEXT,
    type           TEXT CHECK (type IN ('Push','Pull','Legs')),
    partage        BOOLEAN NOT NULL DEFAULT FALSE,
    cree_le        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON modele (utilisateur_id);

CREATE TABLE modele_exercice (
    id          BIGSERIAL PRIMARY KEY,
    modele_id   BIGINT NOT NULL REFERENCES modele(id)   ON DELETE CASCADE,
    exercice_id BIGINT NOT NULL REFERENCES exercice(id) ON DELETE RESTRICT,
    ordre       SMALLINT NOT NULL DEFAULT 0,
    mode        TEXT CHECK (mode IN ('charge','iso','chrono')),
    notes       TEXT,
    secondes_total_cible INTEGER,
    -- meme raison que sur seance_exercice
    UNIQUE (modele_id, ordre) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE modele_serie (
    id                  BIGSERIAL PRIMARY KEY,
    modele_exercice_id  BIGINT NOT NULL REFERENCES modele_exercice(id) ON DELETE CASCADE,
    ordre               SMALLINT NOT NULL DEFAULT 0,
    reps_cible          SMALLINT,
    poids_cible         NUMERIC(6,2),
    secondes_cible      INTEGER
);

-- ---------------------------------------------------------------------
--  Séances réalisées
-- ---------------------------------------------------------------------
CREATE TABLE seance (
    id             BIGSERIAL PRIMARY KEY,
    utilisateur_id UUID NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
    date           DATE NOT NULL,
    type           TEXT CHECK (type IN ('Push','Pull','Legs')),
    modele_id      BIGINT REFERENCES modele(id) ON DELETE SET NULL,
    cree_le        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON seance (utilisateur_id, date DESC);

CREATE TABLE seance_exercice (
    id          BIGSERIAL PRIMARY KEY,
    seance_id   BIGINT NOT NULL REFERENCES seance(id)   ON DELETE CASCADE,
    exercice_id BIGINT NOT NULL REFERENCES exercice(id) ON DELETE RESTRICT,
    ordre       SMALLINT NOT NULL DEFAULT 0,
    mode        TEXT CHECK (mode IN ('charge','iso','chrono')),
    notes       TEXT,
    -- Temps total d'un effort chronométré. Coexiste avec les séries :
    -- un « 100 for time » dure 4:21 ET se compose de 93 rép à 32 kg puis
    -- 7 à 35 kg. Les deux comptent dans la progression.
    secondes_total INTEGER CHECK (secondes_total IS NULL OR secondes_total >= 0),
    -- DIFFERABLE : Doctrine emet les INSERT avant les DELETE quand il
    -- remplace une collection, et un reordonnancement passe forcement par
    -- un doublon transitoire. Verifiee au COMMIT, l'unicite tient sur
    -- l'etat final sans refuser les etapes intermediaires.
    UNIQUE (seance_id, ordre) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ON seance_exercice (exercice_id);   -- pour l'historique et les courbes

CREATE TABLE serie (
    id                  BIGSERIAL PRIMARY KEY,
    seance_exercice_id  BIGINT NOT NULL REFERENCES seance_exercice(id) ON DELETE CASCADE,
    ordre               SMALLINT NOT NULL DEFAULT 0,
    reps                SMALLINT,
    poids               NUMERIC(6,2),
    secondes            INTEGER,
    faite               BOOLEAN NOT NULL DEFAULT FALSE,
    -- objectifs hérités du modèle, conservés pour comparer prévu / réalisé
    reps_cible          SMALLINT,
    poids_cible         NUMERIC(6,2),
    secondes_cible      INTEGER
);
CREATE INDEX ON serie (seance_exercice_id);

-- ---------------------------------------------------------------------
--  Vue pratique : dernière performance et 1RM estimé par exercice
--  (Epley : 1RM = poids × (1 + 0,0333 × répétitions))
-- ---------------------------------------------------------------------
CREATE VIEW v_performance AS
SELECT  s.utilisateur_id,
        se.exercice_id,
        s.date,
        MAX(sr.poids * (1 + 0.0333 * sr.reps)) AS rm_estime,
        MAX(sr.secondes)                       AS meilleure_tenue,
        MIN(NULLIF(sr.secondes, 0))            AS meilleur_chrono
FROM    seance s
JOIN    seance_exercice se ON se.seance_id = s.id
JOIN    serie sr           ON sr.seance_exercice_id = se.id
WHERE   sr.faite
GROUP BY s.utilisateur_id, se.exercice_id, s.date;
