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
--  LA SEMOULE DU CATALOGUE COMMUN PORTE UN NOM QU'ON NE PEUT PAS PROUVER.
--
--  Petite migration, mais elle repare la pire categorie de defaut du projet :
--  une valeur fausse dans le catalogue COMMUN, celui dont part tout nouveau
--  compte. C'est la seule couche ou personne ne peut rattraper l'erreur.
--
--  CE QUI S'EST PASSE
--
--  La ligne « Semoule complete » portait 142 kcal aux 100 g. Ce sont les
--  valeurs de « Semoule ou graine de couscous complète, CUITE » : un libelle
--  ecrit a la main dans la table EXACTS du script d'import, du temps ou les
--  feculents portaient leurs valeurs cuites. Il etait juste alors. La refonte
--  de l'etat de reference l'a rendu faux, et personne ne l'a relu.
--
--  Un utilisateur qui pese sa semoule SECHE se serait donc vu compter 142 kcal
--  la ou il y en a 350. Deux fois et demie d'erreur, sans un mot — et
--  indetectable : un feculent a rendement 1 echappe forcement au controle de
--  la bande seche, sinon toute pomme de terre a 92 kcal serait refusee.
--
--  POURQUOI RENOMMER PLUTOT QUE CORRIGER LES CHIFFRES
--
--  Ciqual contient bien une semoule seche : « Semoule de blé dur, crue »,
--  350 kcal. Mais elle n'est pas COMPLETE, et la table n'a aucune entree de
--  semoule complete crue — seulement des cuites. Poser des valeurs de semoule
--  blanche sous un nom qui annonce du complet remplacerait un mensonge par un
--  autre, plus discret : les fibres passeraient du simple au double sans que
--  rien ne le signale.
--
--  On renomme donc la ligne pour ce qu'elle va contenir. L'identifiant ne
--  bouge pas : un stock ou un repas qui la reference continue de pointer
--  dessus. Seul le libelle change, et il devient exact.
--
--  Les valeurs, elles, sont ecrites par 16-catalogue-ciqual.sql, regenere
--  apres cette migration. Ce fichier ne fait que le nom.
--
--  A jouer APRES 18-un-seul-etat.sql, puis regenerer et rejouer 16.
--  Idempotent.
-- =====================================================================

BEGIN;

SELECT 'avant' AS quand, nom, kcal_100, gluc_100, fibres_100, ratio
  FROM aliment
 WHERE cree_par IS NULL
   AND fitcarnet_normaliser(nom) LIKE '%semoule%';

-- Ne renomme QUE la ligne commune, et seulement si elle porte encore le nom
-- qu'on ne peut pas justifier. Un aliment cree par un utilisateur lui
-- appartient, meme s'il porte le meme nom.
-- LE RENOMMAGE PEUT VIOLER L'UNICITE, ET LE CONTENEUR NE DEMARRE PLUS.
--
-- `aliment_nom_commun_unique` interdit deux aliments communs de meme nom. Si
-- « Semoule de ble dur » existe deja — l'administrateur l'a saisie depuis
-- Ciqual —, cet UPDATE echoue. Or `entrypoint-prod.sh` rejoue TOUTES les
-- migrations a chaque demarrage, avec `ON_ERROR_STOP=1` : la production
-- s'arrete au redemarrage suivant, sur une migration jouee avec succes des
-- dizaines de fois auparavant.
--
-- Meme cause si deux lignes communes correspondent : elles seraient renommees
-- vers le meme nom, dans le meme UPDATE.
--
-- Les deux gardes ci-dessous rendent l'operation sure ET rejouable : on ne
-- renomme que s'il n'existe aucune ligne portant deja ce nom, et on n'en
-- renomme qu'UNE.
UPDATE aliment
   SET nom = 'Semoule de blé dur'
 WHERE id = (
       SELECT id FROM aliment
        WHERE cree_par IS NULL
          AND fitcarnet_normaliser(nom) LIKE '%semoule%'
          AND fitcarnet_normaliser(nom) LIKE '%complet%'
        ORDER BY id
        LIMIT 1)
   AND NOT EXISTS (
       SELECT 1 FROM aliment
        WHERE cree_par IS NULL
          AND fitcarnet_normaliser(nom) = fitcarnet_normaliser('Semoule de blé dur'));

SELECT 'apres' AS quand, nom, kcal_100, gluc_100, fibres_100, ratio
  FROM aliment
 WHERE cree_par IS NULL
   AND fitcarnet_normaliser(nom) LIKE '%semoule%';

COMMIT;

-- ---------------------------------------------------------------------
--  LE CONTROLE QUI COMPTE, ET QUI VAUT POUR TOUT LE CATALOGUE.
--
--  Ce que la semoule a revele : une ligne du catalogue commun que l'import
--  Ciqual ne couvre pas garde des valeurs tapees a la main, que plus rien ne
--  verifie ni ne met a jour. Elles peuvent etre justes. Elles peuvent aussi
--  dater d'une convention abandonnee, comme celle-ci.
--
--  Cette requete les liste. Une ligne qui en ressort n'est pas forcement
--  fausse — mais elle n'est prouvee par rien.
-- ---------------------------------------------------------------------
SELECT nom, categorie, kcal_100, gluc_100, fibres_100, ratio,
       CASE
         WHEN categorie = 'fec' AND ratio > 1.3
              AND kcal_100 NOT BETWEEN 300 AND 400
           THEN 'grain gonflant hors bande seche — SUSPECT'
         WHEN categorie = 'fec' AND ratio < 1
           THEN 'feculent qui retrecit — IMPOSSIBLE'
         WHEN fibres_100 IS NULL
           THEN 'fibres inconnues'
         ELSE 'a relire'
       END AS pourquoi
  FROM aliment
 WHERE cree_par IS NULL
 ORDER BY categorie, nom;
