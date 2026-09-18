> **ARCHIVE — journal de bord du 7 au 17 septembre 2026, figé le 18 septembre.**
> Il n'est plus tenu à jour : **`REPRENDRE.md`, à la racine, fait foi** pour ce
> qui reste à faire et les décisions en vigueur. Celui-ci garde l'histoire
> détaillée — les pannes, leurs dates, comment elles ont été trouvées — que les
> commentaires du code citent parfois. Ses chiffres et ses « reste à faire »
> sont ceux de leur date, pas d'aujourd'hui.

# Où on en est — reprendre le travail

Journal de bord du chantier en cours. À lire au début d'une session sur une
machine qui n'a pas suivi les précédentes, **et à tenir à jour** : c'est le seul
endroit qui dit ce que ni le code ni les commits ne racontent — les décisions
prises, ce qui attend un arbitrage, et par quoi continuer.

**Dernière mise à jour : 17 septembre 2026, soir, second poste** — **chaque
aliment appartient à un compte**, et la reprise sur le second poste a lancé
deux fois les trois agents de contrôle. Ils ont trouvé, entre autres, une
création d'aliment qui s'ouvrait avec des macros à « 0 », une API qui
enregistrait 0 pour une macro absente, des dates écrites deux heures dans le
futur, un import et une remise à zéro qui ne marchaient pas, une procédure de
restauration dangereuse, et la somme d'Atwater écrite cinq fois. **Tout est
corrigé et testé.** Restent : contrôler la production, retirer la migration 34,
et quelques arbitrages — voir juste en dessous et « Par quoi continuer ».

**Le 17 au matin** — le chantier « aliments par compte » lui-même, sur le
premier poste (conception, schéma, API, front, scripts, documentation).

**Plus tôt le 17 septembre** — la présentation tient enfin dans
**un seul fichier** (`presentation/demonstration.md`) derrière **un seul
script** (`preparer-demonstration.sh`), et les **23 captures existent pour de
vrai** : elles sont prises par Playwright sur l'application qui tourne, et
quatre d'entre elles mentaient jusqu'à ce soir (voir « Les captures de la
démonstration », plus bas).

**Le 16 septembre** — l'inventaire des fonctionnalités
écrit par le propriétaire a été passé en revue, **quinze fiches** et **deux
agents** en sont nés, et l'épreuve sur émulateur Android a trouvé que le
sélecteur de mode tout juste ajouté au modèle **ne commandait rien** (voir
« Le mode de travail se choisit aussi dans un modèle », plus bas). Corrigé.

**Avant cela, le 15 septembre au soir** : ce journal annonçait « les 79
constats traités, les huit lots clos ». **C'était faux** : vérifiés un par un
le 17 septembre, **61 sont clos et 18 ouverts** (aucun critique ni élevé), et
les lots 4 et 8 ne sont pas terminés — voir `docs/audit-2026-09/README.md`,
« Ce qui reste ouvert ». Les trois agents de contrôle ont été lancés sur
l'ensemble et ont trouvé trois choses qu'aucun test ne voyait (voir plus bas).
L'application est éprouvée dans un vrai navigateur, écran par écran, et contre
le vrai Grocy. Le dossier de présentation client est prêt ; il ne reste qu'à
tourner les vidéos.

---

## Aliments par compte : ce qui reste à faire

Chantier du 17 septembre 2026, conception et plan dans
`docs/superpowers/specs/2026-09-17-aliments-tous-personnels-design.md` et
`docs/superpowers/plans/2026-09-17-aliments-tous-personnels.md`.

**Fait et poussé.** `Aliment` implémente `ProprieteUtilisateur` et passe par
`FiltreProprietaire` ; `aliment.utilisateur_id` est `NOT NULL ON DELETE
CASCADE`, le nom est unique par compte (`aliment_nom_unique_par_compte`), et
depuis la migration 35 la base refuse qu'une ligne de stock vise l'aliment d'un
autre compte. « Ajouter un aliment » ouvre l'éditeur aux macros vides.
Vérifié le 17 septembre au soir : **606 + 33 tests front, 330 tests API
(864 assertions)**, PHPStan à ses 7 erreurs connues, `verifier-schema.sh`
« identiques », `verifier-migrations.sh`, `verifier-jeux.sh` et
`test_import_carnet.py` verts.

> **POUSSER, C'EST DÉPLOYER.** La tâche planifiée `fitcarnet — deploiement`
> tire Gitea toutes les 5 minutes (`DEPLOIEMENT.md`). La migration 34 est donc
> très probablement passée en production quelques minutes après le push de
> 10 h 09 — la sauvegarde automatique de 4 h la précède. Le journal du matin
> prévoyait « sauvegarde, puis `deployer-nas.sh` » : l'ordre n'a pas pu être
> tenu, et ce n'était pas grave, la production n'ayant qu'un compte.
> **Décision du propriétaire, le 17 septembre : aucun utilisateur réel hors
> l'administrateur, on repart sur une base saine** — pas besoin de garder
> restaurables les sauvegardes d'avant le passage.

**Ce qui attend, dans cet ordre :**

1. **Contrôler la production** :
   ```bash
   ssh nas 'tail -5 /volume1/docker/fitcarnet/deploiement.log'
   ssh nas 'docker exec fitcarnet-db psql -U fitcarnet -d fitcarnet -c "\d aliment" -c "\d stock"'
   ```
   Attendu : `utilisateur_id` NOT NULL, l'index `aliment_nom_unique_par_compte`,
   la contrainte `aliment_id_utilisateur_unique` ; côté `stock`, la clé
   `stock_aliment_du_meme_compte_fkey`, **et plus** ni `stock_aliment_id_fkey`
   (retirée par la 35 — si la production l'avait nommée autrement, elle
   resterait à côté) ni `stock_quantite_check` (retirée par la 36). Puis se
   connecter, ouvrir le frigo, et créer puis supprimer un aliment.
2. **Supprimer `db/manuel/34-aliments-par-compte.sql`** dans un commit à part,
   et pousser (donc déployer). C'est un passage ponctuel : une base neuve naît
   déjà dans cet état. La 35 et la 36, elles, restent. La prochaine migration
   prend le numéro **37** — jamais le 34 libéré (voir `schema-base`).
   *Une sauvegarde d'avant le passage ne redémarre alors plus seule* : elle
   revient avec `cree_par`, et la 35 s'arrête en demandant de rejouer la 34
   depuis l'historique (`git show 1068054:db/manuel/34-aliments-par-compte.sql`)
   — la production reste arrêtée tant que ce n'est pas fait. Accepté, voir la
   décision ci-dessus ; `DEPLOIEMENT.md` le dit à l'endroit de la restauration.
3. Réduire alors cette section à quelques lignes : c'est la dernière trace,
   dans le dépôt, du modèle précédent.

**Base de développement.** Chaque poste a la sienne, et **chacune doit passer
par les migrations 34 à 36** : `db/manuel/rattraper-dev.sh` après le `git pull`. Sans lui, le
code attend `utilisateur_id` et la base a encore `cree_par` — le frigo de dev
tombe. Les deux postes y sont passés le 17 septembre ; sur le second, 64
aliments sont devenus 14 (les 50 sans propriétaire, qu'aucun stock, plan ni
habitude ne citait), stock, plans et exercices inchangés. Les sauvegardes
d'avant passage n'ont été gardées que dans le dossier temporaire des sessions.
`jeu-essai.sql` crée désormais lui-même ses 8 aliments (valeurs CIQUAL) : le
rejouer sur un compte d'essai si le frigo de dev paraît vide.

**Trouvé en reprenant sur le second poste, et corrigé le même jour.** Les
trois agents de contrôle ont été lancés sur le chantier du matin ; tout ce
qui suit a son test, vu rouge avant le correctif.

- **« Ajouter un aliment » ouvrait les quatre macros déjà à « 0 »** (élevé) :
  un oubli partait en base comme une valeur (règles 6 et 7), comptes Grocy
  compris. L'écran passe une intention (`creation`) et non un aliment rempli
  de zéros ; `editeurAlimentConnecte.test-rendu.tsx` monte l'éditeur comme
  l'écran.
- **Les dates écrites par l'API étaient deux heures dans le futur** (une en
  hiver) : PHP en `Europe/Paris`, session PostgreSQL en UTC, colonnes
  `TIMESTAMPTZ` déclarées sans fuseau. `App\Doctrine\DateAvecFuseauType`
  remplace `datetimetz_immutable` (le type de DBAL lève `InvalidFormat` sur
  les valeurs posées par `now()`). **Décision du propriétaire : on corrige pour
  l'avenir, l'historique garde son décalage** — rien ne distingue, ligne à
  ligne, ce que l'API a écrit de ce que la base a posé.
- **Migration 35** : clé composite stock → aliment du même compte.
  `POST /api/stocks` ne tenait qu'à la lecture filtrée d'un IRI, sans test.
- **`GET /api/comptes` ne comptait ni aliments ni stock** : un compte au frigo
  plein s'annonçait vide avant suppression. Mise en mots unique dans
  `front/src/calcul/contenuCompte.ts`.
- **`sauvegarde.sh --catalogue` n'existe plus** (décision du propriétaire) : il
  exportait aliments et exercices privés de tous les comptes sous la mention
  « AUCUNE donnée personnelle », et ne se rejouait pas sur une base peuplée.
  `--restaurer` n'accepte plus qu'un `.dump`.
- **`import_carnet.py` écrivait encore `modele.partage`** : tout l'import
  échouait, `installer.sh` compris. `test_import_carnet.py` le rejoue sur une
  base jetable (Docker et `psycopg2` requis).
- **`psql -v ecraser=oui` ne levait pas le garde-fou de `jeu-demo.sql`** : la
  remise à zéro de la démonstration échouait toujours. `verifier-jeux.sh`
  rejoue désormais toute la procédure.
- **Deux témoins de câblage** : `AlimentProcessor` bien branché sur
  `ProprietaireProcessor`, et la requête des aliments accessibles sans `OR`.

**Et la seconde passe des agents, le soir même :**

- **L'API enregistrait 0 pour une macro absente** (`POST /api/aliments` sans
  `lip100` → 201, `lip_100 = 0`) : les macros partent de `null` et `NotNull`
  refuse en 422. Même correctif sur le jumeau Grocy (`?? 0`).
- **Les refus du sérialiseur étaient journalisés en `[critical]`** : `warning`
  désormais (`framework.exceptions`).
- **`/api/stocks` est en lecture seule** : ses écritures n'avaient jamais servi
  et un doublon y répondait 500. **`POST /api/mon-frigo/stock`** refuse un
  emplacement inconnu en 422 au lieu d'un 500.
- **Constat 04#12** : un administrateur désactivé se supprime même s'il ne
  reste qu'un administrateur actif. **02#14** : migration 36, un seul CHECK sur
  la quantité. **02#19** : `installer.sh --repartir-de-zero` n'avale plus
  l'échec de `down -v`.
- **Supprimer un compte** annonce et emporte aussi objectifs, compléments et
  exercices personnels (ceux que plus personne ne cite).
- **La migration 35** nomme la migration 34 sur une base trop ancienne ; les
  vérificateurs comparent la définition des contraintes et refusent les CHECK
  en double ; `DatesAvecFuseauTest` attrape aussi le type implicite et
  `DATETIMETZ_MUTABLE`.
- **Règle 5** : la somme d'Atwater n'a plus qu'une écriture (`kcalDesGrammes`),
  cinq copies retirées, `formuleUnique.test.ts` en garde.
- **Les champs de macros vides** montrent « à saisir » et plus un « 0 » gris.
- **Une création Grocy incomplète** laissait un produit nu dans Grocy : les
  contrôles passaient après la création. Ils passent avant.
- **Constat 04#9** : une séance créée entre minuit et 2 h était datée de la
  veille (UTC). `src/calcul/dates.ts`, testé avec le fuseau de Paris simulé.
- **La restauration** : `DEPLOIEMENT.md` renvoyait à une procédure manuelle
  (dans `sauvegarde-nas.sh`) qui laissait tourner les travailleurs
  d'inventaire (É4). Il renvoie à `restaurer-nas.sh`. Les commandes des jeux de
  données portent `-v ON_ERROR_STOP=1`.
- **`schema-base`** annonçait « la prochaine migration porte le numéro 34 »,
  et une divergence de dates « sans effet ».
