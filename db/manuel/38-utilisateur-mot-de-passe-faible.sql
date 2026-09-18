-- =====================================================================
--  Migration 38 — signaler un mot de passe qui ne respecte plus les règles
--
--  Le 18 septembre 2026, la règle du projet est passée de « dix caractères »
--  à « douze caractères, une minuscule, une majuscule, un chiffre et un
--  caractère spécial » (`api/regles/motdepasse.json`).
--
--  LES COMPTES EXISTANTS NE SONT PAS TOUCHÉS : personne ne doit se retrouver
--  dehors un matin parce qu'une règle a changé. Mais il faut pouvoir le leur
--  DIRE, et leur proposer de changer.
--
--  POURQUOI UNE COLONNE PLUTÔT QU'UN CALCUL. La base ne garde qu'une empreinte
--  du mot de passe : on ne peut pas savoir, en le relisant, s'il contient une
--  majuscule. Le seul moment où l'application l'a en clair est **la connexion**.
--  C'est donc là qu'on juge, et il faut bien ranger la réponse quelque part
--  jusqu'à la prochaine fois.
--
--  CE QUE CETTE COLONNE APPREND À QUELQU'UN QUI LIRAIT LA BASE : un bit — « ce
--  compte a un mot de passe qui ne respecte plus les règles ». Qui lit cette
--  table a déjà l'empreinte, c'est-à-dire infiniment plus.
--
--  DÉFAUT À `FALSE`, ET C'EST LE BON SENS DE L'ERREUR : tant que personne ne
--  s'est reconnecté, on n'affiche rien. Un défaut à `TRUE` accuserait tout le
--  monde, y compris ceux dont le mot de passe est parfait.
-- =====================================================================

ALTER TABLE utilisateur
    ADD COLUMN IF NOT EXISTS mot_de_passe_faible BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN utilisateur.mot_de_passe_faible IS
  'Posé à la connexion, seul moment où le mot de passe est en clair : vrai quand il ne respecte plus api/regles/motdepasse.json. Sert à afficher un avertissement, ne bloque rien.';
