# Décisions

> **Frontière avec `REPRENDRE.md`, décidée le 25 septembre 2026.** `REPRENDRE.md` fait foi
> sur le **chantier** — la refonte serveur autoritaire, son récit, ses paliers, ses décisions
> métier — et c'est la première lecture. Ce dossier-ci fait foi sur l'**outillage** et sert de
> point d'entrée à `/harness`. La file métier ne se recopie pas ici : on y renvoie.

> Append-only. On n'efface jamais une décision : on en ajoute une nouvelle qui la remplace, en citant l'ancienne.
> Une ligne par décision. Le *pourquoi* est obligatoire, les alternatives rejetées aussi quand il y en avait.

| Date | Décision | Pourquoi | Alternatives rejetées | Feature |
|---|---|---|---|---|
| 2026-09-25 | `core.autocrlf` global passe de `true` à `input` | Sous WSL2, `autocrlf=true` restitue les fichiers en CRLF au checkout. Les 19 scripts de `claude-harness` en sont morts (`set -euo pipefail\r` → « invalid option name »), et avec eux `/harness-init` et les 4 hooks du plugin. `planning-with-files` (27 scripts) et `superpowers-symfony` étaient touchés aussi. Les blobs commités, eux, étaient sains : le défaut venait entièrement de la machine. | Dé-CRLF le seul cache du plugin : pansement, sauté à la prochaine mise à jour, et laissait les autres plugins cassés. | — (outillage) |
| 2026-09-25 | `.gitattributes` ajouté au dépôt `claude-harness`, calqué sur celui de fitcarnet | Pour que le plugin résiste à un poste mal réglé, sans dépendre de la config locale. fitcarnet portait déjà exactement cette parade — `*.sh text eol=lf`, avec le commentaire « un script shell en CRLF casse à l'exécution sous Linux » — et c'est ce qui l'a laissé indemne. La leçon était apprise ici mais pas reportée là-bas. | Ne corriger que le réglage machine : aurait laissé le dépôt fragile sur tout autre poste. | — (outillage) |
| 2026-09-25 | `test_cmds.back` du harness = `docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'` | La détection automatique proposait `cd api && vendor/bin/phpunit`, qui ne peut pas démarrer : le PHP de l'hôte n'a ni `dom`, ni `mbstring`, ni `xmlwriter`. Le binaire est `bin/phpunit`, pas `vendor/bin/phpunit`. Éprouvé : 555 tests OK. Le montage du conteneur a été vérifié (`/home/micka/perso/fitcarnet/api -> /app`) — c'est bien ce clone, pas un autre. | Faire confiance à la détection : elle avait elle-même signalé le doute dans son champ `unknown`. | — (outillage) |
| 2026-09-25 | Les 7 règles non négociables de `CLAUDE.md` restent la seule référence ; les 5 règles génériques du gabarit du harness ne sont pas recopiées | Elles doublonneraient, en moins précis et sans les dates de panne qui font la valeur de celles du projet. Le harness n'ajoute que sa section « Cadre de projet ». | Fusionner les deux listes : aurait créé une seconde écriture des mêmes règles — exactement le défaut que la règle 5 interdit. | — (outillage) |
| 2026-09-25 | `REPRENDRE.md` et `docs/etat/` coexistent, avec des rôles séparés et écrits | `REPRENDRE.md` est le **récit** du chantier, daté, et reste la première lecture — `CLAUDE.md` le désigne ainsi. `docs/etat/` porte la **file de tâches et les décisions** que `/harness` consomme. Deux formes, deux usages, une frontière écrite dans les deux fichiers pour qu'aucun ne prétende être l'autre. | Migrer `REPRENDRE.md` vers `docs/etat/` : une seule source, mais il fallait corriger `CLAUDE.md` et on perdait le fil narratif daté qui fait la valeur du fichier. | — (outillage) |
| 2026-09-25 | Les bobines vidéo des vérifications ne sont pas versionnées | Elles pèsent lourd et git ne sait pas compresser une vidéo. Les **rapports écrits** de `docs/verifications/`, eux, restent versionnés — vérifié par `git check-ignore`. | Tout versionner : le dépôt porte déjà `front/dist/` volontairement, ça suffit comme poids assumé. | — (outillage) |
| 2026-09-25 | `presentation/fitcarnet-pro-2026-09-21.pptx` reste non suivi, tel quel | Décision du propriétaire : ni versionné, ni ignoré, ni retiré. Il restera visible dans chaque `git status`, et c'est assumé. | Ignorer `presentation/*.pptx`, ou le versionner. | — |
| 2026-09-25 | B4 se recentre : c'est `habitudesAEcrire` qui part au serveur, pas `depuisLesHabitudes` | `depuisLesHabitudes` a besoin des repas du plan RÉSOLU, que le solveur calcule au front jusqu'au palier 3 ; l'y envoyer aujourd'hui coûterait un aller-retour réseau par geste, la régression que le plan nomme au § palier 1. Et ce n'est pas un jugement : il réindexe une clé d'habitude en clé de cuisson. `habitudesAEcrire`, lui, ne tourne qu'au passage à « Cuisiner » — un geste, pas une frappe — et porte une vraie règle métier. | Suivre `REPRENDRE.md`, qui le désignait « le seul candidat net » : mesuré faux le 25 septembre 2026, le journal est corrigé. | habitudes-cuisson-au-serveur |
| 2026-09-25 | Le filtrage de l'inchangé s'écrit en SQL (`ON CONFLICT … DO UPDATE … WHERE … IS DISTINCT FROM EXCLUDED.…`), pas en PHP | Une clause, dans le seul dépôt qui écrit cette table, et sans fenêtre de concurrence : PostgreSQL ne touche pas la ligne quand rien ne change, donc `maj_le` ne bouge pas et l'instruction rend 0. `IS DISTINCT FROM` traite `NULL` comme une valeur, ce dont la règle 6 a besoin. C'est le même argument qui avait fait choisir `ON CONFLICT` en 2026-09-18. | Comparer en PHP dans `LotDHabitudes` en lui passant les habitudes connues : testable sans base, mais rouvre le « lire puis écrire » que le dépôt avait fermé, et remet la règle dans un second endroit. | habitudes-cuisson-au-serveur |
| 2026-09-25 | La refonte serveur autoritaire reste sur `serveur-autoritaire` ; une seule PR à la fin du chantier | Demande du propriétaire, le 25 septembre : `master` est tiré par le NAS toutes les cinq minutes, donc fusionner c'est déployer. Le chantier n'est pas fini — B4, B5 et le palier 3 restent. | Fusionner morceau par morceau : mettrait en production un chantier à moitié traversé. | habitudes-cuisson-au-serveur |