- Commentaires et documentation : plus d'aliment « privé », plus de renvoi aux
  constats retirés de l'audit, renvois `fichier:ligne` recalés, compteurs à
  jour, chemins absolus des skills retirés (le dépôt est `~/perso/fitcarnet`
  sur un poste, `~/fitcarnet` sur l'autre).

**Laissé en l'état, en connaissance de cause :**

- **Un champ connu mais non inscriptible est ignoré en silence** :
  `"utilisateur": …` dans un `POST /api/aliments` reçoit 201, sans effet (aucune
  fuite, le propriétaire vient du jeton). `RefuserLesChampsInconnus` ne refuse
  que les noms inexistants ; refuser aussi les propriétés en lecture seule
  casserait les écrans qui renvoient `id` et `creeLe` — c'est l'échec du
  15 septembre avec `allow_extra_attributes: false`. À reprendre avec une
  liste des champs tolérés, si le besoin se présente.
- **« J'ai cuisiné » dit « plus dans ton frigo »** d'un aliment qui n'y a
  jamais été (cas d'un plan qui cite l'aliment d'un autre compte). Libellé
  inexact, sans conséquence.
- **Les dates ne sortent pas toutes sous la même forme** : `cuisineLe` vaut
  `13:04:10+02:00` dans la réponse de « J'ai cuisiné » et `11:04:10+00:00` à la
  relecture. L'instant est le même ; seul un client qui comparerait les chaînes
  s'y tromperait.
- **`GET /api/utilisateurs/{id}` d'un autre compte rend 403**, contre 404 pour
  un identifiant inconnu : on apprend qu'un UUID existe. Un UUID v4 ne se
  devine pas.
- **Un décalage d'affichage d'environ 13 px** dans l'éditeur d'aliment après
  une saisie (Chromium 1280×900), origine non recherchée.

---

## L'essentiel en cinq lignes

Un audit complet a relevé **79 constats** (3 critiques, 14 élevés). Au
17 septembre 2026 : **61 clos, 18 ouverts** — 12 moyens, 6 faibles, **aucun
critique ni élevé**. Trois sont à trancher (02#13, 02#15, 02#17), quinze n'ont
aucune décision consignée ; la liste et la preuve de chacun sont dans
`docs/audit-2026-09/README.md`, « Ce qui reste ouvert ». Sept lots sur neuf
sont terminés (les lots 4 et 8 restent en cours) : garde-fous, ce qui était cassé, les chiffres faux, la
sécurité et l'isolation, la base reproductible, les scripts dangereux,
l'architecture front, les tests du client HTTP, et le lot 8 dans ses vingt
constats.

État au 17 septembre au soir : **639 tests front** (606 + 33 de rendu) · **330 API · 864 assertions**, 7 erreurs PHPStan
connues (il y en avait 8), `verifier-schema.sh` et `verifier-migrations.sh` au
vert, `master` synchronisé. Tout est dans
[docs/audit-2026-09/](docs/audit-2026-09/README.md), avec un tableau d'avancement.

En parallèle, un **dossier de présentation** est monté de bout en bout dans
`presentation/` : complet et utilisable, il ne reste qu'à tourner les vidéos
(voir « Le chantier présentation » plus bas).

`master` synchronisé sur Gitea.

---

## Ce que la journée du 14 septembre a changé

**Le lot 3 — sécurité et isolation — est clos.** C3 : l'isolation entre comptes
n'avait aucun test, elle en a désormais 14 (ce journal a dit 18 ; recompté le
17 septembre), chacun **vu échouer** en cassant le code qu'il
protège. É8 : les exercices « personnels » le sont vraiment (`FiltreExercice`,
règle « public **OU** le mien »). M-03 : fait. M-02 : **complet depuis le
15 septembre** — la fenêtre était passée à 90 jours glissants, et la *visibilité*
existe désormais : `GET /api/mes-sessions`, `DELETE /api/mes-sessions/{id}`, avec
un 404 identique pour « n'existe pas » et « pas à toi ».

**Le lot 4 — base reproductible — est clos.** `verifier-schema.sh` disait 280
lignes d'écart entre base neuve et base migrée ; il dit maintenant
« identiques ». É6 : un lot d'inventaire ne peut plus être volé à un travailleur
vivant (colonne `jeton`, migration 30). Quatre index de jointure créés, cinq
écartés avec argument.

**Trois choses trouvées en chemin, qu'aucun rapport ne mentionnait :**

- **Le critère de réussite de `verifier-schema.sh` était inatteignable.**
  `pg_dump` 17 encadre sa sortie de `\restrict <jeton>` tiré au sort à chaque
  appel : deux vidanges de la *même* base différaient toujours de deux lignes.
- **La migration 30 n'aurait été jouée nulle part.** Les trois lanceurs
  s'arrêtaient au glob `2[0-9]-*.sql` — ni `installer.sh`, ni
  `entrypoint-prod.sh`, ni `verifier-migrations.sh`, qui aurait donc annoncé que
  tout allait bien. **Toute migration numérotée 40 et au-delà retombera dans ce
  piège** : le glob se liste à la main, dans **cinq** fichiers — voir
  « Pièges vérifiés » plus bas pour la commande qui les trouve tous.
- **`doctrine:schema:validate` ne passera jamais sur ce projet**, et son échec ne
  veut rien dire : le schéma est écrit à la main, la base porte plus que les
  entités. Son `--dump-sql` propose `DROP TABLE invitation`. La proposition du
  lot 0 était mauvaise ; la skill `schema-base` porte l'avertissement.

**Une leçon, la plus utile de la journée.** En écrivant `ExerciceProcessor`,
j'ai recopié le garde « l'auteur est-il encore vide ? » d'un processeur voisin
— et donc reproduit le défaut que je venais de corriger dans le processeur
voisin, une heure après l'avoir lu. Un admin corrigeant un
exercice du catalogue se le serait approprié. C'est **exactement le motif dominant de
l'audit**, observé en direct : une décision juste, appliquée à un endroit et
oubliée à un autre. Les trois processeurs suivent désormais la même règle —
l'**opération** fait foi, jamais l'état du champ.

**Vérifié sur l'application réelle, pas seulement en test unitaire** : Alice voit
1 339 exercices, Bob 1 338, l'item d'Alice rend 404 pour Bob ; un PATCH admin sur
un exercice commun ne se l'approprie pas ; un inventaire déposé est traité, lot
`termine` avec son jeton, stock passé de 500 à 320 g.

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
17 septembre après-midi ; un chantier peut en retirer, un écart se compare à
ce journal :

```bash
cd front && npm test                                                  # 606 + 33 tests, 0 echec
docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'          # 330 tests, 864 assertions
db/manuel/verifier-schema.sh                                          # ✓ identiques
db/manuel/verifier-migrations.sh                                      # ✓ au vert
db/manuel/verifier-jeux.sh                                            # ✓ jeux et garde-fou
```

Si `npm test` échoue sur `Cannot find module '@testing-library/react'`, c'est
le `node_modules` du poste qui date d'avant le 15 septembre : `npm install`.

**Après tout `git pull` qui apporte une migration** :

```bash
db/manuel/rattraper-dev.sh
```

> **LE DÉVELOPPEMENT NE REJOUE JAMAIS `db/manuel/`, et c'est le piège le plus
> coûteux du projet.** `compose.dev.yml` ne monte `./db` que dans
> `docker-entrypoint-initdb.d`, que PostgreSQL ne joue qu'à la **création du
> volume**. La production, elle, guérit seule au redémarrage.
>
> Le 15 septembre 2026, l'agent de vérification bout en bout a trouvé
> `POST /api/connexion` en **HTTP 500 pour tous les comptes** : la migration 32
> n'était pas en base, l'insertion du jeton de rafraîchissement échouait, et
> **l'application était entièrement inutilisable**. Les 750 tests étaient au
> vert. Le message était un 500 opaque, jamais « il manque la migration 32 ».
>
> Le script est idempotent : le lancer sans raison ne coûte rien.

Si l'un des deux est rouge **avant** d'avoir touché à quoi que ce soit, c'est
que l'environnement est en cause, pas le code : le régler d'abord.

**3. Le premier message à donner à Claude.** Deux chantiers sont ouverts —
prends celui que tu veux, la phrase est écrite pour être collée telle quelle.

**Si tu reprends la présentation client** (le plus avancé, il ne reste qu'à
filmer) :

> Lis `REPRENDRE.md` et `presentation/demonstration.md`. Je veux tourner les
> vidéos de démonstration depuis mon téléphone sur l'application de production.
> Aide-moi à créer les deux comptes de démonstration sur le NAS, à y charger le
> jeu de données, et guide-moi bobine par bobine. Ne travaille pas sur une autre
> branche que `master` sans me le demander.

**Si tu reprends le code** — l'audit est clos, il reste du confort et des
arbitrages, listés dans « Par quoi continuer » :

> Lis `REPRENDRE.md`, puis lance les trois agents de contrôle
> (`revue-fitcarnet`, `verification-bout-en-bout`, `verite-documentaire`) en
> parallèle pour savoir où on en est vraiment. Ensuite on prendra la suite dans
> le tableau « Par quoi continuer ». En TDD. Ne travaille pas sur une autre
> branche que `master` sans me le demander.

Une précision qui évite les allers-retours, si Claude ne la prend pas de
lui-même : la skill à utiliser pour toute correction est
**`superpowers:test-driven-development`**.

**Et l'épreuve qui n'est pas dans `npm test`** — à relancer avant toute
livraison, elle ne modifie rien :

```bash
# 1. l'outillage du script — `presentation/tournage/node_modules` est gitignore,
#    donc absent d'un clone neuf, et Chromium ne s'installe pas tout seul
cd presentation/tournage && npm install && npx playwright install chromium && cd ../..

# 2. le bundle que le navigateur va vraiment charger
docker compose -f compose.dev.yml up -d
cd front && npm run build:web && cd .. && rm -rf api/front && cp -r front/dist api/front

# 3. un compte jetable — le script n'en cree AUCUN, il se contente de s'y connecter
HASH=$(docker exec fitcarnet-app-dev sh -c \
  'cd /app && bin/console security:hash-password "MotDePasseTest123!" --no-interaction' \
  | grep -oE '\$2y\$[^ ]+' | head -1)
docker exec fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -c \
  "INSERT INTO utilisateur (id, email, mot_de_passe, nom, roles, actif, cree_le)
   VALUES (gen_random_uuid(), 'ecran-verif@test.local', '$HASH',
           'Ecran Verif', 'ROLE_USER', true, now());"

# 4. l'epreuve elle-meme — elle ne modifie rien
cd presentation/tournage && node verifier-ecrans.mjs ecran-verif@test.local 'MotDePasseTest123!'

# 5. ET ON RETIRE LE COMPTE. Pas « plus tard » : maintenant.
docker exec fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -c \
  "DELETE FROM utilisateur WHERE email LIKE '%-verif@test.local';"
```

> **`api/front` est un DOUBLON de `front/dist`, et il périme en silence.** Le
> dépôt versionne `front/dist` ; le développement, lui, sert `api/front`. Un
> `npm run build:web` seul laisse donc le navigateur sur l'ancien bundle, et on
> vérifie alors très soigneusement du code qui n'est plus là. D'où la recopie
> dans la même ligne, à ne pas séparer.
>
> **L'étape 5 n'est pas de la politesse.** Le 15 septembre 2026,
> `ecran-verif@test.local` est resté en base une soirée entière parce que le
> bloc s'arrêtait à l'étape 4 — trouvé par `verite-documentaire`, pas par moi.
> Un compte oublié se met à ressembler à une donnée réelle au bout de quelques
> jours, et plus personne n'ose le supprimer. Voir la skill `donnees-de-test`.

**Pour éprouver le portier d'administration des deux côtés**, il faut un second
compte, en `ROLE_ADMIN` cette fois (même `INSERT`, `roles` à `'ROLE_ADMIN'`) :
sans lui, un contrôle qui refuserait *tout le monde* passerait pour une
correction. Attendu : `ROLE_USER` → **403** sur `/api/comptes`,
`/api/invitations` et `POST /api/exercices` mais **200** sur
`GET /api/exercices` ; `ROLE_ADMIN` → **200, 200, 201**.

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

## Par quoi continuer

**61 constats d'audit sur 79 sont clos, 18 ouverts** (aucun critique ni élevé ;
liste dans `docs/audit-2026-09/README.md`). Ce qui suit est du confort ou
attend un arbitrage — la production d'abord, la clé Grocy ensuite, et les deux
points à trancher avant de tourner.

| | Quoi | Effort |
|---|---|---|
| **Contrôler la production, puis retirer la migration 34** | voir « Aliments par compte : ce qui reste à faire », en tête de ce fichier | 15 min |
| **Tourner les vidéos** | tout le dossier de présentation est écrit, les huit bobines aussi ; la remise à zéro entre deux bobines marche depuis le 17 septembre | `./presentation/preparer-demonstration.sh`, et `presentation/demonstration.md` |
| **Avant de tourner : le bandeau « Fibres inconnues »** | À TRANCHER. Le plan 4.1 et la slide 06 le montrent, mais `jeu-essai.sql` renseigne les fibres de ses huit aliments : il ne peut pas apparaître. Soit un féculent du jeu aux fibres inconnues (`NULL`), soit le retirer du plan | 15 min |
| **Avant de tourner : les habitudes de cuisson du compte de démo** | À TRANCHER. Aucun fichier ne les pose, et `presentation/tournage/capturer.mjs` clique « se mangent tels quels » : sur un compte neuf, la capture 11 sort sans fournée. Soit `jeu-demo.sql` pose des habitudes, soit le script les choisit | 30 min |
| **Les quinze constats d'audit ouverts sans décision** | 12 moyens et 3 faibles, listés avec leur preuve dans `docs/audit-2026-09/README.md` — dont M5 (jetons en clair dans `localStorage` sur le web), M6 (chargements infinis sur trois écrans), M8 (`RECORD_AUDIO` inutile et en double : le retirer demande une nouvelle compilation Android), M12 (saisie d'inventaire perdue au changement d'onglet), 02#12 (dérive entités ↔ schéma) | à planifier |
| **Constats d'audit à trancher** | À TRANCHER. **02#13** : ni rotation des journaux ni limites de ressources dans `docker-compose.yml` (toute modification s'y déploie au prochain push). **02#15** : `compose.dev.yml` publie `5432:5432` — `import_carnet.py` et `import_catalogue.py` visent `localhost:5432`. **02#17** : aucune purge des invitations expirées | à trancher |
| **Les hooks de `.claude/settings.json`** | appellent graphify par un chemin absolu (`/home/micka/.local/bin/graphify`) : vrai sur les deux postes aujourd'hui, faux sur un troisième. Relevé par `verite-documentaire` ; non modifié | 5 min |
| **Régénérer la clé d'API Grocy** | ⚠ **À FAIRE PAR TOI, ET VITE.** Elle a été collée dans une conversation le 15 septembre 2026 pour vérifier le pont Grocy de bout en bout. Elle est à considérer comme publiée. Grocy → Paramètres → Clés d'API → révoquer puis recréer, et reporter la nouvelle dans `.env` du NAS | 5 min |
| **`choixRatio.tsx`** | dernier morceau du lot 6, et **il était mal rangé dans l'audit** : il appartient à `editeurAliment.tsx` (section 7), pas à l'écran de séance | 1 h |
| **Le câblage non couvert** | reste du lot 7. `client.ts` a ses 28 témoins ; les hooks React restent partiellement hors de portée — `@testing-library/react` est désormais installé, la porte est ouverte | ~4 h |
| **Extraire `LigneAliment` de `carteRepas.tsx`** | le module `calcul/poidsServi.ts` est testé, mais le composant qui l'appelle ne l'est pas. L'extraire vers `src/` rendrait la ligne de repas testable comme le reste | 1 h |
| **Le second `tsconfig` des tests de rendu** | la garde qui interdisait à un test d'importer un `.tsx` a été levée pour permettre `editeurAliment.test-rendu.tsx`. Un second `tsconfig` la rendrait aux tests non-rendu, qui n'ont pas de raison d'y toucher | 1 h |
| **Publier un exercice depuis l'admin** | `Exercice.public` n'est écrit par personne : aucun mécanisme de publication n'existe. L'exposer en écriture aux seuls administrateurs est la proposition « C » de la revue, à trancher | à trancher |

