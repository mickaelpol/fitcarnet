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
--  « aliment » pour les autres. Ce fichier crée de quoi exercer l'autre.
--
--  Il crée des aliments PRIVÉS, copiés depuis les 50 de référence. Une
--  version antérieure posait du stock sur les communs eux-mêmes : depuis
--  que le frigo ne montre que les aliments de l'utilisateur, ces lignes
--  étaient devenues invisibles et le frigo paraissait vide.
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
    --  Ménage : le stock pose sur des aliments COMMUNS n'est plus visible
    --  nulle part depuis que le frigo se limite aux aliments de chacun.
    --  On l'efface plutot que de laisser des lignes fantomes en base.
    -- ----------------------------------------------------------------
    DELETE FROM stock s
    USING  aliment a
    WHERE  s.aliment_id = a.id
      AND  s.utilisateur_id = v_utilisateur
      AND  a.cree_par IS NULL;

    -- ----------------------------------------------------------------
    --  Deux aliments par categorie, copies depuis les communs et devenus
    --  PRIVES. Deux par categorie et non les douze premiers par ordre
    --  alphabetique : sans cela tout tombe dans « fec » et « fruit », donc
    --  dans un seul emplacement, et le regroupement n'est pas exerce.
    -- ----------------------------------------------------------------
    INSERT INTO aliment (nom, categorie, kcal_100, prot_100, gluc_100, lip_100,
                         fibres_100, ratio, etat_reference, source, public, cree_par)
    SELECT t.nom, t.categorie, t.kcal_100, t.prot_100, t.gluc_100, t.lip_100,
           t.fibres_100, t.ratio, t.etat_reference, 'manuel', FALSE, v_utilisateur
    FROM  (SELECT a.*,
                  row_number() OVER (PARTITION BY a.categorie ORDER BY a.nom) AS rang
           FROM   aliment a
           WHERE  a.cree_par IS NULL) t
    WHERE t.rang <= 2
    ON CONFLICT (lower(nom), cree_par) WHERE cree_par IS NOT NULL DO NOTHING;

    -- Un aliment que le catalogue de reference ne contient pas : il verifie
    -- le parcours « creer de zero » et le cloisonnement entre comptes.
    INSERT INTO aliment (nom, categorie, kcal_100, prot_100, gluc_100, lip_100,
                         fibres_100, ratio, etat_reference, source, public, cree_par)
    VALUES ('Skyr d''essai (compte ordinaire)', 'lait', 63, 10.5, 4.0, 0.2,
            0, 1, 'cuit', 'manuel', FALSE, v_utilisateur)
    ON CONFLICT (lower(nom), cree_par) WHERE cree_par IS NOT NULL DO NOTHING;

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
        WHERE  a.cree_par = v_utilisateur
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
                          WHERE cree_par = v_utilisateur ORDER BY nom DESC LIMIT 2);

    RAISE NOTICE 'Jeu d''essai posé pour %.', v_email;
END $$;

-- Contrôle : ce que le compte doit voir.
SELECT u.email,
       (SELECT count(*) FROM aliment WHERE cree_par = u.id)          AS aliments_a_moi,
       (SELECT count(*) FROM stock
         WHERE utilisateur_id = u.id AND quantite > 0)               AS en_stock,
       (SELECT count(*) FROM aliment WHERE cree_par IS NULL)         AS catalogue_de_reference
FROM   utilisateur u
WHERE  u.source_frigo = 'base';
