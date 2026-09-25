# Statut du projet

> **Frontière avec `REPRENDRE.md`, décidée le 25 septembre 2026.** `REPRENDRE.md` fait foi
> sur le **chantier** — la refonte serveur autoritaire, son récit, ses paliers, ses décisions
> métier — et c'est la première lecture. Ce dossier-ci fait foi sur l'**outillage** et sert de
> point d'entrée à `/harness`. La file métier ne se recopie pas ici : on y renvoie.

> Chaque session AJOUTE une entrée en haut, elle n'efface jamais celles des autres — plusieurs
> personnes (ou plusieurs sessions Claude) peuvent travailler en parallèle sans s'écraser.
> Quand ce fichier dépasse ~300 lignes, archive les entrées de plus d'un mois dans
> docs/etat/archive/statut-<année>.md (le skill /harness te le signale).

## 2026-09-25 (nuit, fin) — B4 : phase `tdd` terminée, suites vertes des deux côtés (session Claude)

- **Le cinquième double juge est parti.** `habitudesAEcrire` est supprimée ;
  `lignesDHabitudes(repas, choisi)` la remplace — une ligne par couple (repas,
  aliment) décidé, dans l'ordre du plan, sans comparer ni dédoublonner. Le tri
  se fait en base (`WHERE ... IS DISTINCT FROM`) et le dédoublonnage dans
  `LotDHabitudes::depuis`.
- **Le défaut hors-ligne est corrigé** : `usePlanCalcule` ne passe plus
  `mesCuissons.data ?? {}` comme « ce qui est déjà connu ». Une fonction qui ne
  reçoit pas les habitudes connues ne peut plus se tromper sur ce qu'elle en croit.
- **`remplacer()` rend enfin ce qui a changé**, et non ce qu'on lui a demandé.
- **Trois commits** : `b9bd24d` (CA-8), `c35d3d2` (CA-R4), `4dfee03` (CA-1, CA-6, CA-7).
  Rien n'est poussé — `serveur-autoritaire` reste locale, une seule PR à la fin.
- **Preuve** : API 560 tests / 1 297 assertions verts ; front 740 tests + 46 de
  rendu verts. Le garde `habitudesAuServeur.test.ts` a été éprouvé en sabotant
  volontairement le code : il tombe en nommant le fichier fautif.
- **Ce qui n'est PAS prouvé ici, et c'était prévu** : CA-2, CA-3, CA-4 demandent
  une vraie base (un `maj_le` qui ne bouge pas ne se voit pas avec une
  `Connection` doublée). La spec le disait dès son écriture ; c'est la phase e2e.
- **Un reste pour la phase `docs`** : `REPRENDRE.md` nomme encore
  `habitudesAEcrire` au présent. Les autres occurrences (`decisions.md`,
  `docs/audit-2026-09/03-front.md`) sont au passé et se gardent.
- **Phase passée à `review`.** PHPStan rend toujours ses 5 erreurs préexistantes,
  aucune de ce chantier.

## 2026-09-25 (nuit) — B4 phase `tdd` : la question ouverte est tranchée, phase rouge lancée (session Claude)

- **La question ouverte de la spec est fermée, et la mesure surprend** : il n'y a
  **aucun majorant dans le code**. Les jours ne sont pas bornés (le calendrier est
  mensuel, `calendrier.tsx:91`) et les aliments d'un repas non plus (`Compose.ajouts`
  est une liste libre, `demandeRepas.ts:274`, bornée par le seul frigo). Chercher un
  majorant était une impasse : la borne brute est un **plafond posé**, pas un
  majorant. Calcul et chiffres dans la spec, section « Le majorant, mesuré le
  25 septembre 2026 ».
- **CA-R4 porte désormais ses deux chiffres** : `MAX_LIGNES = 2000` sur l'envoi brut
  (un mois entier coché fait 1 860 couples), `MAX = 200` conservé mais appliqué aux
  aliments **distincts** après dédoublonnage.
- **Une correction à la spec** : CA-5 était déjà couvert côté serveur par
  `testLeMemeAlimentDeuxFoisNeFaitQuUneLigne` (`LotDHabitudesTest.php:78`). Ce qui
  manquait n'était pas le test de la règle mais la preuve de son **unicité** — c'est
  le volet (c) du garde CA-1.
- **La base de dev de ce poste ne pouvait pas servir de mesure empirique** : 8 aliments,
  2 plans de démonstration. Noté pour la prochaine fois qu'on voudra un chiffre réel.
- **Phase rouge lancée**, quatre fiches : CA-8 + la clause `IS DISTINCT FROM` (dépôt),
  CA-R4 (les deux bornes), CA-1 (nouveau garde `habitudesAuServeur.test.ts`), et la
  mise à plat `lignesDHabitudes` qui remplace `habitudesAEcrire` (CA-6, CA-7).
- **Rien n'est encore vert, rien n'est commité.** `npm run verif` est rouge, et c'est
  le rouge attendu : `lignesDHabitudes` n'existe pas encore.
