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
| 2026-09-26 | Les pesées de l'éditeur d'aliment passent par `ChampNombre` et se relisent par `texteDuNombre` ; les macros de l'éditeur restent hors feature | Seule la relecture (`String(…)` → « 42.5 ») et le champ tenu à la main restaient hors de `saisieNombre` ; l'enregistrement y passait déjà depuis le 20/09. | Traiter aussi les macros (`nombreSaisi(v) ?? 0`) : changement de contrat (`ALIMENT_VIDE`, type `Aliment`, serveur), pas un correctif d'écran. | pesees-editeur-aliment-saisienombre |
| 2026-09-26 | Une pesée illisible est signalée par la seule bordure rouge de `ChampNombre` | C'est le signal des séries et des modèles ; un message local serait une seconde façon de dire la même chose. | Un message « Poids avant cuisson illisible » propre à l'écran. | pesees-editeur-aliment-saisienombre |
| 2026-09-26 | Une pesée à 2 décimales est acceptée et arrondie par la base (`NUMERIC(7,1)`) | Une balance de cuisine pèse au gramme : le cas n'est pas tapé honnêtement. Si un refus devient nécessaire, il sera serveur. | Refus à l'écran (recréerait un juge front) ; refus serveur (trop lourd pour un cas inexistant). | pesees-editeur-aliment-saisienombre |
| 2026-09-26 | La feature porte une épreuve e2e en plus des tests de rendu | Choix du propriétaire, contre la recommandation (rendu seul, le serveur ne change pas) : prouver la relecture « 42,5 » sur l'application entière. | Tests de rendu seuls. | pesees-editeur-aliment-saisienombre |
| 2026-09-26 | L'éditeur d'aliment ne convertit plus aucun texte en nombre : il envoie les champs tels que tapés, le serveur lit, juge, calcule le rendement et enregistre | Propriétaire : « tout ce qui se décide doit venir du serveur ; le client affiche et fait quelques contrôles légers mais ne décide de rien ». Lire « 12,5 » est une règle : un front qui l'oublierait écrirait 125 (cf. 42,5 kg → 425 kg). | Macros `number \| null` au front (garde une lecture et un jugement dans l'écran) ; l'écran convertit et envoie `null` ; macros nulles en base (touche le solveur). | macros-editeur-vide-pas-zero |
| 2026-09-26 | Tout l'éditeur est concerné, pesées, rendement et quantité compris ; `ratioDepuisPesees`, `provenanceRatio`, `expliquerRatio` quittent le front | Un écran à moitié conforme est le « jumeau oublié » ; les pesées portaient une formule métier calculée à l'écran. | Les cinq valeurs nutritionnelles d'abord, le reste plus tard. | macros-editeur-vide-pas-zero |
| 2026-09-26 | Les refus du serveur s'affichent en rouge sous leur champ ; l'écran n'en rédige aucun. **Remplace**, pour l'éditeur d'aliment, la décision du même jour « une pesée illisible est signalée par la seule bordure rouge de `ChampNombre` » | Demande du propriétaire. Le serveur renvoie déjà `{champ, message}`. | Bordure rouge calculée par l'écran (`illisible`, `nombreSaisi`). | macros-editeur-vide-pas-zero |
| 2026-09-26 | Les champs numériques refusent la frappe ENTIÈRE qui ferait apparaître autre chose que chiffres, « , » ou « . » ; pavé numérique sur mobile | Contrôle léger voulu par le propriétaire. Refuser la frappe ne retire jamais rien en silence ; le serveur reste seul juge du lisible (« 4,2,1 » passe le filtre et il le refuse). | Retirer les caractères interdits : si la virgule manquait à la liste, « 42,5 » deviendrait « 425 ». | macros-editeur-vide-pas-zero |
| 2026-09-26 | Serveur muet : pendant la saisie, bandeau « rien n'est vérifié » et rendement « inconnu » ; à l'enregistrement, « rien n'a été enregistré, réessaie », saisie intacte | Règle 7. Risque accepté : en cuisine sur réseau capricieux, plus de rendement local. | Garder un calcul local de secours (double juge). | macros-editeur-vide-pas-zero |
| 2026-09-26 | `POST`/`PATCH /api/aliments` passent par `VerdictAliment` : un seul juge avant et pendant l'écriture ; les contraintes de l'entité restent en filet | Aujourd'hui l'écriture ne passe PAS par le verdict : deux juges côté serveur, l'écran peut dire « enregistrable » de ce que l'écriture refuse. | Garder l'entité seule juge à l'écriture. | macros-editeur-vide-pas-zero |
| 2026-09-26 | La route d'écriture accepte les deux formes, `"12,5"` et `12.5` ; `null` est refusé comme `""` | Gratuit côté serveur, aucune règle remise au front, les écrivains hors écran (e2e, futur import) survivent à un changement de front. | Texte seul (réécrire `peseesEditeur.spec.ts`). | macros-editeur-vide-pas-zero |
| 2026-09-26 | Sur `PATCH`, l'origine (valeurs avant modification) est lue en base, jamais prise au client ; deux modifications concurrentes : la dernière gagne | Une origine déclarée par le client laisserait une requête forgée enregistrer un aliment incohérent. La concurrence n'est pas un cas réel (propriétaire). | Faire confiance à l'origine envoyée par l'écran, comme la route de verdict. | macros-editeur-vide-pas-zero |
| 2026-09-26 | **Grocy est abandonné : le propriétaire a migré ses données vers la base de l'application et ne s'en sert plus.** Aucun défaut, critère, test ni revue ne porte plus sur le chemin Grocy (`source_frigo = grocy`, `/mon-frigo/aliment`, `/mon-frigo/quantite`, `MigrationGrocyController`) ; un constat qui ne touche que lui est écarté, pas corrigé. Son retrait du code reste un chantier à part (`prochaines-etapes.md`) | Le propriétaire a dû le répéter plusieurs fois ; la revue de `macros-editeur-vide-pas-zero` a encore classé « ÉLEVÉ » un défaut du seul chemin Grocy. | Maintenir le chemin Grocy à parité en attendant son retrait. | macros-editeur-vide-pas-zero |
| 2026-09-26 | **Amende CA-5 de `macros-editeur-vide-pas-zero`** : « Enregistrer » reste éteint tant qu'une des quatre macros obligatoires est VIDE. L'écran ne regarde que le vide, il ne lit ni ne juge aucune valeur ; le serveur reste le seul juge final | Propriétaire : « il faut quand même un minimum de vérification côté front pour éviter à l'utilisateur d'avoir à faire des allers-retours, mais seul le serveur reste la vérif finale ». Il ne veut jamais envoyer de valeur vide ni nulle. | Envoyer le vide et laisser le serveur répondre 422 (aller-retour) ; vide = 0 automatiquement (règle 6). | macros-editeur-vide-pas-zero |

