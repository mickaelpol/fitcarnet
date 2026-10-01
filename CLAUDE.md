# fitcarnet

Application personnelle de suivi nutritionnel et de musculation, multi-comptes (accès par
invitation). API Symfony 7 + API Platform + Doctrine (`api/`), front Expo SDK 54 / React Native
web + Android (`front/`), PostgreSQL 16 (`db/`), déployée sur un NAS Synology derrière Caddy.

**Le code, les commentaires, les noms de variables et les messages de commit sont en français.**
Les identifiants métier aussi (`Aliment`, `Seance`, `cleDHabitude`). Garder cette langue.

## Où on en est — À LIRE EN PREMIER

[REPRENDRE.md](REPRENDRE.md) est le journal de bord du chantier : ce qui est
fait, par quoi continuer, les décisions déjà prises et celles qui attendent un
arbitrage. Rien de tout cela ne se déduit du code. **Le lire avant de
travailler, et le tenir à jour en repartant.**

## Sur une machine neuve

```bash
git clone ssh://git@gitea.mickael-pol.fr:2222/mickael/fitcarnet.git
cd fitcarnet && ./installer-outils.sh     # graphify, intelephense, les cinq plugins
# redémarrer Claude Code ici — c'est ce qui charge les skills
./installer.sh --email ton@adresse.fr     # l'application : base, conteneurs, compte
```

Le dépôt porte **tout l'outillage** : `CLAUDE.md`, les hooks (`.claude/settings.json`),
la déclaration des cinq plugins (`enabledPlugins` — Claude Code les pose au
premier démarrage, et `installer-outils.sh` vérifie qu'il l'a fait), les skills
propres au projet, `.graphifyignore`, et le **cache sémantique de graphify** —
environ 860 Ko qui évitent de redépenser 125 000 tokens d'extraction. Seul le graphe
lui-même se reconstruit : `/graphify .`.

## Commandes

```bash
cd front && npm test          # eslint + tsc --noEmit + 747 tests, puis 75 de rendu — À LANCER APRÈS TOUTE MODIF FRONT
cd front && npm run verif     # typage + lint, sans les tests : plus rapide
cd front && npm run lint      # la règle des hooks seule (instantané)
cd front && npm run build:web # régénère front/dist/ (versionné, voir plus bas)
# 634 tests API (1 427 assertions), sans base ni noyau, aucun effet de bord. DANS LE CONTENEUR :
# le PHP de l'hote n'a ni dom, ni mbstring, ni xmlwriter, et PHPUnit refuse de
# demarrer sans elles. `cd api && bin/phpunit` est ecrit partout ailleurs et
# echoue ici — releve par `verite-documentaire` le 15 septembre 2026.
docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'
docker compose -f compose.dev.yml up   # environnement de développement
# Base jetable (Docker, image postgres:16), aucune base réelle touchée :
db/manuel/verifier-schema.sh           # base neuve = base migrée
db/manuel/verifier-migrations.sh       # les migrations passent sur de vraies données, contraintes comprises
db/manuel/verifier-jeux.sh             # jeu d'essai et jeu de démonstration, garde-fou compris
python3 test_import_carnet.py          # l'import du carnet (exige psycopg2)
python3 test_ciqual.py                 # l'import CIQUAL, sans dépendance
# ÉPREUVES DE BOUT EN BOUT : vrai navigateur, vraie API, vraie base.
# Exigent l'environnement de dev debout ET un `front/dist` à jour — MAIS CE QUI EST
# SERVI EST `api/front`, PAS `front/dist`. Les deux gestes, jamais l'un sans l'autre :
cd "$DEPOT/front" && npm run build:web
rm -rf "$DEPOT/api/front" && cp -r "$DEPOT/front/dist" "$DEPOT/api/front"
# `$DEPOT` explicite, et ce n'est pas du zèle : un `rm -rf api/front` parti d'un autre
# dossier a déjà mordu. Cette recopie était écrite dans quatre fichiers et ABSENTE d'ici,
# où le mot `api/front` n'apparaissait nulle part — une phase e2e s'est arrêtée dessus le
# 25 septembre 2026, et elle serait passée au VERT pour la mauvaise raison si personne
# n'avait comparé les empreintes des deux bundles.
cd e2e && npm install                  # une seule fois
cd e2e && npm test                     # ~2 min pour TRENTE épreuves (elles tombent si la machine peine : rejouer le fichier seul)
```

### Les épreuves de bout en bout — `e2e/`

Posées le 20 septembre 2026, après que **trois défauts d'assemblage** se soient
succédé en une heure sans qu'aucun des 1 293 tests unitaires ne les voie : un
chemin d'écriture non gardé, un écran qui disait « Cohérent » de ce que le
serveur allait refuser, et un message qui attendait trois champs de trop.

Elles montent l'application ENTIÈRE dans Chromium. Elles n'éprouvent **pas** les
bornes — les suites PHPUnit du serveur s'en chargent, et les rejouer ici les
rendrait lentes sans rien garantir de plus. Elles éprouvent que **l'écran dit ce
que le serveur fera**, et que **la base contient ce que l'écran a promis**.

**Elles n'écrivent jamais sur une donnée qu'elles n'ont pas créée** : un compte
jetable en `@e2e.local` par épreuve, et le ménage final **échoue** s'il en reste
un. Les cinq règles pour en écrire une sont dans `e2e/LISEZMOI.md`.

## Règles non négociables

Chacune de ces règles a déjà été enfreinte au moins une fois, et l'audit de septembre 2026 en a
mesuré le coût. Elles ne sont pas des préférences de style.

### 1. Toute évolution du schéma s'écrit DEUX fois
`db/01-schema.sql` **et** une migration numérotée dans `db/manuel/`. Le schéma initial décrit la
base telle qu'elle est aujourd'hui : une base neuve doit être identique à une base migrée.
Contrôle : `db/manuel/verifier-schema.sh` construit les deux et exige un diff vide.

Les migrations sont **idempotentes** (rejouées à chaque démarrage par `entrypoint-prod.sh`) et leur
ordre est écrit à la main dans `installer.sh`. Une migration qui peut échouer empêche la production
de redémarrer : ne jamais écrire `SET colonne = NULL` sur une colonne `NOT NULL`.

**IDEMPOTENT NE VEUT PAS DIRE `TRUNCATE` PUIS `INSERT`.** Le 20 septembre 2026,
`db/03-ciqual.sql` a mis la production à terre avec exactement ça :

```
ERROR: cannot truncate a table referenced in a foreign key constraint
DETAIL: Table "aliment" references "aliment_reference".
```

Dès qu'une table est référencée, elle ne se vide plus. Un rechargement de
référentiel s'écrit `INSERT … ON CONFLICT (cle) DO UPDATE`, **sans suppression** —
une clé étrangère `ON DELETE SET NULL` détacherait en silence les données de
quelqu'un. Ça passait en développement parce que le contenu y avait été chargé
**avant** la migration qui pose la clé : jamais dans l'ordre réel.

