-- =====================================================================
--  fitcarnet — jeu d'essai pour un COMPTE ORDINAIRE
--
--  CE FICHIER N'EST PAS JOUÉ AU DÉMARRAGE.
--
--  Il vit dans db/manuel/ pour la même raison que cibles.sql : le dossier
--  db/ est monté dans docker-entrypoint-initdb.d, où PostgreSQL exécute
--  tout .sql à la création de la base. Or ce jeu suppose un compte existant.
--
--  À quoi il sert. Le frigo, l'inventaire et le stock sont écrits pour deux
--  sources — Grocy pour l'administrateur, la table « aliment » pour les
--  autres — mais seule la branche Grocy a été éprouvée. Ce fichier crée de
--  quoi exercer l'autre pour de bon.
--
--  Avant de le jouer, crée le compte SANS --admin ni --grocy :
--    docker compose -f compose.dev.yml exec app php bin/console \
--      fitcarnet:creer-utilisateur essai@fitcarnet.local "Compte d'essai"
--
--  Puis :
--    docker compose -f compose.dev.yml exec -T db \
--      psql -U fitcarnet -d fitcarnet < db/manuel/jeu-essai.sql
--
--  Idempotent : relancer remet les quantités aux valeurs ci-dessous et
--  n'ajoute aucun doublon.
-- =====================================================================

DO $$
DECLARE
    v_utilisateur UUID;
    v_email       TEXT := 'essai@fitcarnet.local';   -- <<< à adapter
    v_frigo       SMALLINT;
    v_placard     SMALLINT;
    v_congel      SMALLINT;
    v_aliment     BIGINT;
    v_lieu        SMALLINT;
BEGIN
    SELECT id INTO v_utilisateur FROM utilisateur WHERE lower(email) = lower(v_email);

    IF v_utilisateur IS NULL THEN
        RAISE EXCEPTION 'Aucun compte pour « % ». Crée-le d''abord, sans --admin ni --grocy.', v_email;
    END IF;

    -- Un compte de Grocy ne testerait rien ici : la branche « base » ne
    -- s'exécute que pour source_frigo = 'base'.
    IF (SELECT source_frigo FROM utilisateur WHERE id = v_utilisateur) <> 'base' THEN
        RAISE EXCEPTION 'Le compte « % » lit Grocy. Ce jeu vise un compte ordinaire.', v_email;
    END IF;

    SELECT id INTO v_frigo   FROM emplacement ORDER BY ordre, id LIMIT 1;
    SELECT id INTO v_placard FROM emplacement WHERE lower(libelle) LIKE 'placard%' LIMIT 1;
    SELECT id INTO v_congel  FROM emplacement WHERE lower(libelle) LIKE 'cong%'    LIMIT 1;

    v_placard := coalesce(v_placard, v_frigo);
    v_congel  := coalesce(v_congel,  v_frigo);

    -- ----------------------------------------------------------------
    --  Un aliment PRIVÉ, pour vérifier le cloisonnement.
    --  Il ne doit apparaître que pour ce compte : ni dans le frigo des
    --  autres, ni dans /api/aliments vu par quelqu'un d'autre.
    -- ----------------------------------------------------------------
    INSERT INTO aliment (nom, categorie, kcal_100, prot_100, gluc_100, lip_100,
                         fibres_100, ratio, etat_reference, source, public, cree_par)
    VALUES ('Skyr d''essai (compte ordinaire)', 'lait', 63, 10.5, 4.0, 0.2,
            0, 1, 'cuit', 'manuel', FALSE, v_utilisateur)
    ON CONFLICT (nom) DO UPDATE
        SET cree_par = EXCLUDED.cree_par,
            public   = FALSE;

    -- ----------------------------------------------------------------
    --  Stock réparti sur trois emplacements, avec des cas qui comptent :
    --   · une décimale, pour la saisie « 0,8 » ;
    --   · un aliment à zéro, visible seulement sous « Tout » ;
    --   · un aliment commun ET un aliment privé, pour voir les deux.
    -- ----------------------------------------------------------------
    -- Deux aliments par categorie, et non les douze premiers par ordre
    -- alphabetique : sans cela tout tombe dans « fec » et « fruit », donc
    -- dans un seul emplacement, et le regroupement de l'ecran n'est pas
    -- exerce du tout.
    FOR v_aliment, v_lieu IN
        SELECT t.id,
               CASE t.categorie
                   WHEN 'prot' THEN v_frigo
                   WHEN 'lait' THEN v_frigo
                   WHEN 'leg'  THEN v_congel
                   ELSE v_placard
               END
        FROM  (SELECT a.id, a.categorie,
                      row_number() OVER (PARTITION BY a.categorie ORDER BY a.nom) AS rang
               FROM   aliment a
               WHERE  a.cree_par IS NULL) t
        WHERE t.rang <= 2
    LOOP
        INSERT INTO stock (utilisateur_id, aliment_id, emplacement_id, quantite, maj_le)
        VALUES (v_utilisateur, v_aliment, v_lieu,
                -- des valeurs variées plutôt que rondes : un inventaire sur
                -- des multiples de 100 ne prouverait rien
                round((37 + (v_aliment * 53) % 900)::numeric + 0.5, 2), now())
        ON CONFLICT (utilisateur_id, aliment_id, emplacement_id) DO UPDATE
            SET quantite = EXCLUDED.quantite, maj_le = now();
    END LOOP;

    -- L'aliment privé, en stock lui aussi.
    SELECT id INTO v_aliment FROM aliment WHERE nom = 'Skyr d''essai (compte ordinaire)';
    INSERT INTO stock (utilisateur_id, aliment_id, emplacement_id, quantite, maj_le)
    VALUES (v_utilisateur, v_aliment, v_frigo, 412.5, now())
    ON CONFLICT (utilisateur_id, aliment_id, emplacement_id) DO UPDATE
        SET quantite = EXCLUDED.quantite, maj_le = now();

    -- Les aliments non servis restent à zéro : ils n'apparaîtront que sous
    -- le segment « Tout », ce qui est précisément ce qu'il faut vérifier.

    RAISE NOTICE 'Jeu d''essai posé pour %.', v_email;
END $$;

-- Contrôle : ce que le compte doit voir.
SELECT u.email,
       count(*) FILTER (WHERE s.quantite > 0)                AS en_stock,
       count(*)                                              AS lignes_stock,
       (SELECT count(*) FROM aliment
         WHERE cree_par IS NULL OR cree_par = u.id)          AS aliments_visibles,
       (SELECT count(*) FROM aliment WHERE cree_par = u.id)  AS aliments_prives
FROM   utilisateur u
LEFT   JOIN stock s ON s.utilisateur_id = u.id
WHERE  u.source_frigo = 'base'
GROUP  BY u.email, u.id;
