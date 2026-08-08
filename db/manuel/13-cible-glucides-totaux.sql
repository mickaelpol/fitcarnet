-- =====================================================================
--  fitcarnet — une cible en glucides dit desormais dans quelle unite
--
--  Le probleme. « 61,8 g de glucides » ne veut pas dire la meme chose des
--  deux cotes de l'Atlantique. Les plans nord-americains — USDA, Fitlog,
--  MyFitnessPal — comptent les fibres DANS les glucides ; les etiquettes
--  francaises et cette application les comptent a part.
--
--  Recopier tel quel un objectif venu d'un plan americain revient donc a
--  viser les glucides EN PLUS des fibres. Sur un plan reel : environ huit
--  grammes de trop par repas, trente-quatre par jour, cent trente calories.
--  Rien ne le signalait — les deux nombres se ressemblent.
--
--  La correction. La cible porte son unite. Faux : glucides hors fibres,
--  convention europeenne, comportement d'origine. Vrai : glucides totaux,
--  et le calculateur compare alors la cible a « glucides + fibres » des
--  aliments reels, ceux du frigo, dont les fibres sont connues.
--
--  Pourquoi sur la cible et non sur le compte : une quantite sans son unite
--  est un bug qui attend son heure. Changer de plan ne doit pas faire
--  changer de sens aux valeurs deja enregistrees.
--
--  Aucune cible existante ne change de comportement : toutes passent a faux.
--
--  Idempotent.
-- =====================================================================

ALTER TABLE cible
    ADD COLUMN IF NOT EXISTS glucides_totaux BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN cible.glucides_totaux IS
    'Vrai si la cible en glucides comprend les fibres (convention nord-americaine).';

-- Controle : la colonne existe, elle est fausse partout.
SELECT column_name, data_type, column_default, is_nullable
FROM   information_schema.columns
WHERE  table_name = 'cible' AND column_name = 'glucides_totaux';

SELECT glucides_totaux, count(*) AS cibles
FROM   cible
GROUP  BY glucides_totaux;
