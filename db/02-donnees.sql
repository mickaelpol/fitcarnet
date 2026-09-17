-- fitcarnet : donnees de depart (referentiel commun)

INSERT INTO emplacement (code, libelle, ordre) VALUES
  ('frigo','Frigo',1), ('congelateur','Congélateur',2), ('placard','Placard',3), ('autre','Autre',4)
ON CONFLICT (code) DO NOTHING;
-- ---------------------------------------------------------------------
--  AUCUN ALIMENT N'EST SEMÉ : chaque compte saisit les valeurs de ce qu'il
--  a acheté, telles que l'étiquette les donne. Un compte Grocy les reçoit
--  de Grocy, fibres comprises.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
--  Façons de cuire, partagées par tous les comptes
--
--  Volontairement court : on ajoute à la demande, on ne devine pas les
--  habitudes de gens qu'on ne connaît pas. L'ordre n'est pas alphabétique —
--  les cuissons les plus courantes en haut, ce sont celles qu'on choisit
--  trente fois par semaine.
-- ---------------------------------------------------------------------
INSERT INTO mode_cuisson (libelle, ordre) VALUES
  ('Vapeur',            10),
  ('Eau bouillante',    20),
  ('Poêle',             30),
  ('Four 180 °C',       40),
  ('Four 200 °C',       50),
  ('Four 220 °C',       60),
  ('Air fryer 180 °C',  70),
  ('Air fryer 200 °C',  80)
ON CONFLICT DO NOTHING;

INSERT INTO exercice (nom, format_prescrit, groupes, public) VALUES
  ('Chest press machine', '4 s × 12 rép', 'Push', TRUE),
  ('Dips', '100 for time', 'Push', TRUE),
  ('Développé incliné haltères', '2 s × 15 rép', 'Push', TRUE),
  ('Fente bulgare', '4 s × 12 rép', 'Legs', TRUE),
  ('Fmc extension (relevé de jambes)', '100 for time', 'Legs,Pull,Push', TRUE),
  ('Hip thrust une jambe barre', '2 s × 15 rép', 'Legs', TRUE),
  ('Leg curl à genoux à levier', '50 for time', 'Legs', TRUE),
  ('Machine tirage haut', '50 for time', 'Pull', TRUE),
  ('Pompes', '2 s à l''échec', 'Push', TRUE),
  ('Rowing penché tirage barre', '4 s × 12 rép', 'Pull', TRUE),
  ('Singe', '30 m contrôle lent', 'Pull,Push', TRUE),
  ('Soulevé de terre roumain sumo barre', '100 for time', 'Legs', TRUE),
  ('Squat avant', '2 s iso max', 'Legs', TRUE),
  ('Squat sumo haltère', '100 for time', 'Legs', TRUE),
  ('Tirage corde bras tendus', '100 for time', 'Pull', TRUE),
  ('Tirage vertical prise large', '100 for time', 'Pull', TRUE),
  ('Traction barre développé couché talons au sol', '2 s × 15 rép', 'Pull', TRUE),
  ('Traction prise neutre', '2 s iso max', 'Pull', TRUE),
  ('Écartés couché haltères', '100 for time', 'Push', TRUE),
  ('Écartés inclinés rotative haltères', '50 for time', 'Push', TRUE)
ON CONFLICT (nom) DO NOTHING;

-- ---------------------------------------------------------------------
--  Mode par défaut, déduit du format prescrit — comme le faisait le
--  carnet d'origine, qui ne le stockait pas mais le recalculait :
--    « 100 for time », « contrôle lent » -> chrono
--    « 2 s iso max », « tenue »          -> iso
--    « 4 s × 12 rép »                    -> charge
--
--  Sans cela, un exercice « for time » compterait pour trois séries au
--  lieu d'une, et la jauge d'avancement serait fausse.
-- ---------------------------------------------------------------------

UPDATE exercice
SET    mode_defaut = CASE
           WHEN format_prescrit ILIKE '%for time%' THEN 'chrono'
           WHEN format_prescrit ILIKE '%contrôle%' THEN 'chrono'
           WHEN format_prescrit ILIKE '%controle%' THEN 'chrono'
           WHEN format_prescrit ILIKE '%iso%'      THEN 'iso'
           WHEN format_prescrit ILIKE '%tenue%'    THEN 'iso'
           ELSE 'charge'
       END
WHERE  source = 'perso';

-- Un rattachement vide n'a pas de sens : NULL est plus juste que ''.
UPDATE exercice SET groupes = NULL WHERE groupes = '';