**LES CINQ LISTES DE MIGRATIONS SONT JUMELLES — CINQ, PAS QUATRE.**
`db/manuel/verifier-schema.sh`, `db/manuel/verifier-migrations.sh`,
`db/manuel/rattraper-dev.sh`, `installer.sh` et `docker/entrypoint-prod.sh`
énumèrent les fichiers à la main (`3[0-9]-*.sql`, `4[0-9]-*.sql`…). Le jour où la
40 est arrivée, **trois des cinq** s'arrêtaient encore à `3[0-9]`. Pire :
`verifier-schema.sh` annonçait « identiques » quand même — les deux bases partent
du même `01-schema.sql`, donc une migration jamais jouée ne fait diverger
personne. Un vert qui ne pouvait pas devenir rouge.

**ET LE DÉCOMPTE LUI-MÊME A COÛTÉ UNE SIXIÈME FOIS, le 20 septembre 2026.**
Cette page disait « QUATRE », `rattraper-dev.sh` disait « QUATRE » en énumérant
cinq noms, et le message d'erreur du garde en nommait quatre. Résultat :
`rattraper-dev.sh` est le seul à être resté à `3[0-9]` après la correction des
autres. Un second poste qui fait `git pull` puis `rattraper-dev.sh` — ce que
cette page prescrit — se retrouvait sans `aliment_reference`, sans les
3 484 lignes CIQUAL et sans la recherche floue, **sans le moindre signal** :
le garde ne compare que sa propre liste à ce qui existe, il ne lit pas les
quatre autres. Relevé par `verite-documentaire`, corrigé le même jour.

`verifier-schema.sh` compare sa liste à ce qui existe vraiment et **refuse** ce
qu'elle ne couvre pas, en nommant désormais les **cinq** fichiers à corriger.
En passant à une nouvelle dizaine, il criera avant la production — mais il ne
verra toujours pas une liste tierce restée en arrière. **Compter les listes de
tête est précisément ce qui a échoué : les énumérer.**

### 2. Toute entité exposée en API est filtrée par propriétaire
Une nouvelle entité `#[ApiResource]` avec des opérations implémente `App\Entity\ProprieteUtilisateur`,
sans quoi `FiltreProprietaire` ne la filtre pas et **tous les comptes voient les données de tous**.
Aucune exception pour les données d'un compte, `Aliment` compris : chacun ne voit que les siens.
Dérogent seulement les catalogues partagés — exercices (`FiltreExercice`, « public OU le mien »),
emplacements, modes de cuisson — et `Utilisateur`, qui est le propriétaire lui-même ; chacun avec
sa raison écrite. Le test d'inventaire du modèle (`api/tests/ModeleExposeTest.php`) refuse toute
entité non conforme absente de sa liste `DEROGATIONS`. La base double le contrôle là où un
identifiant vient du client : une ligne de stock ne peut viser qu'un aliment de son propre compte
(clé composite `stock_aliment_du_meme_compte_fkey`, migration 35).

Corollaire pour les contrôleurs personnalisés : **vérifier la propriété sur CHAQUE chemin
d'écriture**, pas seulement sur le principal. La faille de septembre 2026 venait d'un contrôle
présent sur `POST /api/mon-frigo/stock` et absent sur son jumeau `POST /api/mon-frigo/inventaire`.

### 3. Les valeurs nutritionnelles décrivent le produit TEL QU'ON LE PÈSE
Le riz blanc sec vaut 350 kcal/100 g, pas 155 — 155, c'est le même riz une fois gonflé d'eau.
Un légume se pèse cru. Le rendement cru/cuit se dérive des pesées à la lecture, il ne se stocke pas
dans les valeurs. Cette règle vaut aussi pour les scripts d'import et pour ce qu'on écrit dans Grocy.

**Les deux chiffres viennent de `Table_Ciqual_2025.xlsx`**, publiée par l'Anses (ciqual.anses.fr) :
le fichier se télécharge et se pose à la racine du dépôt, mais **n'est pas versionné** (`.gitignore`) —
un clone neuf ne l'a pas. « Riz blanc, cru »
350 et « Riz blanc, cuit » 155, d'où le rendement 2,26 que déduit l'import. **Lire la colonne « Énergie,
Règlement UE n° 1169/2011 »**, celle qui compte les fibres à 2 kcal/g comme la règle 4 ; la colonne
voisine « N × facteur Jones » donne 348 et se trompe de convention.

*Deux pièges, tombés tous les deux le 16 septembre 2026.* **Ne pas dire « 130 »** : c'est la valeur
**USDA** du riz blanc long cuit, pas CIQUAL. **Ne pas dire « basmati »** non plus : le « Riz basmati »
de l'application est apparié à l'entrée CIQUAL **« Riz blanc, cru »** (`ciqual_vers_grocy.py:260`,
`:170`), et c'est de là que vient le 2,26. Le vrai basmati a ses propres valeurs — 351 cru, 148 cuit,
soit un rendement de 2,37.

### 4. Convention EUROPÉENNE des fibres
Fibres à **2 kcal/g**, comptées séparément des glucides. `KCAL_FIBRES` dans
`front/src/calcul/nutrition.ts` fait foi. Ne jamais utiliser l'Atwater américain
(`4P + 4G + 9L` sans fibres) : il déclare incohérents les aliments riches en fibres dont les
valeurs sont pourtant justes.

### 5. Aucune formule métier recopiée
Les modules de référence font foi et sont les seuls à porter la formule :

