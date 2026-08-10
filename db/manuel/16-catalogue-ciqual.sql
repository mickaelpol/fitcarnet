-- =====================================================================
--  Le catalogue COMMUN, aligne sur Ciqual.
--
--  GENERE par `ciqual_vers_grocy.py --exporter-catalogue`. Ne pas modifier
--  a la main : relance la commande.
--
--  Les 50 aliments de reference sont le point de depart de tout nouveau
--  compte. Ils portaient des valeurs tapees a la main, en partie d'origine
--  americaine — l'amande a 21,5 g de glucides fibres comprises contre 8,8 en
--  Ciqual — sans fibres renseignees, ce qui rend une cible exprimee en
--  glucides TOTAUX silencieusement fausse. Et des legumes references cuits,
--  alors qu'on les pese crus.
--
--  Aucun chiffre n'est invente ici : tous viennent de la table de l'Anses.
--  Le rendement d'un grain sec est derive de la conservation de l'energie ;
--  celui d'un legume ou d'une viande reste a 1 faute de mesure — il n'affiche
--  que le poids servi et ne touche aucune macro.
--
--  NE TOUCHE QUE LE COMMUN (`cree_par IS NULL`). Un aliment cree par un
--  utilisateur lui appartient, meme s'il porte le meme nom.
--
--  A jouer APRES 15-legumes-peses-crus.sql. Idempotent.
--
--  Source : Anses, Table Ciqual de composition nutritionnelle des aliments.
-- =====================================================================

BEGIN;

-- Comparer des noms accentues sans installer d'extension.
CREATE OR REPLACE FUNCTION fitcarnet_normaliser(t text) RETURNS text AS $$
    SELECT lower(translate(t, 'àâäéèêëïîôöùûüçÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ', 'aaaeeeeiioouuucAAAEEEEIIOOUUUC'));
$$ LANGUAGE sql IMMUTABLE;

SELECT 'avant' AS quand, count(*) FILTER (WHERE fibres_100 IS NULL) AS sans_fibres,
       count(*) FILTER (WHERE categorie = 'leg' AND etat_reference <> 'cru') AS legumes_cuits
FROM   aliment WHERE cree_par IS NULL;

-- Amande, émondée, sans sel ajouté
UPDATE aliment SET
    categorie      = 'ole',
    kcal_100       = 631,
    prot_100       = 21.4,
    gluc_100       = 8.76,
    lip_100        = 52.5,
    fibres_100     = 9.9,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%amandes%';
-- Ananas, chair sans peau, cru
UPDATE aliment SET
    categorie      = 'fruit',
    kcal_100       = 51.6,
    prot_100       = 0.25,
    gluc_100       = 11.7,
    lip_100        = 0.5,
    fibres_100     = 1.2,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%ananas%';
-- Asperge, verte, crue
UPDATE aliment SET
    categorie      = 'leg',
    kcal_100       = 24.7,
    prot_100       = 2.46,
    gluc_100       = 2.03,
    lip_100        = 0.27,
    fibres_100     = 2.15,
    ratio          = 1,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%asperge%';
-- Banane, chair sans peau, crue
UPDATE aliment SET
    categorie      = 'fruit',
    kcal_100       = 87.6,
    prot_100       = 1.06,
    gluc_100       = 19.7,
    lip_100        = 0.5,
    fibres_100     = 2.7,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%banane%';
-- Beurre de cacahuète ou pâte d'arachide
UPDATE aliment SET
    categorie      = 'ole',
    kcal_100       = 643,
    prot_100       = 22.2,
    gluc_100       = 17.3,
    lip_100        = 51.4,
    fibres_100     = 5,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%beurre%' AND fitcarnet_normaliser(nom) LIKE '%de%' AND fitcarnet_normaliser(nom) LIKE '%cacahuete%';
-- Poulet, filet sans peau cru
UPDATE aliment SET
    categorie      = 'prot',
    kcal_100       = 110,
    prot_100       = 23.4,
    gluc_100       = 0,
    lip_100        = 1.5,
    fibres_100     = 0,
    ratio          = 0.75,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%blanc%' AND fitcarnet_normaliser(nom) LIKE '%de%' AND fitcarnet_normaliser(nom) LIKE '%poulet%';
