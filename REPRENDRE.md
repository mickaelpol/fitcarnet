# Où on en est — reprendre le travail

Journal de bord du chantier en cours. À lire au début d'une session sur une
machine qui n'a pas suivi les précédentes, **et à tenir à jour** : c'est le seul
endroit qui dit ce que ni le code ni les commits ne racontent — les décisions
prises, ce qui attend un arbitrage, et par quoi continuer.

**Dernière mise à jour : 14 septembre 2026** — É1 corrigé, skills du projet
réécrites, et **le dossier de présentation client est terminé** : support,
vidéo, scripts et inventaire complet des fonctionnalités.

---

## L'essentiel en cinq lignes

Un audit complet a relevé **84 constats** (3 critiques, 15 élevés). Les **lots 0,
1 et 2 sont terminés** : les garde-fous automatiques sont posés, ce qui était
cassé est réparé, les chiffres faux montrés à l'utilisateur sont corrigés. **Le
lot 3 — sécurité et isolation — est entamé : É1 est fait**, restent C3, É8 et
M-01 à M-03. Tout est documenté dans
[docs/audit-2026-09/](docs/audit-2026-09/README.md), avec un tableau d'avancement.

En parallèle, un **dossier de présentation** a été monté de bout en bout pour
montrer le produit à un client et à une équipe technique : il est complet et
utilisable, il ne reste qu'à tourner les vidéos (voir « Le chantier
présentation » plus bas).

État : **468 tests au vert** (362 front, 106 API), 8 erreurs PHPStan connues —
les mêmes qu'avant, aucune sur les fichiers touchés. `master` synchronisé sur
Gitea.

---

## En arrivant : quoi taper

**1. Monter la machine** — [NOUVELLE-MACHINE.md](NOUVELLE-MACHINE.md) en entier
si elle est neuve, sinon juste se remettre à jour :

```bash
git pull
cd front && npm install          # si package.json a bougé
docker compose -f compose.dev.yml up -d
```

**2. Vérifier qu'on part d'un socle sain.** Ces chiffres sont ceux du
8 septembre ; ils ne peuvent que monter :

```bash
cd front && npm test                                                  # 362 tests, 0 echec
docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'          # 102 tests, 422 assertions
```

Si l'un des deux est rouge **avant** d'avoir touché à quoi que ce soit, c'est
que l'environnement est en cause, pas le code : le régler d'abord.

**3. Le premier message à donner à Claude.** Deux chantiers sont ouverts —
prends celui que tu veux, la phrase est écrite pour être collée telle quelle.

**Si tu reprends la présentation client** (le plus avancé, il ne reste qu'à
filmer) :

> Lis `REPRENDRE.md` et `presentation/plan-de-tournage.md`. Je veux tourner les
> vidéos de démonstration depuis mon téléphone sur l'application de production.
> Aide-moi à créer les deux comptes de démonstration sur le NAS, à y charger le
> jeu de données, et guide-moi bobine par bobine. Ne travaille pas sur une autre
> branche que `master` sans me le demander.

**Si tu reprends l'audit** :

> Lis `REPRENDRE.md`, puis continue le lot 3 de l'audit : C3 — aucun test ne
> vérifie l'isolation des données entre comptes. En TDD : le test échoue
> d'abord. Ne travaille pas sur une autre branche que `master` sans me le
> demander.

Deux précisions qui évitent les allers-retours, si Claude ne les prend pas de
lui-même : la skill à utiliser est **`superpowers:test-driven-development`**, et
**`docs/audit-2026-09/README.md` porte déjà le scénario reproduit** — inutile de
le redécouvrir.

**Le motif de test est désormais écrit** : `tests/Controller/InventaireProprieteTest.php`
monte un contrôleur avec ses vrais services et une seule `Connection` doublée
(`self::createStub`, pas `createMock` — `failOnNotice` refuse un mock sans
attente). Les services du projet sont `final readonly`, donc indoublables : c'est
en les instanciant pour de vrai autour d'une connexion doublée qu'on teste le
**câblage**, et le câblage est précisément ce qui manquait à É1.

**4. En repartant** : mettre ce fichier à jour, cocher le lot dans le tableau
d'avancement de l'audit, `graphify update .`, et pousser. Le prochain à ouvrir
le projet n'aura, lui non plus, que ce qui est écrit.

---

## Par quoi continuer : le lot 3

| | Constat | Effort |
|---|---|---|
| ~~**É1**~~ | ✅ **fait le 8 septembre.** La règle « commun OU le mien » a déménagé dans `FrigoBase::alimentsAccessibles()`, et `definirStock()` la pose lui-même : les **trois** chemins d'écriture sont couverts — `/stock`, l'inventaire différé et « J'ai cuisiné » — au lieu d'un seul. Refus en 404 sans nommer la ligne, pour ne pas offrir l'énumération | — |
| **C3** | **Aucun test ne vérifie l'isolation entre comptes.** Le code est bon — relu ligne à ligne — mais toute la garantie tient à deux `tags:` dans `services.yaml`. `ModeleExposeTest` couvre les entités ; il manque le test de `FiltreProprietaire` lui-même | 2 h |
| **É8** | Les exercices « personnels » sont **visibles de tous**. `Exercice` porte `public` et `creePar`, jamais renseignés ni lus, pendant que l'écran affiche « ★ exercice personnel ». **Décision produit à trancher** : filtrer, ou supprimer les colonnes et l'étiquette | 1-2 h |
| **M-01 à M-03** | Un PATCH admin privatise un aliment commun · jeton de rafraîchissement d'un an sans rotation · messages DBAL bruts rendus au client | 3 h |

