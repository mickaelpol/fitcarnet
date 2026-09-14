-- =====================================================================
--  fitcarnet — schéma PostgreSQL
--  Principe : un référentiel COMMUN (aliments, exercices, emplacements)
--             et des données PRIVÉES par utilisateur (stock, cibles,
--             séances, modèles).
--
--  CE FICHIER DÉCRIT LA BASE TELLE QU'ELLE EST AUJOURD'HUI, pas telle
--  qu'elle était au départ.
--
--  Il a longtemps décrit l'état initial, et tout le reste — les fibres, les
--  jetons de rafraîchissement, les modes de cuisson, les plans enregistrés —
--  vivait dans `db/manuel/`, à rejouer une par une. Installer sur une machine
--  neuve demandait donc quatorze migrations à la main, et une seule oubliée
--  donnait une application qui démarre et casse plus tard.
--
--  Désormais : ce fichier suffit à obtenir la base d'aujourd'hui.
--
--  `db/manuel/` NE DISPARAÎT PAS POUR AUTANT. Ces fichiers restent le seul
--  chemin pour faire évoluer une base qui EXISTE DÉJÀ — la tienne, celle du
--  NAS — puisque PostgreSQL ne rejoue `db/` qu'à la création du volume. Ils
--  sont tous idempotents : les jouer sur une base construite avec ce fichier
--  ne fait rien, ce qui est exactement ce qu'on veut d'un installateur qui
--  doit marcher dans les deux cas sans savoir lequel il a devant lui.
--
--  Les migrations de DONNÉES (14, 15, 16, 17, 18, 19) ne sont pas repliées
--  ici, et ne peuvent pas l'être : elles corrigent des valeurs saisies, pas
--  une structure. Sur une base vierge elles ne trouvent rien à corriger.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------------------------------------------------------------------
--  Utilisateurs
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
--  Normalisation des noms
--
--  Posee ici parce que les migrations de `db/manuel/` s'en servent, et que
--  `INSTALLATION.md` invite a en rejouer une seule sur une base neuve. Elle
--  vivait uniquement dans la migration 16 : rejouer la 19 seule echouait
--  alors sur « function fitcarnet_normaliser(text) does not exist ».
--
--  Elle abaisse la casse et retire les accents. RIEN D'AUTRE — ni les
--  apostrophes, ni les espaces.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fitcarnet_normaliser(t text) RETURNS text AS $$
    SELECT lower(translate(t, 'àâäéèêëïîôöùûüçÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ', 'aaaeeeeiioouuucAAAEEEEIIOOUUUC'));
