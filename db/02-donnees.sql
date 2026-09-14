-- fitcarnet : donnees de depart (referentiel commun)

INSERT INTO emplacement (code, libelle, ordre) VALUES
  ('frigo','Frigo',1), ('congelateur','Congélateur',2), ('placard','Placard',3), ('autre','Autre',4)
ON CONFLICT (code) DO NOTHING;
-- ---------------------------------------------------------------------
--  PAS DE CATALOGUE D'ALIMENTS DE DÉPART, ET C'EST UNE DÉCISION
-- ---------------------------------------------------------------------
--
--  Il y en a eu un : 50 aliments communs, semés à toute installation et
--  visibles de tous les comptes. Retiré le 14 septembre 2026.
--
--  POURQUOI. Les valeurs nutritionnelles d'un aliment ne sont pas une
--  constante universelle. Deux paquets de la même chose ne portent pas les
--  mêmes chiffres, et en France l'étiquette les donne — y compris les fibres,
--  que les tables américaines omettent. Un utilisateur qui rentre de courses
--  a sous les yeux les valeurs JUSTES pour CE qu'il a acheté ; une moyenne
--  nationale posée d'avance ne peut que le tromper, et lui donne en prime
--  l'impression que la question est réglée.
--
--  C'était d'ailleurs vérifiable : ce catalogue portait encore, en septembre
--  2026, des valeurs de la table factice d'un banc d'essai (constat É7) et
--  deux valeurs de CUIT dans une base qui pèse du CRU. Un catalogue qu'on ne
--  peut pas garantir juste vaut moins que pas de catalogue : c'est la règle 7.
--
--  CE QUI RESTE ICI est structurel, et n'a rien d'un jugement nutritionnel :
--  les emplacements, les modes de cuisson, les exercices de référence.
--
--  POUR UN COMPTE GROCY, la question ne se pose pas : les aliments viennent
--  de Grocy, fibres comprises — `FrigoGrocy` y déclare le champ « Fibres /
--  100 g » et le crée s'il manque.
--
--  Les migrations 14 à 19 corrigeaient ce catalogue. Elles sont conservées et
--  restent idempotentes : sur une base neuve elles ne trouvent rien à mettre
--  à jour, sur une base existante elles gardent leur raison d'être.

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
