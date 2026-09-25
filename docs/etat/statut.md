# Statut du projet

> **Frontière avec `REPRENDRE.md`, décidée le 25 septembre 2026.** `REPRENDRE.md` fait foi
> sur le **chantier** — la refonte serveur autoritaire, son récit, ses paliers, ses décisions
> métier — et c'est la première lecture. Ce dossier-ci fait foi sur l'**outillage** et sert de
> point d'entrée à `/harness`. La file métier ne se recopie pas ici : on y renvoie.

> Chaque session AJOUTE une entrée en haut, elle n'efface jamais celles des autres — plusieurs
> personnes (ou plusieurs sessions Claude) peuvent travailler en parallèle sans s'écraser.
> Quand ce fichier dépasse ~300 lignes, archive les entrées de plus d'un mois dans
> docs/etat/archive/statut-<année>.md (le skill /harness te le signale).

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
