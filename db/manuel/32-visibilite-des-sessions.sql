-- =====================================================================
--  fitcarnet — « vu le » : de quand date la dernière utilisation d'une session
-- =====================================================================
--
--  CONSTAT M-02 DE L'AUDIT DU 7 SEPTEMBRE 2026, SECOND VOLET.
--
--  Le premier volet, le 14 septembre 2026, a ramené la durée du jeton de
--  rafraîchissement d'un an à 90 jours glissants. L'audit disait déjà que ce
--  n'était pas le vrai problème : « Ce qui manque n'est pas la rotation, c'est
--  la VISIBILITÉ — rien ne permet de constater ni de couper une session
--  précise. » Les trois leviers de révocation qui existaient — déconnexion,
--  changement de mot de passe, désactivation du compte — sont tous « tout ou
--  rien », et supposent qu'on soupçonne déjà quelque chose.
--
--  `GET /api/mes-sessions` et `DELETE /api/mes-sessions/{id}` comblent ce trou.
--  La table portait déjà l'identifiant, l'ouverture et l'échéance ; il lui
--  manquait la dernière utilisation.
--
--  POURQUOI L'ÉCHÉANCE NE SUFFISAIT PAS. `expire_le` est repoussée de 90 jours
--  à chaque usage : deux sessions utilisées à un mois d'intervalle affichent
--  donc la même chose à un mois près, et l'écran ne permettrait pas de
--  reconnaître l'appareil qu'on ne reconnaît pas. C'est la date brute du
--  dernier usage qui le permet, et rien d'autre.
--
--  LA COLONNE EST NULLABLE, ET ON NE REMPLIT PAS L'EXISTANT. Sur une base
--  neuve elle ne sera pourtant jamais NULL : l'application l'écrit à la
--  création de la session comme à chaque rafraîchissement. Le NULL ne concerne
--  que les sessions déjà ouvertes au moment où cette migration passe — leur
--  dernière utilisation n'est pas connue, et la règle 6 du projet interdit de
--  substituer une valeur plausible à une donnée manquante. `vu_le = cree_le`
--  serait une date inventée sur une session vieille de trois mois ; l'écran
--  dira « inconnue », ce qui est vrai. Elles se rempliront d'elles-mêmes au
--  premier rafraîchissement, c'est-à-dire dans l'heure pour toute session
--  vivante.
--
--  PAS DE `NOT NULL`, DONC, ET C'EST AUSSI CE QUI REND CETTE MIGRATION SÛRE :
--  `entrypoint-prod.sh` la rejoue à chaque démarrage, et `25-garde-fous.sql`
--  a déjà appris au projet qu'une contrainte NOT NULL posée sur une colonne
--  qui peut être vide empêche la production de repartir.
--
--  Idempotent : rejouable telle quelle, deux fois de suite, sans effet sur une
--  base déjà à jour. Aucune donnée n'est écrite — rien à écraser au prochain
--  redémarrage.
-- =====================================================================

ALTER TABLE jeton_rafraichissement
    ADD COLUMN IF NOT EXISTS vu_le TIMESTAMP(0) WITHOUT TIME ZONE;

COMMENT ON COLUMN jeton_rafraichissement.vu_le IS
    'Derniere utilisation. NULL = session ouverte avant la migration 32, jamais revue depuis.';

-- Contrôle : la colonne doit exister, être nullable, et aucune ligne existante
-- ne doit avoir reçu de valeur inventée.
SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_name = 'jeton_rafraichissement'
ORDER  BY ordinal_position;