---

## Ce que la journée du 15 septembre a changé

**Le lot 6 est terminé, les douze rangs.** Les trois écrans passent de 3 935 à
**1 295** lignes (655 + 445 + 195) ; `composer.ts` de **827** à 135 (830 au
moment de l'audit), `cuisson.ts` de **613** à 22 (611 à l'audit), `hooks.ts` en
dix modules. *Ce paragraphe a longtemps dit « 817 » et déclaré 827 et 613
faux : c'étaient les bonnes tailles juste avant le découpage — recompté le
17 septembre 2026 dans l'historique (`a83e704`, `952062a~1`).* **Les dix duplications D1 à D10 sont closes.**

**Six agents ont travaillé en parallèle**, sur des périmètres strictement
disjoints — c'est la condition, sans quoi ils s'écrasent. Trois ont **refusé**
une partie de leur tâche, et les trois avaient raison : sortir les props
d'`EtapeBatch` aurait donné un riz « à l'eau » sur l'écran de batch alors que
l'utilisateur l'avait mis au four (`cuissonsChoisies` est un `useState`, une
seconde instance a le sien, vide) ; ranger sept tests de cuisson les aurait fait
tomber dans le mauvais fichier ; corriger M7 aurait dépassé le mandat.

**Trois défauts trouvés qui n'étaient dans aucun rapport :**

- **Le mot de passe était écrit en clair sur le disque.** `dehydrateMutation`
  sauvegarde les `variables`, et celles de `useConnexion` sont
  `{email, motDePasse}` — tenter de se connecter hors ligne suffisait.
- **L'application ne démarrait pas en navigation privée.** `localStorage?.` ne
  protège pas d'un objet qui *lève quand on y touche* : écran de chargement
  indéfini, sans message.
- **`verifier-schema.sh` ne contrôlait plus rien depuis trois migrations.** J'avais
  étendu le glob dans trois lanceurs le 14 et oublié le quatrième. Son ✓ vert ne
  prouvait rien — et masquait une vraie divergence, de moi aussi.

**Trois agents ont été créés** — le dossier en compte cinq, les deux hexagonaux datant d'avant et restant sans objet. Les trois nouveaux sont nés de fautes réelles de la session :
`revue-fitcarnet` (les huit motifs de défaut du projet),
`verification-bout-en-bout` (543 tests au vert ne disaient pas si l'API
répondait) et `verite-documentaire` (quatre affirmations fausses trouvées par
accident en deux jours).

---

## Ce que les trois agents de contrôle ont trouvé

Lancés en parallèle sur l'ensemble du dépôt, tous les trois en lecture seule.
**Ils ont trouvé trois choses qu'aucun test unitaire ne pouvait voir**, et c'est
l'argument pour les relancer avant chaque livraison.

- **`verification-bout-en-bout` : l'application ne se connectait plus du tout.**
  `POST /api/connexion` répondait **HTTP 500 pour tous les comptes** en
  développement — la migration 32 n'était pas en base. Voir l'encadré plus haut,
  et `db/manuel/rattraper-dev.sh`, écrit pour ça.
- **`revue-fitcarnet` : le mot de passe était écrit en clair sur le disque.**
  Le cache de TanStack Query persistait aussi les **mutations**, dont le corps
  de `useConnexion`. `shouldDehydrateMutation: () => false` dans
  `src/api/persistance.ts`. Il a aussi trouvé **trois commentaires écrits le
  jour même qui mentaient déjà** (`Exercice.php`, `Aliment.php`, `texte.ts`) et
  un témoin de test qui éprouvait un scénario **impossible**.
- **`verite-documentaire` : `INSTALLATION.md` renvoyait à un fichier qui
  n'a jamais existé.**

---

## Ce que la fin du 15 septembre a changé

**La surface d'administration est fermée, des deux côtés.** Côté API, les
**18 portes** d'administration sont fermées, `POST /api/exercices` compris — un
utilisateur ne peut plus créer d'exercice.

> **Mais pas toutes de la même façon, et c'est à savoir avant d'auditer.**
> Six seulement portent un `#[IsGranted('ROLE_ADMIN')]` (`ComptesController`, au
> niveau **classe**, et `InvitationsController` ×3) ; les douze autres sont
> fermées par `security: "is_granted('ROLE_ADMIN')"` **dans l'`#[ApiResource]`**
> de l'entité ou du DTO, plus une ligne d'`access_control` pour `/api/docs`. Un
> `grep '#\[IsGranted'` pour « vérifier la surface » en manquerait les deux
> tiers et conclurait à une passoire.
>
> C'est exactement pour ça que l'inventaire est un **test** et pas une phrase :
> `api/tests/Security/SurfaceAdministrationTest.php` balaie les trois sources
> (`#[ApiResource]` de `src/Entity` et `src/Dto`, `#[Route]` de
> `src/Controller`, `access_control` de `security.yaml`) et compare **dans les
> deux sens** — une porte fermée non inscrite échoue autant qu'une porte
> inscrite rouverte. Les cinq routes volontairement sans garde y sont, chacune
> avec sa raison écrite : la dérogation muette est impossible.
Côté écran, les quatre gardes recopiés dans les `admin-*.tsx` — déjà **dans deux
orthographes différentes** — sont doublés par un **portier unique** dans
`app/_layout.tsx`, qui reconnaît un écran d'administration à son préfixe de
fichier et non à une liste. Le prochain `admin-*.tsx` naîtra protégé.

*Éprouvé pour de vrai, pas seulement en test :* avec un compte `ROLE_USER`,
`GET /api/comptes`, `GET /api/invitations` et `POST /api/exercices` répondent
**403**, `GET /api/exercices` répond **200** (le témoin — sans lui, un contrôle
qui refuse tout le monde ressemble à une correction) ; avec un compte
administrateur jetable, les mêmes routes répondent **200, 200 et 201**. Et dans
un vrai navigateur, les quatre adresses `/admin-*` tapées à la main renvoient
sur l'onglet Compte, **sans un seul 403 au réseau** — l'écran n'est plus monté
du tout, là où `admin-utilisateurs` lançait ses requêtes avant son garde.

**M7 — le 401 qui accusait l'utilisateur.** Le repli d'un 401 était
« Identifiants incorrects. » quel que soit le chemin appelé : la session
expirait, on ouvrait son frigo, et l'application faisait chercher une faute de
frappe dans un mot de passe qu'on n'avait pas tapé. Le repli distingue
désormais `/connexion` du reste (`repli()` dans `src/api/client.ts`), avec la
lecture de `security.yaml` qui le justifie écrite au-dessus.

**F2 — les deux écrans se contredisaient devant la balance.** `carteRepas.tsx`
affichait `pesé × rendement` pour **tous** les aliments, cuisson choisie ou non :
100 g de riz marqués « tel quel » s'annonçaient à 300 g. La boîte de batch
cooking, elle, disait 100 g. La règle vit maintenant dans
`src/calcul/poidsServi.ts`, testée, et un test croisé refuse que les deux
affichages divergent à nouveau.

**Les bugs latents ont été corrigés, pas classés « inatteignables ».** J'avais
écrit qu'aucun n'était atteignable ; c'était faux, et tu as eu raison
d'insister. `exercices.isError` manquait dans `app/seance/[id].tsx` : un
catalogue en échec — un tunnel de métro suffit — affichait une séance **fausse**
plutôt que pas de séance, blocs sans nom et tous en mode « charge ».
`src/muscles/gardeCatalogue.test.ts` interdit désormais l'oubli **sur tout écran
présent ou futur** qui indexe le catalogue par identifiant. Et la jauge du
catalogue vide, qui recevait `width: 'NaN%'` à la toute première installation,
vaut 0 %.

**La lecture d'une clé de repas est devenue une fonction.**
`` `${jour}|${repas}` `` s'écrivait dans `cleDuRepas` et se relisait à deux
endroits avec un `split('|')` nu — dont un `Number()` qui donnait
`libelleDuJour(NaN)` à l'écran sans que rien ne le signale. `lireLaCle()` vit
dans `src/solveur/periode.ts`, là où la clé s'écrit, et **son propre test a
attrapé que `2|R2|R3` passait**.

**L'application est vérifiée dans un vrai navigateur.**
`presentation/tournage/verifier-ecrans.mjs` pilote Chromium : il se connecte
comme un humain, visite les cinq écrans, éprouve le portier d'administration, et
rapporte **toute** erreur de console et **toute** requête en échec. Il ne
modifie rien. État actuel : tout au vert, **zéro erreur de console, zéro requête
en échec**.

> **Deux fois, ce script a été plus honnête que moi.** Son premier motif
> reconnaissait « séances » dans le slogan de la page de connexion : trois
> écrans sur cinq passaient au vert alors qu'aucun n'était atteint. Puis il a
> trouvé un `GET /api/moi` **sans jeton** sur l'écran de connexion — `useMoi`
> ne connaissait pas la session et partait sur tous les écrans. La garde est
> allée dans le hook, point de passage obligé de ses six appelants.

**Et la revue a relu le travail de la soirée, y compris mes corrections.** Elle
a trouvé onze choses, dont trois qui comptent — la plus instructive étant une
**régression que je venais d'introduire** :

- **Garder `useMoi` a cassé l'onglet Compte.** `isLoading` vaut
  `isPending && isFetching` : quand la requête est désactivée, rien ne part sur
  le réseau, donc `isFetching` est faux, donc `isLoading` **aussi**. L'écran
  passait ses deux gardes avec `data` indéfini et réaffichait le tiret et
  « Gérés dans l'onglet Mon frigo » comme un fait — c'est-à-dire exactement la
  panne que son propre commentaire déclare corrigée, revenue par la porte de
  derrière. C'est `isPending` qu'il faut lire.
- **`planFige.ts` inventait un repas.** `?? 'R1'` sur une clé illisible, dans
  un plan **persisté** : à la relecture, les compléments du matin sur une boîte
  peut-être prise le soir. Le champ est facultatif et `planRelu.tsx` sait déjà
  lire son absence — le repli honnête existait, il suffisait de ne pas le
  contourner.
- **`lireLaCle` annonçait deux découpages à la main ; il y en avait quatre**,
  dont un **vingt lignes au-dessus d'elle**, dans le fichier même. Les deux
  oubliés n'avaient en fait pas besoin de lire la clé du tout. Il n'en reste
  aucun.

Elle a aussi montré que **trois des contrôles de mon script navigateur ne
contrôlaient rien** : le motif de l'écran Modèles était satisfait par la barre
d'onglets (donc cet écran ne pouvait jamais être rapporté cassé), le contrôle
de connexion passait au vert sur un mauvais mot de passe à cause d'un `||`, et
le portier était jugé sur une absence — un chargement infini passait pour un
refus réussi. Les trois sont corrigés, et le contrôle de connexion a été
**vérifié en lui donnant un faux mot de passe**.

