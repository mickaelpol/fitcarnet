-- =====================================================================
--  COMMENT TU CUIS D'HABITUDE.
--
--  Le probleme, tel qu'il s'est presente : a chaque plan, il faut redire que
--  le riz passe a l'eau et le poulet a la poele. Sur une semaine de quatre
--  repas, c'est une trentaine de choix a refaire — et les memes que la
--  semaine derniere. Un outil qui fait recommencer ce qu'on vient de lui
--  apprendre n'aide pas, il occupe.
--
--  POURQUOI UNE TABLE A PART, ET PAS UN CHAMP SUR L'ALIMENT
--
--  C'est la meme raison qu'en 20, et elle n'a pas change : le frigo a DEUX
--  sources — la table `aliment` pour les comptes ordinaires, Grocy pour
--  l'administrateur. Un champ pose sur la fiche existerait en double, avec
--  deux vocabulaires libres de diverger. On garde donc la cuisson hors de
--  l'aliment.
--
--  LA CLE EST LE NOM, PAS UN IDENTIFIANT
--
--  Et c'est ce qui rend cette table possible malgre les deux sources. Un
--  aliment Grocy porte « grocy:12 », un aliment de la base porte un entier :
--  ces deux mondes n'ont aucun identifiant commun. Le NOM, lui, en est un —
--  « riz basmati » est le meme mot des deux cotes.
--
--  Le nom est stocke NORMALISE : minuscules, sans accent, espaces reduits.
--  Sans cela « Riz Basmati », « riz basmati » et « Riz basmati  » feraient
--  trois habitudes pour un seul riz, et l'utilisateur verrait ses reglages
--  disparaitre au moindre changement de casse.
--
--  ET C'EST L'ECRAN QUI NORMALISE, PAS L'API NI LE SQL. La regle doit etre
--  la MEME a l'ecriture et a la lecture ; l'ecrire des deux cotes, c'est se
--  donner deux regles libres de diverger — le jour ou l'une accepte le tiret
--  et pas l'autre, l'habitude s'ecrit sous une cle et se cherche sous une
--  autre, et elle ne revient jamais sans que rien ne le signale. Cote base,
--  `aliment` n'est donc qu'une CLE OPAQUE : personne ici ne l'interprete.
--  Meme raisonnement que le `contenu` jsonb des plans enregistres.
--
--  TROIS ETATS, COMME A L'ECRAN
--
--    - une ligne avec un mode        -> cet aliment se cuit ainsi ;
--    - une ligne avec mode_cuisson_id NULL -> il ne se cuit PAS, c'est decide ;
--    - aucune ligne                  -> jamais decide, on demandera.
--
--  Le NULL n'est donc pas un trou : c'est une reponse. Meme distinction que
--  le zero et le champ vide dans les restes.
--
--  CE N'EST QU'UN DEFAUT. L'habitude pre-remplit ; l'utilisateur change ce
--  qu'il veut, repas par repas, sans que sa correction du jour ne redevienne
--  une habitude — sinon un essai deviendrait une regle.
--
--  A jouer APRES 21. Idempotent.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS cuisson_habituelle (
  id              bigserial PRIMARY KEY,
  utilisateur_id  uuid   NOT NULL
                  REFERENCES utilisateur (id) ON DELETE CASCADE,
  -- le nom normalise de l'aliment : minuscules, sans accent
  aliment         text   NOT NULL,
  -- NULL = « se mange sans cuisson », et c'est un choix, pas un trou.
  --
  -- D'ou le CASCADE, contre ma premiere idee. J'avais ecrit SET NULL pour que
  -- l'habitude survive a la suppression d'un mode. Le test l'a montre pour ce
  -- que c'etait : le riz dont on supprime « Eau bouillante » se serait
  -- retrouve a NULL, c'est-a-dire pre-rempli « se mange sans cuisson » — une
  -- REPONSE FAUSSE, et muette. On aurait decouvert le riz cru devant la
  -- boite. NULL veut dire une seule chose ici ; le faire aussi vouloir dire
  -- « le mode a disparu » est exactement la confusion que le reste du projet
  -- passe son temps a defaire.
  --
  -- La ligne s'en va donc, et l'ecran repose la question. Une question de
  -- trop coute un geste ; une reponse fausse coute un repas.
  mode_cuisson_id integer
                  REFERENCES mode_cuisson (id) ON DELETE CASCADE,
  maj_le          timestamptz NOT NULL DEFAULT now()
);

-- Une seule habitude par aliment et par compte. C'est cette contrainte qui
-- fait de l'ecriture un remplacement et non un empilement.
CREATE UNIQUE INDEX IF NOT EXISTS cuisson_habituelle_unique
  ON cuisson_habituelle (utilisateur_id, aliment);

COMMIT;

SELECT count(*) AS habitudes FROM cuisson_habituelle;
