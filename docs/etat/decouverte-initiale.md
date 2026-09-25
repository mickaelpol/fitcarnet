# Découverte initiale — 25 septembre 2026

## Doc narrative existante : oui, fiable — pointe vers elle
`REPRENDRE.md` (1046 lignes, réécrit le 18 septembre, dernière section « reprendre
ici » datée du 21/22 septembre) est le journal de bord du chantier. Je l'ai
confronté au dépôt réel plutôt que de le croire sur parole :

- Il affirme que les quatre « doubles juges » sont supprimés et `api/regles/`
  vidé → **vérifié** : `api/regles/` n'existe plus, et les fichiers qu'il dit
  supprimés (`front/src/calcul/plausibilite.ts`, `motDePasse.ts`, `planCoach.ts`,
  `rendementPartage.test.ts`, `avancementPartage.test.ts`, `coherencePartage.test.ts`,
  `motDePassePartage.test.ts`) sont bien absents du disque.
- Il affirme que les services serveur `CoherenceDesCibles.php`, `PlanCoach.php`,
  `StockPromis.php`, `EcartDInventaire.php`, `FormatCourt.php` existent →
  **vérifiés présents**.
- Il affirme que B4 (fournées/habitudes) et B5 (1RM/performance) restent au
  front, non migrés → **vérifié** : `front/src/calcul/fournees.ts` (265 l.),
  `habitudesCuisson.ts` (156 l.) et `performance.ts` (375 l.) existent toujours.