> **La leçon, et elle vaut pour la suite.** Sur onze défauts, sept étaient dans
> du code écrit **le jour même**, et trois dans des commentaires écrits le jour
> même. Ce n'est pas un accident de fatigue : c'est que la relecture par un
> autre regard trouve ce que l'auteur ne peut structurellement pas voir. Les
> trois agents ne sont pas une formalité d'avant-livraison.

**Le pont Grocy est vérifié de bout en bout, écriture comprise.** Lecture des
stocks, correspondance des quantités produit par produit, et une écriture réelle
sur un seul produit (Fraises, 112 → 100 → **112 restauré**) — la valeur relevée
**avant** d'écrire, comme l'exige `donnees-de-test`.

---

## Le chantier présentation — terminé, sauf le tournage

Monté du 9 au 14 septembre 2026 pour présenter fitcarnet **à un client et à une
équipe technique dans la même salle**. Tout est dans `presentation/`.

> **On versionne la matière, pas le produit** (`presentation/.gitignore`) : le
> HTML et le MP4 sont **absents d'un clone neuf**, et se régénèrent depuis les
> sources ci-dessous. Un ✅ dit ici « le travail est fait », pas « le fichier
> est sur ton disque ».

> **Un seul point d'entrée depuis le 17 septembre 2026** :
> `./presentation/preparer-demonstration.sh` enchaîne prérequis, captures,
> slides et dossier — et dit ce qui manque au lieu de s'arrêter à moitié.
> Quatre documents ont été fusionnés ce jour-là dans `demonstration.md`
> (`plan-de-tournage.md`, `script-narration.md`, `demo-30-minutes.md`,
> `fonctionnalites-revue.md`) : ils se contredisaient, et l'un d'eux envoyait en
> salle avec un frigo vide.

| Fichier | Ce que c'est | État |
|---|---|---|
| `preparer-demonstration.sh` | **le point d'entrée unique** : prérequis, images, slides, dossier, vidéo en option | ✅ |
| `demonstration.md` | **la matière, et la seule source** : l'inventaire exhaustif de ce qu'il faut montrer (le document du propriétaire fusionné avec la revue du 16 septembre), les huit bobines, le montage en trente minutes, ce qui reste à arbitrer | ✅ |
| `fitcarnet-presentation.html` | **33 slides** en quatre actes : le produit, l'architecture, les garanties, l'outillage IA — dont la carte de *tout* ce que l'application sait faire, et ce qu'on ne promet pas. Captures embarquées, fichier autonome. **Gitignoré — à régénérer** avec `construire.py` | ✅ fait, absent d'un clone |
| `fitcarnet-dossier.html` | ce qu'on dit, dans quel ordre — **rendu de `demonstration.md`**, projetable et imprimable. **Gitignoré — à régénérer** avec `dossier.py` | ✅ fait, absent d'un clone |
| `captures/*.jpg` | les images des slides et du dossier — **21 écrans**, 23 avec `DEMO_ECRIRE=1` (les deux de l'inventaire écrivent en base). **Gitignorées — à refaire** avec `tournage/capturer.mjs`, qui **vérifie chaque écran avant d'écrire l'image** : sans cela on repart avec vingt photos du formulaire de connexion | ✅ l'outil ; les images sont à refaire |
| `fitcarnet-demonstration.mp4` | 3 min 01, muette, 8 chapitres. **Gitignoré — à remonter** avec `monter-demo.sh` | ✅ fait, absent d'un clone |
| `tournage/tourner.mjs` | pilote l'application avec Playwright et enregistre en continu | ✅ |
| `monter-demo.sh` | cartons, légendes, chapitres | ✅ |
| `features.md` | **288 capacités**, chacune avec fichier et ligne. Daté du 14 septembre, et il reste à reprendre | ✅ |
| `fonctionnalites-par-onglet.md` | **la référence du besoin, écrite par le propriétaire** — à ne modifier sous aucun prétexte | ✅ |

**Ce qui reste à faire**, et c'est la suite naturelle :

1. Créer les **deux comptes de démonstration sur la production** — un ordinaire,
   un administrateur. Les commandes sont dans `presentation/demonstration.md`, partie I.2.
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
tournable que si `GROCY_URL` est renseigné sur l'instance filmée. ~~Le partage
d'un modèle est inopérant~~ — **tranché le 15 septembre 2026 : il n'existe
plus.** Voir « Le partage de modèle n'existe pas » plus bas ; il n'y a donc plus
rien à éviter de montrer.

**Le jeu de démonstration est un FICHIER, pas un état de la base.**
`db/manuel/jeu-demo.sql` pose neuf semaines de vie d'un compte : 23 séances,
123 séries, 2 plans, 4 cibles, et un 1RM qui monte de 50,7 à 63,3 kg — c'est
cette courbe qui fait vivre la démonstration.

> **Il ne pose NI aliments NI stock, et ce document a affirmé le contraire
> jusqu'au 16 septembre 2026.** Les aliments et les lignes de stock (8 et 8
> depuis le 17 septembre) viennent de **`db/manuel/jeu-essai.sql`**, que `jeu-demo.sql` exige en
> prérequis et dont l'en-tête dit : « Il ne touche ni au frigo ni aux aliments :
> c'est le domaine du jeu d'essai. » Charger le seul jeu de démonstration avant
> une présentation, c'est arriver avec un **frigo vide** — et le frigo, c'est le
> premier tiers de la démonstration. Relevé par `verite-documentaire`.

> **Il n'est PAS en base sur cette machine**, et il ne faut pas compter dessus :
> le volume `pgdata_dev` a été recréé depuis, et `demo@fitcarnet.local`
> n'existe plus. `jeu-demo.sql` n'est joué ni par `installer.sh` ni par
> `entrypoint-prod.sh` — leurs listes sont écrites à la main, et il n'y figure
> pas, volontairement. **Le remonter est une commande**, décrite dans
> `presentation/demonstration.md`, **partie I.1 — « Le jeu de données se charge
> EN DEUX TEMPS »**, qui donne les commandes pour le local comme pour le NAS, et
> la remise à zéro entre deux bobines ; son garde-fou refuse un compte qui a
> déjà des séances, sauf
> `-v ecraser=oui`.

---

## Ce que l'inventaire des fonctionnalités a mis au jour

`presentation/features.md` a été établi par exploration systématique du code —
écrans, calculs, back-end. Il recense **288 capacités** portant chacune son
`fichier:ligne` (294 puces au total) là où un premier
inventaire de surface en voyait 57. Il a aussi montré que **la documentation
mentait sur deux points** :

- ~~`front/src/calcul/texte.ts` n'existe pas~~ — **créé le 15 septembre 2026.**
  `sansAccent` n'a plus qu'**une** définition. **Cinq** des six copies qui
  traînaient appelaient `normalize('NFD')`, que Hermes n'implémente pas
  toujours — cinq `TypeError` en puissance. La sixième était justement la table
  manuelle de `cleDHabitude`, écrite *contre* `normalize` : c'est sur elle que
  le module s'est aligné, et non l'inverse.
- ~~`front/src/solveur/periode.ts` n'existe pas~~ — **il existe**, sorti du
  découpage de `composer.ts` (rang 6).

**Trois pistes ouvertes, à trancher un jour :**

- ~~`front/src/composants/inventaire.tsx` semble être du code mort~~ —
  **confirmé et supprimé** le 15 septembre : 187 lignes, aucun import, son
  unique export sans usage.
- `Invitation::domaineAccepteDuCourrier()` — vérification DNS complète et
  documentée — **n'a aucun appelant** dans l'API.
- **Aucun appel à OpenFoodFacts** n'existe côté back, alors que le champ
  `Aliment::source` en prévoit la valeur.

---

## Décisions prises, et pourquoi

Elles ne se déduisent ni du code ni des commits. **Ne pas les rouvrir sans
raison.**

**L'architecture hexagonale est un objectif assumé, mais n'a pas commencé.** Les
skills utilisables sont celles du plugin : `superpowers-symfony:ports-and-adapters`,
`:cqrs-and-handlers`, `:value-objects-and-dtos`, plus les deux agents
`hexagonal-architect` et `hexagonal-reviewer`. *Ce paragraphe a cité jusqu'au
16 septembre 2026 quatre skills — `symfony-hexagonal-architecture`,
`-domain-modeling`, `-ports-adapters`, `-cqrs-handlers` — dont **aucune n'existe** :
ce sont les quatre skills projet supprimées le 9 septembre.* `api/src` suit toujours la structure
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

~~**La table des paliers du disque RM.**~~ **Tranché le 15 septembre 2026** :
centrée sur **70-90 %**, la zone où l'on progresse — et, heureuse coïncidence,
la seule où la formule dit vrai (13 répétitions à 70 %, 3 à 90 %, plafond à 15).
Neuf paliers par pas de 2,5 %, donnant neuf cibles distinctes là où le pas de
5 % laissait quatre trous. En dessous de 70 %, la charge s'affiche et **la
prédiction disparaît** ; le seuil n'est pas écrit à la main mais dérivé de
`REPS_MAX_POUR_1RM`, pour que la table suive si le plafond bouge.

Les petites charges étaient la seconde exigence : à 20 kg de 1RM, onze paliers
ne donnaient que **cinq charges distinctes** — trois lignes disaient « 15 kg »
sans le signaler. `pasConseille` descend à 1 kg quand 2,5 kg fait tomber la zone
de travail sous cinq charges, et les paliers confondus fusionnent en une ligne
qui dit son étendue.

**Trois points restent à ton arbitrage** : 95 % et 100 % ont été retirés (le
maximum est déjà affiché au-dessus) ; l'échauffement est à 60/50/40 sans
granularité fine ; et sous 10 kg de 1RM, une ligne fusionnée peut perdre une
prédiction juste à cause d'un voisin hors domaine.

~~**Les exercices personnels**~~ — tranché le 14 septembre : filtrés pour de
vrai, règle « public OU le mien ». La conséquence — un exercice personnel mal
orthographié devenu **incorrigible**, l'administrateur ne voyant plus les
exercices privés — était le constat **F-09**, **clos depuis** :
`api/src/Entity/Exercice.php` porte
`security: "is_granted('ROLE_ADMIN') or object.getCreePar() == user"` sur le
`PATCH`. L'auteur corrige le sien, et lui seul.

---

## Le partage de modèle n'existe pas, et c'est une décision

**Tranché le 15 septembre 2026 par le propriétaire : le partage de modèle ne
doit pas être possible dans l'application.** Constat F-05, option 1 de l'audit,
appliquée en entier.

**Ce que la fonctionnalité faisait vraiment : rien.** `Modele` portait une
colonne `partage`, et l'opération `Get` disait
`object.getUtilisateur() == user OR object.isPartage()`. Cette clause n'a
**jamais pu s'appliquer** : `FiltreProprietaire` pose
`WHERE utilisateur = :moi` dans la requête, donc **avant** que l'expression ne
soit évaluée. Le modèle d'un autre compte n'était jamais trouvé — 404, et la
clause jamais atteinte.

Ce n'était pas un trou de sécurité : la fermeture gagnait, et c'est le bon sens
de l'erreur. C'était une **fonctionnalité morte qui affirmait le contraire**, et
une expression de sécurité qui ment sur ce que le système autorise finit
recopiée là où elle ferait effet.

**Pourquoi supprimer plutôt que faire marcher.** L'ouvrir vraiment aurait
demandé de sortir `Modele` de `FiltreProprietaire` en lecture d'item et de
laisser le `security:` décider seul — c'est-à-dire déplacer l'isolation d'une
extension Doctrine vers une expression de sécurité, le contraire exact de la
règle 2.

**Les quatre endroits ont été coupés ENSEMBLE**, parce qu'une moitié de
suppression est pire que rien :

| Où | Quoi |
|---|---|
| `api/src/Entity/Modele.php` | le champ, ses accesseurs, ses groupes de sérialisation |
| `db/manuel/33-retirer-le-partage-de-modele.sql` | `ALTER TABLE modele DROP COLUMN IF EXISTS partage` |
| `db/01-schema.sql` | la colonne retirée **et** la raison écrite à sa place (règle 1) |
| `front/src/api/types.ts`, `hooks/seances.ts`, `app/modele/[id].tsx` | le type et les deux appelants |

`db/manuel/jeu-demo.sql` a suivi, sans quoi le jeu de démonstration ne se
serait plus chargé.

**Aucune donnée perdue**, relevé avant d'écrire : les trois modèles de la base
portaient tous `partage = false`, et le front envoyait `partage: false` en dur à
chaque création. La colonne n'a jamais porté d'information.

> ~~Un client qui enverrait encore `"partage": true` reçoit 201~~ — **corrigé le
> même jour : il reçoit 400**, « Champ(s) inconnu(s) : partage ». Voir la section
> suivante : ce silence n'était pas propre à `Modele`, et la correction évidente
> cassait la modification des séances.

---

## Un champ inexistant est refusé, et un serveur muet ne fige plus rien

Deux défauts trouvés le 15 septembre 2026 en fin de journée, **corrigés, pas
notés**.

### Un 201 qui n'avait rien fait

Après le retrait de `partage`, un `POST` qui le portait encore recevait **201** :
API Platform ignore ce qu'il ne connaît pas. L'appelant croyait avoir partagé
son modèle. Et ce n'était pas propre à `Modele` — **toute ressource** avalait en
silence un champ mal nommé.