| Domaine | Module de référence |
|---|---|
| 1RM, volume, paliers | `front/src/calcul/performance.ts` — **seule écriture d'Epley dans tout le dépôt** depuis le 19 septembre 2026, gardée par `epleyUnique.test.ts` |
| Macros, Atwater (`kcalDesGrammes`), catégories | `front/src/calcul/nutrition.ts` |
| Cru/cuit, fournées, habitudes | `front/src/calcul/cuisson.ts` |
| Composition de repas | `front/src/solveur/` |
| Suppression des accents | `front/src/calcul/texte.ts` |
| Lecture d'un nombre saisi (virgule, vide ≠ zéro) | `front/src/calcul/saisieNombre.ts` — et `ChampNombre` pour un champ qui garde le texte tapé |
| Jours du calendrier, changement d'heure | `front/src/calcul/dates.ts` |
| Types de séance et leurs couleurs | `front/src/calcul/typesSeance.ts` |
| Bornes et plancher des convives | `front/src/calcul/convives.ts` |
| Proximité de deux noms (fusion d'exercices) | `front/src/calcul/proximite.ts` |
| Composer plusieurs jours d'un coup | `front/src/calcul/composerLaPeriode.ts` |

**Depuis la refonte des 20 et 21 septembre 2026, une partie du métier a quitté
le front pour de bon.** Ces modules-là sont sur le serveur, et le front se
contente d'afficher ce qu'ils répondent :

| Domaine | Module de référence, côté serveur |
|---|---|
| Verdict d'un aliment en cours de saisie (refus, avertissements, couleur, conversion) | `api/src/Service/VerdictAliment.php` — servi par `POST /api/verification/aliment` |
| Les quatorze anomalies nutritionnelles | `api/src/Service/AnomaliesAliment.php` |
| Cohérence des kilocalories déclarées | `api/src/Service/CoherenceNutritionnelle.php` |
| Somme d'Atwater, côté serveur | `api/src/Service/Atwater.php` — **seule écriture PHP**, elle l'était cinq fois |
| Lecture d'un nombre saisi, côté serveur (virgule, vide ≠ zéro, `null` ≡ `""`) | `api/src/Service/NombreSaisi.php` — depuis le 26 septembre 2026. Seul lecteur de l'aliment et de la quantité à la création ; **pas encore** de l'inventaire ni de la cible, son en-tête nomme ces deux restes |
| Rendement tiré des pesées, et la phrase qui l'explique | `api/src/Service/RendementExplique.php` — depuis le 26 septembre 2026 ; `ratioDepuisPesees`, `provenanceRatio` et `expliquerRatio` ont quitté le front. L'écriture d'un aliment passe par `VerdictAliment`, via `AlimentDenormalizer` : **un seul juge, avant et pendant l'écriture** |
| Force d'un mot de passe | `api/src/Service/MotDePasse.php` — servi par `POST /api/verification/mot-de-passe`, **route publique** (l'écran d'invitation n'a pas encore de compte) |
| « Un chrono ne compte que pour une série » | `api/src/Service/ModesDeTravail.php` — **seule écriture du dépôt**. `Seance::getAvancement()` la lui demande, l'écran la reçoit par `GET /api/modes-de-travail` |
| Cohérence d'une cible — seuil de 15 kcal, deux conventions de glucides | `api/src/Service/CoherenceDesCibles.php` — servi par `POST /api/verification/cible`. Le solveur garde `SEUIL_COHERENCE` pour SON diagnostic : jumeau **déclaré**, gardé par `coherenceCibleUnique.test.ts`, part au palier 3 |
| Habitudes de cuisson : « la dernière décision gagne » | `api/src/Service/LotDHabitudes.php::depuis` — il dédoublonne, borne et valide. **Il ne trie AUCUN écart**, et le croire fait recréer un double juge |
| Habitudes de cuisson : « l'inchangé ne s'écrit pas » | `api/src/Repository/CuissonsHabituelles.php::remplacer` — la clause `ON CONFLICT … DO UPDATE … WHERE mode_cuisson_id IS DISTINCT FROM EXCLUDED.mode_cuisson_id`, **seul endroit du dépôt où le tri de l'inchangé est décidé**. `IS DISTINCT FROM` et non `<>` : il traite `NULL` comme une valeur, ce dont la règle 6 a besoin |

### Les doubles juges : il n'y en a plus, et `api/regles/` n'existe plus

**Décision du 20 septembre 2026**, dans les mots du propriétaire : « *tout doit
passer par le serveur car le métier doit être sur le serveur et puis c'est tout,
comme ça je peux changer le front quand bon me semble* ». Les quatre premiers
sont partis en deux jours, et avec eux les quatre fichiers de règles. **Il y en
a SIX au total**, et cette page a longtemps annoncé quatre : les deux derniers
n'y ont été ajoutés que le 25 septembre 2026, par `verite-documentaire`.

| Ce qui était jugé deux fois | Parti le | Ce qui le décide aujourd'hui |
|---|---|---|
| Cohérence d'un aliment | 20 sept. 2026 | `POST /api/verification/aliment` → `VerdictAliment` |
| Rendement cru/cuit | 20 sept. 2026 | la même route |
| Force d'un mot de passe | 20 sept. 2026 | `POST /api/verification/mot-de-passe` → `MotDePasse` |
| **Avancement d'une séance** | **21 sept. 2026** | `api/src/Service/ModesDeTravail.php`, servi par `GET /api/modes-de-travail` |
| **Cohérence d'une cible** | **21 sept. 2026** | `api/src/Service/CoherenceDesCibles.php`, servi par `POST /api/verification/cible` |
| **Habitudes de cuisson** — « la dernière décision gagne » et « l'inchangé ne s'écrit pas » | **25 sept. 2026** | **DEUX endroits, et les confondre invite à en recréer un** : `LotDHabitudes::depuis` dédoublonne, borne et valide — il ne trie AUCUN écart ; c'est la clause SQL de `CuissonsHabituelles::remplacer` qui n'écrit que ce qui a changé. Servis par `PUT /api/mes-cuissons` |

**IL EN RESTE DEUX, ET ILS SONT TOUS DEUX DÉCLARÉS ET GARDÉS.** Cette page a
annoncé « un » jusqu'au 2 octobre 2026 — sixième erreur de comptage sur ce même
paragraphe, et cette fois c'est la feature `macros-editeur-vide-pas-zero` qui en
avait créé un second le 26 septembre sans que personne le reporte ici.

| Jumeau déclaré | Les deux écritures | Ce qui les tient | Quand il part |
|---|---|---|---|
| `SEUIL_COHERENCE`, `ecartDeCoherence`, `bornesDeCoherence` | `front/src/solveur/solveur.ts` et `api/src/Service/CoherenceDesCibles.php` | `coherenceCibleUnique.test.ts` | au palier 3, avec le solveur |
| `POIDS_INCHANGE` (0,01) — « le poids ne bouge pas assez pour qu'on en parle » | `front/src/calcul/nutrition.ts:88` (il sert encore à `resumeRatio`, la phrase courte du frigo) et `api/src/Service/RendementExplique.php:24` | `ratioDit.test.ts`, qui ouvre le PHP et compare les deux valeurs | le jour où la case du frigo recevra sa phrase du serveur |

Le solveur pose le même constat de cohérence dans ses propres diagnostics ; le
front garde le seuil du poids inchangé parce que `resumeRatio` écrit encore la
phrase courte du frigo. **Les deux sont déclarés, gardés par un test qui lit
l'autre langage, et datés d'une sortie.** C'est la seule réponse honnête à
« combien en reste-t-il » : **deux**.

`api/regles/coherence.json`, `rendement.json`, `motdepasse.json` et
`avancement.json` sont supprimés, ainsi que leurs huit suites jumelles.
**Le dossier `api/regles/` n'existe plus : ne pas en recréer un.**

**ET L'ANCIEN JUGE DU FRONT EST PARTI AVEC, le 21 septembre 2026** :
`front/src/calcul/plausibilite.ts` (422 l.) et son générateur de corpus
(151 l.) sont supprimés. Ils ne servaient plus — aucun écran ne les importait —
mais tant qu'ils étaient là, « il n'y a plus de double juge » n'était vrai que
**par accident** : rien n'empêchait un écran de les rappeler. Vingt-cinq renvois
écrits au présent pointaient encore vers eux, dont quatre **déjà faux avant la
suppression** ; ils sont corrigés. Ceux écrits au PASSÉ sont gardés : ce dépôt
met son histoire dans ses commentaires.

