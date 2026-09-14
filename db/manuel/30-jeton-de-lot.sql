-- =====================================================================
--  UN JETON POUR QUE DEUX TRAVAILLEURS NE SE DISPUTENT PAS UN LOT
-- =====================================================================
--
--  CONSTAT É6 DE L'AUDIT DU 7 SEPTEMBRE 2026.
--
--  `prendre()` verrouille le lot le temps de le prendre — `FOR UPDATE SKIP
--  LOCKED` — puis referme sa transaction. Passé cet instant, la seule chose
--  qui dit « quelqu'un travaille ici » est `vu_le`, touché à chaque ligne
--  envoyée, et `reprendreLesAbandonnes()` rend le lot après deux minutes de
--  silence.
--
--  Deux minutes, c'est long pour une ligne et court pour un Grocy qui rame.
--  Le travailleur A envoie une ligne, Grocy met trois minutes ; B constate le
--  silence, reprend le lot et s'y met ; A revient et écrase l'avancement de B.
--  Les deux traitent alors le même lot, et l'index unique « un seul lot actif
--  par compte » n'y peut rien : c'est le MÊME lot.
--
--  Les lignes renvoyées deux fois sont sans gravité — `definirStock` pose une
--  quantité absolue, Grocy répond « déjà à jour ». Ce qui casse, c'est
--  `traites`, et surtout `terminer()` appelé deux fois avec deux listes
--  d'échecs différentes : l'écran de rattrapage montre alors n'importe quoi.
--
--  LE JETON. `prendre()` en tire un et l'inscrit sur le lot. Chaque écriture
--  suivante le présente ; la base ne l'accepte que s'il est toujours le bon.
--  Un travailleur dépossédé l'apprend à sa première écriture — zéro ligne
--  modifiée — et s'arrête, au lieu de se battre en silence avec son
--  remplaçant.
--
--  NULLABLE, ET C'EST VOULU : un lot en attente n'a pas encore de jeton. La
--  colonne se remplit à la prise et se vide à la reprise.
-- =====================================================================

ALTER TABLE inventaire_lot ADD COLUMN IF NOT EXISTS jeton UUID;

COMMENT ON COLUMN inventaire_lot.jeton IS
    'Pose a la prise, presente a chaque ecriture. Un lot repris change de jeton : l''ancien travailleur est alors refuse.';
