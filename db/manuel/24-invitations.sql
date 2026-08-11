-- =====================================================================
--  fitcarnet — invitations
--
--  L'administrateur saisit une adresse. L'application fabrique un lien.
--  La personne suit ce lien et choisit elle-meme son nom et son mot de passe.
--
--  POURQUOI PAS SIMPLEMENT CREER LE COMPTE
--
--  Parce qu'il faudrait alors inventer un mot de passe, le transmettre, et
--  esperer qu'il soit change. Trois occasions de fuite pour un secret qui ne
--  nous appartient pas. Ici, le mot de passe n'existe qu'au moment ou son
--  proprietaire le tape, et personne d'autre ne l'a jamais vu.
--
--  ON NE STOCKE PAS LE JETON, ON STOCKE SON EMPREINTE
--
--  `jeton_empreinte` est un SHA-256. Le jeton en clair n'existe qu'une fois,
--  dans la reponse HTTP qui suit sa creation — l'ecran l'affiche, l'admin le
--  copie, et il n'est plus jamais lisible nulle part. Une sauvegarde qui
--  fuite ne donne donc aucun compte : on ne peut pas remonter du hachage au
--  lien.
--
--  C'est la meme raison qui fait qu'on ne stocke pas les mots de passe.
--
--  UNE INVITATION N'EST PAS UN COMPTE
--
--  Elle vit dans sa propre table et disparait de la liste des invitations en
--  attente des qu'elle est acceptee. On garde la ligne — savoir QUI a invite
--  QUI et QUAND vaut les quelques octets — mais elle ne donne plus rien.
--
--  Idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS invitation (
    id              BIGSERIAL PRIMARY KEY,

    -- L'adresse decidee par l'admin. Elle est FIGEE : la personne invitee ne
    -- peut pas en changer au moment d'accepter, sinon le lien deviendrait un
    -- droit de creer n'importe quel compte.
    email           TEXT        NOT NULL,

    -- SHA-256 du jeton, en hexadecimal : 64 caracteres, toujours.
    jeton_empreinte CHAR(64)    NOT NULL UNIQUE,

    -- Qui a invite. ON DELETE SET NULL et pas CASCADE : si l'administrateur
    -- disparait un jour, les comptes qu'il a crees ne doivent pas disparaitre
    -- avec lui, et les invitations en attente non plus.
    invite_par      UUID        REFERENCES utilisateur(id) ON DELETE SET NULL,

    cree_le         TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Une invitation qui traine est une porte ouverte. Sept jours : assez
    -- pour une personne en vacances, trop peu pour qu'on l'oublie.
    expire_le       TIMESTAMPTZ NOT NULL,

    -- Rempli au moment de l'acceptation. Non NULL = jeton mort.
    accepte_le      TIMESTAMPTZ,

    -- Le compte ne. ON DELETE SET NULL : supprimer un utilisateur ne doit pas
    -- faire disparaitre la trace de son invitation, et surtout ne doit pas
    -- rendre son ancien jeton reutilisable.
    utilisateur_id  UUID        REFERENCES utilisateur(id) ON DELETE SET NULL
);

-- UNE SEULE INVITATION EN ATTENTE PAR ADRESSE.
--
-- Index PARTIEL : la contrainte ne porte que sur les invitations vivantes.
-- Une adresse deja invitee et acceptee peut etre reinvitee un jour — un
-- compte supprime, par exemple —, alors que deux liens valides en meme temps
-- pour la meme personne sont une confusion pure : elle utilisera le premier
-- qu'elle trouve, l'admin surveillera l'autre.
CREATE UNIQUE INDEX IF NOT EXISTS invitation_en_attente
    ON invitation (lower(email))
    WHERE accepte_le IS NULL;

CREATE INDEX IF NOT EXISTS invitation_par_date
    ON invitation (cree_le DESC);

COMMENT ON COLUMN invitation.jeton_empreinte IS
  'SHA-256 hexadecimal du jeton. Le jeton en clair n''est jamais stocke.';
COMMENT ON COLUMN invitation.email IS
  'Adresse du futur compte, figee a la creation : la personne invitee ne peut pas en changer.';