Les skills `superpowers-symfony:api-platform-security`, `symfony-voters` et
`api-platform-state-providers` couvrent exactement ce terrain.

Le graphe sait où chercher : la communauté **« Propriété manquante sur
l'inventaire »** rassemble É1, `FrigoController::alimentAccessible` et
`AppliqueInventaire`.

---

## Le chantier présentation — terminé, sauf le tournage

Monté du 9 au 14 septembre 2026 pour présenter fitcarnet **à un client et à une
équipe technique dans la même salle**. Tout est dans `presentation/`.

| Fichier | Ce que c'est | État |
|---|---|---|
| `fitcarnet-presentation.html` | 28 slides en quatre actes : le produit, l'architecture, les garanties, l'outillage IA. Captures embarquées, fichier autonome | ✅ fait |
| `construire.py` | le génère ; **relancer après toute modification** | ✅ |
| `fitcarnet-demonstration.mp4` | 3 min 01, muette, 8 chapitres | ✅ fait, à refaire au téléphone |
| `tournage/tourner.mjs` | pilote l'application avec Playwright et enregistre en continu | ✅ |
| `monter-demo.sh` | cartons, légendes, chapitres | ✅ |
| `script-narration.md` | ce qu'il faut dire, slide par slide, vidéo minutée | ✅ |
| `features.md` | **les ~220 fonctionnalités**, avec fichier et ligne | ✅ |
| `plan-de-tournage.md` | le script de tournage en 8 bobines, pour filmer au téléphone | ✅ |

**Ce qui reste à faire**, et c'est la suite naturelle :

1. Créer les **deux comptes de démonstration sur la production** — un ordinaire,
   un administrateur. Les commandes sont dans `plan-de-tournage.md`, partie I.3.
   Sans le compte admin, les bobines 1 et 8 sont impossibles : les quatre écrans
   d'administration ne s'affichent pas pour un compte ordinaire.
2. Y charger le jeu de données (`jeu-essai.sql` puis `jeu-demo.sql`). **Relire
   l'adresse dans les `sed`** : `jeu-demo.sql` efface avant de poser. Un garde-fou
   refuse tout compte ayant déjà des séances, il faut `-v ecraser=oui` pour passer
   outre — si le message nomme un compte personnel, l'adresse est fausse.