## 2026-09-25 — B4 : la borne d'un envoi d'habitudes est un plafond posé, pas un majorant

**Choix.** `LotDHabitudes` porte deux bornes : `MAX_LIGNES = 2000` sur l'envoi brut,
et `MAX = 200` sur les aliments distincts après dédoublonnage.

**Pourquoi.** La spec demandait de mesurer le majorant du nombre de couples
(repas, aliment) d'un plan de sept jours. La mesure montre qu'il n'y en a pas :
le calendrier laisse cocher un mois entier et `Compose.ajouts` est une liste libre.
Le pire cas théorique est donc 31 × 4 × (taille du frigo), inutilisable comme borne.
2 000 laisse passer le plus gros geste que l'écran sache produire (un mois coché à
quatre repas de quinze aliments : 1 860) et ferme la porte à un corps qui ne vient
plus de lui. 200 garde son chiffre et sa raison d'origine — « une semaine de quatre
repas met en jeu une trentaine d'aliments distincts » — qui redevient vraie une fois
appliquée aux distincts et non aux lignes reçues.

**Ce que ça remplace.** Un `MAX = 200` unique comparé aux lignes reçues, qui serait
devenu atteignable par un usage normal dès que le front cesse de n'envoyer que les
écarts : un refus 422 sur un geste légitime.
