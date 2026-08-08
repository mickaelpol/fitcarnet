-- =====================================================================
--  fitcarnet — les sessions ne se terminent plus toutes seules
--
--  Le probleme. Le jeton JWT durait 24 h. Passe ce delai, l'application
--  affichait « Expired JWT Token » en rouge, gardait le jeton perime dans
--  le coffre du telephone, et se croyait connectee : la navigation
--  fonctionnait, aucun contenu ne chargeait. Il fallait se deconnecter et
--  se reconnecter a la main, tous les jours.
--
--  La correction. Un JWT ne se revoque pas — il vaut jusqu'a son echeance,
--  meme apres une deconnexion. On le rend donc COURT (1 h), et on ajoute a
--  cote un jeton de rafraichissement qui, lui, vit en base : revocable,
--  echeance repoussee a chaque usage. Une session se termine alors sur un
--  clic « Se deconnecter », et sur rien d'autre.
--
--  Ce que la table ne contient PAS : le jeton lui-meme. Seulement son
--  SHA-256, sur 64 caracteres hexadecimaux. Une fuite de la base ne livre
--  donc aucune session utilisable — le jeton en clair n'existe que dans la
--  reponse HTTP qui le cree et dans le coffre du telephone.
--
--  Idempotent : rejouable sans effet sur une base deja a jour.
-- =====================================================================

CREATE TABLE IF NOT EXISTS jeton_rafraichissement (
    id             UUID        PRIMARY KEY,
    empreinte      VARCHAR(64) NOT NULL UNIQUE,
    utilisateur_id UUID        NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
    expire_le      TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
    cree_le        TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL
);

-- Supprimer un compte doit emporter ses sessions : c'est le ON DELETE
-- CASCADE ci-dessus qui s'en charge, et cet index qui le rend rapide.
CREATE INDEX IF NOT EXISTS idx_jeton_rafraichissement_utilisateur
    ON jeton_rafraichissement (utilisateur_id);

-- Le balayage des jetons perimes passe par cette colonne.
CREATE INDEX IF NOT EXISTS idx_jeton_rafraichissement_expire
    ON jeton_rafraichissement (expire_le);

COMMENT ON TABLE jeton_rafraichissement IS
    'Sessions ouvertes. Une ligne par connexion, supprimee a la deconnexion.';
COMMENT ON COLUMN jeton_rafraichissement.empreinte IS
    'SHA-256 du jeton. Le jeton en clair n''est jamais stocke.';
COMMENT ON COLUMN jeton_rafraichissement.expire_le IS
    'Repousse a chaque rafraichissement : une application qui sert ne deconnecte pas.';

-- Controle : doit afficher les trois colonnes et les deux index.
SELECT column_name, data_type
FROM   information_schema.columns
WHERE  table_name = 'jeton_rafraichissement'
ORDER  BY ordinal_position;

SELECT indexname
FROM   pg_indexes
WHERE  tablename = 'jeton_rafraichissement'
ORDER  BY indexname;
