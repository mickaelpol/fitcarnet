# Où on en est — reprendre le travail

Journal de bord du chantier en cours. À lire au début d'une session sur une
machine qui n'a pas suivi les précédentes, **et à tenir à jour** : c'est le seul
endroit qui dit ce que ni le code ni les commits ne racontent — les décisions
prises, ce qui attend un arbitrage, et par quoi continuer.

**Dernière mise à jour : 8 septembre 2026** — 23 commits les 7 et 8 septembre.

---

## L'essentiel en cinq lignes

Un audit complet a relevé **84 constats** (3 critiques, 15 élevés). Les **lots 0,
1 et 2 sont terminés** : les garde-fous automatiques sont posés, ce qui était
cassé est réparé, les chiffres faux montrés à l'utilisateur sont corrigés. **Le
lot 3 — sécurité et isolation — est le suivant.** Tout est documenté dans
[docs/audit-2026-09/](docs/audit-2026-09/README.md), avec un tableau d'avancement.

État : **464 tests au vert** (362 front, 102 API), 8 erreurs PHPStan connues,
`master` synchronisé sur Gitea.

---

## Par quoi continuer : le lot 3

| | Constat | Effort |
|---|---|---|
| **É1** | `POST /api/mon-frigo/inventaire` n'a **aucun contrôle de propriété** sur l'aliment, là où son jumeau `/stock` a reçu `alimentAccessible()` pour corriger exactement cette faille. Un compte peut écrire du stock sur l'aliment privé d'un autre, qui ne peut alors plus le supprimer | 1 h |
| **C3** | **Aucun test ne vérifie l'isolation entre comptes.** Le code est bon — relu ligne à ligne — mais toute la garantie tient à deux `tags:` dans `services.yaml`. `ModeleExposeTest` couvre les entités ; il manque le test de `FiltreProprietaire` lui-même | 2 h |
| **É8** | Les exercices « personnels » sont **visibles de tous**. `Exercice` porte `public` et `creePar`, jamais renseignés ni lus, pendant que l'écran affiche « ★ exercice personnel ». **Décision produit à trancher** : filtrer, ou supprimer les colonnes et l'étiquette | 1-2 h |
| **M-01 à M-03** | Un PATCH admin privatise un aliment commun · jeton de rafraîchissement d'un an sans rotation · messages DBAL bruts rendus au client | 3 h |

Les skills `superpowers-symfony:api-platform-security`, `symfony-voters` et
`api-platform-state-providers` couvrent exactement ce terrain.

Le graphe sait où chercher : la communauté **« Propriété manquante sur
l'inventaire »** rassemble É1, `FrigoController::alimentAccessible` et
`AppliqueInventaire`.

---

## Décisions prises, et pourquoi

Elles ne se déduisent ni du code ni des commits. **Ne pas les rouvrir sans
raison.**

**L'architecture hexagonale est un objectif assumé, mais n'a pas commencé.** Les
skills sont installées (`symfony-hexagonal-architecture`, `-domain-modeling`,
`-ports-adapters`, `-cqrs-handlers`). `api/src` suit toujours la structure
Symfony classique. La refonte ne doit **jamais** se mélanger à une correction de
bug dans un même commit. À noter : le domaine riche du projet — le solveur de
repas — est déjà isolé, pur et testé… côté front, en TypeScript.

**Une seule arborescence, en terminal.** Claude Cowork refuse les chemins
`\\wsl.localhost\…`, donc il n'est pas utilisable ici. Le clone Windows a été
renommé `fitcarnet.OBSOLETE-2026-09-07` et son `fitsync.sh` neutralisé. Deux
copies désynchronisées ont produit le bug critique C1.

**Le TDD n'a pas d'exception.** Chacune des dix corrections a eu son test écrit
et vu échouer d'abord. Deux fois, le test est passé du premier coup : on a alors
**remis le code fautif** pour vérifier qu'il tombait — un test qui ne peut pas
échouer ne vaut rien, et l'audit en avait trouvé douze de ce genre.

**graphify oriente, il ne remplace pas `grep`.** Deux hooks le rappellent avant
chaque recherche. Son périmètre est fixé par `.graphifyignore` : les skills
tierces en sont exclues, faute de quoi le graphe se remplit de documentation
PostgreSQL qui ne parle pas du projet.

---

## Ce qui attend une décision de ta part

**La table des paliers du disque RM.** `disqueRM.tsx` affiche 90→40 %, le
calculateur 100→50 %. À 40 %, la formule annonce 45 répétitions alors que
`REPS_MAX_POUR_1RM` vaut 15 : la prédiction sort de la zone où elle veut dire
quelque chose. La fonction dupliquée a été supprimée ; les deux tables
subsistent. Unifier change l'affichage — c'est un choix produit.

**Les exercices personnels** (É8 ci-dessus) : filtrer, ou assumer un catalogue
commun et retirer l'étiquette mensongère.

---

## Deux chantiers laissés ouverts, sciemment

**É14 n'a reçu qu'un volet sur trois.** Terminer la session quand le jeton de
rafraîchissement a disparu suffit à rouvrir la porte — vérifié jusqu'à la
redirection. Les deux ceintures de sécurité restantes (le bouton de déconnexion
rendu avant l'écran d'erreur dans `compte.tsx`, le portier de `_layout.tsx`)
demandent une bibliothèque de test de composants que le projet n'a pas.

**M1 et M4 du lot 2** ne sont pas faits : deux formules Atwater encore recopiées
(`solveur.ts:340`, `objectifs.tsx:78`) qui comptent les fibres à 4 kcal/g en mode
« glucides totaux », et l'`EPSILON` absolu d'`algebre.ts` qui ne détecte jamais un
système singulier.

---

## Pièges vérifiés, qui reviendront

- **`verifier-schema.sh` signale 280 lignes de divergence.** Ce n'est pas un raté
  d'installation : c'est le constat C2, prévu au lot 4.
- **8 erreurs PHPStan sont attendues.** Aucune sur les fichiers corrigés. Deux
  méritent un coup d'œil au lot 3 : `JetonRafraichissement::$empreinte` et
  `$creeLe` sont « écrites mais jamais relues ».
- **`superpowers-symfony` ne s'installe pas seul** — manifeste pointant sur
  l'ancien nom d'organisation, clone SSH refusé. `installer-outils.sh` s'en
  charge ; à relancer après un `claude plugin marketplace update`.
- **Le graphe se périme.** `graphify update .` après du code, `/graphify . --update`
  après de la documentation.

---

## Comment travailler ici

[CLAUDE.md](CLAUDE.md) porte les sept règles non négociables et l'aiguillage des
skills. Trois qui reviennent le plus :

1. **TDD sans exception** — le test échoue d'abord.
2. **Ne jamais déclarer terminé sans preuve** — coller la sortie, pas une
   affirmation.
3. **Les commentaires racontent la panne réelle et sa date.** C'est ce qui a
   permis à l'audit de retrouver l'origine de chaque défaut.

Pour monter la machine : [NOUVELLE-MACHINE.md](NOUVELLE-MACHINE.md). Attention,
**la base sera vide de ton historique** — voir son étape 5.