**La correction évidente a été essayée, mesurée, et retirée.**
`allow_extra_attributes: false` répond à « ce champ s'écrit-il ? ». Il refuse donc
aussi `id`, `creeLe` et les `@id` imbriqués — que le front renvoie avec l'objet
qu'il a lu. Résultat mesuré sur l'application : **modifier une séance répondait
400**, l'écran d'administration des exercices et celui des cuissons ne pouvaient
plus rien enregistrer.

**Ce qui est en place répond à une autre question : « ce champ existe-t-il ? »**
`api/src/Serializer/ChampsInconnus.php` lit les vraies entités par réflexion —
propriétés, accesseurs calculés (`getAvancement`), clés JSON-LD — et descend dans
les relations écrites en objets en suivant leur `targetEntity`.
`api/src/EventListener/RefuserLesChampsInconnus.php` l'applique à **toute
ressource API Platform**, après le pare-feu. Posé sur la seule `Modele`, il
aurait été le jumeau oublié de la ressource suivante.

Éprouvé sur l'application : `partage` → **400**, message dans `detail`, que le
front affiche · séance relue et renvoyée → **200** · écrans admin (`{id, …}`) →
**200** · ordre de modèle, plan de repas → acceptés · anonyme → **401**, pas 400.
Sur les tests : sept pour le contrôle, dont un champ inconnu dans une série
rapporté avec son chemin (`exercices[0].series[1].charge`), et sept pour
l'écouteur lui-même — verbes, sous-requêtes, routes hors API Platform. Chacun des
deux fichiers a été vu tomber sous mutation.

**La revue a balayé toutes les écritures du front** — séances, modèles,
aliments, cibles, compléments, plans, cuissons, exercices, ordre de modèle,
fusion — en confrontant chaque clé envoyée à la classe PHP visée : **aucun
faux positif**.

### Ce que cette vérification a montré en passant — et ce n'est PAS un bug

**Enregistrer une séance ou un modèle supprime et recrée tous ses blocs et
séries**, malgré leurs `@id`. Vérifié avant de conclure, parce que ça ressemblait
à une perte de données :

- c'est **voulu et documenté** : « lu et écrit en UN SEUL objet complet » dit
  `Modele`, et le schéma rend l'unicité `(seance_id, ordre)` différable
  précisément parce que Doctrine insère avant de supprimer ;
- **rien ne pointe sur ces lignes** hors leurs propres enfants ;
- **aucun champ n'est perdu** : tous sont en lecture ET en écriture, seul `id`
  est en lecture seule. Aller-retour réel d'une séance à deux séries : identique
  champ par champ, cases « faite » comprises ;
- **le front est construit autour** : `avecIdentifiantSeance` ne recopie
  volontairement pas les identifiants des blocs — les greffer faisait perdre le
  focus en pleine frappe. L'écran renvoie donc des identifiants périmés à chaque
  sauvegarde automatique, et c'est sans effet : **200, un bloc, deux séries,
  valeurs à jour**, vérifié.

Il n'y avait donc rien à « nettoyer » côté front : les `@id` qu'il renvoie ne
changent rien à l'écriture, puisque les blocs sont recréés de toute façon. (Une
première version de ce paragraphe prétendait le contraire ; la revue l'a relevé.)

### Un serveur qui accepte et ne répond jamais figeait tout

`client.ts` n'avait **aucun délai de garde**, et `fetch` n'en a pas par défaut.
Une connexion acceptée puis muette — proxy bloqué, NAS en veille, Wi-Fi captif —
laissait chaque écran sur son rond qui tourne, sans erreur ni « Réessayer ». Et
le renouvellement de jeton passait par le même `fetch` nu : muet, il figeait via
`uneSeuleFois` **toutes** les requêtes qui l'attendaient.

`fetchAvecDelai` coupe à **30 secondes** les deux chemins — **corps de la réponse
compris**. La première version annulait le minuteur dès les en-têtes : sur le
web, `fetch` résout avant que le corps n'arrive, et une connexion qui décrochait
au milieu d'une longue liste laissait `text()` attendre pour toujours. Relevé par
la revue, corrigé, deux témoins vus rouges avant.

Le message dit « Le serveur ne répond pas », **sans désigner de coupable** : sur
Android, OkHttp n'a pas de délai de connexion, donc un serveur éteint ou un Wi-Fi
captif finissent ici aussi. La première version affirmait « il a accepté la
connexion » — faux précisément dans ces cas-là.

Un renouvellement muet rend la main **sans déconnecter**. Cinq témoins, chacun
avec son chien de garde ; le témoin inverse respecte le signal, si bien qu'un
délai retombé à zéro le fait tomber — ce qu'il ne faisait pas dans sa première
version.

**Et l'API répond toujours avant ce délai.** `FrigoGrocy` n'imposait aucune durée
à ses appels : 60 s de `default_socket_timeout`, plus que les 30 s du front. Un
Grocy muet faisait donc lire « le serveur ne répond pas » au lieu du 502
« Grocy est injoignable… », et sur `/plan_repas/{id}/cuisine` le serveur
continuait après la coupure. Les appels à Grocy sont bornés à **20 s** — y compris
`inventorierUn`, en tâche de fond, où un Grocy muet figeait un des deux
travailleurs d'inventaire. `FrigoGrocyDelaiTest` n'exige pas une valeur mais un
**ordre** : l'API doit répondre avant que le front abandonne. Et quand la borne
saute, la ligne d'inventaire **échoue en le disant** — un délai dépassé devient
un motif lisible, pas une exception qui ferait tomber le lot ; témoin vu tomber
en rétrécissant le `catch`.

> **À savoir, sans que ce soit un défaut** : avec les deux réessais de React
> Query, un serveur totalement muet laisse le rond tourner environ 90 s avant
> « Réessayer ». Le bouton « Se déconnecter » reste accessible pendant ce temps.

---

## L'épreuve sur Android — et le chiffre faux qu'elle a trouvé

Le 15 septembre 2026, l'application a été éprouvée **sur le vrai moteur
d'Android**, et plus seulement sous Node et Chromium : Expo Go sur l'émulateur
d'Android Studio (`Medium_Phone_API_36.1`, côté Windows), piloté depuis WSL par
`adb.exe`. Rien n'a été construit ni publié : c'est le bundle de Metro, dans
Hermes, avec le `fetch` de React Native.

**Ce qui tient sur Android** : la connexion, les cinq onglets sans une erreur
JavaScript, la création d'une séance et ses sauvegardes automatiques
(`POST` 201, `PATCH` 200), et le nouveau client HTTP — délai de garde,
réponse relue puis reconstruite — qui n'avait été éprouvé que sous Node.

### Le défaut : 42,5 kg tapés, 425 kg enregistrés

Frappe par frappe dans le poids d'une série, sur l'émulateur :

| Frappe | Le champ affichait |
|---|---|
| `4` | `4` |
| `2` | `42` |
| `,` | `42` — la virgule disparaît |
| `5` | `425` |

**La base a enregistré `poids = 425.00`**, qui part ensuite dans le 1RM, les
records et la courbe. Le champ était piloté par le NOMBRE (`String(serie.poids)`) :
« 42, » se lisait 42 et se réécrivait « 42 ». Ce défaut était antérieur à la
journée, et valait sur le web comme sur Android.

**Ses jumeaux, trouvés en le corrigeant et par la revue qui a suivi** :

- répétitions de la série, répétitions et poids cibles du modèle — ce dernier
  affiché via `nb()`, qui arrondissait 42,25 en « 42.3 » dans le champ même ;
- `parseFloat(...) || 0` et `parseInt(...) || 0` dans ces quatre champs : une
  saisie illisible devenait **zéro** (règle 6) ;
- **les objectifs par repas** : `parseFloat('12,5')` rend 12. Prouvé sur
  Android avant et après : 12,5 g tapés s'enregistraient **12.00** (298 kcal),
  ils s'enregistrent **12.50** (300 kcal) ;
- l'inventaire du frigo (« 4,2,1 » partait en 4,2), le calculateur de 1RM
  (« 8,5 » répétitions lues 8), et l'éditeur d'aliment, qui enregistrait **0 g**
  pour une macro laissée vide.

**La correction** : une seule lecture, `src/calcul/saisieNombre.ts`
(`nombreSaisi` — vide ou illisible donne `null`, jamais 0 ; `entier` pour les
répétitions), sur laquelle `grammesSaisis` s'est branchée au lieu d'en garder
une copie ; et `src/composants/champNombre.tsx`, un champ qui **garde le texte
tapé** et ne le remplace que si la valeur change de l'extérieur. Un champ
illisible se borde de rouge ; l'éditeur d'aliment refuse d'enregistrer une macro
vide et dit pourquoi. Tests unitaires et de rendu, **chacun vu tomber sous
mutation** — dont les deux que la revue a exigés : une série supprimée dont la
voisine prend la place, et un décimal dans des répétitions qui doit rester à
l'écran.

**Le délai de garde, prouvé sur Android face à un serveur muet.** Expo Go
effacé (plus de session), application pointée vers un serveur qui accepte les
connexions sans jamais répondre, appui sur « Se connecter » : « Connexion… »
à 6 s, puis **à 32 s** « *Le serveur ne répond pas (plus de 30 s) :
http://127.0.0.1:9999/api. Réessaie dans un instant ; si ça dure, vérifie ta
connexion et que le serveur est bien allumé.* » Le serveur muet a reçu la
connexion, l'API réelle aucune. Jusqu'au 15 septembre, ce même écran aurait
tourné pour toujours.

**Le poids décimal, prouvé sur Android dans les deux configurations réelles** :

| Téléphone | Frappes | Le champ | En base |
|---|---|---|---|
| anglais | `4 2 . 5` | `42.` puis `42.5` | 42.50 |
| français (Expo Go en fr-FR) | `4 2 , 5` | `42,` puis `42,5` | 42.50 |

**Les données existantes** : les 31 séries des comptes réels de la base de
développement sont toutes cohérentes avec leur exercice. Une seule est
invérifiable faute de point de comparaison — « Squat sumo haltère, 79 kg × 1 »,
seule série de son exercice, qui pourrait aussi être un 7,9 kg amputé de sa
virgule. **La base de production n'a pas été examinée.**

### Refaire l'épreuve : la procédure, et ses pièges vérifiés

```bash
SDK=/mnt/c/Users/micka/AppData/Local/Android/Sdk
$SDK/emulator/emulator.exe -avd Medium_Phone_API_36.1 -no-snapshot-save &
$SDK/platform-tools/adb.exe install -r <Expo Go SDK 54>.apk   # api.expo.dev/v2/versions/latest
$SDK/platform-tools/adb.exe reverse tcp:8081 tcp:8081
cd front && npx expo start --go --localhost --port 8081 --clear   # l'adresse de l'API vient de front/.env
$SDK/platform-tools/adb.exe shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081
```

Chacun de ces pièges a coûté un faux résultat le 15 septembre :

- **`front/.env` gagne sur la ligne de commande — et `EXPO_NO_DOTENV=1` n'y
  change rien.** `client.ts` ne lit pas `process.env` mais le module
  `expo/virtual/env`, que Metro remplit depuis les fichiers `.env`. Le bundle
  portait donc à la fois `process.env.EXPO_PUBLIC_API_URL = 127.0.0.1:9999`
  (la ligne de commande) et `expo/virtual/env = 192.168.1.118:8080` (le fichier)
  — et c'est le second qui servait : un test « face à un serveur muet » a parlé
  à la vraie API, vérifié dans son journal. Pour viser une autre adresse, poser
  un **`front/.env.local`** temporaire (ignoré par git, prioritaire sur `.env`)
  et le retirer ensuite. Le bundle porte alors les DEUX valeurs dans
  `expo/virtual/env` — celle de `.env` et celle de `.env.local` : y trouver la
  bonne ligne ne prouve pas qu'elle sert. **La preuve est dans le journal du
  serveur visé**, et dans l'absence de requête chez l'autre.
- **`CI=1` désactive le rechargement de Metro** (« *reloads are disabled* ») :
  il sert l'ancien code, sans erreur visible, et une correction semble inopérante.
  Relancer Metro après chaque modification, ou ne pas passer `CI=1`.
- **Vérifier le bundle avant d'éprouver** : le demander à Metro via son manifeste
  (`curl -H 'expo-platform: android' http://localhost:8081/`, puis
  `launchAsset.url`) et y chercher le code attendu. Un bundle de 12 Ko est un
  **message d'erreur**, pas du code — Expo Go continue alors sur l'ancien.
- **Le clavier d'Android filtre le séparateur décimal selon la langue** : en
  anglais la virgule est refusée avant d'atteindre l'application. Pour éprouver
  un téléphone français : `adb shell cmd locale set-app-locales host.exp.exponent --locales fr-FR`.
- **Relire l'écran après chaque geste** (`uiautomator dump`) : une sauvegarde qui
  affiche « enregistré » décale la page de 82 pixels, et une coordonnée relevée
  avant n'est plus la bonne.
- **Des commandes lancées en parallèle se disputent le dossier courant** : un
  `cd front && npm run build:web` a tourné à la racine, et un `rm -rf api/front`
  est parti d'un autre dossier (sans rien trouver à supprimer, vérifié). **Chemins
  absolus uniquement**, surtout pour un `rm`.

