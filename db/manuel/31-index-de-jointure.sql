-- =====================================================================
--  LES INDEX DE CLÉ ÉTRANGÈRE QUI MANQUAIENT SUR LES CHEMINS CHAUDS
-- =====================================================================
--
--  CONSTAT 11 DU RAPPORT « DONNÉES ET INFRASTRUCTURE », 7 septembre 2026.
--
--  PostgreSQL n'indexe pas les clés étrangères tout seul, contrairement à
--  MySQL. Dix colonnes en manquaient. On n'en crée que CINQ, et le choix est
--  délibéré : `28-muscle-cible-filtrable.sql` rappelle qu'« un index que
--  personne n'interroge n'est pas neutre » — il coûte à chaque écriture, et
--  encombre les décisions du planificateur. Ceux-ci sont interrogés à chaque
--  lecture ou à chaque suppression.
--
--  CE QU'ON INDEXE, ET POURQUOI CELUI-LÀ
--
--  modele_serie.modele_exercice_id — le plus gênant. Chemin chaud, joint à
--  chaque lecture de modèle par `ChargementComplet` (chemin `exercices.series`).
--  Le côté séance a le sien depuis toujours — `CREATE INDEX ON serie
--  (seance_exercice_id)` — le côté modèle avait été oublié. Une asymétrie qui
--  ressemble à un oubli et non à un choix.
--
--  modele_exercice.exercice_id — même jointure, un cran plus haut.
--
--  stock.aliment_id — la contrainte est `ON DELETE RESTRICT` : sans index,
--  PostgreSQL balaie TOUT `stock` à chaque suppression d'aliment, pour
--  vérifier qu'aucune ligne ne s'y oppose.
--
--  aliment.cree_par et exercice.cree_par — les deux moitiés « le mien » de
--  `FiltreAliment` et `FiltreExercice`, évaluées à chaque lecture des
--  catalogues. Celui d'`exercice` a pris de l'importance le 14 septembre 2026 :
--  avant `FiltreExercice` (constat É8), la colonne n'était jamais lue ; elle
--  l'est désormais sur les 1 338 lignes du catalogue, à chaque appel.
--
--  CE QU'ON N'INDEXE PAS, ET C'EST ASSUMÉ : `stock.emplacement_id`,
--  `seance.modele_id`, `cuisson_habituelle.mode_cuisson_id`,
--  `invitation.invite_par` et `invitation.utilisateur_id`. Tables courtes,
--  jointures rares, aucune contrainte RESTRICT à faire respecter. Les ajouter
--  serait payer une écriture plus lente pour une lecture qui n'a pas lieu.
-- =====================================================================

CREATE INDEX IF NOT EXISTS modele_serie_par_exercice
    ON modele_serie (modele_exercice_id);

CREATE INDEX IF NOT EXISTS modele_exercice_par_exercice
    ON modele_exercice (exercice_id);

CREATE INDEX IF NOT EXISTS stock_par_aliment
    ON stock (aliment_id);

-- Index PARTIELS : la très grande majorité des lignes ont `cree_par IS NULL`
-- — 50 aliments communs sur 50, 1 338 exercices publics sur 1 338. Indexer les
-- NULL n'apporterait rien et gonflerait l'index ; ce qu'on cherche à retrouver
-- vite, ce sont les rares lignes qui appartiennent à quelqu'un.
CREATE INDEX IF NOT EXISTS aliment_par_auteur
    ON aliment (cree_par) WHERE cree_par IS NOT NULL;

CREATE INDEX IF NOT EXISTS exercice_par_auteur
    ON exercice (cree_par) WHERE cree_par IS NOT NULL;