$$ LANGUAGE sql IMMUTABLE;

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
    -- Pas d'UNIQUE en ligne : l'unicité dépend du propriétaire, et deux index
    -- partiels plus bas s'en chargent. Un UNIQUE global interdirait à deux
    -- comptes d'avoir chacun son « Riz basmati ».
    nom             TEXT        NOT NULL,
    categorie       TEXT        NOT NULL
                    CHECK (categorie IN ('prot','fec','leg','ole','huile','lait','fruit','autre')),

    -- UNE SEULE CONVENTION, ET C'EST TOUT LE PROJET QUI EN DÉPEND : ces
    -- valeurs décrivent le produit TEL QU'ON LE PÈSE, avant cuisson. Riz sec,
    -- viande crue. Il n'y a pas de colonne disant « ces valeurs sont-elles
    -- celles du cru ou du cuit » — il y en a eu une, `etat_reference`, et
    -- écrire le même fait à deux endroits a fini par faire peser trois fois
    -- trop de riz. Voir `db/manuel/18-un-seul-etat.sql`.
    kcal_100        NUMERIC(7,2) NOT NULL,
    prot_100        NUMERIC(6,2) NOT NULL,
    gluc_100        NUMERIC(6,2) NOT NULL,
    lip_100         NUMERIC(6,2) NOT NULL,
    -- Facultatif. Comptées 2 kcal/g et SÉPARÉES des glucides, convention
    -- européenne : sans elles, le contrôle « 4·P + 4·G + 2·F + 9·L = kcal »
    -- perd sa fiabilité sur les légumes et les céréales complètes.
    fibres_100      NUMERIC(6,2),

    -- Cuit / pesé. N'entre dans AUCUN calcul de macros — la cuisson n'ajoute
    -- que de l'eau. Sert uniquement à annoncer le poids qu'on aura dans
    -- l'assiette.
    ratio           NUMERIC(5,3) NOT NULL DEFAULT 1,
    -- Les deux pesées d'où vient un ratio mesuré par l'utilisateur. Gardées
    -- pour qu'on sache d'où sort le chiffre : une valeur de table et une
    -- mesure faite chez soi ne se corrigent pas de la même façon.
    pesee_avant     NUMERIC(7,1),
    pesee_apres     NUMERIC(7,1),

    code_barres     TEXT,
    source          TEXT        NOT NULL DEFAULT 'manuel'
                    CHECK (source IN ('manuel','openfoodfacts','reference')),
    public          BOOLEAN     NOT NULL DEFAULT TRUE,
    cree_par        UUID        REFERENCES utilisateur(id) ON DELETE SET NULL,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Une valeur nutritionnelle négative n'existe pas. La base le refuse
    -- elle-même : un import bâclé ou un bogue de saisie s'arrête ici, et non
    -- trois écrans plus loin dans un calcul de macros.
    CONSTRAINT aliment_valeurs_positives CHECK (
        (kcal_100   IS NULL OR kcal_100   >= 0) AND
        (prot_100   IS NULL OR prot_100   >= 0) AND
        (gluc_100   IS NULL OR gluc_100   >= 0) AND
        (lip_100    IS NULL OR lip_100    >= 0) AND
        (fibres_100 IS NULL OR fibres_100 >= 0)
    ),
    -- Un ratio cru/cuit au-delà de 10 est une erreur de saisie, pas un aliment.
    CONSTRAINT aliment_ratio_borne
        CHECK (ratio IS NULL OR (ratio > 0 AND ratio <= 10)),
    CONSTRAINT aliment_pesees_positives CHECK (
        (pesee_avant IS NULL OR pesee_avant > 0) AND
        (pesee_apres IS NULL OR pesee_apres > 0)
    )
);
-- Un aliment COMMUN — sans propriétaire — porte un nom unique pour tout le
-- monde. Un aliment PRIVÉ est unique chez son propriétaire, et seulement chez
-- lui : deux comptes peuvent avoir chacun leur « Riz basmati », avec leurs
-- propres valeurs.
CREATE UNIQUE INDEX aliment_nom_commun_unique
    ON aliment (lower(nom)) WHERE cree_par IS NULL;
CREATE UNIQUE INDEX aliment_nom_prive_unique
    ON aliment (lower(nom), cree_par) WHERE cree_par IS NOT NULL;

-- Ce qui ne peut PAS être vrai physiquement, refusé par la base plutôt que
-- rattrapé par du code. Ces deux contraintes viennent de vraies erreurs :
-- des macros américaines qui comptent les fibres deux fois, et des valeurs
-- de riz cuit posées sur un riz qu'on pèse sec.
ALTER TABLE aliment ADD CONSTRAINT aliment_matiere_plausible
    CHECK (prot_100 + gluc_100 + lip_100 + COALESCE(fibres_100, 0) <= 100.5);