---

## Ce que propose l'application : l'inventaire, sa revue, et deux agents

**16 septembre 2026.** Le propriétaire a écrit son propre inventaire,
`presentation/fonctionnalites-par-onglet.md` — 45 lignes, cinq onglets, les
fonctionnalités telles qu'un utilisateur les vit. **C'est la référence du
besoin** : le code ne peut pas la donner.

Elle a été confrontée ligne à ligne au code dans
`presentation/fonctionnalites-revue.md` (son document n'a pas été touché) —
**cette revue a été absorbée dans `presentation/demonstration.md` le
17 septembre 2026, partie II, et le fichier supprimé** :
**41 lignes confirmées**, quatre écarts, et des pans entiers absents — toute
l'administration, les invitations, Grocy, le catalogue d'exercices, les
avertissements du calculateur.

**Trois décisions prises :**

1. **Pas de cible de fibres par repas.** L'application reste comme elle est : la
   case « glucides fibres comprises » suffit, et les fibres n'interviennent que
   dans le convertisseur de plan et l'affichage du repas. C'est la ligne de
   l'inventaire qui était en avance sur le code.
2. **Le mode de travail se choisit désormais dans un modèle** — voir plus bas.
3. **Les fiches de fonctionnalité suivent un découpage en 15**, une par fonction
   perçue, pour des captures vidéo courtes et ciblées.

Deux écarts restent sans suite, sciemment : l'inventaire cite **trois**
catégories d'aliment quand l'application en a **huit** (imprécision d'écriture,
aucun effet), et il ne mentionne pas les deux garde-fous d'Epley — plafond de
15 répétitions, série d'une répétition prise telle quelle — qui restent tels
quels.

**Deux agents sont nés de là**, avec leurs skills :

- **`verification-android`** — faire tourner l'application sur le vrai moteur
  d'Android et y faire les gestes de l'utilisateur. Sa skill porte la procédure
  et les pièges qui ont chacun coûté un faux résultat le 15 septembre.
- **`verification-fonctionnalites`** — éprouver une fonctionnalité du point de
  vue de l'utilisateur (« répond-elle au besoin ? ») et **en filmer une capture
  vidéo par scénario**. Il s'appuie sur `epreuve-fonctionnalite` (la méthode
  commune, et le gabarit des fiches) et sur une fiche `fonctionnalite-*` par
  fonctionnalité. Les vidéos vont dans `presentation/captures/`, ignoré par git.

### Le mode de travail se choisit aussi dans un modèle

L'inventaire annonçait « plusieurs modes de travail » sur un modèle. C'était
faux : le mode y était repris du mode par défaut de l'exercice au moment de
l'ajout (`mode: ex.modeDefaut`) et **ne pouvait plus bouger** — un programme de
gainage restait en « Charge » et prescrivait des kilos là où il faut des
secondes. Seul l'écran de séance portait le sélecteur.

Le sélecteur est **extrait** dans `src/composants/choixMode.tsx` et partagé par
les deux écrans — pas recopié : la veille, quatre champs de nombre recopiés
portaient deux lectures différentes, dont une fausse.

**Éprouvé sur l'API** : un modèle créé en « charge », renvoyé avec `iso`,
s'enregistre bien `iso` ; un mode inconnu reçoit **422**.

