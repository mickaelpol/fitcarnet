-- =====================================================================
--  fitcarnet — l'inventaire devient une tache de fond
--
--  CE QUI S'EST PASSE LE 14 AOUT 2026, ET QUI A MOTIVE CETTE TABLE.
--
--  L'envoi d'un inventaire etait synchrone : le telephone attendait pendant
--  que le serveur poussait une quarantaine de lignes vers Grocy. PHP s'est
--  arrete a 30 secondes, en plein milieu.
--
--      500 POST /api/mon-frigo/inventaire  33,38 s
--      PHP Fatal error: Maximum execution time of 30 seconds exceeded
--
--  Les journaux de Grocy montrent la suite : les produits 2, 22, 24 et 30
--  repondent `499` — le client a raccroche — puis `400 The new amount cannot
--  equal the current stock amount` a la tentative suivante. Grocy AVAIT
--  applique la premiere : il a continue a travailler apres que le telephone
--  a abandonne. Le frigo etait donc a moitie corrige, et rien ne le disait.
--
--  TROIS FAUTES, PAS UNE.
--
--  1. Le serveur envoyait les POST tous en meme temps, en croyant paralleliser.
--     Grocy tourne avec CINQ ouvriers PHP et une base SQLite, qui n'accepte
--     qu'un ecrivain a la fois. Rien n'etait parallelise : tout faisait la
--     queue, et l'un des appels est mort sur un verrou (500 sur le produit 49).
--
--  2. Le travail vivait dans une requete HTTP. Une requete HTTP a une duree
--     maximale, et le jour ou on la depasse on ne sait plus ou on en est.
--
--  3. Rien n'empechait de rappuyer sur le bouton pendant que le premier envoi
--     tournait encore. C'est ce second envoi qui a produit les `400`.
--
--  CE QUE CETTE TABLE CORRIGE.
--
--  L'inventaire n'est plus fait par la requete : il y est DEPOSE. La requete
--  rend la main tout de suite, un travailleur separe applique les lignes une
--  par une, et l'avancement est lisible a tout moment — y compris apres avoir
--  ferme l'application. Un envoi interrompu ne devient pas juste, mais il
--  devient CONNU : `traites` dit exactement ou ca s'est arrete.
--
--  Idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS inventaire_lot (
    id              BIGSERIAL PRIMARY KEY,

    -- UUID ET NON INT : `utilisateur.id` est un `Uuid` cote Doctrine, et une
    -- colonne `uuid` cote PostgreSQL. Ecrit en `INT`, ce fichier echouait des
    -- la creation de la table — « foreign key constraint cannot be implemented,
    -- key columns are of incompatible types: integer and uuid ». Et comme le
    -- point d'entree joue `db/manuel/` AVANT de lancer FrankenPHP, ce n'est pas
    -- une table manquante qu'on aurait eue : c'est l'application entiere qui ne
    -- serait pas remontee.
    utilisateur_id  UUID        NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,

    -- 'grocy' ou 'base'. Fige au depot : si l'utilisateur change de source
    -- entre le depot et le traitement, le lot doit partir la ou il visait.
    source          TEXT        NOT NULL,

    -- [{"reference": "grocy:42", "quantite": 3.5}, ...]
    -- En JSONB et non dans une table fille : ces lignes ne sont jamais
    -- interrogees separement, seulement relues en bloc par le travailleur.
    -- Une table fille couterait une jointure et un ordre a maintenir pour
    -- une donnee qui n'a de sens qu'entiere.
    lignes          JSONB       NOT NULL,

    total           INT         NOT NULL,
    -- COMBIEN DE LIGNES SONT DEJA PARTIES. Ecrit apres CHAQUE ligne, pas a la
    -- fin : c'est ce chiffre qui transforme une panne en information.
    traites         INT         NOT NULL DEFAULT 0,

    -- [{"reference": "grocy:49", "motif": "..."}]
    echecs          JSONB       NOT NULL DEFAULT '[]'::jsonb,

    statut          TEXT        NOT NULL DEFAULT 'en_attente',

    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    commence_le     TIMESTAMPTZ,
    fini_le         TIMESTAMPTZ,

    -- DERNIER SIGNE DE VIE DU TRAVAILLEUR SUR CE LOT.
    --
    -- Touche a chaque ligne envoyee. C'est ce qui permet de dire « plus
    -- personne ne s'en occupe » sans compter les travailleurs ni supposer
    -- lequel tourne : un lot « en cours » qui n'a pas bouge depuis deux
    -- minutes est abandonne, qu'il y ait un travailleur ou dix.
    --
    -- L'alternative etait de reprendre tout lot « en cours » au demarrage, en
    -- raisonnant « il n'y a qu'un travailleur, donc c'est le mien ». Ca marche
    -- tant que c'est vrai, et ca vole le lot du voisin le jour ou on en ajoute
    -- un second — c'est-a-dire le jour ou on en a besoin.
    vu_le           TIMESTAMPTZ,

    CONSTRAINT inventaire_lot_statut_connu
        CHECK (statut IN ('en_attente', 'en_cours', 'termine', 'echoue')),
    CONSTRAINT inventaire_lot_source_connue
        CHECK (source IN ('grocy', 'base')),
    CONSTRAINT inventaire_lot_avancement_coherent
        CHECK (traites >= 0 AND traites <= total AND total > 0)
);

