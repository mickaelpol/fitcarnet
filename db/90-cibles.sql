-- =====================================================================
--  fitcarnet — objectifs macro par repas
--
--  Adapte l'adresse e-mail et les valeurs, puis exécute :
--    docker compose -f compose.dev.yml exec -T db \
--      psql -U fitcarnet -d fitcarnet < db/03-cibles.sql
--
--  Idempotent : relancer le script met à jour les valeurs existantes.
-- =====================================================================

DO $$
DECLARE
    v_utilisateur UUID;
    v_email       TEXT := 'mickael@mickael-pol.fr';   -- <<< à adapter
BEGIN
    SELECT id INTO v_utilisateur FROM utilisateur WHERE lower(email) = lower(v_email);

    IF v_utilisateur IS NULL THEN
        RAISE EXCEPTION 'Aucun compte pour « % ». Vérifie l''adresse.', v_email;
    END IF;

    -- R1 matin · R2 midi · R3 collation 16 h · R4 soir
    INSERT INTO cible (utilisateur_id, repas, kcal, prot, gluc, lip) VALUES
        (v_utilisateur, 'R1', 578.6, 26.8, 64.7, 25.9),
        (v_utilisateur, 'R2', 661.9, 42.8, 61.8, 25.8),
        (v_utilisateur, 'R3', 591.7, 57.3, 51.6, 16.4),
        (v_utilisateur, 'R4', 551.8, 30.1, 80.3, 15.4)
    ON CONFLICT (utilisateur_id, repas) DO UPDATE
        SET kcal = EXCLUDED.kcal,
            prot = EXCLUDED.prot,
            gluc = EXCLUDED.gluc,
            lip  = EXCLUDED.lip;

    RAISE NOTICE 'Objectifs enregistrés pour %.', v_email;
END $$;

-- Contrôle : les kcal annoncées correspondent-elles aux macros ?
-- Un écart signale une consigne incohérente, pas une erreur de saisie.
SELECT  repas,
        kcal                                   AS kcal_annoncees,
        ROUND(4 * prot + 4 * gluc + 9 * lip, 1) AS kcal_des_macros,
        ROUND(kcal - (4 * prot + 4 * gluc + 9 * lip), 1) AS ecart
FROM    cible
ORDER BY repas;