-- Oeuf, blanc (blanc d'oeuf), cru
UPDATE aliment SET
    categorie      = 'prot',
    kcal_100       = 48.1,
    prot_100       = 10.9,
    gluc_100       = 0.73,
    lip_100        = 0.17,
    fibres_100     = 0,
    ratio          = 1,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%blancs%' AND fitcarnet_normaliser(nom) LIKE '%d%' AND fitcarnet_normaliser(nom) LIKE '%oeufs%';
-- Boeuf, steak haché 5% MG cru
UPDATE aliment SET
    categorie      = 'prot',
    kcal_100       = 130,
    prot_100       = 21.9,
    gluc_100       = 0.3,
    lip_100        = 4.59,
    fibres_100     = 0,
    ratio          = 0.78,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%boeuf%' AND fitcarnet_normaliser(nom) LIKE '%hache%' AND fitcarnet_normaliser(nom) LIKE '%5%';
-- Boulgour de blé, cuit, sans sel ajouté
UPDATE aliment SET
    categorie      = 'fec',
    kcal_100       = 131,
    prot_100       = 4.31,
    gluc_100       = 24.1,
    lip_100        = 1,
    fibres_100     = 3.7,
    ratio          = 2.65,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%boulgour%';
-- Brocoli, cru
UPDATE aliment SET
    categorie      = 'leg',
    kcal_100       = 31.9,
    prot_100       = 2.9,
    gluc_100       = 2.15,
    lip_100        = 0.36,
    fibres_100     = 2.6,
    ratio          = 1,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%brocoli%';
-- Cabillaud, cru
UPDATE aliment SET
    categorie      = 'prot',
    kcal_100       = 77.4,
    prot_100       = 18.1,
    gluc_100       = 0,
    lip_100        = 0.57,
    fibres_100     = 0.2,
    ratio          = 0.85,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%cabillaud%';
-- Camembert au lait pasteurisé
UPDATE aliment SET
    categorie      = 'lait',
    kcal_100       = 275,
    prot_100       = 19.2,
    gluc_100       = 1.29,
    lip_100        = 21.5,
    fibres_100     = 0,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%camembert%';
-- Carotte, crue
UPDATE aliment SET
    categorie      = 'leg',
    kcal_100       = 30.2,
    prot_100       = 0.78,
    gluc_100       = 5.16,
    lip_100        = 0.5,
    fibres_100     = 2.9,
    ratio          = 1,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%carotte%';
-- Champignon de Paris ou champignon de couche, cru
UPDATE aliment SET
    categorie      = 'leg',
    kcal_100       = 21,
    prot_100       = 2.11,
    gluc_100       = 1.83,
    lip_100        = 0.36,
    fibres_100     = 1,
    ratio          = 1,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%champignon%';
-- Chou-fleur, cru
UPDATE aliment SET
    categorie      = 'leg',
    kcal_100       = 24.9,
    prot_100       = 1.81,
    gluc_100       = 2.13,
    lip_100        = 0.7,
    fibres_100     = 2.2,
    ratio          = 1,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%chou%' AND fitcarnet_normaliser(nom) LIKE '%fleur%';
-- Lieu noir, cru
UPDATE aliment SET
    categorie      = 'prot',
    kcal_100       = 82.5,
    prot_100       = 18.8,
    gluc_100       = 0,
    lip_100        = 0.8,
    fibres_100     = 0,
    ratio          = 0.85,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%colin%';
-- Concombre, chair et peau, cru
UPDATE aliment SET
    categorie      = 'leg',
    kcal_100       = 16.8,
    prot_100       = 0.65,
    gluc_100       = 2.87,
    lip_100        = 0.11,
    fibres_100     = 0.5,
    ratio          = 1,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%concombre%';
-- Courgette, chair et peau, crue
UPDATE aliment SET
    categorie      = 'leg',
    kcal_100       = 16.7,
    prot_100       = 1.21,
    gluc_100       = 1.75,
    lip_100        = 0.32,
    fibres_100     = 1,
    ratio          = 1,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%courgette%';
-- Emmental ou emmenthal
UPDATE aliment SET
    categorie      = 'lait',
    kcal_100       = 373,
    prot_100       = 27.9,
    gluc_100       = 0,
    lip_100        = 28.8,
    fibres_100     = 0,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%emmental%';
-- Épinard, cru
UPDATE aliment SET
    categorie      = 'leg',
    kcal_100       = 33.3,
    prot_100       = 2.68,
    gluc_100       = 3.06,
    lip_100        = 0.39,
    fibres_100     = 2.6,
    ratio          = 1,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%epinard%';
-- Dinde, escalope crue
UPDATE aliment SET
    categorie      = 'prot',
    kcal_100       = 108,
    prot_100       = 23.7,
    gluc_100       = 0,
    lip_100        = 1.48,
    fibres_100     = 0,
    ratio          = 0.75,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%escalope%' AND fitcarnet_normaliser(nom) LIKE '%de%' AND fitcarnet_normaliser(nom) LIKE '%dinde%';
-- Veau, escalope crue
UPDATE aliment SET
    categorie      = 'prot',
    kcal_100       = 114,
    prot_100       = 20.5,
    gluc_100       = 0.58,
    lip_100        = 3.28,
    fibres_100     = 0,
    ratio          = 0.75,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%escalope%' AND fitcarnet_normaliser(nom) LIKE '%de%' AND fitcarnet_normaliser(nom) LIKE '%veau%';
-- Flocons d'avoine
UPDATE aliment SET
    categorie      = 'fec',
    kcal_100       = 369,
    prot_100       = 10.6,
    gluc_100       = 57.7,
    lip_100        = 7.82,
    fibres_100     = 11.2,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%flocons%' AND fitcarnet_normaliser(nom) LIKE '%d%' AND fitcarnet_normaliser(nom) LIKE '%avoine%';
-- Fraise, crue
UPDATE aliment SET
    categorie      = 'fruit',
    kcal_100       = 35.1,
    prot_100       = 0.63,
    gluc_100       = 6.03,
    lip_100        = 0.5,
    fibres_100     = 3.8,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%fraise%';
-- Framboise, crue
UPDATE aliment SET
    categorie      = 'fruit',
    kcal_100       = 47.9,
    prot_100       = 1.19,
    gluc_100       = 5.83,
    lip_100        = 0.8,
    fibres_100     = 4.3,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%framboise%';
-- Fromage blanc, nature, 0% MG
UPDATE aliment SET
    categorie      = 'lait',
    kcal_100       = 48.4,
    prot_100       = 7.34,
    gluc_100       = 4.22,
    lip_100        = 0.1,
    fibres_100     = 0.042,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%fromage%' AND fitcarnet_normaliser(nom) LIKE '%blanc%';
-- Haricot vert, cru
UPDATE aliment SET
    categorie      = 'leg',
    kcal_100       = 31.9,
    prot_100       = 1.83,
    gluc_100       = 4.14,
    lip_100        = 0.22,
    fibres_100     = 2.7,
    ratio          = 1,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%haricots%' AND fitcarnet_normaliser(nom) LIKE '%verts%';
-- Poulet, cuisse, viande crue
UPDATE aliment SET
    categorie      = 'prot',
    kcal_100       = 114,
    prot_100       = 19.3,
    gluc_100       = 0,
    lip_100        = 4.05,
    fibres_100     = 0,
    ratio          = 0.75,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%haut%' AND fitcarnet_normaliser(nom) LIKE '%de%' AND fitcarnet_normaliser(nom) LIKE '%cuisse%' AND fitcarnet_normaliser(nom) LIKE '%de%' AND fitcarnet_normaliser(nom) LIKE '%poulet%';
-- Huile d'avocat
UPDATE aliment SET
    categorie      = 'huile',
    kcal_100       = 900,
    prot_100       = 0,
    gluc_100       = 0,
    lip_100        = 100,
    fibres_100     = 0,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%huile%';
-- Jus de citron, pur jus
UPDATE aliment SET
    categorie      = 'autre',
    kcal_100       = 29.4,
    prot_100       = 0.4,
    gluc_100       = 6.1,
    lip_100        = 0.29,
    fibres_100     = 0.4,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%jus%' AND fitcarnet_normaliser(nom) LIKE '%de%' AND fitcarnet_normaliser(nom) LIKE '%citron%';
-- Lait demi-écrémé, UHT
UPDATE aliment SET
    categorie      = 'lait',
    kcal_100       = 47.7,
    prot_100       = 3.48,
    gluc_100       = 5,
    lip_100        = 1.56,
    fibres_100     = 0,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%lait%';
-- Mûre (de ronce), crue
UPDATE aliment SET
    categorie      = 'fruit',
    kcal_100       = 46,
    prot_100       = 1.13,
    gluc_100       = 6.53,
    lip_100        = 0.7,
    fibres_100     = 5.2,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%mure%';
-- Myrtille, crue
UPDATE aliment SET
    categorie      = 'fruit',
    kcal_100       = 57.7,
    prot_100       = 0.87,
    gluc_100       = 10.6,
    lip_100        = 0.33,
    fibres_100     = 2.4,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%myrtille%';
-- Noisette, sans sel ajouté
UPDATE aliment SET
    categorie      = 'ole',
    kcal_100       = 632,
    prot_100       = 14.4,
    gluc_100       = 7.16,
    lip_100        = 56.9,
    fibres_100     = 11.6,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%noisette%';
-- Noix, cerneau, séchée
UPDATE aliment SET
    categorie      = 'ole',
    kcal_100       = 709,
    prot_100       = 13.3,
    gluc_100       = 6.88,
    lip_100        = 67.3,
    fibres_100     = 6.7,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%noix%';
-- Oeuf cru
UPDATE aliment SET
    categorie      = 'prot',
    kcal_100       = 140,
    prot_100       = 12.8,
    gluc_100       = 0.06,
    lip_100        = 9.83,
    fibres_100     = 0,
    ratio          = 1,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%oeufs%' AND fitcarnet_normaliser(nom) LIKE '%entiers%';
-- Pain de mie complet, préemballé
UPDATE aliment SET
    categorie      = 'fec',
    kcal_100       = 257,
    prot_100       = 7.3,
    gluc_100       = 41.8,
    lip_100        = 4.1,
    fibres_100     = 7.3,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%pain%' AND fitcarnet_normaliser(nom) LIKE '%de%' AND fitcarnet_normaliser(nom) LIKE '%mie%' AND fitcarnet_normaliser(nom) LIKE '%complet%';
-- Patate douce, cuite
UPDATE aliment SET
    categorie      = 'fec',
    kcal_100       = 79.1,
    prot_100       = 1.69,
    gluc_100       = 16.3,
    lip_100        = 0.15,
    fibres_100     = 2.9,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%patate%' AND fitcarnet_normaliser(nom) LIKE '%douce%';
-- Pâtes sèches, semi-complètes, cuites, sans sel ajouté
UPDATE aliment SET
    categorie      = 'fec',
    kcal_100       = 173,
    prot_100       = 5.71,
    gluc_100       = 31.8,
    lip_100        = 1.2,
    fibres_100     = 4.5,
    ratio          = 2.2,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%pates%' AND fitcarnet_normaliser(nom) LIKE '%completes%';
-- Petits pois, crus
UPDATE aliment SET
    categorie      = 'leg',
    kcal_100       = 81.2,
    prot_100       = 5.42,
    gluc_100       = 11.4,
    lip_100        = 0.4,
    fibres_100     = 5.1,
    ratio          = 1,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%petits%' AND fitcarnet_normaliser(nom) LIKE '%pois%';
-- Poire, chair et peau, crue
UPDATE aliment SET
    categorie      = 'fruit',
    kcal_100       = 56.6,
    prot_100       = 0.36,
    gluc_100       = 12.3,
    lip_100        = 0.27,
    fibres_100     = 2.9,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%poire%';
-- Poireau, cru
UPDATE aliment SET
    categorie      = 'leg',
    kcal_100       = 30.4,
    prot_100       = 1.5,
    gluc_100       = 4.55,
    lip_100        = 0.3,
    fibres_100     = 1.8,
    ratio          = 1,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%poireau%';
-- Pomme, chair et peau, crue
UPDATE aliment SET
    categorie      = 'fruit',
    kcal_100       = 54,
    prot_100       = 0.25,
    gluc_100       = 11.6,
    lip_100        = 0.25,
    fibres_100     = 1.4,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%pomme%';
-- Pomme de terre, cuite (aliment moyen)
UPDATE aliment SET
    categorie      = 'fec',
    kcal_100       = 94.9,
    prot_100       = 2.05,
    gluc_100       = 17.2,
    lip_100        = 1.58,
    fibres_100     = 2.15,
    ratio          = 1,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%pommes%' AND fitcarnet_normaliser(nom) LIKE '%de%' AND fitcarnet_normaliser(nom) LIKE '%terre%';
-- Quinoa, bouilli/cuit à l'eau, sans sel ajouté
UPDATE aliment SET
    categorie      = 'fec',
    kcal_100       = 149,
    prot_100       = 4.66,
    gluc_100       = 27.9,
    lip_100        = 1.1,
    fibres_100     = 3.8,
    ratio          = 2.4,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%quinoa%';
-- Ratatouille cuisinée, préemballée
UPDATE aliment SET
    categorie      = 'leg',
    kcal_100       = 57.1,
    prot_100       = 1.22,
    gluc_100       = 4.97,
    lip_100        = 3.15,
    fibres_100     = 2.03,
    ratio          = 1,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%ratatouille%';
-- Riz blanc, cuit, sans sel ajouté
UPDATE aliment SET
    categorie      = 'fec',
    kcal_100       = 155,
    prot_100       = 3.15,
    gluc_100       = 33.2,
    lip_100        = 0.7,
    fibres_100     = 1.4,
    ratio          = 2.26,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%riz%' AND fitcarnet_normaliser(nom) LIKE '%basmati%';
-- Riz complet, cuit, sans sel ajouté
UPDATE aliment SET
    categorie      = 'fec',
    kcal_100       = 187,
    prot_100       = 3.87,
    gluc_100       = 37.6,
    lip_100        = 1.8,
    fibres_100     = 2.1,
    ratio          = 1.87,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%riz%' AND fitcarnet_normaliser(nom) LIKE '%complet%';
-- Saumon, élevage, cru
UPDATE aliment SET
    categorie      = 'prot',
    kcal_100       = 193,
    prot_100       = 20.5,
    gluc_100       = 0,
    lip_100        = 12.4,
    fibres_100     = 0.25,
    ratio          = 0.85,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%saumon%';
-- Semoule ou graine de couscous complète, cuite, sans sel ajouté
UPDATE aliment SET
    categorie      = 'fec',
    kcal_100       = 142,
    prot_100       = 4.28,
    gluc_100       = 26.8,
    lip_100        = 1,
    fibres_100     = 3.7,
    ratio          = 2.46,
    etat_reference = 'cuit'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%semoule%' AND fitcarnet_normaliser(nom) LIKE '%complete%';
-- Thon, au naturel, appertisé, égoutté
UPDATE aliment SET
    categorie      = 'prot',
    kcal_100       = 143,
    prot_100       = 26.8,
    gluc_100       = 0,
    lip_100        = 3.94,
    fibres_100     = 0,
    ratio          = 1,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%thon%' AND fitcarnet_normaliser(nom) LIKE '%au%' AND fitcarnet_normaliser(nom) LIKE '%naturel%';
-- Tofu nature, préemballé
UPDATE aliment SET
    categorie      = 'prot',
    kcal_100       = 147,
    prot_100       = 13.4,
    gluc_100       = 2.87,
    lip_100        = 8.5,
    fibres_100     = 0.5,
    ratio          = 1,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%tofu%';
-- Truite de mer, crue
UPDATE aliment SET
    categorie      = 'prot',
    kcal_100       = 114,
    prot_100       = 19.6,
    gluc_100       = 0.81,
    lip_100        = 3.63,
    fibres_100     = 0,
    ratio          = 0.85,
    etat_reference = 'cru'
WHERE cree_par IS NULL AND fitcarnet_normaliser(nom) LIKE '%truite%';

SELECT 'apres' AS quand, count(*) FILTER (WHERE fibres_100 IS NULL) AS sans_fibres,
       count(*) FILTER (WHERE categorie = 'leg' AND etat_reference <> 'cru') AS legumes_cuits
FROM   aliment WHERE cree_par IS NULL;

COMMIT;

-- Ce qui reste sans fibres apres coup : ces aliments faussent une cible
-- exprimee en glucides totaux, et rien ne le signale a l'ecran.
SELECT nom, categorie FROM aliment
WHERE  cree_par IS NULL AND fibres_100 IS NULL
ORDER  BY categorie, nom;