**POURQUOI UNE ROUTE, ET NON UN FICHIER DE RÈGLES.** Un fichier de règles est un
*contrat* : il suppose qu'un futur front pense à le lire, donc il **garde** la
duplication au lieu de la supprimer. Une route ne le suppose pas — un écran qui
ne l'appelle pas n'affiche rien, et ça se voit tout de suite.

**CE QUI A DÉBLOQUÉ L'AVANCEMENT, le dernier et le plus coriace.** Cocher une
série doit bouger le compteur *immédiatement*, hors ligne compris : lire
`seance.avancement` l'aurait figé jusqu'au retour de la requête. La sortie n'est
pas de partager la règle, c'est de **déplacer ce qui est transmis** — le serveur
envoie, par mode de travail, **combien de séries comptent** (`GET
/api/modes-de-travail` : `chrono → 1`, les autres → toutes), et l'écran découpe
à ce nombre. Ce n'est plus une règle métier, c'est de l'arithmétique paramétrée.

**ET LA PREMIÈRE VERSION DE CETTE CORRECTION ÉTAIT FAUSSE — même journée.** Elle
envoyait un **poids par série** (1, ou 0 au-delà de la première ligne d'un
chrono) que l'écran additionnait. Élégant, et périmé dès que l'utilisateur
touchait au bloc : un poids par ligne est *dérivé* du mode et du rang, les deux
choses que l'écran modifie sans le serveur. Mesuré — ajouter un exercice « for
time » affichait **0/3** là où le serveur dirait 0/1, supprimer la première
ligne d'un chrono donnait 0/0 et faisait disparaître la jauge, basculer
Chrono → Charge donnait 0/1 au lieu de 0/3. Trouvé par **deux agents**, chacun
de son côté, sur le geste le plus banal de l'écran.

> **NE JAMAIS TRANSMETTRE AU FRONT UNE VALEUR DÉRIVÉE D'UN ÉTAT QU'IL MUTE.**
> Transmettre la règle, indexée sur quelque chose que le client possède déjà.
> C'est la leçon du 21 septembre 2026, et elle dépasse largement l'avancement.

**NE COMPTE PAS LES DOUBLES JUGES DE TÊTE — CETTE PAGE S'EST TROMPÉE CINQ
FOIS.** Successivement : « le mot de passe est le seul cas », « deux cas et deux
seulement », « trois cas », « deux » de nouveau, puis — le 21 septembre — elle
annonçait « deux » et « trois » **dans le même paragraphe** en citant quatre
fichiers déjà supprimés. Chaque correction a été écrite par quelqu'un qui
croyait vérifier. **Si tu lis cette page pour savoir combien il y en a, va
d'abord regarder `api/regles/` et la liste des routes de vérification.**

**CE QUI EMPÊCHE MAINTENANT QU'ILS REVIENNENT**, faute de fichier de règles à
tenir d'accord — **sept** gardes. La portée de chacun est écrite ci-dessous
parce qu'elle décide de ce qu'il peut voir : un garde qui ne lit que `front/` ne
verra jamais une divergence entre deux langages, et c'est précisément le défaut
qu'on cherche. **La colonne distingue le BALAYAGE — ce qu'il parcourt en masse —
des fichiers qu'il ouvre nommément**, et ce n'est pas cosmétique : c'est cette
seconde liste qui dit s'il voit l'autre langage.

| Garde | Ce qu'il refuse | Ce qu'il LIT |
|---|---|---|
| `front/src/calcul/epleyUnique.test.ts` | le coefficient d'Epley hors de `performance.ts` | **tout le dépôt** : `.ts`, `.tsx`, `.php`, `.sql`, `.py` |
| `front/src/calcul/avancementUnique.test.ts` | le mot « chrono » dans le module d'avancement, tout décompte partiel des séries (`slice(0, 1)`), **et la divergence des trois listes de modes de travail** | balaie `front/src` + `front/app`, **et ouvre `db/01-schema.sql`, `api/src/Service/ModesDeTravail.php`, `front/src/composants/choixMode.tsx`** |
| `front/src/calcul/formuleUnique.test.ts` | toute multiplication par un coefficient `KCAL_…` hors de `nutrition.ts` | `front/src` + `front/app` |
| `front/src/calcul/coherenceCibleUnique.test.ts` | qu'un écran rejuge la cohérence d'une cible ; la divergence des deux seuils | balaie `front/app`, **et ouvre `solveur.ts`, `CoherenceDesCibles.php`, `FormatCourt.php`, `theme/index.ts`** |
| `front/src/calcul/habitudesAuServeur.test.ts` | toute comparaison choisi/connu, le nom `habitudesAEcrire`, tout envoi au serveur qui ne vient pas de `lignesDHabitudes` | balaie `front/src` + `front/app`, **et ouvre `LotDHabitudes.php`** |
| `front/src/calcul/lectureAuServeur.test.ts` *(26 sept. 2026)* | `nombreSaisi`, `parseFloat`, `Number(` et `ratioDepuisPesees` dans les deux éditeurs d'aliment ; le retour de `ratioDepuisPesees`, `provenanceRatio` ou `expliquerRatio` dans `nutrition.ts` | ouvre **quatre fichiers nommés** : `editeurAliment.tsx`, `editeurAlimentConnecte.tsx`, `nutrition.ts`, `nutrition.test.ts`. Ne balaie rien, **et ne voit aucun autre langage** |
| `front/src/calcul/ratioDit.test.ts` *(26 sept. 2026)* | la divergence de `POIDS_INCHANGE` entre le front et le serveur | ouvre `api/src/Service/RendementExplique.php` et le compare à `nutrition.ts` |

**CETTE PAGE A ANNONCÉ « TROIS » JUSQU'AU 25 SEPTEMBRE 2026**, et elle disait
deux autres choses fausses dans le même paragraphe : que « les deux derniers ne
voient ni le serveur ni la base » — alors qu'`avancementUnique` compare les trois
listes de modes à travers SQL, PHP et TSX, et que son propre commentaire le
revendique : « LE SEUL CONTRÔLE QUI VOIT CETTE DIVERGENCE » — et, plus bas,
qu'`epleyUnique` serait « le seul dispositif qui voit une divergence entre deux
langages », alors qu'ils sont plusieurs. Le tableau portait en prime deux lignes
d'en-tête empilées, dont la seconde s'affichait comme une ligne de données.
Relevé par `verite-documentaire`.

