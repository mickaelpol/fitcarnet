# Prochaines étapes

> **Frontière avec `REPRENDRE.md`, décidée le 25 septembre 2026.** `REPRENDRE.md` fait foi
> sur le **chantier** — la refonte serveur autoritaire, son récit, ses paliers, ses décisions
> métier — et c'est la première lecture. Ce dossier-ci fait foi sur l'**outillage** et sert de
> point d'entrée à `/harness`. La file métier ne se recopie pas ici : on y renvoie.

> La file, dans l'ordre. /harness la lit. Une ligne = une chose finissable. Dette assumée datée.

## Maintenant
- [x] **Redémarrer Claude Code** — fait. L'outil `LSP` est présent dans la session du 25/09/2026 au soir : `ENABLE_LSP_TOOL` et `typescript-lsp` ont pris effet.

- [x] ~~**B4 — `habitudes-cuisson-au-serveur`**~~ — **TERMINÉE le 25/09/2026**, cycle
  complet spec → tdd → review → e2e → verify → docs. Neuf commits, non poussés.
  Reste pour le palier B : **`fournees.ts`**, dont `REPRENDRE.md` rappelle que le
  plus gros est de l'état d'écran et ne part pas tel quel.

- [x] ~~**`pesees-editeur-aliment-saisienombre`**~~ — **TERMINÉE le 26/09/2026**, cycle complet tdd → review → e2e → verify → docs. Non poussée.
- [ ] **Suivante, choisie par le propriétaire le 26/09/2026 : les macros de l'éditeur lues 0** — la dette « Éditeur d'aliment : les macros lisent vide/illisible comme 0 » ci-dessous. Contraire à la règle 6 ; touche `ALIMENT_VIDE`, le type `Aliment` et le contrat serveur : à cadrer d'abord (`/harness nouvelle`).

