-- ---------------------------------------------------------------------
--  CETTE MIGRATION NE VISE PLUS QU'UN CATALOGUE HISTORIQUE.
--
--  Le 14 septembre 2026, `db/02-donnees.sql` a cessé de semer les 50 aliments
--  communs : les valeurs nutritionnelles ne sont pas une constante, chacun
--  saisit celles de ce qu'il a acheté. Une base neuve n'a donc plus d'aliment
--  commun, et cette migration n'y trouvera rien à corriger — elle est
--  idempotente, elle passera sans bruit.
--
--  Elle est CONSERVÉE pour les bases existantes, où ces aliments sont encore
--  là et où ses corrections gardent tout leur sens. `entrypoint-prod.sh`
--  rejoue db/manuel/ à chaque démarrage : la retirer changerait ce qui
--  s'exécute en production, et effacerait la trace d'une correction réelle.
-- ---------------------------------------------------------------------

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
       count(*) FILTER (WHERE categorie = 'fec' AND ratio > 1.3
                          AND kcal_100 NOT BETWEEN 300 AND 400) AS grains_hors_bande
FROM   aliment WHERE cree_par IS NULL;

-- LES `LIKE '%...%'` DE CE FICHIER ONT ETE ANCRES, ET VOICI POURQUOI.
--
-- `WHERE fitcarnet_normaliser(nom) LIKE '%amandes%'` attrape « Purée
-- d'amandes », qui est la cible — et « Lait d'amandes », qui ne l'est pas.
-- La ligne du lait recevait donc 631 kcal et 52,5 g de lipides au lieu de 24
-- et 1,2 : une erreur de facteur 26, dans le catalogue COMMUN, celui que
-- personne ne peut rattraper compte par compte.
--
-- Et comme `entrypoint-prod.sh` rejoue toutes les migrations a CHAQUE
-- demarrage du conteneur, une correction faite a la main par
-- l'administrateur etait silencieusement annulee au redemarrage suivant. Une
-- valeur fausse qui revient toute seule est pire qu'une valeur fausse.
--
-- ATTENTION EN AJOUTANT UNE LIGNE : `fitcarnet_normaliser` abaisse la casse
-- et retire les accents, RIEN D'AUTRE. Ni les apostrophes, ni les espaces.
-- « Purée d'amandes » devient « puree d'amandes », apostrophe comprise — et
-- une apostrophe dans un litteral SQL se double.
--
-- On compare desormais le nom normalise ENTIER. Si un aliment ne porte pas
-- exactement ce nom, il n'est pas touche — c'est le bon defaut : ne rien
-- faire vaut mieux que corriger le mauvais aliment.
-- Amande, émondée, sans sel ajouté
UPDATE aliment SET
    categorie      = 'ole',
    kcal_100       = 631,
    prot_100       = 21.4,
    gluc_100       = 8.8,
    lip_100        = 52.5,
    fibres_100     = 10.4,
    ratio          = 1
WHERE cree_par IS NULL
  AND fitcarnet_normaliser(nom) IN ('puree d''amandes', 'amandes', 'amande');
-- Brocoli, cru
UPDATE aliment SET
    categorie      = 'leg',
    kcal_100       = 31.9,
    prot_100       = 2.9,
    gluc_100       = 2.1,
    lip_100        = 0.4,
    fibres_100     = 2.6,
    ratio          = 1
WHERE cree_par IS NULL
  AND fitcarnet_normaliser(nom) IN ('brocoli', 'brocolis');
-- Quinoa, cru
UPDATE aliment SET
    categorie      = 'fec',
    kcal_100       = 358,
    prot_100       = 13.2,
    gluc_100       = 58.1,
    lip_100        = 6.1,
    fibres_100     = 6.8,
    ratio          = 2.75
WHERE cree_par IS NULL
  AND fitcarnet_normaliser(nom) IN ('quinoa');
-- Riz blanc, cru
--
-- QUATRE DE CES SIX CHIFFRES N'ETAIENT PAS CEUX DE LA TABLE, jusqu'au
-- 16 septembre 2026 : prot 7.12, gluc 75, lip 1.58, fibres 3.2 — la table dit
-- 7.02, 77.5, 0.79, 1.53. Les lipides etaient au DOUBLE et les fibres a 2,1x,
-- et comme ce fichier est rejoue a chaque demarrage, une correction a la main
-- revenait a la suivante : exactement le piege que l'en-tete decrit plus haut.
-- L'audit avait nomme les deux premiers (04-tests-qualite.md:144) et les avait
-- traces jusqu'a la table factice de `test_ecriture_grocy.py`, d'ou ils
-- venaient. Corrige ici, a la source. Le doublement des fibres deplacait une
-- cible exprimee en glucides TOTAUX : c'etait un chiffre affiche.
--
-- Le rendement 2.26 reste : il vient de 350 / 155, « Riz blanc, cru » et
-- « Riz blanc, cuit » (colonne « Reglement UE n° 1169/2011 »). C'est bien
-- l'entree « riz blanc » que l'application apparie a son « Riz basmati »
-- (`ciqual_vers_grocy.py:294` et `:202`) ; le vrai basmati donnerait 2.37.
UPDATE aliment SET
    categorie      = 'fec',
    kcal_100       = 350,
    prot_100       = 7.02,
    gluc_100       = 77.5,
    lip_100        = 0.79,
    fibres_100     = 1.53,
    ratio          = 2.26
WHERE cree_par IS NULL
  AND fitcarnet_normaliser(nom) IN ('riz basmati');

-- Riz complet, cru
--
-- Ajoute le 16 septembre 2026. La base portait 332.40 kcal et un rendement de
-- 3 — le rendement d'hier, celui d'avant la refonte. La table donne 350 au cru
-- et 187 au cuit, soit 1.87 : un utilisateur qui prescrivait 100 g s'en voyait
-- annoncer 300 dans l'assiette au lieu de 187. Aucune macro n'etait touchee,
-- seul le poids servi l'etait — mais c'est un poids qu'on lit devant la
-- balance.
UPDATE aliment SET
    categorie      = 'fec',
    kcal_100       = 350,
    prot_100       = 7.02,
    gluc_100       = 71.4,
    lip_100        = 2.8,
    fibres_100     = 5,
    ratio          = 1.87
WHERE cree_par IS NULL
  AND fitcarnet_normaliser(nom) IN ('riz complet');

SELECT 'apres' AS quand, count(*) FILTER (WHERE fibres_100 IS NULL) AS sans_fibres,
       count(*) FILTER (WHERE categorie = 'fec' AND ratio > 1.3
                          AND kcal_100 NOT BETWEEN 300 AND 400) AS grains_hors_bande
FROM   aliment WHERE cree_par IS NULL;

COMMIT;

-- Ce qui reste sans fibres apres coup : ces aliments faussent une cible
-- exprimee en glucides totaux, et rien ne le signale a l'ecran.
SELECT nom, categorie FROM aliment
WHERE  cree_par IS NULL AND fibres_100 IS NULL
ORDER  BY categorie, nom;