**ET LE 2 OCTOBRE 2026, ELLE ANNONÇAIT ENCORE « CINQ ».** `lectureAuServeur` et
`ratioDit` étaient posés depuis le 26 septembre, aucun des deux n'était dans le
tableau, et `ratioDit` gardait en prime un second jumeau déclaré que le
paragraphe ci-dessus ignorait. Les deux ont été écrits par une session qui
corrigeait consciencieusement cette page par ailleurs. **Le défaut n'est pas
l'inattention : c'est que poser un garde et le déclarer sont deux gestes, et
que le second s'oublie.** Trouvé par `doc-auditor` pendant la passe de
documentation de `macros-editeur-vide-pas-zero`.

**CE QUI RESTE VRAI DE L'AVERTISSEMENT** : `db/manuel/cibles.sql` écrit
`4 * prot + 4 * gluc + 9 * lip` — l'Atwater **américain**, sans fibres,
contraire à la règle 4 — et **aucun garde ne le voit**, parce qu'aucun ne balaie
`db/`. Relevé le 21 septembre 2026, non corrigé, toujours vrai le 25.

**Un garde ne suffit pas : il faut qu'il PUISSE tomber.** Chacun porte donc un
cas TÉMOIN qui vérifie qu'il reconnaît encore sa référence — sans quoi un motif
devenu obsolète laisserait la suite verte et muette. Les trois ont été éprouvés
en sabotant volontairement le code gardé, et chacun est tombé **en nommant le
défaut**.

### Le 1RM : la duplication a été retirée, le 19 septembre 2026

Epley était écrit **trois** fois, dans trois langages : `performance.ts`,
`api/src/Entity/SeanceExercice.php` (exposé en `seance:lire`) et la vue SQL
`v_performance`. **Personne ne lisait les deux dernières**, et la troisième était
déjà fausse — `MAX(sr.poids * (1 + 0.0333 * sr.reps))`, sans le plafond de
15 répétitions, donc un « record » sur une série de 93 répétitions. C'est le
constat E1 endormi dans une vue.

Les deux copies sont supprimées (migration 39 pour la vue). **La formule n'a plus
qu'un domicile**, et `front/src/calcul/epleyUnique.test.ts` refuse toute
réécriture du coefficient **dans tout le dépôt** — `.ts`, `.tsx`, `.php`, `.sql`,
`.py` — pas seulement dans le front. C'est le seul qui balaie le dépôt ENTIER ;
ils sont **cinq** à voir une divergence entre deux langages — `epleyUnique`,
`avancementUnique`, `coherenceCibleUnique`, `habitudesAuServeur` et `ratioDit`,
chacun sur son sujet. **Les énumérer, pas les compter** : la phrase disait « le
seul dispositif » (faux depuis le 21 septembre 2026, corrigé le 25), puis
« quatre » (faux depuis le 26 septembre, corrigé le 2 octobre). Les sept gardes
et leur portée sont dans le tableau plus haut ; les deux qui ne lisent que du
TypeScript sont `formuleUnique` et `lectureAuServeur`.

**Ne pas réintroduire `rmEstime` dans l'API sans décision explicite.** Si un
autre lecteur doit un jour obtenir ce chiffre du serveur, il faudra le lui faire
**calculer par le serveur** et l'afficher, comme pour l'aliment et le mot de
passe — surtout pas un second juge tenu par un fichier de règles, dispositif
abandonné le 21 septembre 2026.

Un hook qui recalcule un 1RM importe `performance.ts`. Trois copies d'Epley aux bornes divergentes
ont produit un « record » de 79,96 kg que la formule elle-même déclare invalide.

**La somme d'Atwater n'a qu'une écriture depuis le 17 septembre 2026.** Ce fichier l'affirmait
déjà ; elle était en réalité écrite cinq fois (`solveur.ts`, `plausibilite.ts`, `planCoach.ts`,
`carteRepas.tsx`, en plus de `nutrition.ts`). `front/src/calcul/formuleUnique.test.ts` refuse
désormais toute multiplication par un coefficient `KCAL_…` hors de `nutrition.ts`.

**`front/src/calcul/texte.ts` existe depuis le 15 septembre 2026** (constat D4).
Il a longtemps figuré dans ce tableau sans exister : la ligne annonçait une
correction qui n'avait pas été faite. Les quatre copies de `sansAccent` sont
désormais fusionnées.

**Elles appelaient toutes `normalize('NFD')`** — soit quatre `TypeError` en
puissance, Hermes ne l'implémentant pas partout. Le module s'aligne donc sur la
table manuelle de `cleDHabitude`, et son test **retire `String.prototype.normalize`
le temps de l'appel** : toute réécriture en `normalize` tombe sur le poste, et non
sur un téléphone.

Les deux restes signalés au moment de la fusion **sont réglés depuis le
15 septembre 2026** : `habitudesCuisson.ts` importe `SANS_ACCENT` au lieu de
réécrire la table, et la sixième copie qui dormait dans
`src/solveur/garanties.test.ts` — un test qui réimplémentait ce qu'il garantit —
a été remplacée par un import du module. Il n'y a plus qu'une définition de
`sansAccent` et qu'une table dans tout le front.

Exception : `cleDHabitude` utilise **volontairement** une table de correspondance manuelle plutôt
que `normalize('NFD')`, parce que Hermes ne l'implémente pas partout. Ne pas « factoriser » celle-là.

### 6. Vide ≠ zéro
Un champ vide veut dire « je ne sais pas », un zéro veut dire « zéro ». La saisie garde le texte
tapé par l'utilisateur ; « sans cuisson » est un choix, pas une absence de réponse. Ne jamais
substituer une valeur par défaut silencieuse à une donnée manquante.

### 7. Un chiffre faux est pire qu'un refus de répondre
C'est une application de nutrition : ce qui est affiché sera pesé et mangé. En cas de doute sur un
calcul, afficher l'incertitude ou refuser, jamais une valeur plausible non vérifiée. Toute
déviation par rapport à la cible doit être expliquée à l'écran.

## Grocy est ABANDONNÉ — ne plus jamais le traiter

**Décision du propriétaire, répétée plusieurs fois et écrite enfin ici le
26 septembre 2026** : ses données ont été migrées de Grocy vers la base de
l'application, et Grocy ne lui sert plus à rien. Le code Grocy traîne encore
(`source_frigo = grocy`, `/mon-frigo/aliment`, `/mon-frigo/quantite`,
`MigrationGrocyController`, skill `fonctionnalite-frigo-grocy`, les mentions
de Grocy dans la règle 3) : **c'est du code mort en attente de retrait**, pas un
chemin à protéger. Un défaut, un critère, un test ou un constat de revue qui ne
touche que lui est **écarté, pas corrigé** — et un agent de revue qui en
remonte un se trompe de sujet. Le retrait lui-même est un chantier à part
(`docs/etat/prochaines-etapes.md`), à ne lancer que sur demande.

## Architecture, en bref