- Les 4 commits passés depuis l'écriture de `REPRENDRE.md` (ccf9297 → 2bd8f9f,
  22→25 sept.) sont des corrections mineures (page blanche Compte, date future
  d'une séance de démo, un merge, un commentaire périmé dans `types.ts`) qui ne
  contredisent rien de ce que le journal annonce.

Sur ce point précis, **`REPRENDRE.md` est à jour et fiable** : je résume sans
reconstruire par-dessus. Il existe aussi `docs/plan-serveur-autoritaire.md`
(563 lignes, la « carte » du chantier en paliers 0 à 3, décidée le 19 septembre)
que `REPRENDRE.md` suit et cite — donc le chantier actif A un document de plan,
voir la dernière section.

## Où est l'activité récente (preuve : git log)
Sur `serveur-autoritaire`, 30 derniers jours (le dépôt est actif en continu,
pas seulement sur cette fenêtre) :
- `front/dist/**` — régénéré à quasi chaque commit touchant le front (build web
  versionné volontairement, cf. `CLAUDE.md`) — dernier : "types.ts decrivait au
  present un poids par serie retire depuis quatre jours" le 2026-09-25.
- `api/src/Service/*` (nouveaux : `CoherenceDesCibles.php`, `PlanCoach.php`,
  `StockPromis.php`, `EcartDInventaire.php`, `FormatCourt.php`) et
  `api/src/Controller/{VerificationController,FrigoController}.php` — cœur du
  transfert de logique métier vers le serveur, commits du 21 septembre.
- `front/src/calcul/*` et `front/src/solveur/*` — suppressions et réécritures
  massives en miroir des ajouts côté API (ex. `nutrition.ts` passé de 336 à
  162 lignes le 21 septembre : "174 lignes de jugement mort partent").
- `db/manuel/jeu-demo.sql` — modifié le 23 septembre (date future corrigée).
- `.claude/skills/*`, `CLAUDE.md`, `REPRENDRE.md` — mis à jour en parallèle du
  code à plusieurs reprises (21 septembre).

## Chantier ouvert maintenant (preuve : git status / git diff)
- Branche courante `serveur-autoritaire`, **non fusionnée dans `master`** — 155
  fichiers de différence (`git diff master...HEAD --stat`), +9610/-4795 lignes.
  `REPRENDRE.md` dit explicitement qu'il ne faut pas fusionner sans décision
  (le NAS tire `master` toutes les 5 minutes en production).
- `git status --short` — arbre de travail propre sur le code applicatif. Seuls
  fichiers modifiés/non suivis :
  - `.claude/settings.json` — modifié par le bootstrap du harness.
    **Rectification (session principale, 25/09) :** rien n'a été retiré. Les clés
    `enabledPlugins` et `extraKnownMarketplaces` ont été *déplacées* après `hooks`,
    ce qui produit un gros diff textuel trompeur. Comparaison faite objet par objet :
    `hooks` strictement identique, les cinq plugins d'origine conservés, aucune clé
    perdue, un seul ajout (`typescript-lsp@claude-plugins-official`) et une clé
    nouvelle (`env.ENABLE_LSP_TOOL`).
  - `.claude/harness.detected.json`, `.claude/harness.json`,
    `.claude/harness.overrides.json`, `.claude/harness/`,
    `.claude/settings.json.bak-1790330530` — **artefacts de l'installation du
    harness en cours**, pas du travail applicatif du projet.
  - `presentation/fitcarnet-pro-2026-09-21.pptx` — un livrable non suivi, sans
    lien apparent avec le chantier serveur-autoritaire.
  - Aucun de ces fichiers n'est un chantier de code métier en cours : le vrai
    chantier ouvert est le palier B lui-même (voir section suivante), qui lui
    est proprement commité.

## État réel de la refonte back-autoritaire (fait, pas doc)
Vérifié sur le disque, pas seulement lu dans `REPRENDRE.md` :

**Fait et commité** (confirmé par présence des fichiers serveur + absence des
fichiers front supprimés) :
- Cohérence d'une cible → `api/src/Service/CoherenceDesCibles.php` +
  `POST /api/verification/cible`.
- Conversion d'un plan coach américain → `api/src/Service/PlanCoach.php` +
  `POST /api/verification/plan-coach` ; `front/src/calcul/planCoach.ts` bien
  absent.
- « Stock moins ce qui est promis » → `api/src/Service/StockPromis.php` +
  `api/src/Repository/PlansPrevus.php`.
- Seuil d'écart d'inventaire → `api/src/Service/EcartDInventaire.php`.
- Les 4 « doubles juges » plus anciens (mot de passe, rendement cru/cuit,
  avancement de séance, cohérence d'un aliment) → `api/regles/` absent,
  fichiers front jumeaux absents.

**Pas encore fait**, confirmé par la présence continue du code front :
- `front/src/calcul/fournees.ts` (265 lignes) et `habitudesCuisson.ts`
  (156 lignes) — logique de fournées/cuisson toujours entièrement côté front.
- `front/src/calcul/performance.ts` (375 lignes) — 1RM, paliers, volume,
  toujours côté front (Epley reste dans sa seule écriture actuelle, gardée par
  `epleyUnique.test.ts`).
- Le solveur (`front/src/solveur/`) — le palier 3 (composition de repas) n'a
  pas commencé selon `docs/plan-serveur-autoritaire.md`, seule une mesure de
  faisabilité PHP (125 ms vs 19 ms TS) a été faite le 21 septembre.

**Ce que je ne peux pas confirmer sans lancer les suites de tests** (je suis
en lecture seule, je n'ai pas relancé `npm test` ni `bin/phpunit` pendant cette
reconnaissance) : les décomptes de tests annoncés par `REPRENDRE.md` (737 tests
unitaires + 46 de rendu front, 555 API) n'ont pas été re-mesurés par moi
aujourd'hui — je rapporte le chiffre du dernier commit, pas une mesure propre.

## Fonctionnalités observées dans le code (fait, pas déduction)
- Route `POST /api/verification/cible` — `api/src/Controller/VerificationController.php`
  (existence du fichier confirmée), déclarée dans `api/src/OpenApi/VerificationDansOpenApi.php`.
- Route `POST /api/verification/plan-coach` — même contrôleur, service `PlanCoach.php`.
- `GET /api/mon-frigo` avec champs `grammesDisponibles` et `seuilEcartInventaire`
  — `api/src/Controller/FrigoController.php`.
- `GET /api/modes-de-travail` — sert le nombre de séries qui comptent par mode
  de séance (chrono/charge), consommé par `front/src/api/hooks/modesDeTravail.ts`.
- Écrans front : `front/app/objectifs.tsx`, `front/app/(onglets)/frigo.tsx`,
  `front/app/(onglets)/seances.tsx`, `front/app/seance/[id].tsx` (build présents
  dans `front/dist/`, confirmant que ces écrans sont bien construits et déployés).
- 15 fiches `fonctionnalite-*` dans `.claude/skills/` — une par fonctionnalité
  documentée du produit (déduction indirecte de la liste des skills, pas
  inspectée fichier par fichier ici).

## Travail signalé inachevé (TODO/FIXME)
Recherche `TODO|FIXME|XXX|HACK` sur `api/src`, `front/src`, `front/app` :
**aucun résultat**. Le projet ne semble pas utiliser ces marqueurs — le suivi du
travail restant passe par `REPRENDRE.md` (section « Ce qui reste ouvert ») et
`docs/plan-serveur-autoritaire.md`, pas par des commentaires dans le code.

## Ce que j'en déduis (marqué comme déduction, pas comme fait)
- (confiance haute) Le chantier en cours est la refonte « serveur autoritaire » :
  déplacer toute la logique métier du front vers l'API, palier par palier, pour
  que le front redevienne remplaçable sans perdre le métier. C'est écrit noir
  sur blanc dans `docs/plan-serveur-autoritaire.md` et cohérent avec l'activité
  git observée — ce n'est donc pas une pure inférence de ma part, mais je ne l'ai
  pas vérifié par un entretien avec le propriétaire du projet.
- (confiance moyenne) Les artefacts `.claude/harness*` et le `.pptx` non suivis
  n'ont aucun rapport avec le chantier serveur-autoritaire ; ce sont des
  sous-produits d'outillage (harness-init, une présentation générée par ailleurs)
  qui devront être traités séparément (ignorés, committés ou nettoyés) — je ne
  sais pas laquelle de ces trois options est voulue.
- (confiance basse) Rien n'indique que les décomptes de tests de `REPRENDRE.md`
  soient encore exacts au 25 septembre : le dernier commit mentionne bien
  "737 tests unitaires et 46 de rendu, zero echec" (2bd8f9f), donc c'est
  probablement à jour, mais je n'ai pas exécuté les suites moi-même pour le
  confirmer.

## Zones sans preuve trouvée
- Je n'ai pas fait tourner `npm test` ni `bin/phpunit` : consigne de
  reconnaissance en lecture seule, je ne peux donc pas confirmer par moi-même
  l'état vert des suites (je m'appuie sur le message du dernier commit).
- Je n'ai pas vérifié l'état de la base de développement (`db/manuel/rattraper-dev.sh`
  a-t-il été rejoué depuis le dernier pull ?), ni l'état de `front/dist` par
  rapport aux sources (`REPRENDRE.md` prévient qu'un `dist` périmé rend les
  épreuves e2e mensongères) — pas d'écriture ni d'exécution de build possible en
  reconnaissance.
- Aucune preuve directe trouvée sur le contenu ni la provenance de
  `presentation/fitcarnet-pro-2026-09-21.pptx` (non suivi) — je ne sais pas s'il
  s'agit d'un livrable à committer, à ignorer, ou d'un résidu.
- Je n'ai pas ouvert `docs/audit-2026-09/` en détail (79 constats) au-delà de
  confirmer son existence ; `REPRENDRE.md` affirme 78/79 clos au 19 septembre,
  je ne l'ai pas recontrôlé constat par constat.

## Chantier actif sans document de plan
Sans objet ici : contrairement au cas générique à surveiller, ce chantier **a**
un document de plan structuré, `docs/plan-serveur-autoritaire.md` (563 lignes,
paliers 0 à 3, décidé le 19 septembre 2026 par le propriétaire du projet), et
`REPRENDRE.md` fait explicitement le pont entre ce plan et l'avancement réel
(« palier B à moitié traversé », B4/B5 restants, palier 3 non commencé). Rien à
signaler de ce côté.

---

**Fiabilité globale : reconstruction solide, appuyée sur une doc à jour.**
`REPRENDRE.md` et `docs/plan-serveur-autoritaire.md` racontent un état cohérent
avec ce que j'ai vérifié sur le disque (présence/absence de fichiers, services
serveur, fichiers front supprimés). Les seules zones d'incertitude viennent de
ma contrainte de lecture seule (tests non relancés, `dist` non revérifié contre
les sources) et des artefacts d'outillage non suivis (`harness*`, `.pptx`) dont
je ne connais pas le sort voulu.

