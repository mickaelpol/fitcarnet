# Prochaines étapes

> **Frontière avec `REPRENDRE.md`, décidée le 25 septembre 2026.** `REPRENDRE.md` fait foi
> sur le **chantier** — la refonte serveur autoritaire, son récit, ses paliers, ses décisions
> métier — et c'est la première lecture. Ce dossier-ci fait foi sur l'**outillage** et sert de
> point d'entrée à `/harness`. La file métier ne se recopie pas ici : on y renvoie.

> La file, dans l'ordre. /harness la lit. Une ligne = une chose finissable. Dette assumée datée.

## Maintenant
- [ ] **Redémarrer Claude Code** pour que `ENABLE_LSP_TOOL` et le plugin `typescript-lsp` — activés en portée projet dans `.claude/settings.json` le 25/09/2026 — prennent effet. Contrainte de Claude Code, rien à installer de plus.

## Ensuite
- [ ] `api/vendor/bin/phpstan analyse` rend **5 erreurs** — mesuré le 25/09/2026 sur `serveur-autoritaire`. Elles préexistent au harness. L'une est un `parameterByRef.unusedType` dans `api/tests/Service/InventaireUneLigneTest.php:121`.
- [ ] `CLAUDE.md` ligne 36 annonce « 735 tests » front ; il y en a **737** (mesuré le 25/09/2026). Compteur à corriger — c'est exactement le genre d'écart que `verite-documentaire` cherche exprès.
- [ ] Écrire les specs de features dans `docs/features/` (gabarit `_modele.md`). Les quinze skills `fonctionnalite-*` portent déjà le besoin et les critères : la spec doit y **renvoyer**, pas les recopier — sinon on crée le double juge que la règle 5 interdit, appliqué à la documentation.
- [ ] `serveur-autoritaire` a **26 commits d'avance sur `master`** (155 fichiers, +9610/-4795) et zéro de retard. `master` est tiré par le NAS en production : la fusion est une mise en production, elle attend une décision explicite.

## Dette assumée
- [ ] 2026-09-25 — `php-lsp@claude-plugins-official` est activé **à la fois** en global (`~/.claude/settings.json`) et en portée projet. Le harness n'y touche pas. Pour ne le garder qu'au projet : `claude plugin uninstall php-lsp@claude-plugins-official --scope user`. Laissé en place faute d'avoir tranché si d'autres projets en dépendent.
- [ ] 2026-09-25 — Le cache des plugins (`~/.claude/plugins/cache/`) a été normalisé en LF à la main : 901 fichiers. C'est un correctif d'arbre de travail, pas de dépôt. Le garde-fou durable est `core.autocrlf=input`, désormais posé, plus le `.gitattributes` ajouté au dépôt `claude-harness`.
- [ ] 2026-09-25 — `docs/audits/` (harness) et `docs/audit-2026-09/` (les 79 constats de septembre) coexistent. Noms voisins, contenus distincts : ne pas les confondre, ne pas fusionner sans décision.

## Tranché le 25/09/2026 (voir `decisions.md`)
- `REPRENDRE.md` reste le récit du chantier et la première lecture ; `docs/etat/` porte la file et les décisions. La frontière est écrite dans les deux fichiers.
- Les bobines vidéo ne sont pas versionnées ; les rapports écrits le restent.
- Le `.pptx` du 21/09 reste non suivi, tel quel. Il apparaîtra dans chaque `git status` : c'est voulu.

## Vérifié le 25/09/2026, rien à faire
- La base de dev de ce poste a bien ses **3 484 lignes CIQUAL** (`aliment_reference`) : elle n'est pas victime du `rattraper-dev.sh` qui ne jouait que quatre listes sur cinq (corrigé en `bbdabd5`). Et le pull du jour n'apporte **aucune nouvelle migration** — seulement `jeu-demo.sql` et deux lanceurs.
- Les deux suites sont vertes, mesurées le jour même : **555 tests API** (1 288 assertions) et **737 tests front + 46 de rendu**. Le compteur API de `CLAUDE.md` dit vrai ; celui du front est faux de deux (voir « Ensuite »). Ne pas les corriger d'après le `CLAUDE.md` de `master`, qui est en retard de 26 commits — c'est normal, pas un défaut.

## Idées mises de côté
- Migrer vers l'architecture hexagonale : objectif assumé, **non commencé**. `api/src` suit la structure Symfony classique. Ne jamais mélanger cette refonte avec une correction de bug.