- **Isolation des données** : `ProprieteUtilisateur` (interface de marquage) + `FiltreProprietaire`
  (extension Doctrine, priorité 100, pose le `WHERE`) + `ChargementComplet` (priorité 50, ajoute les
  jointures anti-N+1 par-dessus). L'entité `Utilisateur` n'a **aucune relation sortante** : c'est un
  type auquel on se réfère, pas un module dont on dépend. Garder cette propriété.
- **« Cette donnée est-elle à moi ? » se demande au voter** `App\Security\Voter\EstLeProprietaire`
  (attribut `MIEN`), qui vaut pour **toute** entité `ProprieteUtilisateur`. Il remplace deux
  comparaisons écrites à la main. Il **décide**, il ne répond pas : les appelants rendent **404**,
  le même texte pour « n'existe pas » et « pas à toi ». Les `#[IsGranted('ROLE_…')]` des contrôleurs
  restent : un rôle se vérifie ainsi, un voter sert quand la décision porte sur un objet.
- **Aucun SQL dans `src/Controller/`** depuis le 18 septembre 2026 : il vit dans `src/Repository/`
  (`CuissonsHabituelles`, `Comptes`, `Invitations`), avec les transactions. Un contrôleur lit la
  requête, appelle, répond. C'est ce que montre la documentation Symfony 7.4, et ce qui rend le SQL
  éprouvable sans lever le noyau.
- **Session** : JWT court (1 h) + jeton de rafraîchissement révocable. Les pare-feux `session`,
  `invitation` et `etat` sont **volontairement hors** du pare-feu JWT — leur ordre dans
  `security.yaml` est signifiant, le premier motif qui correspond gagne.
- **Inventaire** : déposé en lot (`inventaire_lot`), appliqué en tâche de fond par
  `TraiterInventaires` (2 exemplaires, `FOR UPDATE SKIP LOCKED`).
- **`front/dist/` est versionné volontairement** (exception explicite dans `.gitignore`) : c'est le
  build web servi par Caddy. Le régénérer avec `npm run build:web`, jamais le copier d'ailleurs.

## Pièges connus

- `entrypoint-prod.sh` rejoue `db/manuel/` à **chaque** démarrage : un fichier de migration qui
  écrit des données écrase les corrections manuelles à chaque redémarrage.
- **Un champ d'écriture doit porter le nom d'une propriété ou d'un accesseur.**
  `RefuserLesChampsInconnus` refuse en 400 tout corps d'écriture qui nomme un champ inexistant
  dans la ressource visée — c'est ce qui empêche un `"partage": true` de recevoir 201 sans rien
  faire. Exposer un jour un champ sous un autre nom (`#[SerializedName]`) ou une relation sans
  `targetEntity` le fera refuser à tort : étendre `api/src/Serializer/ChampsInconnus.php`, et
  surtout pas revenir à `allow_extra_attributes: false`, qui refuse aussi `id` et les `@id`
  imbriqués que le front renvoie — essayé et retiré le 15 septembre 2026.
- Les scripts de la racine ne sont pas des jouets : `installer.sh`, `restaurer-nas.sh`,
  `deployer-nas.sh`, `publier*.sh` déploient ou détruisent. Ne jamais les lancer pour « voir ».
- **Une colonne `TIMESTAMPTZ` se déclare `Types::DATETIMETZ_IMMUTABLE`.** PHP tourne en
  `Europe/Paris`, la session PostgreSQL en UTC : déclarée `DATETIME_IMMUTABLE`, l'heure partait
  sans fuseau et chaque ligne écrite par l'API datait de deux heures dans le futur, jusqu'au
  17 septembre 2026. `datetimetz_immutable` est remplacé dans `doctrine.yaml` par
  `App\Doctrine\DateAvecFuseauType`, qui relit aussi les valeurs posées par `now()` ;
  `DatesAvecFuseauTest` refuse toute colonne datée sans fuseau hors `jeton_rafraichissement`.
- **`doctrine:schema:update --force` détruirait des données.** `doctrine:schema:validate`
  répond « not in sync », et **c'est normal** : le schéma s'écrit à la main, `invitation` et
  `inventaire_lot` n'ont aucune entité — Doctrine propose donc de les SUPPRIMER, avec les index
  et les CHECK faits à la main. Le schéma évolue par `db/01-schema.sql` **et** une migration
  numérotée, jamais par l'ORM. Détail dans la skill `schema-base`.
- **L'ALIAS `@/` NE SURVIT PAS À `npm test`.** La suite compile `src/` vers
  `dist-tests/` et lance Node dessus, sans réécrire `@/` : un module de calcul
  qui l'utilise pour une **valeur** tombe sur `Cannot find module '@/theme'`.
  Les imports de **type** y survivent, eux, parce qu'ils s'effacent à la
  compilation — d'où un piège asymétrique : `npm run verif` passe, `npm test`
  tombe, et le message ne parle pas du vrai sujet. Il a mordu deux fois le
  20 septembre 2026 ; `front/src/calcul/aliasInterdit.test.ts` l'interdit
  désormais dans `src/calcul` et `src/solveur`. Dans un `.tsx`, l'alias reste
  parfaitement correct.
- **`Intl` EST DISPONIBLE SOUS HERMES, et trois fichiers disaient le
  contraire.** Mesuré le 20 septembre 2026 sur l'émulateur, moteur réel,
  Android 14 et 16 : `toLocaleDateString('fr-FR', { weekday: 'long' })` rend
  « dimanche 20/09 », et `HERMES_ENABLE_INTL=True` est en dur dans React Native
  (`ReactAndroid/hermes-engine/build.gradle.kts:267`) — aucun réglage de ce
  dépôt ne peut l'éteindre. La croyance venait de `normalize`, qui n'est **pas**
  une API `Intl`. **Ce qui reste vrai** : seuls quatre constructeurs sont là —
  `getCanonicalLocales`, `Collator`, `DateTimeFormat`, `NumberFormat`.
  `PluralRules`, `RelativeTimeFormat`, `ListFormat`, `DisplayNames`, `Locale`
  et `Segmenter` sont **absents**, donc un `TypeError` en puissance. Et les
  données venant de l'ICU du système, ne jamais éprouver une sortie
  `toLocaleDateString` caractère par caractère.
- `tsconfig.tests.json` n'inclut plus une liste écrite à la main mais **un motif**,
  `src/**/*.test.ts` — la liste manuelle avait laissé `performance.ts` sans test
  pendant des mois. Le piège qui reste : le motif ne couvre que `src/`, donc un
  test posé dans `front/app/` n'est **jamais exécuté**, sans le moindre signal.

## Méthode de travail

- **TDD** : le test échoue d'abord, puis le correctif le fait passer. Sans quoi on « corrige » un
  bug en ajustant le test qui fige la mauvaise valeur.
- **Ne jamais déclarer terminé sans preuve** : coller la sortie de `npm test` ou de `bin/phpunit`,
  pas une affirmation.
- Les commentaires de ce projet racontent **la panne réelle et sa date**. Continuer ainsi : c'est ce
  qui rend les divergences repérables des mois plus tard.