- **PHPStan rend toujours ses 5 erreurs préexistantes**, inchangées, aucune n'est de ce
  chantier — elles sont déjà dans `prochaines-etapes.md`.

## 2026-09-25 (soir) — B4 cadré : spec écrite, phase `tdd` (session Claude)

- **Feature ouverte** : `docs/features/habitudes-cuisson-au-serveur.md`, phase `tdd`.
  C'est le morceau B4 du palier B — le récit reste dans `REPRENDRE.md` § 3.
- **Décidé avec le propriétaire** : le chantier reste sur `serveur-autoritaire`,
  **une seule PR à la fin**. Aucun push vers `master` — le NAS le tire toutes les
  cinq minutes.
- **Deux trouvailles de la phase de spec, dans aucun document jusqu'ici** :
  1. **un cinquième double juge** — « la dernière décision gagne » est écrite
     deux fois, `habitudesAEcrire` (`front/src/calcul/habitudesCuisson.ts:126`) et
     `LotDHabitudes::depuis` (`api/src/Service/LotDHabitudes.php:79`) ;
  2. **un défaut hors-ligne mesuré** — `usePlanCalcule.ts:133` passe
     `mesCuissons.data ?? {}` : requête en pause, `data` vaut `undefined`, le front
     croit ne rien connaître et réécrit toutes les habitudes du plan.
- **Une affirmation de `REPRENDRE.md` corrigée** : `depuisLesHabitudes` n'est PAS
  le candidat de B4 (il a besoin du plan résolu → palier 3). Le vrai candidat est
  `habitudesAEcrire`. Le § 3 du journal est corrigé le même jour.
- **Relevé au passage** : `remplacer()` rend `count($aEcrire)`, c'est-à-dire ce
  qu'on lui a demandé et non ce qui a changé (CA-8). Et le plafond `MAX = 200` de
  `LotDHabitudes` devient atteignable par un usage normal dès que le front
  n'envoie plus seulement les écarts (CA-R4) : il faut deux bornes.
- **L'outil `LSP` est actif** dans cette session : la ligne « redémarrer Claude
  Code » de `prochaines-etapes.md` est fermée.
- Rien n'a été codé, rien n'a été commité : phase de spec seulement.

## 2026-09-25 12:30 — installation du harness (session Claude)
- **En cours** : la refonte « serveur autoritaire » (`docs/plan-serveur-autoritaire.md`,
  paliers 0 à 3). Le palier B est à moitié traversé. Déjà passés au serveur : cohérence
  d'une cible, conversion d'un plan coach, « stock moins ce qui est promis », seuil d'écart
  d'inventaire, et les quatre anciens doubles juges — `api/regles/` n'existe plus, et il
  ne faut pas en recréer un. **Restent au front** : `fournees.ts` et `habitudesCuisson.ts`
  (B4), `performance.ts` avec le 1RM (B5), et le solveur (palier 3, non commencé).
- **À surveiller** : `serveur-autoritaire` a **26 commits d'avance sur `master`** et zéro
  de retard, soit 155 fichiers. Le NAS tire `master` toutes les cinq minutes : fusionner,
  c'est mettre en production. Cela attend une décision explicite.
- **Fait cette session** : installation du harness, bloquée d'abord par un défaut de
  configuration de la machine — `core.autocrlf=true` en global rendait les dix-neuf
  scripts du plugin inexécutables. Réglage passé à `input`, `.gitattributes` ajouté au
  dépôt `claude-harness`, 901 fichiers de cache normalisés. Détection de pile corrigée
  (les tests API passent par le conteneur). `docs/etat/` posé, reconnaissance initiale
  écrite et complétée par trois mesures.
- **Mesuré ce jour, pas déduit** : **555 tests API** au vert (1 288 assertions) et
  **737 tests front + 46 de rendu**, 0 échec ; base de dev à jour avec ses 3 484 lignes
  CIQUAL ; phpstan rend 5 erreurs préexistantes.
- **Tranché** : `REPRENDRE.md` garde le récit, `docs/etat/` prend la file et les décisions ;
  les bobines vidéo ne sont pas versionnées ; le `.pptx` du 21 septembre reste non suivi,
  tel quel. Les trois sont dans `decisions.md`.

## Environnement (ne change pas à chaque session, en bas du fichier)
- **Lancer l'app** : `docker compose -f compose.dev.yml up`. Le front web se régénère avec
  `cd front && npm run build:web` (`front/dist/` est versionné volontairement).
- **Tests** : API `docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'` —
  **dans le conteneur**, le PHP de l'hôte n'a pas les extensions requises.
  Front `cd front && npm test`. Bout en bout `cd e2e && npm test`, qui exigent
  l'environnement de dev debout **et** un `front/dist` à jour.
- **Appareil pour les vérifications** : émulateur Android Studio côté Windows + Expo Go,
  Metro dans WSL, pilotage par `adb.exe` (skill `verification-android`). Sur le web,
  Playwright et ses navigateurs sont installés.
- **Une seule arborescence par poste, sous WSL2.** Jamais de second clone : c'est ce qui a
  coûté le bug de septembre 2026. Ce qui doit circuler passe par git.