-- POUR UNE TABLE DEJA CREEE PAR UNE VERSION PRECEDENTE DE CE FICHIER.
--
-- `CREATE TABLE IF NOT EXISTS` ci-dessus ne touche pas a une table existante :
-- une colonne ajoutee apres coup n'y arriverait jamais, et l'application
-- echouerait sur une colonne absente sans que ce fichier ne signale quoi que
-- ce soit. Ce fichier est rejoue a chaque demarrage — il doit donc savoir
-- rattraper ses propres versions anterieures, pas seulement partir de zero.
ALTER TABLE inventaire_lot ADD COLUMN IF NOT EXISTS vu_le TIMESTAMPTZ;

-- UN SEUL LOT ACTIF PAR UTILISATEUR, ET C'EST LE COEUR DU CORRECTIF.
--
-- L'ecran peut bien desactiver son bouton : il ne controle pas le second
-- telephone, ni le rechargement de page, ni l'utilisateur presse. La regle
-- « on ne compte pas deux fois le meme frigo en meme temps » est une regle de
-- donnees, elle doit vivre la ou les donnees sont ecrites.
--
-- Index PARTIEL : la contrainte ne porte que sur les lots vivants. L'historique
-- des lots termines n'est pas contraint, sinon on ne pourrait jamais en refaire
-- un second.
CREATE UNIQUE INDEX IF NOT EXISTS inventaire_lot_un_seul_actif
    ON inventaire_lot (utilisateur_id)
    WHERE statut IN ('en_attente', 'en_cours');

-- Le travailleur cherche « ce qu'il y a a faire », plusieurs fois par seconde.
-- Sans cet index il balaierait tout l'historique a chaque tour.
CREATE INDEX IF NOT EXISTS inventaire_lot_a_faire
    ON inventaire_lot (cree_le)
    WHERE statut IN ('en_attente', 'en_cours');

-- L'ecran ne demande jamais qu'une chose : « le dernier, pour moi ».
CREATE INDEX IF NOT EXISTS inventaire_lot_dernier
    ON inventaire_lot (utilisateur_id, id DESC);

COMMENT ON TABLE inventaire_lot IS
    'File d''attente des inventaires. Deposes par l''API, appliques par la commande app:inventaire:traiter.';
COMMENT ON COLUMN inventaire_lot.traites IS
    'Lignes deja envoyees a la source. Mis a jour apres chaque ligne, pour qu''une interruption reste lisible.';

-- ---------------------------------------------------------------------
--  MENAGE
--
--  Un lot termine n'a d'interet que le temps qu'on le lise. Au-dela, c'est de
--  l'archive — et de l'archive qui grossit d'un enregistrement par inventaire,
--  pour toujours, sur un NAS. On garde trente jours : de quoi revenir sur un
--  envoi de la semaine derniere, pas de quoi remplir un disque.
--
--  Joue a chaque demarrage du conteneur, comme le reste de db/manuel/.
-- ---------------------------------------------------------------------
DELETE FROM inventaire_lot
 WHERE statut IN ('termine', 'echoue')
   AND fini_le < now() - INTERVAL '30 days';
