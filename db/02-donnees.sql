-- fitcarnet : donnees de depart (referentiel commun)

INSERT INTO emplacement (code, libelle, ordre) VALUES
  ('frigo','Frigo',1), ('congelateur','Congélateur',2), ('placard','Placard',3), ('autre','Autre',4)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
--  Aliments de référence
--
--  UNE SEULE CONVENTION : ces valeurs décrivent le produit TEL QU'ON LE PÈSE,
--  avant cuisson. Riz sec, viande crue. Il n'y a plus de colonne disant de
--  quel état on parle — il y en a eu une, et écrire le même fait à deux
--  endroits a fini par faire peser trois fois trop de riz.
--
--  Ces lignes ne sont pas saisies à la main : elles sont le RÉSULTAT de la
--  chaîne de migrations 14 à 19 rejouée sur l'ancien jeu de départ, relevé
--  tel quel. Personne n'a retapé un chiffre, et c'est voulu — la conversion
--  cuit → pesé a été faite une fois, en SQL testé, et pas une seconde fois de
--  mémoire.
--
--  DEUX LIGNES RESTENT FAUSSES ET LE PROJET LE SAIT : « Boulgour » (83 kcal)
--  et « Pates completes » (124 kcal) portent encore des valeurs de CUIT. La
--  migration 18 ne les a pas converties parce que le résultat ne retombait
--  pas dans la bande du grain sec (300–400 kcal), et elle a eu raison de
--  refuser plutôt que d'inventer. L'application les signale en rouge au
--  premier calcul. On préfère une donnée fausse ANNONCÉE à une donnée fausse
--  corrigée au jugé.
--
--  `ON CONFLICT DO NOTHING` sans cible : l'unicité du nom passe désormais par
--  deux index PARTIELS — commun sans propriétaire, privé avec — et
--  PostgreSQL ne sait pas déduire une cible d'un index partiel.
-- ---------------------------------------------------------------------
INSERT INTO aliment (nom, categorie, kcal_100, prot_100, gluc_100, lip_100, fibres_100, ratio, public) VALUES
  ('Boulgour', 'fec', 83.00, 3.10, 18.60, 0.20, NULL, 2.500, TRUE),
  ('Flocons d''avoine', 'fec', 375.00, 12.50, 67.50, 7.50, NULL, 1.000, TRUE),
  ('Patate douce', 'fec', 92.00, 2.00, 20.70, 0.16, NULL, 1.000, TRUE),
  ('Pates completes', 'fec', 124.00, 5.30, 26.50, 0.60, NULL, 2.200, TRUE),
  ('Pommes de terre', 'fec', 87.00, 1.90, 20.10, 0.10, NULL, 1.000, TRUE),
  ('Quinoa', 'fec', 358.00, 13.20, 58.10, 6.10, 6.80, 2.750, TRUE),
  ('Riz basmati', 'fec', 350.00, 7.12, 75.00, 1.58, 3.20, 2.260, TRUE),
  ('Riz complet', 'fec', 332.40, 7.65, 69.30, 3.15, NULL, 3.000, TRUE),
  ('Semoule de blé dur', 'fec', 336.00, 11.40, 69.60, 1.95, NULL, 3.000, TRUE),
  ('Ananas', 'fruit', 50.00, 0.50, 13.10, 0.10, NULL, 1.000, TRUE),
  ('Banane', 'fruit', 89.00, 1.10, 22.80, 0.30, NULL, 1.000, TRUE),
  ('Fraises', 'fruit', 32.00, 0.70, 7.70, 0.30, NULL, 1.000, TRUE),
  ('Framboises', 'fruit', 52.00, 1.20, 12.00, 0.65, NULL, 1.000, TRUE),
  ('Mures', 'fruit', 43.00, 1.40, 9.60, 0.50, NULL, 1.000, TRUE),
  ('Myrtilles', 'fruit', 57.00, 0.70, 14.50, 0.30, NULL, 1.000, TRUE),
  ('Poire', 'fruit', 57.00, 0.40, 15.20, 0.10, NULL, 1.000, TRUE),
  ('Pomme', 'fruit', 52.00, 0.30, 13.80, 0.20, NULL, 1.000, TRUE),
  ('Huile', 'huile', 900.00, 0.00, 0.00, 100.00, NULL, 1.000, TRUE),
  ('Fromage blanc 0%', 'lait', 55.00, 8.00, 4.50, 0.20, NULL, 1.000, TRUE),
  ('Skyr 0%', 'lait', 57.00, 10.00, 4.00, 0.20, 0.00, 1.000, TRUE),
  ('Asperges', 'leg', 20.00, 2.20, 3.90, 0.10, NULL, 1.000, TRUE),
  ('Brocoli', 'leg', 31.90, 2.90, 2.10, 0.40, 2.60, 1.000, TRUE),
  ('Carottes', 'leg', 41.00, 0.90, 9.60, 0.20, NULL, 1.000, TRUE),
  ('Champignons', 'leg', 22.00, 3.10, 3.30, 0.30, NULL, 1.000, TRUE),
  ('Chou-fleur', 'leg', 25.00, 1.90, 5.00, 0.30, NULL, 1.000, TRUE),
  ('Concombre', 'leg', 15.00, 0.70, 3.60, 0.10, NULL, 1.000, TRUE),
  ('Courgettes', 'leg', 17.00, 1.20, 3.10, 0.30, NULL, 1.000, TRUE),
  ('Epinards', 'leg', 23.00, 2.90, 3.60, 0.40, NULL, 1.000, TRUE),
  ('Haricots verts', 'leg', 31.00, 1.80, 7.00, 0.10, NULL, 1.000, TRUE),
  ('Petits pois', 'leg', 80.00, 5.00, 14.00, 0.40, NULL, 1.000, TRUE),
  ('Poireaux', 'leg', 31.00, 1.50, 6.30, 0.30, NULL, 1.000, TRUE),
  ('Ratatouille', 'leg', 22.00, 1.00, 5.00, 0.20, NULL, 1.000, TRUE),
  ('Amandes', 'ole', 631.00, 21.40, 8.80, 52.50, 10.40, 1.000, TRUE),
  ('Beurre de cacahuete', 'ole', 588.00, 25.00, 20.00, 50.00, NULL, 1.000, TRUE),
  ('Noisettes', 'ole', 628.00, 15.00, 16.70, 60.80, NULL, 1.000, TRUE),
  ('Noix', 'ole', 654.00, 15.20, 13.70, 65.20, NULL, 1.000, TRUE),
  ('Blanc de poulet', 'prot', 165.00, 31.00, 0.00, 3.60, NULL, 0.750, TRUE),
  ('Blancs d''oeufs', 'prot', 52.00, 10.90, 0.70, 0.20, NULL, 1.000, TRUE),
  ('Boeuf hache 5%', 'prot', 149.00, 25.00, 0.00, 4.60, NULL, 0.780, TRUE),
  ('Cabillaud', 'prot', 105.00, 22.80, 0.00, 0.90, NULL, 0.850, TRUE),
  ('Colin / lieu', 'prot', 82.00, 17.80, 0.00, 0.70, NULL, 0.850, TRUE),
  ('Escalope de dinde', 'prot', 147.00, 30.00, 0.00, 2.00, NULL, 0.750, TRUE),
  ('Escalope de veau', 'prot', 172.00, 31.00, 0.00, 4.80, NULL, 0.750, TRUE),
  ('Haut de cuisse de poulet', 'prot', 179.00, 24.20, 0.00, 8.70, NULL, 0.750, TRUE),
  ('Oeufs entiers', 'prot', 146.00, 12.00, 2.00, 10.00, NULL, 1.000, TRUE),
  ('Sardines au naturel', 'prot', 208.00, 24.60, 0.00, 11.50, 0.00, 1.000, TRUE),
  ('Saumon', 'prot', 173.50, 18.90, 0.00, 10.20, NULL, 0.850, TRUE),
  ('Thon au naturel', 'prot', 116.00, 25.50, 0.00, 1.00, NULL, 1.000, TRUE),
  ('Tofu ferme', 'prot', 70.00, 8.20, 1.70, 4.20, NULL, 1.000, TRUE),
  ('Truite', 'prot', 148.00, 20.80, 0.00, 6.80, NULL, 0.850, TRUE)
ON CONFLICT DO NOTHING;

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
