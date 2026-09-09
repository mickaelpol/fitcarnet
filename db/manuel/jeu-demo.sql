-- =====================================================================
--  fitcarnet — JEU DE DÉMONSTRATION, pour montrer le produit
--
--  CE FICHIER N'EST PAS JOUÉ AU DÉMARRAGE. Ni `installer.sh` ni
--  `entrypoint-prod.sh` ne le nomment, et leur liste est ÉCRITE, pas triée :
--  ce qui n'y figure pas n'est jamais rejoué. C'est la même règle que pour
--  `jeu-essai.sql` et `audit-catalogue.sql`.
--
--  CE QU'IL AJOUTE À `jeu-essai.sql`, ET POURQUOI.
--
--  Le jeu d'essai remplit le frigo — des aliments privés et du stock, de quoi
--  exercer l'inventaire. Il ne raconte aucune HISTOIRE : pas de cible à
--  atteindre, pas une séance, pas un plan de repas. Or une démonstration se
--  regarde dans le temps : une charge qui monte semaine après semaine dit ce
--  qu'une capture d'écran isolée ne dira jamais.
--
--  Ce fichier pose donc neuf semaines de vie du compte :
--    - quatre cibles nutritionnelles, une par moment de repas ;
--    - trois programmes (Push, Pull, Legs) avec leurs séries prescrites ;
--    - neuf séances hebdomadaires, dont une progression suivie au développé
--      (40 kg → 60 kg en neuf semaines, à répétitions constantes) : c'est elle
--      qui fait vivre la courbe de 1RM et la table des paliers ;
--    - deux plans de repas au format v3, dont un déjà cuisiné.
--
--  LES CHIFFRES SONT PLAUSIBLES, PAS ALÉATOIRES. Une progression de 2,5 kg
--  toutes les deux semaines est ce qu'un pratiquant obtient réellement ; une
--  courbe tirée au hasard se voit tout de suite et décrédibilise la démo.
--
--  Prérequis — le compte, sans --admin ni --grocy, puis le frigo :
--    docker compose -f compose.dev.yml exec app php bin/console \
--      fitcarnet:creer-utilisateur demo@fitcarnet.local "Démo fitcarnet"
--    sed 's/essai@/demo@/' db/manuel/jeu-essai.sql | docker compose -f compose.dev.yml exec -T db psql -U fitcarnet -d fitcarnet
--
--  Puis :
--    docker compose -f compose.dev.yml exec -T db psql -U fitcarnet -d fitcarnet < db/manuel/jeu-demo.sql
--
--  IL EST REJOUABLE, ET IL EFFACE AVANT DE POSER — séances, modèles, plans,
--  cibles du compte visé. Un garde-fou refuse donc un compte qui a déjà des
--  séances : sur une base de production, une adresse mal recopiée détruirait un
--  historique réel. Pour repasser sur un compte de démonstration déjà garni :
--  `psql -v ecraser=oui`. Il ne touche ni au frigo
--  ni aux aliments : c'est le domaine du jeu d'essai.
-- =====================================================================

DO $$
DECLARE
    v_email        TEXT := 'demo@fitcarnet.local';   -- <<< à adapter
    v_utilisateur  UUID;
    v_existant     INT;
    v_modele_push  BIGINT;
    v_modele_pull  BIGINT;
    v_modele_legs  BIGINT;
    v_seance       BIGINT;
    v_sx           BIGINT;
    v_me           BIGINT;
    v_semaine      INT;
    v_charge       NUMERIC;
    v_date         DATE;

    -- Le catalogue commun porte des noms français : on les résout plutôt que
    -- d'écrire des identifiants, qui changent d'une base à l'autre.
    v_ex_developpe BIGINT;
    v_ex_ecartes   BIGINT;
    v_ex_pompes    BIGINT;
    v_ex_rowing    BIGINT;
    v_ex_traction  BIGINT;
    v_ex_tirage    BIGINT;
    v_ex_squat     BIGINT;
    v_ex_fente     BIGINT;
    v_ex_souleve   BIGINT;