## 2026-09-25 — B4 : la borne d'un envoi d'habitudes est un plafond posé, pas un majorant

> ⚠️ **RÉVISÉE LE SOIR MÊME** : le chiffre de 2 000 était faux. Voir l'entrée
> « le plafond passe de 2 000 à 10 000 » plus bas. Cette entrée est gardée telle
> quelle — le raisonnement reste juste, c'est le chiffre qui ne l'était pas.

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

## 2026-09-25 (soir) — B4 : le plafond brut passe de 2 000 à 10 000

**Choix.** `MAX_LIGNES` vaut 10 000, et non 2 000 comme décidé le matin.

**Pourquoi.** 2 000 sortait d'un calcul confortable — « mois entier coché,
31 jours × 4 repas × quinze aliments = 1 860 ». Quinze n'était pas une mesure,
c'était un chiffre qui semblait large. À dix-sept aliments par repas, le même
mois fait 2 108 lignes : refusé en 422, et comme l'échec d'écriture des habitudes
est silencieux **par décision** (`retenirLesCuissons`, `onError: () => {}`),
l'utilisateur perdait tout son lot sans un mot. C'est exactement le défaut que la
double borne venait corriger, réintroduit par sa propre correction. Relevé par
`revue-fitcarnet` le jour même.

10 000 est adossé au **pire cas concevable** et non à ce qui semble large :
31 jours × 4 repas × 60 aliments — le seul chiffre mesuré du dépôt sur un vrai
plan, `usePlanCalcule.ts:34` — soit 7 440 lignes. Vérifié depuis contre la vraie
base : 7 440 lignes acceptées en 75 ms, 10 001 refusées.

**La leçon, plus large que la borne.** Un plafond posé à partir d'un cas
« raisonnable » refuse un jour quelqu'un de raisonnable. Il se pose à partir du
maximum que le produit permet d'atteindre, ou il ne se pose pas.