## Ensuite
- [ ] **Retirer le code Grocy** — **Grocy est ABANDONNÉ** (le propriétaire a migré ses données vers la base de l'app ; décision du 26/09/2026, écrite dans `CLAUDE.md` et `decisions.md` : aucun constat Grocy ne se corrige plus). Quitté en production le 20/09/2026, mais ≈ 50 fichiers de `front/src`, `front/app`, `api/src` le nomment encore, et la base de dév est toujours en `source_frigo = grocy` (`REPRENDRE.md:500`). Relevé le 26/09/2026 pendant le brainstorm `macros-editeur-vide-pas-zero`. À cadrer : le filet « aller-retour » est-il encore voulu ?
- [ ] `api/vendor/bin/phpstan analyse` rend **5 erreurs** — mesuré le 25/09/2026 sur `serveur-autoritaire`. Elles préexistent au harness. L'une est un `parameterByRef.unusedType` dans `api/tests/Service/InventaireUneLigneTest.php:121`.
- [x] ~~`CLAUDE.md` ligne 36 annonce « 735 tests » front ; il y en a **737**~~ — **fait le 25/09/2026 au soir, et l'entrée elle-même était fausse** : il y en avait 741, pas 737. Une ligne écrite pour traquer un compteur portait un compteur périmé. Quatorze endroits du dépôt annonçaient un décompte de tests ; tous corrigés, sauf ceux écrits au passé et datés, qui sont de l'histoire.
- [ ] Écrire les specs de features dans `docs/features/` (gabarit `_modele.md`). Les quinze skills `fonctionnalite-*` portent déjà le besoin et les critères : la spec doit y **renvoyer**, pas les recopier — sinon on crée le double juge que la règle 5 interdit, appliqué à la documentation.
- [ ] `serveur-autoritaire` a **26 commits d'avance sur `master`** (155 fichiers, +9610/-4795) et zéro de retard. `master` est tiré par le NAS en production : la fusion est une mise en production, elle attend une décision explicite.

## Dette assumée
- [ ] 2026-09-26 — **L'inventaire et la vérification de cible lisent encore par `(float)`** (`FrigoController`, quantité d'une ligne de lot ; `VerificationController`, `POST /api/verification/cible`) : « 12,5 » y vaudrait 12 sans un mot. Aujourd'hui le front leur envoie des nombres déjà lus, donc aucun chiffre faux constaté ; le jour où ces écrans enverront le texte tapé, passer par `NombreSaisi`. Relevé par `revue-fitcarnet` sur `macros-editeur-vide-pas-zero`.
- [ ] 2026-09-26 — **`AlimentDenormalizer` : deux silences mineurs** relevés en revue, non corrigés. Un `ratio: ""` est retiré sans refus (l'entité garde sa valeur) — l'écran ne l'envoie jamais. Un simple renommage d'un aliment dont le ratio en base diffère de ses pesées réécrit le ratio avec la valeur mesurée — 0 cas sur 8 en dév, production non mesurée.
- [ ] 2026-09-26 — **L'écart au type CIQUAL se juge encore à l'écran** (`ChampRattachement`, « moitié moins ou deux fois plus ») : il lit lui-même les calories tapées. Seul jugement de l'éditeur d'aliment resté au front, laissé hors de `macros-editeur-vide-pas-zero`. Il avertit, il ne bloque rien.
- [ ] 2026-09-26 — **Un `Bouton` désactivé n'est pas désactivé pour le navigateur** : `Bouton` (`front/src/composants/base.tsx`) rend un `<div>` sans `disabled` ni `aria-disabled`. Pendant les ~250 ms de l'anti-rebond de `useVerdictAliment`, « Utiliser ce résultat » est inerte (`verdictPerime`) : un clic trop rapide ne fait rien, sans le dire, et Playwright clique sans erreur. Relevé par `qa` en vérifiant `pesees-editeur-aliment-saisienombre`, hors périmètre. Touche tous les boutons de l'application.
- [x] ~~2026-09-26 — **Une pesée illisible s'efface quand on referme puis rouvre la mesure**~~ — **réglé par `macros-editeur-vide-pas-zero`** : les pesées sont des textes tenus par l'éditeur, plus des `ChampNombre` démontés. (`editeurAliment.tsx`, bascule « Revenir aux valeurs courantes » / « Je préfère mesurer ») : `ChampNombre` est démonté, le parent ne garde que `null`. Aucun chiffre faux (rien ne s'enregistre, `null` et vide disent « je ne sais pas »). Relevé par `revue-fitcarnet`, accepté. Si un jour il faut le garder : laisser le champ monté et masqué.
- [ ] 2026-09-26 — **Une pesée à 2 décimales est arrondie en silence par la base** (`pesee_avant`/`pesee_apres` en `NUMERIC(7,1)`) : le ratio est calculé sur 123,45, la base garde 123,5. Accepté (feature `pesees-editeur-aliment-saisienombre`) : une balance de cuisine pèse au gramme. Si un jour il faut refuser, c'est au serveur, pas à l'écran.
- [x] ~~2026-09-26 — **Éditeur d'aliment : les macros lisent vide/illisible comme 0**~~ — **réglé par `macros-editeur-vide-pas-zero`** : l'écran ne lit plus rien. (`editeurAliment.tsx:82`, `nombreSaisi(v) ?? 0`), contraire à la règle 6 ; seules les fibres y échappent. Écarté de la feature `pesees-editeur-aliment-saisienombre` : touche `ALIMENT_VIDE`, le type `Aliment` et le contrat serveur.
- [ ] 2026-09-25 — **Le `ksort` anti-interblocage de `CuissonsHabituelles::remplacer` n'a aucune preuve expérimentale.** Le constat M2 de la revue est fermé par le code, mais deux transactions entrelacées ne se constatent pas de façon fiable depuis `curl` : personne n'a vu le `40P01` qu'il empêche. Le test unitaire prouve que les écritures partent triées, rien de plus.
- [ ] 2026-09-25 — **`ChoixDansListe` n'expose ni rôle ni `testID` stable**, ce qui empêche d'automatiser en e2e le choix d'un exercice (séance, modèle) et l'affectation d'un aliment à un repas. Blocage rencontré deux fois : `avancementSeance.spec.ts` le 20/09, `habitudesCuisson.spec.ts` le 25/09. **Corrigé le 26/09/2026** : cette ligne disait « l'ajout manuel d'un aliment », or le frigo n'utilise PAS `ChoixDansListe` — l'ajout s'y fait dans un éditeur vide. Relevé par le propriétaire.
- [ ] 2026-09-25 — `php-lsp@claude-plugins-official` est activé **à la fois** en global (`~/.claude/settings.json`) et en portée projet. Le harness n'y touche pas. Pour ne le garder qu'au projet : `claude plugin uninstall php-lsp@claude-plugins-official --scope user`. Laissé en place faute d'avoir tranché si d'autres projets en dépendent.
- [ ] 2026-09-25 — Le cache des plugins (`~/.claude/plugins/cache/`) a été normalisé en LF à la main : 901 fichiers. C'est un correctif d'arbre de travail, pas de dépôt. Le garde-fou durable est `core.autocrlf=input`, désormais posé, plus le `.gitattributes` ajouté au dépôt `claude-harness`.
- [ ] 2026-09-25 — `docs/audits/` (harness) et `docs/audit-2026-09/` (les 79 constats de septembre) coexistent. Noms voisins, contenus distincts : ne pas les confondre, ne pas fusionner sans décision.

## Tranché le 25/09/2026 (voir `decisions.md`)
- `REPRENDRE.md` reste le récit du chantier et la première lecture ; `docs/etat/` porte la file et les décisions. La frontière est écrite dans les deux fichiers.
- Les bobines vidéo ne sont pas versionnées ; les rapports écrits le restent.
- Le `.pptx` du 21/09 reste non suivi, tel quel. Il apparaîtra dans chaque `git status` : c'est voulu.

## Vérifié le 25/09/2026, rien à faire
- La base de dev de ce poste a bien ses **3 484 lignes CIQUAL** (`aliment_reference`) : elle n'est pas victime du `rattraper-dev.sh` qui ne jouait que quatre listes sur cinq (corrigé en `bbdabd5`). Et le pull du jour n'apporte **aucune nouvelle migration** — seulement `jeu-demo.sql` et deux lanceurs.
- ~~Les deux suites sont vertes : **555 tests API** (1 288 assertions) et **737 tests front + 46 de rendu**. Le compteur API de `CLAUDE.md` dit vrai~~ — **PÉRIMÉ le soir même**, et c'était le pire endroit pour l'être : une affirmation fausse rangée sous « rien à faire ». Au 25/09 au soir : **564 tests API** (1 306 assertions), **741 front + 46 de rendu**, **18 épreuves e2e**. Le compteur API de `CLAUDE.md` ne disait PAS vrai. Ce qui reste juste : ne pas se fier au `CLAUDE.md` de `master`, en retard de 26 commits.

## Idées mises de côté
- Migrer vers l'architecture hexagonale : objectif assumé, **non commencé**. `api/src` suit la structure Symfony classique. Ne jamais mélanger cette refonte avec une correction de bug.
