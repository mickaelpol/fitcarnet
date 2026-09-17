-- =====================================================================
--  36 — UN SEUL CONTRÔLE DE QUANTITÉ SUR LE STOCK
--
--  Constat 02#14 de l'audit de septembre 2026, resté ouvert jusqu'au
--  17 septembre 2026. `stock.quantite` portait deux CHECK identiques :
--  `stock_quantite_check`, écrit dans la colonne par le schéma d'origine, et
--  `stock_quantite_positive`, posé par la migration 25. Deux règles pour un
--  même fait ne protègent pas deux fois : elles se contredisent le jour où
--  l'on en change une seule. `stock_quantite_positive` reste, nommée, et
--  c'est elle que `db/01-schema.sql` déclare.
--
--  Idempotent : `DROP CONSTRAINT IF EXISTS`. N'écrit aucune donnée.
-- =====================================================================

ALTER TABLE stock DROP CONSTRAINT IF EXISTS stock_quantite_check;
