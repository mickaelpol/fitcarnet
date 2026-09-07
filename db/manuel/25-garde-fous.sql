-- =====================================================================
--  fitcarnet — les garde-fous que la base n'avait pas
--
--  POURQUOI EN BASE ET PAS DANS L'APPLICATION
--
--  Les entites Doctrine portent deja des `Assert\PositiveOrZero`. Ils ne
--  valent que pour le chemin ORM — et ce projet ecrit en SQL direct a cinq
--  endroits au moins : `FrigoBase`, `CuissonsController`, les imports Python
--  `import_catalogue.py` et `import_carnet.py`, et les migrations
--  elles-memes. Chacun contourne la validation sans le savoir.
--
--  Une regle qui protege une valeur nutritionnelle doit vivre la ou la valeur
--  est ecrite. La base est le seul endroit que personne ne contourne.
--
--  CE QU'ON A CONSTATE, ET QUI EST ACCEPTE AUJOURD'HUI :
--
--      aliment : kcal_100 = -350, prot_100 = -20, lip_100 = -3
--      cible   : kcal = -600
--      serie   : reps = -12, poids = -100  ->  1RM estime a -60 kg
--
--  Le controle `aliment_matiere_plausible` (somme <= 100,5) est SATISFAIT par
--  des valeurs negatives : une faute de signe passait les deux garde-fous a
--  la fois. Un import CSV avec un tiret parasite pose `gluc_100 = -75` sur un
--  riz commun, le solveur resout un systeme avec un coefficient negatif, et
--  propose une quantite aberrante sans un mot.
--
--  ON NETTOIE AVANT DE CONTRAINDRE. Une contrainte posee sur des donnees qui
--  la violent echoue — et comme le point d'entree rejoue ce fichier a chaque
--  demarrage, elle arreterait la production. Les UPDATE ci-dessous ne
--  touchent que des valeurs deja fausses.
--
--  ZERO POUR LES COLONNES NOT NULL, NULL POUR LES AUTRES.
--
--  Ce fichier a longtemps ecrit `SET kcal_100 = NULL` sur une colonne NOT
--  NULL. Le nettoyage lui-meme etait donc impossible, et il echouait AVANT
--  DE POSER LE MOINDRE GARDE-FOU : pas seulement celui d'`aliment`, les six.
--  Tant qu'aucune valeur negative n'existait, l'UPDATE ne touchait aucune
--  ligne et personne ne voyait rien. Le jour ou une seule apparaissait — le
--  cas decrit quinze lignes plus haut, donc deja arrive —, `entrypoint-prod.sh`
--  s'arretait sur ON_ERROR_STOP et le conteneur applicatif ne redemarrait plus.
--
--  NULL voudrait dire « on ne sait pas », ce qui serait la verite. Mais ces
--  quatre colonnes d'`aliment` et ces quatre de `cible` l'interdisent, et
--  changer leur nullabilite pour raccommoder une faute de signe couterait plus
--  cher que ca ne vaut. Zero est donc un pis-aller assume : la valeur reste
--  fausse, mais elle est VISIBLE — `src/calcul/plausibilite.ts` signale un
--  aliment a 0 kcal dont les macros ne le sont pas, et la ligne remonte a
--  l'ecran au lieu de bloquer le demarrage.
--
--  Verifie par `db/manuel/verifier-migrations.sh`, qui rejoue tout ce dossier
--  sur une base portant precisement ces valeurs aberrantes.
--
--  Idempotent.
-- =====================================================================

-- ------------------------------------------------------------- aliment

UPDATE aliment SET kcal_100   = 0    WHERE kcal_100   < 0;
UPDATE aliment SET prot_100   = 0    WHERE prot_100   < 0;
UPDATE aliment SET gluc_100   = 0    WHERE gluc_100   < 0;
UPDATE aliment SET lip_100    = 0    WHERE lip_100    < 0;
UPDATE aliment SET fibres_100 = NULL WHERE fibres_100 < 0;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aliment_valeurs_positives') THEN
        ALTER TABLE aliment ADD CONSTRAINT aliment_valeurs_positives CHECK (
            (kcal_100   IS NULL OR kcal_100   >= 0) AND
            (prot_100   IS NULL OR prot_100   >= 0) AND
            (gluc_100   IS NULL OR gluc_100   >= 0) AND
            (lip_100    IS NULL OR lip_100    >= 0) AND
            (fibres_100 IS NULL OR fibres_100 >= 0)
        );
    END IF;