-- Une protéine et un légume PERDENT de l'eau à la cuisson, un féculent en
-- GAGNE. Un rendement qui dit l'inverse est une saisie fausse, pas un aliment
-- exotique.
ALTER TABLE aliment ADD CONSTRAINT aliment_ratio_sens
    CHECK (
        ratio > 0
        AND (categorie NOT IN ('prot', 'leg') OR ratio <= 1.05)
        AND (categorie <> 'fec'               OR ratio >= 1)
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
    UNIQUE (utilisateur_id, aliment_id, emplacement_id),
    CONSTRAINT stock_quantite_positive CHECK (quantite >= 0)
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
    -- Certains plans — nord-américains surtout — expriment les glucides
    -- FIBRES COMPRISES. Le dire ici évite de retrancher les fibres à la main
    -- et de se tromper d'un repas sur deux.
    glucides_totaux BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (utilisateur_id, repas),
    CONSTRAINT cible_valeurs_positives CHECK (
        (kcal IS NULL OR kcal >= 0) AND
        (prot IS NULL OR prot >= 0) AND
        (gluc IS NULL OR gluc >= 0) AND
        (lip  IS NULL OR lip  >= 0)
    )
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
    secondes_cible      INTEGER,
    CONSTRAINT modele_serie_valeurs_positives CHECK (
        (reps_cible     IS NULL OR reps_cible     >= 0) AND
        (poids_cible    IS NULL OR poids_cible    >= 0) AND
        (secondes_cible IS NULL OR secondes_cible >= 0)
    )
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
    secondes_cible      INTEGER,
    CONSTRAINT serie_valeurs_positives CHECK (
        (reps     IS NULL OR reps     >= 0) AND
        (poids    IS NULL OR poids    >= 0) AND
        (secondes IS NULL OR secondes >= 0)
    )
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

-- ---------------------------------------------------------------------
--  Sessions : jetons de rafraîchissement
--
--  Le jeton JWT d'accès ne dure qu'une heure. C'est CELUI-CI qui tient la
--  session ouverte, et le fait qu'il vive en base est le point : effacer les
--  jetons du téléphone ne suffirait pas à se déconnecter, une copie
--  rouvrirait la session. Une déconnexion supprime la ligne.
--
--  On stocke une EMPREINTE, jamais le jeton. Une base lue par un tiers ne
--  doit ouvrir aucune session.
-- ---------------------------------------------------------------------
CREATE TABLE jeton_rafraichissement (
    id             UUID        PRIMARY KEY,
    empreinte      VARCHAR(64) NOT NULL UNIQUE,
    utilisateur_id UUID        NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
    expire_le      TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
    cree_le        TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL
);
CREATE INDEX idx_jeton_rafraichissement_utilisateur
    ON jeton_rafraichissement (utilisateur_id);
-- Le balayage des jetons périmés passe par cette colonne.
CREATE INDEX idx_jeton_rafraichissement_expire
    ON jeton_rafraichissement (expire_le);

-- ---------------------------------------------------------------------
--  Batch cooking : les façons de cuire
--
--  Une TABLE PARTAGÉE, et non un champ sur l'aliment. Le frigo a deux
--  sources — la table `aliment` pour les comptes ordinaires, Grocy pour
--  l'administrateur : un mode de cuisson posé sur la fiche existerait en
--  double, avec deux vocabulaires libres de diverger. Et un mode de cuisson
--  n'est de toute façon pas une propriété de l'aliment — les mêmes pommes de
--  terre passent au four un soir et à la vapeur le lendemain.
--
--  Deux aliments partagent une fournée s'ils pointent la MÊME LIGNE d'ici.
--  D'où une seule colonne de libellé : « Four 180 °C » est un libellé, pas un
--  mode plus une température. Le libellé s'affiche, l'identifiant regroupe.
--
--  Tout le monde lit, seul l'administrateur écrit. Une liste ouverte finirait
--  avec « four », « Four », « au four » et « four 180 » — quatre fournées là
--  où il en faut une.
-- ---------------------------------------------------------------------
CREATE TABLE mode_cuisson (
    id      SERIAL PRIMARY KEY,
    libelle TEXT     NOT NULL,
    -- On ne trie pas par ordre alphabétique : « Air fryer » n'a aucune raison
    -- de passer avant « Vapeur ». Les cuissons les plus courantes en haut.
    ordre   SMALLINT NOT NULL DEFAULT 100
);
CREATE UNIQUE INDEX mode_cuisson_libelle ON mode_cuisson (lower(libelle));

-- ---------------------------------------------------------------------
--  Batch cooking : comment ce compte cuit, d'habitude
--
--  Un DÉFAUT, rien de plus : à la composition d'un repas l'écran pré-remplit
--  les cuissons à partir d'ici, et l'utilisateur change ce qu'il veut. Sans
--  ça, une semaine de quatre repas demandait une trentaine de choix — les
--  mêmes que la semaine précédente.
--
--  LA CLÉ EST LE NOM, normalisé par l'écran. C'est le seul identifiant que
--  les deux frigos aient en commun : un aliment Grocy porte « grocy:12 », un
--  aliment de la base porte un entier, et ces deux mondes n'ont aucun
--  identifiant partagé. Côté base, `aliment` n'est qu'une chaîne opaque :
--  personne ici ne l'interprète.
-- ---------------------------------------------------------------------
CREATE TABLE cuisson_habituelle (
    id              BIGSERIAL PRIMARY KEY,
    utilisateur_id  UUID NOT NULL REFERENCES utilisateur (id) ON DELETE CASCADE,
    -- le nom normalisé de l'aliment : minuscules, sans accent
    aliment         TEXT NOT NULL,
    -- NULL = « se mange sans cuisson », et c'est une réponse, pas un trou.
    --
    -- CASCADE et non SET NULL : si l'administrateur supprime « Eau
    -- bouillante », le riz qui la visait ne doit PAS se retrouver à NULL — il
    -- serait pré-rempli « se mange tel quel », c'est-à-dire une réponse
    -- fausse et muette, découverte devant la boîte. La ligne s'en va, l'écran
    -- repose la question. Une question de trop coûte un geste ; une réponse
    -- fausse coûte un repas.
    mode_cuisson_id INTEGER REFERENCES mode_cuisson (id) ON DELETE CASCADE,
    maj_le          TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Une seule habitude par aliment et par compte. C'est cette contrainte qui
-- fait de l'écriture un remplacement et non un empilement.
CREATE UNIQUE INDEX cuisson_habituelle_unique
    ON cuisson_habituelle (utilisateur_id, aliment);

-- ---------------------------------------------------------------------
--  Batch cooking : les plans conservés
--
--  `CALCULATEUR.md` disait « rien n'est enregistré : le plan est un outil
--  d'organisation, pas un journal ». Le batch cooking a rendu cette règle
--  intenable : on cuisine le dimanche pour la semaine, et le jeudi midi,
--  devant sa boîte, il faut savoir combien s'en servir.
--
--  ON ENREGISTRE UN INSTANTANÉ, PAS UNE RECETTE À REJOUER. `contenu` porte le
--  RÉSULTAT déjà calculé — des noms et des grammes. Rejouer le solveur à la
--  lecture donnerait un autre plan : le stock a bougé. Le jeudi, on ne veut
--  pas savoir ce qu'on cuisinerait aujourd'hui.
--
--  D'où le `jsonb` plutôt qu'un schéma en cinq tables : ces données ne sont
--  jamais requêtées par leur contenu, jamais jointes, jamais modifiées ligne
--  à ligne. On les écrit une fois et on les relit entières.
-- ---------------------------------------------------------------------
CREATE TABLE plan_repas (
    id             BIGSERIAL PRIMARY KEY,
    utilisateur_id UUID        NOT NULL REFERENCES utilisateur (id) ON DELETE CASCADE,
    -- « Semaine du 11/08 », ou ce que l'utilisateur aura tapé.
    libelle        TEXT        NOT NULL,
    cree_le        TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- NULL = PRÉVU : la nourriture est encore dans le frigo mais elle est
    -- promise, et le plan RÉSERVE son stock — les compositions suivantes ne
    -- comptent plus dessus. Renseigné = CUISINÉ : le stock a été décrémenté
    -- pour de vrai, le plan ne réserve plus rien.
    --
    -- Sans cette colonne, deux batch cooking d'affilée comptaient deux fois
    -- le même frigo : chacun juste tout seul, faux ensemble, et rien ne le
    -- disait.
    cuisine_le     TIMESTAMPTZ,
    contenu        JSONB       NOT NULL
);
-- On liste toujours SES plans, du plus récent au plus ancien.
CREATE INDEX plan_repas_par_compte ON plan_repas (utilisateur_id, cree_le DESC);
-- « Que reste-t-il de promis ? », posée à chaque composition. Index partiel :
-- les plans déjà cuisinés ne sont jamais dans cette réponse, et ce sont eux
-- qui s'accumulent avec le temps.
CREATE INDEX plan_repas_prevus ON plan_repas (utilisateur_id) WHERE cuisine_le IS NULL;

-- ---------------------------------------------------------------------
--  Invitations
--
--  L'administrateur saisit une adresse, l'application rend un lien, la
--  personne choisit elle-meme son nom et son mot de passe. Le jeton n'est
--  jamais stocke : seule son empreinte SHA-256 l'est.
--
--  Voir `db/manuel/24-invitations.sql`, qui pose la meme table sur une base
--  existante. Ce fichier-ci decrit la base d'AUJOURD'HUI : il manquait cette
--  table, et un environnement de developpement monte a neuf repondait donc
--  500 sur `/api/invitations`.
-- ---------------------------------------------------------------------
CREATE TABLE invitation (
    id              BIGSERIAL PRIMARY KEY,
    email           TEXT        NOT NULL,
    jeton_empreinte CHAR(64)    NOT NULL UNIQUE,
    invite_par      UUID        REFERENCES utilisateur(id) ON DELETE SET NULL,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    expire_le       TIMESTAMPTZ NOT NULL,
    accepte_le      TIMESTAMPTZ,
    utilisateur_id  UUID        REFERENCES utilisateur(id) ON DELETE SET NULL
);

-- Index PARTIEL : une seule invitation VIVANTE par adresse. Une adresse deja
-- invitee et acceptee peut etre reinvitee ; deux liens valides en meme temps
-- pour la meme personne sont une confusion pure.
CREATE UNIQUE INDEX invitation_en_attente
    ON invitation (lower(email))
    WHERE accepte_le IS NULL;

CREATE INDEX invitation_par_date ON invitation (cree_le DESC);

-- ---------------------------------------------------------------------
--  File d'attente des inventaires (migration 26)
-- ---------------------------------------------------------------------
--  Un inventaire de frigo peut compter des dizaines de lignes, et chacune
--  part vers Grocy — une à deux secondes. L'API dépose donc le lot ici et
--  répond tout de suite ; `app:inventaire:traiter` l'applique en tâche de
--  fond, ligne par ligne, en notant son avancement pour qu'une interruption
--  reste lisible et reprenable.
CREATE TABLE inventaire_lot (
    id              BIGSERIAL PRIMARY KEY,
    utilisateur_id  UUID        NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
    source          TEXT        NOT NULL,
    lignes          JSONB       NOT NULL,
    total           INT         NOT NULL,
    traites         INT         NOT NULL DEFAULT 0,
    echecs          JSONB       NOT NULL DEFAULT '[]'::jsonb,
    statut          TEXT        NOT NULL DEFAULT 'en_attente',
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    commence_le     TIMESTAMPTZ,
    fini_le         TIMESTAMPTZ,
    vu_le           TIMESTAMPTZ,
    -- Posé à la prise, présenté à chaque écriture (migration 30). Un lot
    -- repris change de jeton : l'ancien travailleur est alors refusé, au lieu
    -- d'écraser en silence l'avancement de son remplaçant.
    jeton           UUID,
    CONSTRAINT inventaire_lot_statut_connu
        CHECK (statut IN ('en_attente', 'en_cours', 'termine', 'echoue')),
    CONSTRAINT inventaire_lot_source_connue
        CHECK (source IN ('grocy', 'base')),
    CONSTRAINT inventaire_lot_avancement_coherent
        CHECK (traites >= 0 AND traites <= total AND total > 0)
);

-- UN SEUL LOT ACTIF PAR COMPTE, et c'est la base qui le tient. Deux
-- inventaires simultanés du même frigo se marcheraient dessus : le second
-- écraserait les quantités que le premier vient d'écrire.
CREATE UNIQUE INDEX inventaire_lot_un_seul_actif
    ON inventaire_lot (utilisateur_id)
    WHERE statut IN ('en_attente', 'en_cours');

CREATE INDEX inventaire_lot_a_faire
    ON inventaire_lot (cree_le)
    WHERE statut IN ('en_attente', 'en_cours');

CREATE INDEX inventaire_lot_dernier
    ON inventaire_lot (utilisateur_id, id DESC);

COMMENT ON TABLE inventaire_lot IS
    'File d''attente des inventaires. Deposes par l''API, appliques par la commande app:inventaire:traiter.';
COMMENT ON COLUMN inventaire_lot.traites IS
    'Lignes deja envoyees a la source. Mis a jour apres chaque ligne, pour qu''une interruption reste lisible.';

-- ---------------------------------------------------------------------
--  Compléments alimentaires (migration 27)
-- ---------------------------------------------------------------------
CREATE TABLE complement (
    id              BIGSERIAL PRIMARY KEY,
    utilisateur_id  UUID        NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
    nom             TEXT        NOT NULL,
    quantite        NUMERIC(10, 2) NOT NULL,
    unite           TEXT        NOT NULL,
    repas           TEXT        NOT NULL,
    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT complement_repas_connu
        CHECK (repas IN ('R1', 'R2', 'R3', 'R4')),
    CONSTRAINT complement_quantite_positive
        CHECK (quantite > 0),
    CONSTRAINT complement_nom_raisonnable
        CHECK (char_length(btrim(nom)) BETWEEN 1 AND 80),
    CONSTRAINT complement_unite_raisonnable
        CHECK (char_length(btrim(unite)) BETWEEN 1 AND 20)
);

CREATE UNIQUE INDEX complement_unique_par_repas
    ON complement (utilisateur_id, lower(btrim(nom)), repas);

CREATE INDEX complement_par_compte
    ON complement (utilisateur_id, repas);

COMMENT ON TABLE complement IS
    'Consignes de complements alimentaires, rattachees a un moment de repas. Ce n''est pas un journal de prises.';

-- ---------------------------------------------------------------------
--  Commentaires de colonnes posés par les migrations
-- ---------------------------------------------------------------------
COMMENT ON COLUMN aliment.fibres_100 IS
  'Fibres pour 100 g, facultatif ; comptées 2 kcal/g, hors glucides.';
COMMENT ON COLUMN aliment.pesee_avant IS
  'Poids avant cuisson lors de la mesure du ratio ; NULL si valeur courante.';
COMMENT ON COLUMN cible.glucides_totaux IS
    'Vrai si la cible en glucides comprend les fibres (convention nord-americaine).';
COMMENT ON COLUMN invitation.email IS
    'Adresse du futur compte, figee a la creation : la personne invitee ne peut pas en changer.';
COMMENT ON COLUMN invitation.jeton_empreinte IS
    'SHA-256 hexadecimal du jeton. Le jeton en clair n''est jamais stocke.';
COMMENT ON TABLE jeton_rafraichissement IS
    'Sessions ouvertes. Une ligne par connexion, supprimee a la deconnexion.';
COMMENT ON COLUMN jeton_rafraichissement.empreinte IS
    'SHA-256 du jeton. Le jeton en clair n''est jamais stocke.';
COMMENT ON COLUMN jeton_rafraichissement.expire_le IS
    'Repousse a chaque rafraichissement : une application qui sert ne deconnecte pas.';
COMMENT ON COLUMN plan_repas.cuisine_le IS
    'NULL = prevu, le plan reserve son stock ; renseigne = cuisine, le stock a deja ete decremente';
COMMENT ON INDEX aliment_nom_commun_unique IS
    'Unicite des aliments de reference entre eux.';
COMMENT ON INDEX aliment_nom_prive_unique IS
    'Unicite du nom chez un utilisateur. Deux comptes peuvent nommer pareil.';