- **Une seule arborescence par poste, sous WSL2**, poussée sur Gitea — `~/perso/fitcarnet` sur
  l'un, `~/fitcarnet` sur l'autre : ne pas écrire de chemin absolu dans une commande documentée,
  partir de la racine du dépôt. Chaque poste a sa base de dev et son `node_modules` : après un
  `git pull`, `db/manuel/rattraper-dev.sh` et, si besoin, `npm install`.
  Le projet se travaille en terminal, avec Claude Code. **Claude Cowork n'est pas utilisable
  ici** : il refuse les chemins `\\wsl.localhost\...`, et la parade — un clone Windows
  synchronisé — est précisément ce qui a coûté le bug de septembre 2026, un renommage de
  méthode propagé à deux appelants sur trois. Ne jamais recréer de seconde copie sur un même
  poste : ni sous Windows, ni ailleurs. Ce qui doit circuler passe par git.

## Skills : laquelle, quand

**Les 26 skills du dépôt portent ce que personne d'autre ne peut écrire** — onze
skills de métier et d'outillage, plus les quinze fiches `fonctionnalite-*`. Elles
sont dans `.claude/skills/`, toutes actives, et disent le métier et les pièges de
*ce* projet :

| Skill | Ce qu'elle porte |
|---|---|
| `isolation-donnees` | La règle 2, ses trois pièces, et le corollaire « chaque chemin d'écriture » |
| `tests-api` | PHPUnit sans base ni noyau, services `final readonly`, `createStub` |
| `front-fitcarnet` | Modules de référence, `node:test`, Node 22, `front/dist/` |
| `nutrition-fitcarnet` | Fibres à 2 kcal/g, produit tel qu'on le pèse, vide ≠ zéro |
| `schema-base` | Double écriture du schéma, idempotence, ordre dans `installer.sh` |
| `revue-de-code` | Les huit motifs de défaut du projet, un cas daté pour chacun — **plus une neuvième question** : confronter le code à la documentation officielle de sa pile, par `context7` |
| `donnees-de-test` | **À charger avant toute écriture en base de dév** : compte jetable, ordre de nettoyage, et la règle « relever la valeur AVANT de l'écraser » |
| `epreuve-fonctionnalite` | La méthode pour éprouver une fonctionnalité côté utilisateur, la filmer, et le gabarit des fiches |
| `verification-android` | Émulateur, Expo Go, pilotage par `adb`, et les pièges qui font croire à un faux résultat |
| `fonctionnalite-*` | Une fiche par fonctionnalité : le besoin, le parcours, les critères, la capture |
| `postgres` | Index, plan de requête, `VACUUM` |
| `passe-de-controle` | **Avant de publier quoi que ce soit** : quels agents lancer, dans quel ordre, et surtout **ce que chacun ne verra jamais** |

Le 9 septembre 2026, dix skills « du projet » ont été **supprimées** : génériques,
sans une ligne sur fitcarnet, toutes écrites pour une architecture hexagonale que
`api/src` n'a pas — et redondantes avec `superpowers-symfony`, dont les 44 skills
ciblent la vraie pile. Le tri d'alors était à l'envers : les coupées étaient celles
du travail quotidien, les actives celles d'une refonte jamais commencée.

**`skillOverrides` ne peut rien contre les skills des plugins.** Vérifié le
8 septembre 2026 : une entrée `expo:expo-dom` ou `superpowers-symfony:tdd-with-pest`
ne coupe rien, ni depuis le dépôt ni depuis `~/.claude/settings.json`. Le seul
levier est `claude plugin disable` — le plugin entier. Les vingt-deux entrées de
ce genre ont été retirées : elles faisaient croire à une économie qui n'existait
pas (~2 950 tokens de contexte payés à chaque session malgré tout). Ne pas en
réécrire. Sur les skills du dépôt, en revanche, `skillOverrides` fonctionne — il
n'y en a simplement plus une seule à couper.

Pour l'aiguillage :

| Travail | Skill à prendre |
|---|---|
| Corriger un bug, ajouter un comportement | **`superpowers:test-driven-development`**, sans exception |
| Relire du code, chercher une régression | **`revue-de-code`** — les huit motifs de défaut du projet, avec un cas daté pour chacun |
| Exposer une entité, écrire un contrôleur ou un processeur | **`isolation-donnees`** — avant de coder, pas après |
| Écrire un test API | **`tests-api`** d'abord — le motif du projet ; **`superpowers-symfony:tdd-with-phpunit`** pour le générique PHPUnit (le projet n'est pas en Pest) |
| Toucher à `front/src` ou `front/app` | **`front-fitcarnet`** |
| Un calcul, un import d'aliments, un chiffre affiché | **`nutrition-fitcarnet`** |
| Table, colonne, contrainte, migration | **`schema-base`** |
| Écrire en base de développement, monter un scénario réel | **`donnees-de-test`** — la règle « n'écris jamais sur une donnée que tu n'as pas créée » |
| Cadrer une demande vague ou vaste | **`superpowers:brainstorming`** (celle de `superpowers`, pas celle de `superpowers-symfony`) |
| API Platform : ressource, filtre, processeur, sérialisation | **`superpowers-symfony:api-platform-*`** — elles ciblent la v4, celle du projet |
| Doctrine : relations, migrations, transactions, N+1 | **`superpowers-symfony:doctrine-*`** |
| Écran, navigation, données | **`expo:expo-router`**, **`expo:expo-data-fetching`** |
| Après un `eas update` : est-il arrivé sur les téléphones | **`expo:eas-update-insights`** — aucune skill ne couvre la publication elle-même, c'est `publier.sh` |
| Index, plan de requête, VACUUM | **`postgres`** |
| Déployer, publier, restaurer | **rien d'automatique** : lire `DEPLOIEMENT.md`, qui couvre aussi la livraison quotidienne depuis le 16 septembre 2026 |
| **Avant un APK, une démonstration, une passation** | **`passe-de-controle`** — les six agents, leurs angles morts respectifs, et les trois pièges de la passe elle-même |

## Agents

