-- =====================================================================
--  fitcarnet — jeu d'essai pour un COMPTE ORDINAIRE
--
--  CE FICHIER N'EST PAS JOUÉ AU DÉMARRAGE.
--
--  Il vit dans db/manuel/ pour la même raison que cibles.sql : le dossier
--  db/ est monté dans docker-entrypoint-initdb.d, où PostgreSQL exécute
--  tout .sql à la création de la base. Or ce jeu suppose un compte existant.
--
--  À quoi il sert. Le frigo, l'inventaire et la gestion des aliments sont
--  écrits pour deux sources — Grocy pour l'administrateur, la table
--  « aliment » pour les autres. Ce fichier crée de quoi exercer l'autre :
--  des aliments appartenant au compte d'essai, et du stock.
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

    -- Un compte Grocy ne testerait rien ici : la branche « base » ne
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
    --  Deux aliments par categorie ou presque, pour que le regroupement par
    --  emplacement soit exerce. Valeurs de Table_Ciqual_2025.xlsx, colonne
    --  « Energie, Reglement UE n° 1169/2011 », pour le produit TEL QU'ON LE
    --  PESE (regle 3). Le ratio est celui des deux entrees CIQUAL cru/cuit :
    --  riz 350/155, pates 364/167, poulet 110/141.
    -- ----------------------------------------------------------------
    INSERT INTO aliment (utilisateur_id, nom, categorie, kcal_100, prot_100,
                         gluc_100, lip_100, fibres_100, ratio, source)
    VALUES
        (v_utilisateur, 'Poulet, filet sans peau cru',  'prot', 110,  23.4,  0,    1.5,   0,     0.78, 'manuel'),
        (v_utilisateur, 'Riz blanc, cru',               'fec',  350,  7.02,  77.5, 0.79,  1.53,  2.26, 'manuel'),
        (v_utilisateur, 'Pâtes sèches, standard, crues','fec',  364,  12,    72.7, 1.6,   2.91,  2.18, 'manuel'),
        (v_utilisateur, 'Brocoli, cru',                 'leg',  31.9, 2.9,   2.15, 0.36,  2.6,   1,    'manuel'),
        (v_utilisateur, 'Haricot vert, cru',            'leg',  31.9, 1.83,  4.14, 0.22,  2.7,   1,    'manuel'),
        (v_utilisateur, 'Amande, avec peau',            'ole',  615,  18.8,  9.51, 51.3,  12.5,  1,    'manuel'),
        (v_utilisateur, 'Huile d''olive vierge extra',  'huile',899,  0.25,  0,    99.9,  0,     1,    'manuel'),
        -- Un aliment qu'on reconnait au premier coup d'oeil comme un jeu
        -- d'essai : il verifie le cloisonnement entre comptes.
        (v_utilisateur, 'Skyr d''essai (compte ordinaire)', 'lait', 63, 10.5, 4.0, 0.2, 0, 1, 'manuel')
    ON CONFLICT (utilisateur_id, lower(nom)) DO NOTHING;

    -- ----------------------------------------------------------------
    --  Stock reparti sur trois emplacements, avec des valeurs decimales :
    --  un inventaire sur des multiples de 100 ne prouverait rien de la
    --  saisie « 0,8 ».
    -- ----------------------------------------------------------------
    FOR v_aliment, v_lieu IN
        SELECT a.id,
               CASE a.categorie
                   WHEN 'prot' THEN v_frigo
                   WHEN 'lait' THEN v_frigo
                   WHEN 'leg'  THEN v_congel
                   ELSE v_placard
               END
        FROM   aliment a
        WHERE  a.utilisateur_id = v_utilisateur
        ORDER  BY a.nom
    LOOP
        INSERT INTO stock (utilisateur_id, aliment_id, emplacement_id, quantite, maj_le)
        VALUES (v_utilisateur, v_aliment, v_lieu,
                round((37 + (v_aliment * 53) % 900)::numeric + 0.5, 2), now())
        ON CONFLICT (utilisateur_id, aliment_id, emplacement_id) DO UPDATE
            SET quantite = EXCLUDED.quantite, maj_le = now();
    END LOOP;

    -- Deux aliments laisses a ZERO : ils ne doivent apparaitre que sous le
    -- segment « Tout », et sont les seuls supprimables sans mise a zero.
    UPDATE stock SET quantite = 0
    WHERE  utilisateur_id = v_utilisateur
      AND  aliment_id IN (SELECT id FROM aliment
                          WHERE utilisateur_id = v_utilisateur ORDER BY nom DESC LIMIT 2);

    RAISE NOTICE 'Jeu d''essai posé pour %.', v_email;
END $$;

-- Contrôle : ce que le compte doit voir.
SELECT u.email,
       (SELECT count(*) FROM aliment WHERE utilisateur_id = u.id)    AS aliments_a_moi,
       (SELECT count(*) FROM stock
         WHERE utilisateur_id = u.id AND quantite > 0)               AS en_stock
FROM   utilisateur u
WHERE  u.source_frigo = 'base';