> **Et une leçon d'accessibilité, payée de deux essais.** L'état sélectionné
> doit s'ANNONCER, pas seulement se peindre. `accessibilityState={{ selected }}`
> sur un `role="button"` ne produit rien (`aria-selected` n'y est pas valide), et
> `accessibilityState={{ checked }}` sur un `role="radio"` **non plus** dans
> cette version de react-native-web. Seule la forme `aria-checked={…}` en clair
> sort dans le rendu — et React Native 0.71+ la retraduit côté natif. **Lire le
> HTML réellement rendu** plutôt que supposer : c'est ce qui a tranché.

#### Et l'épreuve Android a montré que ce sélecteur ne commandait rien

**C'est le meilleur argument pour l'agent `verification-android` : tout était au
vert sans lui.** Le mode se choisissait, partait en base (`modele_exercice.mode
= iso`, relu après un redémarrage à froid d'Expo Go), l'API l'acceptait, les
tests passaient — et après bascule en « Tenue », les quatre lignes de série
affichaient toujours **« — kg » et « 12 rép »**. Capture à l'appui. La
justification même de la modification — « un programme de gainage prescrivait
des kilos là où il faut des secondes » — n'était donc pas tenue :
`ModeleSerie.secondesCible` existait dans le type et dans la table **sans être
saisissable nulle part**.

Le jumeau oublié, une fois encore : `LigneSerie` bascule depuis toujours
(`mode === 'charge' || mode === 'chrono'` contre `mode === 'iso'`), son jumeau
du modèle n'avait jamais reçu la règle.

**Corrigé le 16 septembre 2026**, en TDD, les deux témoins vus rouges d'abord
(« en Tenue, on prescrit des secondes » et la durée remontée dans
`secondesCible`). Les champs sont **sortis vers `src/composants/serieModele.tsx`**
— pas seulement pour alléger l'écran : tant qu'ils vivaient dans `app/`, aucun
test ne pouvait les voir. Cinq tests de rendu, dont **le témoin inverse** : en
« Chrono », les répétitions et les kilos restent, parce qu'un « for time » se
note aussi en charge. Et **basculer de mode ne jette pas ce qui était saisi** :
un aller-retour Charge → Tenue → Charge rend les kilos (règle 6).

Le bouton « × » de ces lignes a reçu au passage le libellé que son jumeau de la
séance avait depuis la veille — sans lui, un lecteur d'écran annonce « signe
multiplication », ou rien.

**Ce que l'épreuve a confirmé par ailleurs** : l'écran de séance bascule bien
(colonnes `rép`/`kg` remplacées par les chronomètres en « Tenue », puis
« Temps total · Go » en « Chrono », `mode` à jour en base à chaque fois), et le
raccourci « ↓ 12×14 · … » reste à côté des modes dans les trois états — **sans
devenir un décor permanent** : sur la séance la plus ancienne, qui n'a pas de
précédente, il est absent (contre-épreuve faite).

> **Et une confirmation, qui n'est pas un défaut** : chaque `PATCH /api/seances`
> recrée les `seance_exercice` (122/123/124 → 127/128/129). C'est le
> comportement documenté plus haut — « lu et écrit en UN SEUL objet complet ».
> Rien ne référence ces identifiants dans la durée. À savoir avant de croire
> à une perte de données.

---

## Le riz cuit ne fait pas 130 kcal, et quatre chiffres de la fixture étaient faux

**16 septembre 2026.** Le propriétaire a demandé de vérifier « le riz sec vaut
350 kcal/100 g, pas 130 » — la phrase de la règle 3, répétée dans douze
documents et dite à voix haute dans le script de présentation. **Elle était à
moitié fausse, et la vérification a ouvert trois autres trous.**

### Ce que dit la table, et où on se trompe en la lisant

La source fait foi : `Table_Ciqual_2025.xlsx`, publiée par l'Anses
(ciqual.anses.fr). **Elle n'est pas versionnée** (`.gitignore`) : ce paragraphe
disait le contraire jusqu'au 17 septembre 2026. La télécharger et la poser à la
racine du dépôt pour revérifier les chiffres.

| entrée CIQUAL | kcal | prot | gluc | lip | fibres |
|---|---|---|---|---|---|
| Riz blanc, **cru** | 350 | 7,02 | 77,5 | 0,79 | 1,53 |
| Riz blanc, **cuit** | 155 | 3,15 | 33,2 | 0,7 | 1,4 |
| Riz thaï ou basmati, cru | 351 | 7,08 | 78,4 | 0,63 | 1,06 |
| Riz complet, cru → cuit | 350 → 187 | | | | |

> **Le classeur porte DEUX colonnes d'énergie**, et elles ne disent pas la même
> chose : « Énergie, **Règlement UE n° 1169/2011** » (350) et « N × facteur
> Jones, avec fibres » (348). **C'est la première qu'il faut lire** — elle compte
> les fibres à 2 kcal/g, c'est-à-dire la règle 4 du projet. J'ai d'abord lu la
> seconde et écrit 348 partout ; la revue l'a relevé. Le contrôle qui tranche :
> 350 ÷ 155 = **2,26**, exactement le rendement retenu pour le riz blanc.

**Trois pièges, chacun tombé une fois :**

1. **130 est une valeur USDA**, pas CIQUAL — aucun riz nature cuit n'y descend
   sous 141 (et le riz sauvage cuit fait 102, donc ne pas affirmer de plancher).
2. **Ne pas dire « basmati ».** Le « Riz basmati » de l'application est apparié à
   l'entrée **« Riz blanc, cru »** (`ciqual_vers_grocy.py:260`, `:170`) : la paire
   350 / 155 et le 2,26 sont des valeurs de **riz blanc**. Le vrai basmati
   donnerait 351 / 148, soit 2,37. Ma première correction disait « basmati » et
   était donc fausse aussi.
3. **2,26 n'est pas « deux fois et demie ».** Le riz *pèse* 2,26 fois plus ; il a
   absorbé 1,26 fois son poids en eau. Dire « il pèse deux fois et quart plus
   lourd » est juste et plus parlant devant une balance.

### Ce qui était faux dans les données

**La fausse table de `test_ecriture_grocy.py` portait un riz dont quatre
chiffres sur six ne sont dans aucune entrée CIQUAL** : prot 7,12, gluc 75, lip
**1,58** (le double), fibres **3,2** (2,1 ×). L'audit en avait nommé deux et les
avait tracés jusqu'à cette table : **ils sont corrigés**, à la source et dans la
fixture. Le doublement des fibres déplaçait une cible exprimée en glucides
*totaux* : c'était un chiffre affiché.

### Ce que l'application calcule est juste — et c'est prouvé

La question posée était : *« assure-moi que l'application dit vrai dans les
calculs cru/cuit »*. Trois compositions du même repas, **en ne changeant que le
rendement** :

| | rendement riz | riz à peser | riz servi | macros |
|---|---|---|---|---|
| passe 1 | 2,26 | 105,00 g | 237,30 g | 801,75 kcal · 49,75 P · 88,52 G · 24,84 L |
| passe 2 | **3,00** | 105,00 g | **315,00 g** | **identiques** |
| passe 3 | 2,26 (poulet 0,75 → **0,90**) | 105,00 g | 237,30 g | **identiques** |

Le rendement déplace le poids dans l'assiette et **pas un gramme de macro ni un
gramme à peser**. Le témoin qui donne sa valeur au contrôle : en recalculant les
macros sur les poids *servis*, on obtiendrait **1 207 kcal au lieu de 801** —
+51 %. C'est l'erreur que l'application ne commet pas.

### Les trois défauts que les agents ont trouvés en chemin, tous corrigés

- **Un rendement à contresens répondait HTTP 500 avec le SQL brut**, et un
  utilisateur ordinaire pouvait l'atteindre : `ratioVraisemblable` répondait
  « 0,4 à 5 » **sans regarder la catégorie**. Il refusait donc une vraie mesure
  d'épinard (0,32, que `plausibilite.ts` déclare légitime à la ligne près) et
  laissait passer un féculent à 0,8 que la base rejette en `CHECK`. La règle vit
  désormais dans **`rendementPossible`** (`calcul/plausibilite.ts`), et elle dit
  exactement ce que disent l'API (`RendementPlausible::sens`) et la base
  (`aliment_ratio_sens`) : un féculent absorbe de l'eau, une protéine et un
  légume en perdent. Trois endroits, une règle.
- **Un message qui mentait sur le sens de l'erreur.** Pour un poisson à 1,4, le
  front annonçait « une cuisson plus poussée » et « la colonne cuit sera basse » :
  les deux sont faux dans ce sens — il aurait *gagné* de l'eau. Les deux bornes
  ont maintenant deux messages. *Ma première version le passait en **blocage** :
  le test « le rendement d'une protéine ne fait qu'annoncer un poids » est tombé
  dessus, et il avait raison — un rendement faux ne fait pas mal peser.*
- **Le docblock de `api/src/Entity/Aliment.php` disait l'inverse de la règle 3**
  (« féculents : valeurs CUITES, ratio = cuit/sec (riz 3) ») : la convention
  que la règle 3 a abolie, sur l'entité que lit en premier quiconque
  écrit un import.

### Et deux défauts trouvés par la revue, hors du riz

- **Le raccourci « ↓ dernière fois » était éteint pour tout le mode « Tenue ».**
  L'aperçu ne gardait que les séries portant `reps` ou `poids` ; une séance de
  gainage n'en produit aucune, la liste était vide, le bouton n'apparaissait
  **jamais** — alors que `rechargerDerniereFois` savait restaurer les durées.
  Descendu dans `calcul/blocSeance.ts` pour être éprouvé (4 tests).
- **Mon propre test du sélecteur de mode affirmait une garantie qu'il
  n'éprouvait pas** : il gardait `mode` figé à `iso` tout en prétendant vérifier
  qu'« une bascule ne jette rien ». Il bascule pour de vrai maintenant, et fait
  l'aller-retour Charge → Tenue → Charge.

### Ce que `verite-documentaire` a trouvé, et qui t'aurait coûté la démonstration

**`jeu-demo.sql` ne pose NI aliments NI stock** — c'est `jeu-essai.sql`, qu'il
exige en prérequis. La liste « avant d'entrer dans la salle » de
`presentation/demo-30-minutes.md` (supprimé depuis, absorbé dans
`presentation/demonstration.md`) ne citait que le premier : en la suivant à la
lettre, on arrive avec un **frigo vide**, et le frigo est le premier tiers de la
démonstration. Corrigé là et ici (voir plus bas, « Le jeu de démonstration »).

Il a aussi trouvé **quatorze renvois `fichier:ligne` faux** dans
`presentation/fonctionnalites-revue.md` (absorbé depuis dans
`presentation/demonstration.md`), tous hérités d'avant le lot 6 —
`composer.ts` est passé de 827 lignes à 135, `repas.tsx` de 2 316 à 655. Recalés.

---

## Le 500 de l'API est fermé — la règle était écrite, personne ne l'appelait

**16 septembre 2026, au soir.** L'agent de vérification bout en bout a répondu
franchement à la question qu'on lui posait : **oui, le 500 subsistait.**

`POST /api/aliments` avec un féculent à 0,8 rendait :

```
HTTP 500 — SQLSTATE[23514]: Check violation: aliment_ratio_sens
DETAIL: Failing row contains (65, …, 2869f386-…, 2026-09-16 22:40:50+00)
```

Deux défauts dans une seule réponse : le message n'apprend rien, et la ligne
brute expose l'**UUID du propriétaire**.

**Le correctif du matin ne suffisait pas, et c'est le point à retenir.**
`rendementPossible` grise le bouton d'enregistrement : plus personne ne
provoque ce 500 *depuis l'application*. Le serveur seul, lui, n'avait rien
gagné — curl, un autre client, une version d'application en retard le
déclenchaient encore. Corriger l'écran n'est pas corriger l'API.

**La règle existait pourtant depuis le 14 septembre.** `RendementPlausible::sens`
la porte, mot pour mot celle de la contrainte `aliment_ratio_sens` — mais son
seul appelant était `AlimentDisponible`, c'est-à-dire la **lecture** du frigo.
`Aliment::$ratio` ne portait qu'un `Assert\Positive`. Quatre endroits
connaissaient la règle ; le seul branché sur l'écriture ne la consultait pas.

Un `#[Assert\Callback]` sur l'entité **appelle** le service — il ne le recopie
pas. `atPath('ratio')` désigne le champ fautif, pour que le front sache quoi
souligner. Cinq tests, trois vus rouges d'abord, et les témoins qui comptent :
l'épinard à 0,32 (500 g crus → 160 g cuits) et le riz à 4,68 restent acceptés —
sans eux, une contrainte qui refuserait tout passerait pour une correction.

**257 tests API, 671 assertions. PHPStan à ses 7 erreurs connues.**

---

## Le graphe relie enfin les constats au code qui les porte

**16 septembre 2026.** `FiltreExercice` avait dix arêtes, **toutes vers du code**,
et aucune vers le constat que son propre en-tête nomme en clair (« POURQUOI CETTE
CLASSE EXISTE — constat E8 / F-04 »). Deux passes ont comblé ça :

1. **`api/src` passe désormais par l'extraction sémantique**, pas seulement l'AST
   (règle inscrite dans `CLAUDE.md`). 61 fichiers, 233 nœuds, dont 58 de
   *rationale*. **Relancer l'AST dans la même passe est obligatoire** : sans lui,
   la fusion remplace les nœuds structurels par les seuls nœuds sémantiques et
   `api/src` perd ses méthodes et ses appels.
2. **Une passe déterministe relie les codes de constat cités en commentaire au
   nœud correspondant** — 67 arêtes `references`, sans LLM, gratuite.

### Le piège, et il coûtera à qui le refera

**Le projet emploie DEUX numérotations qui se recouvrent.** Le graphe les
distingue par un suffixe que le code n'écrit jamais :

| Écrit dans le code | Peut désigner | Ce qui tranche |
|---|---|---|
| `E1` | `E1` (inventaire, README) **ou** `E1 front` (deux 1RM) | le **sujet de la ligne**, rien d'autre |
| `E2` | `E2` (25-garde-fous.sql) **ou** `E2 front` (liste de courses) | idem |
| `F4` vs `F-04` | séries différentes | le **trait d'union** |
| `E-01`, `M-0N`, `C2`, `D1`–`D10` | une seule cible | sans ambiguïté |

Deux heuristiques ont été essayées et **sont fausses** : « fichier sous `front/`
→ nœud *front* » (`client.ts` et `editeurAliment.tsx` citent « la leçon d'É1 » en
parlant du **contrôle au point de passage obligé**, donc de l'inventaire), et
« accent É → série README » (`demandeRepas` écrit `É2` pour la liste de courses,
donc pour `E2 front`). Les six cas ambigus ont été résolus **en lisant leur ligne
une par une** ; ils sont inscrits en dur dans la passe.

Résultat : 7 065 arêtes, et `FiltreExercice.php --references--> E8`.

> **Le sens compte, et il est l'inverse de celui qu'on voudrait parcourir.**
> L'arête part du **code** vers le **constat** : `graphify path "E8" "FiltreExercice.php"`
> ne trouve rien, le chemin inverse oui. Partir d'un constat pour retrouver le
> code qui le porte demande donc une traversée non dirigée.

---

## Le tri de la documentation — ce qui a disparu, et pourquoi

**16 septembre 2026.** 76 fichiers de documentation passés en revue, compteurs
re-mesurés en lançant les tests plutôt qu'en croyant les documents.

### La question tranchée : pas de fichier unique

Le propriétaire hésitait entre « un seul `.md` » et « supprimer les périmés ».
**C'est le second, plus deux fusions.** Trois raisons, pas un avis :

1. **Une partie du corpus est exécutée, pas lue.** 25 skills, 7 agents,
   `CLAUDE.md`, `.graphifyignore` sont chargés par l'outillage — Claude Code lit
   `.claude/skills/<nom>/SKILL.md`, pas un chapitre. Les fondre les désactive.
2. **Le fichier unique ferait ~7 400 lignes.** `REPRENDRE.md` en fait 1 200 et
   c'est déjà la limite du tenable. Un document que personne ne relit en entier
   ne se corrige jamais : c'est le mécanisme qui a produit les treize faussetés
   ci-dessous.
3. **Les durées de vie sont opposées.** Ce journal change tous les jours ;
   `DEPLOIEMENT.md` n'avait pas bougé depuis le 11 août **sans une seule
   erreur**. Les fusionner ferait vieillir le stable au rythme du volatil.

### Les deux fusions

**`MISE-A-JOUR.md` → `DEPLOIEMENT.md`**, et c'était **urgent** : ses lignes
128-152 commandaient encore `fitsync`, l'outil de synchronisation Windows → WSL
neutralisé et archivé depuis le 7 septembre, dont le clone est renommé
`.OBSOLETE`, et dont `CLAUDE.md`, `README.md` et `NOUVELLE-MACHINE.md`
interdisent tous les trois l'usage — **c'est la cause du bug critique C1**. Un
document opérationnel qui prescrit la cause d'une panne connue est pire qu'un
document absent. Quatre sections ont été rapatriées — « l'ordre des cinq gestes
quand une dépendance native change » (qui contient le piège Gradle 503), « si tu
touches à la base de données », « quand quelque chose ne marche pas » et « ce que
tu ne dois jamais faire » ; la section `fitsync` est
restée derrière. Trois référents réécrits : `CLAUDE.md`, `README.md`, la skill
`schema-base`.

**`db/manuel/INSTALLATION.md` → `INSTALLATION.md`** : même titre, 93 lignes
identiques sur 115. Celui de `db/manuel/` n'avait pas bougé depuis le 11 août et
gardait, lui seul, la justification du répertoire (« pourquoi `db/manuel/` et
non `db/` ») et le chapitre « Août 2026 ». Les deux sont rapatriés.

### Les deux suppressions sèches

`docs/archives/fitsync.sh.archive` — **zéro référent** dans tout le dépôt, et
son histoire est déjà racontée ici et dans `NOUVELLE-MACHINE.md`.
`presentation/captures/.jpg` — nom vide, **md5 identique** à
`02-seances-liste.jpg`, et `construire.py` balaie le dossier.

### Les treize faussetés corrigées

La pire après `fitsync` : **`INSTALLATION.md` annonçait 12 tables et des
aliments semés** et donnait la requête pour les compter. Le schéma en a **19**,
et `db/02-donnees.sql` n'insère **aucun** aliment — celui qui suivait le
contrôle obtenait 0 et croyait avoir raté son installation.

Les autres : `NOUVELLE-MACHINE.md` annonçait **6 skills et 2 agents** (il y en a
25 et 7 — dix-neuf skills cachées à l'arrivant) · `README.md` disait 852 tests
(869) · `front/src/solveur/README.md` décrivait un dossier de **5 fichiers** qui
en contient **17**, si bien que chercher `composer.ts` y faisait conclure qu'il
n'existe pas · ce journal citait quatre skills hexagonales dont **aucune
n'existe** · `features.md` et `plan-de-tournage.md` se contredisaient de 1 à 4
sur le nombre de fonctionnalités.

> **Compteurs mesurés le 16 septembre, après DEUX erreurs de ma part** :
> **16 écrans** (`front/app/**.tsx` hors les deux `_layout`), **38 composants**
> (`.tsx` de `src/composants/` hors tests), 17 modules de calcul, 17 fichiers
> dans le solveur, 9 contrôleurs, 17 ressources API, 7 processeurs, 13 services,
> **19 tables** (`BASE TABLE` — la base porte en plus la vue `v_performance`,
> d'où 20 si on interroge `information_schema.tables` sans filtre),
> 24 migrations numérotées (20 au 17 septembre), 1 338 exercices, 288 capacités dans `features.md`.
>
> *J'avais d'abord écrit « 18 écrans, 43 composants » : le premier comptait les
> deux `_layout.tsx`, le second comptait les fichiers de test. `verite-documentaire`
> a relevé les deux le soir même — et le README disait **16** avant que je le
> « corrige ». Recopier un chiffre sans le compter est la faute que ce chantier
> répare ; la commettre en la réparant valait d'être écrit ici.*

### Ce qui se garde, contre l'intuition

**`docs/audit-2026-09/` reste.** Aucune skill ne cite son *chemin*, mais quinze
citent ses constats **par leur code** — `M-02`, `É8`, `C3`, `F-09`. Le dossier
est le seul **dictionnaire de ces codes** : le supprimer rendrait quinze renvois
de skills indéchiffrables. Ses deux mentions de `db/manuel/INSTALLATION.md`
n'ont pas été réécrites : un constat d'audit décrit l'état d'alors, pas celui
d'aujourd'hui.

**Les six documents de `presentation/` restent**, tous. L'autorité n'est pas
dans ce dossier mais dans les quinze fiches `fonctionnalite-*`, qui ont leurs
adresses vérifiées une par une et qui corrigent `features.md`. Dans le dossier :
`plan-de-tournage.md` est l'opératoire (douze skills s'y adossent),
`fonctionnalites-par-onglet.md` est la source brute du propriétaire — la toucher
invaliderait la revue qui affirme ne pas l'avoir modifiée.

> **Ce paragraphe a été rattrapé le 17 septembre 2026.** Garder les six, c'était
> garder six documents qui se contredisaient — et préparer une démonstration
> demandait d'en ouvrir huit. Quatre ont été fusionnés dans
> `presentation/demonstration.md` : `plan-de-tournage.md` (dont les **seize**
> skills qui s'y adossaient — et non douze — ont vu leur renvoi réécrit),
> `script-narration.md`, `demo-30-minutes.md` et `fonctionnalites-revue.md`.
> Les deux qui restent à côté sont bien ceux que ce paragraphe disait
> intouchables : `features.md` et `fonctionnalites-par-onglet.md`.

**Bilan : les `.md` suivis par git passent de 75 à 73**, plus une archive et une
capture en doublon retirées. Le gain n'est pas le compte, c'est que plus aucun
document ne commande un outil interdit ni n'annonce cinquante aliments qui
n'existent pas.

---

## Deux chantiers laissés ouverts, sciemment

~~**É14 n'a reçu qu'un volet sur trois.**~~ — **les trois sont faits, le
15 septembre 2026.** Terminer la session quand le jeton de rafraîchissement a
disparu (volet 1, vérifié jusqu'à la redirection), le portier de `_layout.tsx`
(volet 3), et le dernier, corrigé ce soir :

**Le bouton de déconnexion était enfermé derrière l'écran d'erreur.**
`compte.tsx` retournait son `<Erreur>` par un `return` précoce, et son bouton
« Se déconnecter » quarante lignes plus bas. Dès que `GET /api/moi` échouait, la
seule façon de quitter une session disparaissait — réseau coupé, API en panne,
jeton corrompu. **Et le chargement enfermait autant que l'erreur** :
`src/api/client.ts` ne posait alors aucun délai de garde (il en a un depuis,
`fetchAvecDelai`), donc une requête qui pend
laisse `isPending` vrai indéfiniment, et l'écran restait sur son rond qui tourne
sans erreur à montrer ni bouton pour sortir.

C'est la leçon déjà écrite dans `etatMaj.tsx` — le bouton de rafraîchissement
caché par le bug qu'il corrigeait — et pas appliquée ici. Le jumeau oublié, une
fois de plus.

Le cadre de l'écran est extrait vers **`src/composants/cadreCompte.tsx`** : il
décide de ce qu'il montre selon trois états, et rend la sortie **hors de toute
condition**. L'écran n'est plus que son câblage, et n'a plus un seul `return`
précoce. `cadreCompte.test-rendu.tsx` éprouve les trois états, plus les deux
témoins inverses — que l'erreur s'affiche toujours et se réessaie, et que le
contenu du compte ne s'affiche **pas** tant qu'on ne l'a pas reçu (sans quoi
« toujours afficher le bouton » se corrigerait en affichant tout, tiret compris,
et on retomberait sur la règle 7).

**Pourquoi dans `src/` et pas à côté de l'écran** : un test posé dans `app/`
n'est jamais exécuté — `tsconfig.tests.json` ne compile que `src/`. Une garde
qu'on ne peut pas éprouver se re-perd au découpage suivant, ce qui est
exactement ce qui venait d'arriver.

~~**M1 et M4 du lot 2**~~ — **faits le 15 septembre 2026.** M1 n'était pas qu'une
duplication : en mode « glucides totaux », la cible comprend les fibres à 2 kcal/g
et non 4, si bien que **7,5 g de fibres suffisaient** à faire accuser une cible
parfaitement atteignable. M4 a reçu un seuil **relatif**, choisi après mesure de
134 860 pivots — le rapport vaut soit 0, soit ≥ 0,484, rien entre les deux.

---

**Le réseau sortant des conteneurs est cassé sur cette machine.** Ni DNS ni
routage : même vers une IP brute, `curl` rend `000` depuis `fitcarnet-app-dev`.
D'où l'échec de `composer install` dans le conteneur, contourné en installant
`vendor` depuis l'hôte (le dossier est monté). C'est du NAT Docker sous WSL2,
pas le dépôt — **réparation à faire**, elle n'a pas été tentée.

**Le port 8080 ne se dispute plus.** Le Keycloak de `gestion-interne-api` le
tenait ; `fitcarnet-app-dev` refusait de démarrer, puis a tourné sans port
publié — sain au `docker ps`, injoignable. **Keycloak a été supprimé pour de bon
à la demande du propriétaire** (conteneur, image, volume), entre le 9 et le
14 septembre, et il n'en veut plus. Constaté le 16 septembre : ni conteneur, ni
image, ni volume, et plus aucun fichier compose sous `/home/micka` qui le
déclare. **Ne jamais le relancer ni le réinstaller.**

---

## Les captures de la démonstration, et les quatre images qui mentaient

**Le 17 septembre 2026.** La préparation d'une démonstration demandait d'ouvrir
huit documents et de lancer plusieurs commandes dans le bon ordre, dont deux se
contredisaient. Elle tient désormais dans **un seul fichier de matière**,
`presentation/demonstration.md` (1 015 lignes : préparer · l'inventaire par
domaine A→M · les huit bobines · le montage en 30 min · ce qui reste à
arbitrer), et **un seul point d'entrée**, `presentation/preparer-demonstration.sh`
(`--captures --slides --dossier --video --tout --aide`). Quatre documents
narratifs ont disparu, leur contenu absorbé ; les sections « ce qui manque dans
ton document » de la revue sont devenues les lignes marquées **`+`** de la
partie II, et ce sont elles qui garantissent la couverture.

**Les treize captures prises à la main ont été retirées et refaites.** Elles
dataient d'un état de la base que personne ne savait plus reconstituer, ne
couvraient que neuf écrans sur seize, et l'une d'elles était un doublon au nom
vide. `presentation/tournage/capturer.mjs` en produit **23**, chacune vérifiée
avant d'être écrite : sans le motif `attendu`, on repart avec vingt-trois
photos du formulaire de connexion et on s'en aperçoit en réunion.

**Quatre défauts n'ont été trouvés qu'en regardant les images produites**, et
aucun n'aurait levé la moindre erreur :

- **Deux paires d'images identiques au bit près.** `14-garde-fou-donnees.jpg`
  sortait avec le md5 exact de `08-repas-cuissons.jpg`, et
  `10-repas-courses.jpg` avec celui de `11-batch-cooking.jpg`. La cause est la
  même deux fois : **un `wheel()` qui ne défile pas ne lève rien**, il rend la
  même image sous un autre nom. Le garde-fou des valeurs ne vit pas sur l'écran
  Repas mais dans l'éditeur d'aliment (seul appelant de `rendementPossible`),
  et la liste de courses est un **panneau repliable**, pas un bas de page.
- **Le batch cooking annonçait « 3 fournées » et n'en montrait aucune.** Pour
  débloquer le bouton, le script cliquait « Les N autres se mangent tels
  quels » — ce qui enregistre « sans cuisson » **comme habitude** pour tout le
  frigo. Plus rien ne cuisait, définitivement. Les habitudes du compte de
  démonstration du **premier poste** ont été posées à la main avec de vraies
  cuissons (vapeur, eau bouillante, poêle). **Aucun fichier ne les pose** —
  `jeu-demo.sql` n'écrit rien dans `cuisson_habituelle` — et `capturer.mjs`
  clique toujours « se mangent tels quels » : sur un compte neuf, la capture 11
  sortira sans fournée. À trancher (voir « Par quoi continuer »).
- **La bascule vers le compte administrateur attendait un formulaire absent.**
  La session ordinaire était encore ouverte, donc l'accueil affichait
  l'application. Les quatre écrans d'administration tombaient d'un coup sur
  « Timeout 20000ms exceeded », un message qui ne parle ni de session ni de
  connexion. On purge `localStorage` avant de se reconnecter.
- **L'inventaire en tâche de fond ne s'appliquait jamais en développement.**
  `TraiterInventaires` n'y tourne pas : le lot restait « en attente 0/3 », et
  la règle « un seul inventaire à la fois » bloquait tout dépôt suivant. La
  capture « appliqué » photographiait donc le stock **inchangé**. Il faut
  lancer `bin/console app:inventaire:traiter --boucle` pendant la passe —
  c'est ce que fait la production, avec deux exemplaires.

**Contrôle qui doit rester vrai** : 23 images, et **aucune paire de md5
identiques**. C'est le seul test qui attrape ces quatre défauts d'un coup.

```bash
cd presentation/captures && md5sum *.jpg | awk '{print $1}' | sort | uniq -d
# doit ne rien afficher
```

**Deux comptes jetables ont été créés pour cela, et ils sont restés** — sur la
base de dev du premier poste, pas sur celle du second — sans eux, plus aucune
capture n'est reproductible :

```bash
# demo-verif@test.local et demo-admin-verif@test.local, mot de passe DemoFitcarnet2026!
# jeu-essai.sql PUIS jeu-demo.sql posés dessus, adresse réécrite au passage.
# Pour les retirer (l'ordre compte : le stock AVANT les aliments, les aliments AVANT le compte) :
docker exec -i fitcarnet-db-dev psql -U fitcarnet -d fitcarnet <<'SQL'
DELETE FROM stock   WHERE utilisateur_id IN (SELECT id FROM utilisateur WHERE email LIKE '%-verif@test.local');
DELETE FROM aliment WHERE utilisateur_id IN (SELECT id FROM utilisateur WHERE email LIKE '%-verif@test.local');
DELETE FROM utilisateur WHERE email LIKE '%-verif@test.local';
SQL
```

---

## Filmer soi-même : la feuille de tournage, et des images qu'on remplace

**Le 17 septembre 2026, au soir.** La vidéo montée par `tourner.mjs` ne fait pas
une démonstration : c'est un parcours automatique. Le propriétaire filme donc
lui-même, au téléphone, et les images des slides ne lui conviennent pas non plus
— certaines ne montrent pas l'écran dont la slide parle.

- **`fitcarnet-tournage.html`**, rendu par `dossier.py` depuis la **partie III**
  de `demonstration.md` : 8 bobines, 53 plans, 24 min 53 s, chaque plan avec son
  minutage dans le film, son geste, ce qu'on voit, ce qu'on dit, une case à
  cocher. Pas de seconde source : pour changer un plan, on change la partie III.
- **Les images des slides se remplacent** dans `presentation/images/`
  (versionné, prioritaire sur `captures/`, PNG accepté, portrait centré). La
  partie I, section 5, dit ce que chacune doit montrer et à quel plan la prendre.
- **Plus aucune date** dans les slides ni dans la partie III.

**Ce que la relecture a trouvé, et qui aurait été dit à l'oral :**

- **Le plan 4.5 faisait lire un bandeau absent.** « Boulgour : 83 kilocalories
  aux cent grammes de grain sec » — or le boulgour du jeu de démonstration vaut
  347, corrigé la veille. Le seul bandeau présent est l'ambre « Fibres inconnues »,
  et il est à l'étape **Jours**, avant de composer. *Relevé le 17 septembre :
  avec `jeu-essai.sql`, qui renseigne les fibres de ses huit aliments, ce
  bandeau ne peut pas apparaître (`planCalcule.ts` exige un aliment aux fibres
  inconnues). À trancher (voir « Par quoi continuer »).* Le bandeau est passé au 4.1 ;
  le 4.5 montre ce que l'écran affiche vraiment après la composition : chaque
  macro en vert quand elle tient la cible, en ambre sinon.
- **Le plan 7.5 annonçait « +2,8 kilos sur neuf séances »** ; l'écran affiche le
  chiffre de l'exercice ouvert (« +25,3 kg sur 5 séances » sur le squat avant).
- **Deux légendes de slide mentaient** : « le stock est passé de 623,5 g à
  480 g » (il partait de 836,5), et la slide des avertissements montrait
  l'éditeur d'aliment depuis que la capture 14 y a été déplacée.
- **Le contrôle par empreintes ne suffit pas.** `12-inventaire-envoye` et
  `13-inventaire-applique` ont des md5 différents et montrent **le même écran** :
  le travailleur de fond applique le lot avant la première photo. Regarder les
  images reste le seul contrôle qui vaille.

---

## Pièges vérifiés, qui reviendront

- ~~`verifier-schema.sh` signale 280 lignes de divergence~~ — **corrigé le
  14 septembre**. Il doit désormais dire « identiques ». S'il ne le dit plus,
  c'est une régression : une évolution du schéma écrite d'un seul côté.
- **Le glob des migrations s'arrête à `3[0-9]-*.sql`.** Une migration numérotée
  40 ne serait jouée nulle part. **CINQ fichiers à étendre**, et ce document en
  a longtemps annoncé trois — c'est-à-dire qu'il désignait lui-même le piège en
  en oubliant deux, dont celui qui *vérifie* :

  ```bash
  grep -rn '3\[0-9\]' installer.sh docker/entrypoint-prod.sh \
      db/manuel/verifier-migrations.sh db/manuel/verifier-schema.sh \
      db/manuel/rattraper-dev.sh
  ```

  Oublier `verifier-schema.sh` est le pire des cinq : il annoncerait
  « identiques » sans avoir joué la migration, et son ✓ ne prouverait plus
  rien. C'est arrivé le 14 septembre avec la migration 30.
- **7 erreurs PHPStan sont attendues** (c'était 8). `$creeLe` a disparu de la
  liste : M-02 lui a donné un accesseur, la date d'ouverture était en base et
  inaccessible au code. `JetonRafraichissement::$empreinte` **reste, et doit
  rester** — lui donner un accesseur pour faire taire l'analyse irait contre la
  raison même de ne stocker qu'un SHA-256.
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
  d'`installer.sh` — les 24 migrations passent, `25-garde-fous.sql` compris.
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
- **Si `fitcarnet-app-dev` tourne sans port publié**, c'est qu'un autre
  conteneur tenait le 8080 à sa création : sain au `docker ps`, injoignable.
  Libérer le port, puis `docker compose -f compose.dev.yml up -d
  --force-recreate app`. Le coupable d'origine, Keycloak, est supprimé et ne
  doit pas revenir (voir plus haut).
- **`verifier-schema.sh` et `verifier-migrations.sh` exigent l'image
  `postgres:16`**, pas l'alpine du dev et de la prod : `docker pull postgres:16`
  (451 Mo) sur une machine neuve. On adapte la machine, pas les scripts —
  décision du 16 septembre 2026, détail dans la skill `schema-base`.
- **Le réseau sortant des conteneurs est cassé sur cette machine.** Ni DNS ni
  routage : même vers une IP brute, `curl` rend `000`. D'où l'échec de
  `composer install` dans le conteneur. Contourné en installant `vendor` depuis
  l'hôte (le dossier est monté), **réparation remise à plus tard** : c'est du
  NAT Docker sous WSL2, pas le dépôt.
- **scrcpy ne voit pas le téléphone depuis WSL2.** WSL2 n'a aucun accès USB :
  `/dev/bus/usb` n'y contient que les deux hubs racine. L'affichage, lui, marche
  (WSLg est présent). Installer scrcpy **sur Windows** — le zip des *releases*
  GitHub est autonome, `adb` compris. Les voies de repli sont dans
  `presentation/demonstration.md`.
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
