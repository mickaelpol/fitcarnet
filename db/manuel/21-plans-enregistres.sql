-- =====================================================================
--  LES PLANS DE BATCH COOKING, CONSERVES.
--
--  CE QUE CETTE MIGRATION CHANGE DANS LA NATURE DE L'APPLICATION
--
--  `CALCULATEUR.md` disait, noir sur blanc : « Rien n'est enregistre. Le plan
--  est un outil d'organisation, pas un journal. On ferme l'ecran, tout
--  disparait. » Cette regle tombe ici, et pas par confort.
--
--  Le batch cooking l'a rendue intenable. On cuisine le dimanche pour la
--  semaine ; le jeudi midi, devant sa boite, il faut savoir combien s'en
--  servir pour tenir ses macros. Sans conservation, il faudrait recomposer
--  tout le plan ce jeudi-la — avec un frigo qui a change entre-temps, donc
--  des quantites differentes — pour lire un chiffre decide le dimanche. La
--  regle vidait la fonctionnalite de son sens.
--
--  ON ENREGISTRE UN INSTANTANE, PAS UNE RECETTE A REJOUER
--
--  Le contenu est le RESULTAT deja calcule, pas les ingredients du calcul.
--  C'est le point le plus important de ce fichier.
--
--  Rejouer le solveur au moment de la consultation donnerait un autre plan :
--  le stock aura bouge, un aliment aura ete supprime, une cible modifiee. Le
--  jeudi, on ne veut pas savoir ce qu'on cuisinerait aujourd'hui — on veut
--  savoir ce qu'on a cuisine dimanche. Un plan enregistre doit donc etre
--  autonome : il porte des noms et des grammes, pas des identifiants
--  d'aliments qui peuvent disparaitre.
--
--  D'ou le `jsonb` plutot qu'un schema relationnel. Ce n'est pas de la
--  paresse : ces donnees ne sont jamais requetees par leur contenu, jamais
--  jointes, jamais mises a jour ligne a ligne. On les ecrit une fois et on
--  les relit entieres. Un schema en cinq tables n'apporterait ici que des
--  jointures et des migrations a chaque evolution de l'ecran.
--
--  La liste de courses est DANS l'instantane, a la demande de Mickael :
--  savoir ce qu'il manquait au moment ou le plan a ete fait fait partie du
--  plan.
--
--  A jouer APRES 20. Idempotent.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS plan_repas (
  id             bigserial PRIMARY KEY,
  -- uuid, comme `utilisateur.id`. La premiere version de ce fichier avait
  -- ecrit `bigint` : PostgreSQL a refuse la cle etrangere et annule toute la
  -- transaction. Bonne nouvelle au passage — une migration qui se trompe de
  -- type ne laisse rien derriere elle.
  utilisateur_id uuid        NOT NULL
                 REFERENCES utilisateur (id) ON DELETE CASCADE,
  -- « Semaine du 11/08 », ou ce que l'utilisateur aura tape.
  libelle        text        NOT NULL,
  cree_le        timestamptz NOT NULL DEFAULT now(),
  contenu        jsonb       NOT NULL
);

-- On liste toujours SES plans, du plus recent au plus ancien. C'est la seule
-- requete que cette table servira.
CREATE INDEX IF NOT EXISTS plan_repas_par_compte
  ON plan_repas (utilisateur_id, cree_le DESC);

COMMIT;

SELECT count(*) AS plans_enregistres FROM plan_repas;
