-- =====================================================================
--  35 — LE STOCK ET SON ALIMENT APPARTIENNENT AU MÊME COMPTE
--
--  17 septembre 2026. Chaque aliment appartient désormais à un compte
--  (`aliment.utilisateur_id NOT NULL`) : la base peut donc garantir elle-même
--  qu'une ligne de stock ne vise que les aliments de son propre compte.
--
--  POURQUOI DANS LA BASE, ET PAS SEULEMENT DANS LE CODE. La faille É1 de
--  septembre 2026 venait d'un chemin d'écriture qui oubliait de vérifier la
--  propriété (`POST /api/mon-frigo/inventaire`, jumeau de `/stock`).
--  `FrigoBase::definirStock` vérifie depuis pour ses trois appelants ; mais
--  `POST /api/stocks` ne tient qu'à la lecture filtrée d'un IRI, et un
--  chemin à venir peut oublier. Une clé étrangère composite est le seul point
--  de passage qu'aucun code ne contourne.
--
--  CE QUE FAIT CE FICHIER, UNE SEULE FOIS :
--    1. une contrainte d'unicité (id, utilisateur_id) sur `aliment`, cible
--       obligatoire d'une clé composite ;
--    2. les lignes de stock qui visent l'aliment d'un AUTRE compte sont
--       retirées — elles ne peuvent exister qu'à la faveur d'É1, et la
--       contrainte ne se poserait pas sur elles ;
--    3. la clé simple `stock_aliment_id_fkey` laisse la place à la clé
--       composite, en `ON DELETE RESTRICT` comme elle.
--
--  Idempotent : chaque étape est gardée par la présence de sa contrainte. La
--  suppression de l'étape 2 ne se rejoue donc jamais une fois la clé posée.
-- =====================================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'aliment'::regclass
                      AND conname = 'aliment_id_utilisateur_unique') THEN
        ALTER TABLE aliment
            ADD CONSTRAINT aliment_id_utilisateur_unique UNIQUE (id, utilisateur_id);
    END IF;
END $$;

DO $$
DECLARE
    retirees INT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'stock'::regclass
                      AND conname = 'stock_aliment_du_meme_compte_fkey') THEN
        DELETE FROM stock s
         USING aliment a
         WHERE s.aliment_id = a.id AND s.utilisateur_id <> a.utilisateur_id;
        GET DIAGNOSTICS retirees = ROW_COUNT;
        IF retirees > 0 THEN
            RAISE NOTICE '35 : % ligne(s) de stock visaient l''aliment d''un autre compte, retirées', retirees;
        END IF;

        ALTER TABLE stock DROP CONSTRAINT IF EXISTS stock_aliment_id_fkey;
        ALTER TABLE stock ADD CONSTRAINT stock_aliment_du_meme_compte_fkey
            FOREIGN KEY (aliment_id, utilisateur_id)
            REFERENCES aliment (id, utilisateur_id) ON DELETE RESTRICT;
    END IF;
END $$;

COMMIT;