BEGIN
    SELECT id INTO v_utilisateur FROM utilisateur WHERE lower(email) = lower(v_email);
    IF v_utilisateur IS NULL THEN
        RAISE EXCEPTION 'Aucun compte pour « % ». Crée-le d''abord, sans --admin ni --grocy.', v_email;
    END IF;

    -- ----------------------------------------------------------------
    --  LE GARDE-FOU. CE FICHIER EFFACE AVANT DE POSER.
    --
    --  Il supprime les seances, les modeles, les plans et les cibles du
    --  compte vise. Sur une base de PRODUCTION, une adresse mal recopiee
    --  en tete de ce fichier detruirait des mois d'historique reel — et
    --  personne ne s'en apercevrait avant d'ouvrir l'application.
    --
    --  On refuse donc de toucher a un compte qui a deja vecu. Pour repasser
    --  sur un compte de demonstration deja garni, c'est un geste conscient :
    --      psql -v ecraser=oui -f db/manuel/jeu-demo.sql
    -- ----------------------------------------------------------------
    SELECT count(*) INTO v_existant FROM seance WHERE utilisateur_id = v_utilisateur;

    IF v_existant > 0 AND current_setting('psql.ecraser', TRUE) IS DISTINCT FROM 'oui' THEN
        RAISE EXCEPTION
            'Le compte « % » a deja % seance(s). Ce fichier les EFFACERAIT. '
            'Si c''est bien un compte de demonstration, relance avec : psql -v ecraser=oui',
            v_email, v_existant;
    END IF;

    SELECT id INTO v_ex_developpe FROM exercice WHERE nom_fr ILIKE '%chest press%' OR nom ILIKE '%chest press%' LIMIT 1;
    SELECT id INTO v_ex_ecartes   FROM exercice WHERE coalesce(nom_fr, nom) ILIKE 'écartés couché%' LIMIT 1;
    SELECT id INTO v_ex_pompes    FROM exercice WHERE coalesce(nom_fr, nom) ILIKE 'pompes%' LIMIT 1;
    SELECT id INTO v_ex_rowing    FROM exercice WHERE coalesce(nom_fr, nom) ILIKE 'rowing%' LIMIT 1;
    SELECT id INTO v_ex_traction  FROM exercice WHERE coalesce(nom_fr, nom) ILIKE 'traction prise neutre%' LIMIT 1;
    SELECT id INTO v_ex_tirage    FROM exercice WHERE coalesce(nom_fr, nom) ILIKE 'tirage vertical%' LIMIT 1;
    SELECT id INTO v_ex_squat     FROM exercice WHERE coalesce(nom_fr, nom) ILIKE 'squat avant%' LIMIT 1;
    SELECT id INTO v_ex_fente     FROM exercice WHERE coalesce(nom_fr, nom) ILIKE 'fente bulgare%' LIMIT 1;
    SELECT id INTO v_ex_souleve   FROM exercice WHERE coalesce(nom_fr, nom) ILIKE 'soulevé de terre%' LIMIT 1;

    IF v_ex_developpe IS NULL OR v_ex_rowing IS NULL OR v_ex_squat IS NULL THEN
        RAISE EXCEPTION 'Catalogue d''exercices incomplet : joue d''abord db/03-exercices.sql ou installer.sh.';
    END IF;

    -- ----------------------------------------------------------------
    --  Rejouable : on efface ce que CE fichier avait posé, rien d'autre.
    --  Les cascades font le reste (séries, exercices de séance, de modèle).
    -- ----------------------------------------------------------------
    DELETE FROM seance     WHERE utilisateur_id = v_utilisateur;
    DELETE FROM modele     WHERE utilisateur_id = v_utilisateur;
    DELETE FROM plan_repas WHERE utilisateur_id = v_utilisateur;
    DELETE FROM cible      WHERE utilisateur_id = v_utilisateur;

    -- ----------------------------------------------------------------
    --  LES CIBLES, UNE PAR MOMENT DE REPAS.
    --
    --  Total : 2 400 kcal, 165 g de protéines. Réparti 25 / 35 / 10 / 30 —
    --  un petit-déjeuner correct, un midi qui porte l'entraînement, une
    --  collation de 16 h, un soir plus léger.
    --
    --  `glucides_totaux` à TRUE : convention européenne, les fibres sont
    --  comptées à part et à 2 kcal/g. Voir la règle 4 du projet.
    -- ----------------------------------------------------------------
    INSERT INTO cible (utilisateur_id, repas, kcal, prot, gluc, lip, glucides_totaux) VALUES
        (v_utilisateur, 'R1',  600, 40,  65, 18, TRUE),
        (v_utilisateur, 'R2',  840, 58,  90, 26, TRUE),
        (v_utilisateur, 'R3',  240, 17,  26,  7, TRUE),
        (v_utilisateur, 'R4',  720, 50,  78, 22, TRUE);

    -- ----------------------------------------------------------------
    --  TROIS PROGRAMMES. Le découpage Push / Pull / Legs est celui que la
    --  base impose (contrainte CHECK sur `type`).
    -- ----------------------------------------------------------------
    INSERT INTO modele (utilisateur_id, nom, type, partage)
    VALUES (v_utilisateur, 'Haut du corps — poussée', 'Push', FALSE) RETURNING id INTO v_modele_push;

    INSERT INTO modele_exercice (modele_id, exercice_id, ordre, mode, notes)
    VALUES (v_modele_push, v_ex_developpe, 1, 'charge', 'Barre guidée, amplitude complète') RETURNING id INTO v_me;
    INSERT INTO modele_serie (modele_exercice_id, ordre, reps_cible, poids_cible) VALUES
        (v_me, 1, 8, 55), (v_me, 2, 8, 55), (v_me, 3, 8, 55), (v_me, 4, 6, 60);

    INSERT INTO modele_exercice (modele_id, exercice_id, ordre, mode, notes)
    VALUES (v_modele_push, v_ex_ecartes, 2, 'charge', NULL) RETURNING id INTO v_me;
    INSERT INTO modele_serie (modele_exercice_id, ordre, reps_cible, poids_cible) VALUES
        (v_me, 1, 12, 14), (v_me, 2, 12, 14), (v_me, 3, 12, 14);

    INSERT INTO modele_exercice (modele_id, exercice_id, ordre, mode, notes)
    VALUES (v_modele_push, v_ex_pompes, 3, 'iso', 'À l''échec, deux séries') RETURNING id INTO v_me;
    INSERT INTO modele_serie (modele_exercice_id, ordre, reps_cible, secondes_cible) VALUES
        (v_me, 1, NULL, 45), (v_me, 2, NULL, 45);

    INSERT INTO modele (utilisateur_id, nom, type, partage)
    VALUES (v_utilisateur, 'Haut du corps — tirage', 'Pull', FALSE) RETURNING id INTO v_modele_pull;

    INSERT INTO modele_exercice (modele_id, exercice_id, ordre, mode, notes)
    VALUES (v_modele_pull, v_ex_rowing, 1, 'charge', NULL) RETURNING id INTO v_me;
    INSERT INTO modele_serie (modele_exercice_id, ordre, reps_cible, poids_cible) VALUES
        (v_me, 1, 10, 45), (v_me, 2, 10, 45), (v_me, 3, 10, 45);

    IF v_ex_traction IS NOT NULL THEN
        INSERT INTO modele_exercice (modele_id, exercice_id, ordre, mode, notes)
        VALUES (v_modele_pull, v_ex_traction, 2, 'charge', 'Lest si plus de 10 répétitions') RETURNING id INTO v_me;
        INSERT INTO modele_serie (modele_exercice_id, ordre, reps_cible, poids_cible) VALUES
            (v_me, 1, 8, 0), (v_me, 2, 8, 0), (v_me, 3, 6, 5);
    END IF;

    IF v_ex_tirage IS NOT NULL THEN
        INSERT INTO modele_exercice (modele_id, exercice_id, ordre, mode, notes)
        VALUES (v_modele_pull, v_ex_tirage, 3, 'charge', NULL) RETURNING id INTO v_me;
        INSERT INTO modele_serie (modele_exercice_id, ordre, reps_cible, poids_cible) VALUES
            (v_me, 1, 12, 50), (v_me, 2, 12, 50), (v_me, 3, 12, 50);
    END IF;

    INSERT INTO modele (utilisateur_id, nom, type, partage)
    VALUES (v_utilisateur, 'Bas du corps', 'Legs', FALSE) RETURNING id INTO v_modele_legs;

    INSERT INTO modele_exercice (modele_id, exercice_id, ordre, mode, notes)
    VALUES (v_modele_legs, v_ex_squat, 1, 'charge', NULL) RETURNING id INTO v_me;
    INSERT INTO modele_serie (modele_exercice_id, ordre, reps_cible, poids_cible) VALUES
        (v_me, 1, 8, 70), (v_me, 2, 8, 70), (v_me, 3, 8, 70);

    IF v_ex_fente IS NOT NULL THEN
        INSERT INTO modele_exercice (modele_id, exercice_id, ordre, mode, notes)
        VALUES (v_modele_legs, v_ex_fente, 2, 'charge', 'Par jambe') RETURNING id INTO v_me;
        INSERT INTO modele_serie (modele_exercice_id, ordre, reps_cible, poids_cible) VALUES
            (v_me, 1, 12, 16), (v_me, 2, 12, 16), (v_me, 3, 12, 16);
    END IF;

    -- ----------------------------------------------------------------
    --  NEUF SEMAINES DE SÉANCES.
    --
    --  La progression est portée par le développé : 40 kg semaine 1, puis
    --  +2,5 kg toutes les deux semaines, à 8 répétitions constantes. Epley
    --  fait alors passer le 1RM estimé de 50,7 kg à 63,3 kg — une courbe qui
    --  monte sans être invraisemblable, et des paliers qui bougent assez pour
    --  que la table des charges ait quelque chose à montrer.
    --
    --  Les séries ne sont pas toutes réussies : la quatrième tombe souvent
    --  une répétition sous la cible. Un carnet où tout est parfait ne
    --  ressemble à aucun carnet réel.
    -- ----------------------------------------------------------------
    FOR v_semaine IN 0..8 LOOP
        v_date   := (CURRENT_DATE - INTERVAL '1 day' * (7 * (8 - v_semaine) + 2))::date;
        v_charge := 40 + 2.5 * floor(v_semaine / 2.0);

        -- ---- séance de poussée, celle qui porte la progression ----
        INSERT INTO seance (utilisateur_id, date, type, modele_id)
        VALUES (v_utilisateur, v_date, 'Push', v_modele_push) RETURNING id INTO v_seance;

        INSERT INTO seance_exercice (seance_id, exercice_id, ordre, mode, notes)
        VALUES (v_seance, v_ex_developpe, 1, 'charge',
                CASE WHEN v_semaine = 8 THEN 'Barre qui monte enfin sans à-coup' ELSE NULL END)
        RETURNING id INTO v_sx;
        INSERT INTO serie (seance_exercice_id, ordre, reps, poids, faite, reps_cible, poids_cible) VALUES
            (v_sx, 1, 8, v_charge, TRUE, 8, v_charge),
            (v_sx, 2, 8, v_charge, TRUE, 8, v_charge),
            (v_sx, 3, 8, v_charge, TRUE, 8, v_charge),
            (v_sx, 4, CASE WHEN v_semaine % 3 = 2 THEN 6 ELSE 7 END, v_charge, TRUE, 8, v_charge);

        INSERT INTO seance_exercice (seance_id, exercice_id, ordre, mode)
        VALUES (v_seance, v_ex_ecartes, 2, 'charge') RETURNING id INTO v_sx;
        INSERT INTO serie (seance_exercice_id, ordre, reps, poids, faite, reps_cible, poids_cible) VALUES
            (v_sx, 1, 12, 12 + floor(v_semaine / 3.0), TRUE, 12, 14),
            (v_sx, 2, 12, 12 + floor(v_semaine / 3.0), TRUE, 12, 14),
            (v_sx, 3, 11, 12 + floor(v_semaine / 3.0), TRUE, 12, 14);

        INSERT INTO seance_exercice (seance_id, exercice_id, ordre, mode, secondes_total)
        VALUES (v_seance, v_ex_pompes, 3, 'iso', 90) RETURNING id INTO v_sx;
        INSERT INTO serie (seance_exercice_id, ordre, secondes, faite, secondes_cible) VALUES
            (v_sx, 1, 45 + v_semaine, TRUE, 45),
            (v_sx, 2, 40 + v_semaine, TRUE, 45);

        -- ---- une séance de tirage, deux jours plus tard ----
        INSERT INTO seance (utilisateur_id, date, type, modele_id)
        VALUES (v_utilisateur, v_date + 2, 'Pull', v_modele_pull) RETURNING id INTO v_seance;

        INSERT INTO seance_exercice (seance_id, exercice_id, ordre, mode)
        VALUES (v_seance, v_ex_rowing, 1, 'charge') RETURNING id INTO v_sx;
        INSERT INTO serie (seance_exercice_id, ordre, reps, poids, faite, reps_cible, poids_cible) VALUES
            (v_sx, 1, 10, 40 + 1.25 * v_semaine, TRUE, 10, 45),
            (v_sx, 2, 10, 40 + 1.25 * v_semaine, TRUE, 10, 45),
            (v_sx, 3,  9, 40 + 1.25 * v_semaine, TRUE, 10, 45);

        -- ---- et le bas du corps une semaine sur deux ----
        IF v_semaine % 2 = 0 THEN
            INSERT INTO seance (utilisateur_id, date, type, modele_id)
            VALUES (v_utilisateur, v_date + 4, 'Legs', v_modele_legs) RETURNING id INTO v_seance;

            INSERT INTO seance_exercice (seance_id, exercice_id, ordre, mode)
            VALUES (v_seance, v_ex_squat, 1, 'charge') RETURNING id INTO v_sx;
            INSERT INTO serie (seance_exercice_id, ordre, reps, poids, faite, reps_cible, poids_cible) VALUES
                (v_sx, 1, 8, 60 + 2.5 * v_semaine, TRUE, 8, 70),
                (v_sx, 2, 8, 60 + 2.5 * v_semaine, TRUE, 8, 70),
                (v_sx, 3, 8, 60 + 2.5 * v_semaine, TRUE, 8, 70);
        END IF;
    END LOOP;

    -- ----------------------------------------------------------------
    --  DEUX PLANS DE REPAS, AU FORMAT v3.
    --
    --  Un instantané, pas une recette : des noms et des grammes, jamais des
    --  identifiants — sauf `consomme`, qui désigne les lignes de frigo à
    --  décrémenter et doit donc les nommer par leur id.
    --
    --  Le premier est déjà cuisiné (`cuisine_le` renseigné) : c'est lui qui
    --  montre le bouton « J'ai cuisiné » dans son état d'après.
    -- ----------------------------------------------------------------
    INSERT INTO plan_repas (utilisateur_id, libelle, cree_le, cuisine_le, contenu)
    VALUES (
        v_utilisateur,
        'Batch cooking du dimanche',
        now() - INTERVAL '3 days',
        now() - INTERVAL '3 days' + INTERVAL '2 hours',
        jsonb_build_object(
            'version', 3,
            'courses', jsonb_build_array(
                jsonb_build_object('nom', 'Blanc de poulet', 'categorie', 'viande', 'grammes', 900),
                jsonb_build_object('nom', 'Riz basmati',     'categorie', 'fec',    'grammes', 450),
                jsonb_build_object('nom', 'Brocoli',         'categorie', 'legume', 'grammes', 800),
                jsonb_build_object('nom', 'Huile d''olive',  'categorie', 'huile',  'grammes', 45)),
            'fournees', jsonb_build_array(
                jsonb_build_object(
                    'libelle', 'Four — 40 min à 180 °C',
                    'lignes', jsonb_build_array(
                        jsonb_build_object('nom', 'Blanc de poulet', 'categorie', 'viande', 'aCuire', 900),
                        jsonb_build_object('nom', 'Brocoli',         'categorie', 'legume', 'aCuire', 800))),
                jsonb_build_object(
                    'libelle', 'Casserole — riz',
                    'lignes', jsonb_build_array(
                        jsonb_build_object('nom', 'Riz basmati', 'categorie', 'fec', 'aCuire', 450)))),
            'boites', jsonb_build_array(
                jsonb_build_object(
                    'titre', 'Lundi · Midi', 'repas', 'R2', 'convives', 1,
                    'cuits', jsonb_build_array(
                        jsonb_build_object('nom', 'Blanc de poulet', 'categorie', 'viande', 'assiette', 220, 'parPersonne', 220),
                        jsonb_build_object('nom', 'Riz basmati',     'categorie', 'fec',    'assiette', 110, 'parPersonne', 110)),
                    'crus', jsonb_build_array(
                        jsonb_build_object('nom', 'Huile d''olive', 'categorie', 'huile', 'assiette', 11, 'parPersonne', 11))),
                jsonb_build_object(
                    'titre', 'Mardi · Midi', 'repas', 'R2', 'convives', 1,
                    'cuits', jsonb_build_array(
                        jsonb_build_object('nom', 'Blanc de poulet', 'categorie', 'viande', 'assiette', 220, 'parPersonne', 220),
                        jsonb_build_object('nom', 'Brocoli',         'categorie', 'legume', 'assiette', 260, 'parPersonne', 260)),
                    'crus', jsonb_build_array())),
            'consomme', jsonb_build_array())
    );

    INSERT INTO plan_repas (utilisateur_id, libelle, cree_le, cuisine_le, contenu)
    VALUES (
        v_utilisateur,
        'Repas de ce soir',
        now() - INTERVAL '4 hours',
        NULL,
        jsonb_build_object(
            'version', 3,
            'courses', jsonb_build_array(
                jsonb_build_object('nom', 'Saumon',       'categorie', 'poisson', 'grammes', 180),
                jsonb_build_object('nom', 'Patate douce', 'categorie', 'fec',     'grammes', 250)),
            'fournees', jsonb_build_array(
                jsonb_build_object(
                    'libelle', 'Poêle — 12 min',
                    'lignes', jsonb_build_array(
                        jsonb_build_object('nom', 'Saumon', 'categorie', 'poisson', 'aCuire', 180)))),
            'boites', jsonb_build_array(
                jsonb_build_object(
                    'titre', 'Aujourd''hui · Soir', 'repas', 'R4', 'convives', 1,
                    'cuits', jsonb_build_array(
                        jsonb_build_object('nom', 'Saumon',       'categorie', 'poisson', 'assiette', 180, 'parPersonne', 180),
                        jsonb_build_object('nom', 'Patate douce', 'categorie', 'fec',     'assiette', 250, 'parPersonne', 250)),
                    'crus', jsonb_build_array())),
            'consomme', jsonb_build_array())
    );

    RAISE NOTICE 'Jeu de démonstration posé pour %', v_email;
END $$;

-- Ce qu'on vient de poser, pour le vérifier d'un coup d'œil.
SELECT u.email,
       (SELECT count(*) FROM cible      c WHERE c.utilisateur_id = u.id) AS cibles,
       (SELECT count(*) FROM modele     m WHERE m.utilisateur_id = u.id) AS programmes,
       (SELECT count(*) FROM seance     s WHERE s.utilisateur_id = u.id) AS seances,
       (SELECT count(*) FROM serie      x
          JOIN seance_exercice se ON se.id = x.seance_exercice_id
          JOIN seance sc ON sc.id = se.seance_id
         WHERE sc.utilisateur_id = u.id)                                 AS series,
       (SELECT count(*) FROM plan_repas p WHERE p.utilisateur_id = u.id) AS plans
FROM   utilisateur u
WHERE  lower(u.email) = lower('demo@fitcarnet.local');