---

## Complément de la session principale — 25 septembre 2026

Trois des incertitudes ci-dessus sont levées, par mesure et non par lecture.

- **Suite API : 555 tests, 1 288 assertions, 0 échec**, en 1,27 s. Mesurée avec
  `docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'`. Le chiffre annoncé par
  `CLAUDE.md` sur cette branche est donc exact. Sur l'hôte la commande ne peut pas
  démarrer : le PHP local n'a ni `dom`, ni `mbstring`, ni `xmlwriter`.
- **Base de développement de ce poste : à jour.** `aliment_reference` contient ses
  **3 484 lignes CIQUAL**. Ce poste n'a donc pas souffert du `rattraper-dev.sh` qui ne
  jouait que quatre listes de migrations sur cinq (corrigé en `bbdabd5`). Et le pull du
  jour n'apporte **aucune migration nouvelle** — seulement `jeu-demo.sql` et deux
  lanceurs. Aucun rattrapage n'était nécessaire.
- **Suite front : 737 tests puis 46 de rendu, 0 échec**, via `cd front && npm test`
  (eslint + `tsc --noEmit` compris). Le chiffre du dernier commit est donc exact.
  Léger écart relevé au passage : `CLAUDE.md` ligne 36 annonce « 735 tests », il y en a
  **737**. Deux de plus, pas deux de moins — mais un compteur faux reste un compteur faux.
- **`api/vendor/bin/phpstan analyse` : 5 erreurs**, préexistantes au harness. L'une est un
  `parameterByRef.unusedType` dans `api/tests/Service/InventaireUneLigneTest.php:121`.
  phpstan, lui, tourne bien sur l'hôte.

Les deux suites sont donc vertes, mesurées le même jour : **555 côté API**, **737 + 46
côté front**. Ce que ce complément **ne** lève pas : l'état de `front/dist` face aux
sources, et la relecture des 79 constats de `docs/audit-2026-09/`.