3. **Tourner les huit bobines** avec scrcpy (installé sur Windows, pas dans WSL2 :
   WSL2 n'a aucun accès USB).
4. Remonter la vidéo à partir des prises téléphone.

**Deux choses à ne pas découvrir caméra allumée** : la source Grocy n'est
tournable que si `GROCY_URL` est renseigné sur l'instance filmée, et le **partage
d'un modèle est inopérant** (constat F-05).

**Le jeu de démonstration local est en place** sur cette machine : 14 aliments,
14 lignes de stock, 23 séances, 123 séries, 2 plans, 4 cibles, et un 1RM qui monte
de 50,7 à 63,3 kg sur neuf semaines. Compte `demo@fitcarnet.local`.

---

## Ce que l'inventaire des fonctionnalités a mis au jour

`presentation/features.md` a été établi par exploration systématique du code —
écrans, calculs, back-end. Il recense environ **220 capacités** là où un premier
inventaire de surface en voyait 57. Il a aussi montré que **la documentation
mentait sur deux points** :

- **`front/src/calcul/texte.ts` n'existe pas.** `CLAUDE.md` l'annonçait comme le
  seul porteur de la suppression des accents : c'était la *correction prévue* au
  lot 6 (constat D4), présentée comme faite. `sansAccent` est toujours recopié
  quatre fois. Corrigé dans `CLAUDE.md` et dans la skill `front-fitcarnet`.
- **`front/src/solveur/periode.ts` n'existe pas** — seul son fichier de test
  existe, il éprouve une fonction qui vit dans `composer.ts`.

**Trois pistes ouvertes, à trancher un jour :**

- `front/src/composants/inventaire.tsx` semble être du **code mort** — aucun
  écran ne l'importe, `frigo.tsx` réimplémente le mode inventaire.
- `Invitation::domaineAccepteDuCourrier()` — vérification DNS complète et
  documentée — **n'a aucun appelant** dans l'API.
- **Aucun appel à OpenFoodFacts** n'existe côté back, alors que le champ
  `Aliment::source` en prévoit la valeur.

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

**Le réseau sortant des conteneurs est cassé sur cette machine.** Ni DNS ni
routage : même vers une IP brute, `curl` rend `000` depuis `fitcarnet-app-dev`.
D'où l'échec de `composer install` dans le conteneur, contourné en installant
`vendor` depuis l'hôte (le dossier est monté). C'est du NAT Docker sous WSL2,
pas le dépôt — **réparation à faire**, elle n'a pas été tentée.

**Le port 8080 se dispute avec `gestion-interne-api`.** Son Keycloak le tenait ;
`fitcarnet-app-dev` refusait de démarrer, puis a tourné sans port publié — sain
au `docker ps`, injoignable. Le recréer (`up -d --force-recreate app`) après
avoir libéré le port. **Keycloak a été arrêté le 9 septembre et n'a pas été
relancé.**

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
- **Un plugin déclaré peut manquer sans un mot.** Le 8 septembre, `expo` n'a pas
  été posé par le démarrage de Claude Code, et le contrôle d'`installer-outils.sh`
  comptait les plugins *déclarés* au lieu des installés : il annonçait « 5 » avec
  quatre sur le disque. Le script compare désormais pour de bon et pose ce qui
  manque, en `--scope project` — sans ce drapeau, le plugin s'active dans tous
  les dépôts de la machine. La ligne à lire : « 5/5 plugins installés ».
- **`skillOverrides` ne coupe que les skills du projet.** Les vingt-deux entrées
  qui visaient `expo:` et `superpowers-symfony:` n'ont jamais rien coupé — le
  8 septembre, une skill déclarée « off » s'est chargée à la demande, et la
  déplacer dans `~/.claude/settings.json` n'y a rien changé. Retirées. Le seul
  levier pour une skill de plugin est `claude plugin disable`, qui prend le
  plugin entier ; on paie donc ~2 950 tokens de contexte par session pour des
  skills dont on ne se sert pas ici. À rouvrir si Claude Code gagne un réglage
  par composant.
- **Monter l'environnement sans `installer.sh` laisse une base INCOMPLÈTE.**
  PostgreSQL ne joue que `db/*.sql` à la création du volume ; les migrations de
  `db/manuel/` ne partent que par `installer.sh` ou `entrypoint-prod.sh`, dont
  l'ordre est écrit à la main. Le 9 septembre, la base avait 18 tables au lieu de
  20 : `inventaire_lot` manquait, et l'envoi d'un inventaire répondait
  « relation "inventaire_lot" does not exist ». Rejouer la liste dans l'ordre
  d'`installer.sh` — les 21 migrations passent, `25-garde-fous.sql` compris.
- **`bin/console` exige `api/.env`, que le clone ne fournit pas.** Sans lui :
  « Unable to read the "/app/.env" ». L'API servie par FrankenPHP s'en passe —
  ses variables viennent du conteneur. Un fichier local suffit, avec `APP_ENV`
  et `DEFAULT_URI` ; il est ignoré par git.
- **Les clés JWT ne sont pas dans le dépôt** (et c'est heureux). Sans elles, la
  connexion répond « An error occurred while trying to encode the JWT token ».
  `bin/console lexik:jwt:generate-keypair --skip-if-exists`.
- **Une machine neuve n'a ni `front/node_modules` ni `api/vendor`, et rien ne le
  dit.** Le 8 septembre, `npm test` a échoué sur `expo/tsconfig.base not found`
  et `bin/phpunit` n'existait pas. Faire `cd front && npm install`, et pour l'API
  un `composer install` — ce qui suppose Composer, absent de cette machine :
  récupéré par `getcomposer.org` et lancé avec `--ignore-platform-reqs`, l'hôte
  n'ayant pas `php8.3-xml`. L'exécution, elle, se fait dans le conteneur, qui a
  toutes les extensions.
- **Node 22 est exigé, et `installer-outils.sh` ne vérifie que la présence de
  node.** La machine avait 20.11.1 : `node --test` n'y développe pas les globs,
  donc `npm test` répondait « Could not find dist-tests/**/*.test.js » — un
  message qui ne parle pas de version. `nvm install 22 && nvm alias default 22`.
  Attention, un terminal déjà ouvert garde l'ancien PATH.
- **Le port 8080 se dispute avec les autres projets.** Le Keycloak de
  `gestion-interne-api` le tenait ; `fitcarnet-app-dev` refusait de démarrer.
  `docker stop gestion-intenre-api-keycloak-1` le temps de la session — **et le
  redémarrer après**.
- **Le réseau sortant des conteneurs est cassé sur cette machine.** Ni DNS ni
  routage : même vers une IP brute, `curl` rend `000`. D'où l'échec de
  `composer install` dans le conteneur. Contourné en installant `vendor` depuis
  l'hôte (le dossier est monté), **réparation remise à plus tard** : c'est du
  NAT Docker sous WSL2, pas le dépôt.
- **scrcpy ne voit pas le téléphone depuis WSL2.** WSL2 n'a aucun accès USB :
  `/dev/bus/usb` n'y contient que les deux hubs racine. L'affichage, lui, marche
  (WSLg est présent). Installer scrcpy **sur Windows** — le zip des *releases*
  GitHub est autonome, `adb` compris. Les voies de repli sont dans
  `presentation/plan-de-tournage.md`.
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
