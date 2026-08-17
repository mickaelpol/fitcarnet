-- =====================================================================
--  fitcarnet — les complements alimentaires, rattaches a un repas
--
--  CE QUE CETTE TABLE N'EST PAS : un journal de prises.
--
--  Elle ne dit pas « j'ai pris ma creatine ce matin », elle dit « avec le
--  repas du matin, il y a 5 g de creatine ». C'est une CONSIGNE, pas un
--  historique — au meme titre qu'une cible macro. On la lit au moment de
--  preparer l'assiette, et elle vaut tous les jours jusqu'a ce qu'on la
--  change.
--
--  POURQUOI PAS DANS `aliment`, AVEC LE RESTE.
--
--  Parce qu'un complement ne se calcule pas. Le solveur ajuste des quantites
--  pour atteindre des macros ; une dose de creatine est FIXE, et ses macros
--  sont nulles ou negligeables. La faire entrer dans le systeme des aliments
--  donnerait au solveur une variable qu'il n'a pas le droit de bouger, et a
--  l'utilisateur un aliment qu'il ne doit pas peser.
--
--  LA LIGNE DE PARTAGE : ce qui se MANGE va dans le frigo — une whey, c'est
--  24 g de proteines, ca doit entrer dans le calcul comme le reste. Ce qui
--  s'AVALE vient ici : creatine, magnesium, vitamine D, omega-3. Mettre une
--  whey des deux cotes, c'est se garantir de la compter deux fois ou zero
--  fois, sans jamais savoir laquelle.
--
--  `repas` REPREND LE VOCABULAIRE DES CIBLES — R1 matin, R2 midi, R3 16h,
--  R4 soir. Pas un vocabulaire parallele : le jour ou un cinquieme moment
--  apparait, il doit apparaitre a UN endroit.
--
--  Idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS complement (
    id              BIGSERIAL PRIMARY KEY,
    utilisateur_id  UUID        NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,

    nom             TEXT        NOT NULL,
    quantite        NUMERIC(10, 2) NOT NULL,

    -- TEXTE LIBRE ET NON UNE LISTE FIGEE. g, mg, gelule, dosette, mL, sachet,
    -- goutte, cuillere — toute liste fermee rencontre son cas manquant, et il
    -- faut alors redeployer pour ajouter un mot. Le cout d'un champ libre est
    -- qu'on ne peut pas convertir automatiquement ; on n'en a pas besoin ici,
    -- personne ne fait la somme de deux compléments.
    unite           TEXT        NOT NULL,

    repas           TEXT        NOT NULL,

    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT complement_repas_connu
        CHECK (repas IN ('R1', 'R2', 'R3', 'R4')),

    -- UNE QUANTITE NULLE OU NEGATIVE N'EST PAS UNE CONSIGNE.
    -- « 0 g de creatine » ne veut rien dire : si on n'en prend plus, on
    -- supprime la ligne. La laisser a zero fabrique une consigne muette,
    -- affichee dans l'ecran repas sans rien demander.
    CONSTRAINT complement_quantite_positive
        CHECK (quantite > 0),

    -- Bornes de saisie. Elles ne protegent pas d'une faute de frappe, elles
    -- protegent d'un champ colle par megarde — et la base est le seul endroit
    -- que ni l'ecran, ni un script, ni une console SQL ne contourne.
    CONSTRAINT complement_nom_raisonnable
        CHECK (char_length(btrim(nom)) BETWEEN 1 AND 80),
    CONSTRAINT complement_unite_raisonnable
        CHECK (char_length(btrim(unite)) BETWEEN 1 AND 20)
);

-- LE MEME COMPLEMENT, UNE SEULE FOIS PAR REPAS.
--
-- Deux lignes « 5 g Creatine » sur R1 ne sont jamais voulues : c'est un double
-- appui, ou un ajout qu'on croyait perdu. En revanche le MEME complement a
-- deux moments differents est parfaitement legitime — magnesium matin et soir.
-- La contrainte porte donc sur le couple (nom, repas), pas sur le nom seul.
--
-- `lower(btrim(nom))` : « Creatine » et « creatine  » sont le meme produit.
CREATE UNIQUE INDEX IF NOT EXISTS complement_unique_par_repas
    ON complement (utilisateur_id, lower(btrim(nom)), repas);

-- L'ecran repas demande « les complements de CE compte, pour CE repas », quatre
-- fois par affichage.
CREATE INDEX IF NOT EXISTS complement_par_compte
    ON complement (utilisateur_id, repas);

COMMENT ON TABLE complement IS
    'Consignes de complements alimentaires, rattachees a un moment de repas. Ce n''est pas un journal de prises.';