END $$;

-- Un ratio de cuisson nul ou negatif n'a pas de sens et divise par zero dans
-- le calculateur. Le plafond a 10 attrape la virgule oubliee : un ratio de
-- 226 au lieu de 2,26 ferait peser deux grammes de riz.
UPDATE aliment SET ratio = 1 WHERE ratio IS NOT NULL AND (ratio <= 0 OR ratio > 10);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aliment_ratio_borne') THEN
        ALTER TABLE aliment ADD CONSTRAINT aliment_ratio_borne
            CHECK (ratio IS NULL OR (ratio > 0 AND ratio <= 10));
    END IF;
END $$;

-- Les deux pesees d'une mesure de rendement : positives, ou absentes.
UPDATE aliment SET pesee_avant = NULL WHERE pesee_avant IS NOT NULL AND pesee_avant <= 0;
UPDATE aliment SET pesee_apres = NULL WHERE pesee_apres IS NOT NULL AND pesee_apres <= 0;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aliment_pesees_positives') THEN
        ALTER TABLE aliment ADD CONSTRAINT aliment_pesees_positives CHECK (
            (pesee_avant IS NULL OR pesee_avant > 0) AND
            (pesee_apres IS NULL OR pesee_apres > 0)
        );
    END IF;
END $$;

-- --------------------------------------------------------------- cible

UPDATE cible SET kcal = 0    WHERE kcal < 0;
UPDATE cible SET prot = 0    WHERE prot < 0;
UPDATE cible SET gluc = 0    WHERE gluc < 0;
UPDATE cible SET lip  = 0    WHERE lip  < 0;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cible_valeurs_positives') THEN
        ALTER TABLE cible ADD CONSTRAINT cible_valeurs_positives CHECK (
            (kcal IS NULL OR kcal >= 0) AND
            (prot IS NULL OR prot >= 0) AND
            (gluc IS NULL OR gluc >= 0) AND
            (lip  IS NULL OR lip  >= 0)
        );
    END IF;
END $$;

-- --------------------------------------------------------------- stock

-- Une quantite negative en stock voudrait dire qu'on doit des aliments au
-- frigo. Le calculateur, lui, la traite comme une reserve disponible.
UPDATE stock SET quantite = 0 WHERE quantite < 0;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_quantite_positive') THEN
        ALTER TABLE stock ADD CONSTRAINT stock_quantite_positive CHECK (quantite >= 0);
    END IF;
END $$;

-- ------------------------------------------------------- series et modeles

UPDATE serie SET reps     = NULL WHERE reps     < 0;
UPDATE serie SET poids    = NULL WHERE poids    < 0;
UPDATE serie SET secondes = NULL WHERE secondes < 0;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'serie_valeurs_positives') THEN
        ALTER TABLE serie ADD CONSTRAINT serie_valeurs_positives CHECK (
            (reps     IS NULL OR reps     >= 0) AND
            (poids    IS NULL OR poids    >= 0) AND
            (secondes IS NULL OR secondes >= 0)
        );
    END IF;
END $$;

UPDATE modele_serie SET reps_cible     = NULL WHERE reps_cible     < 0;
UPDATE modele_serie SET poids_cible    = NULL WHERE poids_cible    < 0;
UPDATE modele_serie SET secondes_cible = NULL WHERE secondes_cible < 0;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'modele_serie_valeurs_positives') THEN
        ALTER TABLE modele_serie ADD CONSTRAINT modele_serie_valeurs_positives CHECK (
            (reps_cible     IS NULL OR reps_cible     >= 0) AND
            (poids_cible    IS NULL OR poids_cible    >= 0) AND
            (secondes_cible IS NULL OR secondes_cible >= 0)
        );
    END IF;
END $$;

-- ce qui reste de negatif, s'il en reste : zero ligne attendue
SELECT 'valeurs negatives restantes' AS controle,
       (SELECT count(*) FROM aliment WHERE kcal_100 < 0 OR prot_100 < 0
                                        OR gluc_100 < 0 OR lip_100 < 0) AS aliments,
       (SELECT count(*) FROM stock   WHERE quantite < 0)                AS stocks,
       (SELECT count(*) FROM serie   WHERE reps < 0 OR poids < 0)       AS series;