| Agent | Quand l'invoquer |
|---|---|
| **`revue-fitcarnet`** | Avant de pousser, sur une modification en cours, ou pour éprouver un pan de code. Lecture seule : il rapporte, il ne corrige pas. Il applique les **huit motifs de défaut réellement trouvés** par l'audit — le jumeau oublié, le garde qui regarde l'état au lieu de l'intention, le commentaire qui ment, le test qui ne peut pas échouer… — via la skill `revue-de-code`. Une revue générique ne trouve rien sur ce projet ; celle-ci sait où regarder. Il n'a **pas** `context7` : un agent de projet qui déclare une liste d'outils explicite ne reçoit pas les outils MCP (mesuré le 19 septembre 2026). Il signale donc les sujets à confronter, et c'est `revue-pile` ou la session principale qui pose la question. |
| **`revue-pile`** | Confronte le code à la documentation **officielle** de sa pile — Symfony 7.4, API Platform 4, React Native, Expo Router, TanStack Query — par le MCP `context7`. Là où `revue-fitcarnet` cherche le code contre lui-même, celui-ci cherche le code contre l'état de l'art de ses bibliothèques. C'est cet **angle** — la confrontation à `context7` — qui a trouvé que `login_throttling` était devenu un verrou de tout le site, faute de `trusted_proxies` ; la trouvaille date du 18 septembre et vient de la **session principale** (`1e3a47d`), un jour avant que cet agent existe (`b4a5cc0`, 19 septembre 1 h 21). Ne pas la lui attribuer : trois documents l'ont fait, et c'est ce qui fait croire qu'un outil trouve tout seul. **Il ne déclare aucune liste `tools:`**, et c'est ce qui lui donne le MCP — la règle, mesurée dans les deux sens le 19 septembre 2026 : *une liste `tools:` explicite prive des outils MCP ; pas de liste ⇒ tous les outils*. Contrepartie : il dispose d'outils d'écriture, et son interdiction de modifier ne tient qu'à sa consigne. |
| **`verification-bout-en-bout`** | Après une modification qui touche l'API ou la base, et avant une livraison ou une démonstration. Éprouve l'application **qui tourne** — connexion, appels, état en base — puis retire toute trace de son passage et le prouve. Sa règle absolue : **n'écrire jamais sur une donnée qu'il n'a pas créée** (skill `donnees-de-test`). |
| **`verite-documentaire`** | Après un chantier, avant une passation. Confronte ce que la documentation **affirme** au dépôt réel : fichiers annoncés, revendications d'unicité, compteurs, `fichier:ligne`. Quatre affirmations fausses ont été trouvées par accident en deux jours ; il les cherche exprès. |
| **`verification-android`** | Après une modification qui touche une saisie, le réseau ou un écran, et avant une livraison. Fait tourner l'application dans Expo Go sur l'émulateur, fait les gestes de l'utilisateur, relit l'écran et la base. C'est ainsi qu'on a vu 42,5 kg s'enregistrer 425 kg avec 577 tests au vert. Skill `verification-android`. |
| **`verification-fonctionnalites`** | Avant une démonstration ou une livraison, ou pour dresser l'état réel de ce que propose l'application. Éprouve une fonctionnalité du point de vue de l'utilisateur — répond-elle au besoin, fonctionne-t-elle — et en filme une capture vidéo par scénario. Skills `epreuve-fonctionnalite` et `fonctionnalite-*`. |
| `hexagonal-architect`, `hexagonal-reviewer` | Installés pour la refonte hexagonale, **non commencée**. Sans objet tant que `api/src` suit la structure Symfony classique. |

**Hexagonal / DDD.** La migration vers l'architecture hexagonale reste un objectif
assumé, et **elle n'a toujours pas commencé** : `api/src` suit la structure Symfony
classique (`Controller`, `Service`, `Entity`, `Repository`, `State`). Ne pas
appliquer ces patrons à du code existant sans une décision explicite — et ne jamais
mélanger cette refonte avec une correction de bug dans le même commit.

Ce qui reste pour le jour J : les deux agents `hexagonal-architect` et
`hexagonal-reviewer` (`.claude/agents/`), qui notent la conformité d'un module, et
les skills `superpowers-symfony:ports-and-adapters`, `:cqrs-and-handlers`,
`:value-objects-and-dtos`. Les quatre skills projet qui doublonnaient tout cela ont
été supprimées le 9 septembre 2026.

**graphify** a sa propre section plus bas.

## Audit

`docs/audit-2026-09/` — 79 constats classés, avec scénarios reproduits et plan de correction en lots.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- **`api/src` passe AUSSI par l'extraction sémantique, et pas seulement par l'AST.**
  Décidé le 16 septembre 2026. L'AST ne lit que la structure — imports, appels,
  méthodes — si bien que `FiltreExercice` avait dix arêtes, toutes vers du code, et
  **aucune vers le constat d'audit que son propre en-tête nomme en clair**
  (« POURQUOI CETTE CLASSE EXISTE — constat E8 / F-04 »). Or ce projet met son
  histoire dans ses commentaires : 2 584 lignes sur 8 378 dans `api/src`. Sans
  cela, un constat n'est relié au code que si un *document* nomme le symbole,
  jamais quand le code nomme le constat. Concrètement : lors d'un
  `/graphify . --update`, ajouter les `.php` de `api/src` à la liste envoyée aux
  sous-agents (partie B), en plus de leur passage AST habituel.

## Cadre de projet (harness)

Installé le 25 septembre 2026 par `/harness-init` (plugin `claude-harness@mickael-harness`).
Il **n'ajoute aucune règle** : les sept règles non négociables ci-dessus restent la seule
référence, et le gabarit du harness en propose cinq, génériques, qui ne sont
volontairement pas recopiées ici — elles doubleraient les nôtres en moins précis et sans
les dates de panne qui en font la valeur.

- Point d'entrée : `/harness`. Il connaît la phase de chaque feature et propose la suite.
- Pile détectée : `.claude/harness.json`, **régénéré** dès que les manifestes changent.
  Les corrections tiennent dans `.claude/harness.overrides.json`, jamais dans
  `harness.json` — c'est ce fichier-là qui survit à un `composer.json` modifié.
  Trois valeurs y sont corrigées à la main, avec leur raison : les tests API passent
  par le conteneur, l'analyse du front par `npm run verif`, les épreuves par `e2e/`.
- Index du code : `.claude/harness/index.json` (285 fichiers), à interroger avant un
  `grep` sur tout le dépôt. Il se maintient seul. **Il ne remplace pas graphify** :
  l'index donne les symboles, graphify donne les relations et l'histoire.
- État : `docs/etat/statut.md`, `docs/etat/decisions.md` (append-only),
  `docs/etat/prochaines-etapes.md`. **`REPRENDRE.md` reste le journal de bord du
  chantier** — c'est lui qu'on lit en premier, comme dit plus haut.
- `docs/audits/` appartient au harness. **Ne pas le confondre avec
  `docs/audit-2026-09/`**, qui porte les 79 constats de septembre.

**Le piège qui a coûté l'installation, le 25 septembre 2026.** `core.autocrlf` valait
`true` en global sur ce poste : git restituait les fichiers en CRLF *au checkout*, alors
que les blobs étaient sains. Les dix-neuf scripts du harness mouraient tous sur
`set -euo pipefail\r` — « invalid option name » — et avec eux `/harness-init` et les
quatre hooks du plugin. **fitcarnet, lui, n'a rien senti** : son `.gitattributes` force
`*.sh text eol=lf` et surcharge le réglage global ; ses quinze scripts sont restés en LF.
Le réglage est passé à `input`, et le dépôt du harness a reçu le même `.gitattributes`.
Sans ce fichier, un dépôt de scripts shell dépend de la configuration de qui le clone.
