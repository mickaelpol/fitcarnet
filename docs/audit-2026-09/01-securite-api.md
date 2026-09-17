# Audit de sécurité — back-end fitcarnet (`api/`)

Audit en lecture seule. Aucun fichier du projet n'a été modifié.
Périmètre lu intégralement : `api/src/**`, `api/config/**`, `api/tests/`,
`docker-compose.yml`, `docker/Caddyfile`, `.gitignore`, `.env*`.
Vérifications dynamiques : `php bin/console debug:router` (liste réelle des
routes exposées et de leurs contrôleurs).

Bilan : **0 CRITIQUE, 1 ÉLEVÉE, 2 MOYENNES, 9 FAIBLES.**
Aucune fuite de données entre comptes en LECTURE n'a été trouvée. Le socle
d'isolation (`ProprieteUtilisateur` + `FiltreProprietaire` + `security:` par
opération) est correct et redondant. Le seul défaut d'autorisation réel est un
chemin d'ÉCRITURE oublié.

---

## Recensement préalable : entités, exposition, isolation

| Entité | Lien vers `Utilisateur` | `ProprieteUtilisateur` | Exposée `#[ApiResource]` | Opérations | Isolation effective |
|---|---|---|---|---|---|
| `Seance` | `utilisateur` (NOT NULL) | oui | oui | GetC, Get, Post, Patch, Delete | `FiltreProprietaire` + `object.getUtilisateur() == user` — **OK** |
| `Modele` | `utilisateur` (NOT NULL) | oui | oui | GetC, Get, Post, Patch, Delete | idem — **OK** (voir F-05 sur `partage`) |
| `Stock` | `utilisateur` (NOT NULL) | oui | oui | GetC, Get, Post, Patch, Delete | idem — **OK** |
| `PlanRepas` | `utilisateur` (NOT NULL) | oui | oui | GetC, Get, Post, Delete | idem — **OK** |
| `Cible` | `utilisateur` (NOT NULL) | oui | oui | GetC, Get, Post, Patch, Delete | idem — **OK** |
| `Complement` | `utilisateur` (NOT NULL) | oui | oui | GetC, Get, Post, Patch, Delete | idem — **OK** |
| `Aliment` | `utilisateur` (NOT NULL) | oui | oui | GetC, Get, Post, Patch, Delete | idem — **OK** |
| `Exercice` | `creePar` (nullable) | non | oui | GetC, Get, Post, Patch(ADMIN) | **aucun filtre** — catalogue volontairement commun (voir F-04) |
| `Utilisateur` | — | non | oui | Get, GetC(ADMIN), Post(ADMIN), Patch | `is_granted('ROLE_ADMIN') or object == user` — **OK** |
| `Emplacement` | — | non | oui | GetC, Get (lecture seule) | référentiel fixe, aucune donnée personnelle — **OK** |
| `ModeCuisson` | — | non | oui | GetC, Get, Post/Patch/Delete(ADMIN) | référentiel commun — **OK** |
| `SeanceExercice`, `Serie`, `ModeleExercice`, `ModeleSerie` | via parent | non | `operations: []` | aucune | routes générées mais branchées sur `api_platform.action.not_exposed` (404 systématique) — **vérifié via `debug:router`** |
| `CuissonHabituelle` | `utilisateur` (NOT NULL) | non | **non exposée** | — | passe par `CuissonsController`, `WHERE utilisateur_id = :u` — **OK** |
| `JetonRafraichissement` | `utilisateur` (NOT NULL) | non | **non exposée** | — | **OK** |
| DTO `FusionExercice` | — | — | oui | Post `/exercices/fusion` (ADMIN) | **OK** |
| DTO `OrdreModele` | — | — | oui | Post `/modeles/{id}/appliquer-ordre` | contrôle de propriété explicite dans le processeur — **OK** |

Contrôleurs personnalisés : tous portent un `#[IsGranted]` de classe ou de
méthode, sauf `EtatController` et `SessionController` — les deux sont hors
pare-feu par conception (voir F-06/F-07 pour ce qui les concerne).

---

# Constats, du plus grave au moins grave

## E-01 — L'inventaire différé n'a aucun contrôle de propriété sur l'aliment

- **Gravité : ÉLEVÉE**
- **Statut : CONFIRMÉ**
- **Emplacement :**
  - `api/src/Controller/FrigoController.php:332-390` (dépôt du lot, aucune vérification)
  - `api/src/Service/AppliqueInventaire.php:146-179` (application, aucune vérification)
  - à comparer avec `api/src/Controller/FrigoController.php:124-131` et `:157-159`, qui font le contrôle sur l'autre chemin

**Ce qui se passe.** `POST /api/mon-frigo/stock` vérifie que l'aliment visé
appartient au demandeur (`alimentAccessible()`, ajouté explicitement pour
corriger cette faille — le commentaire aux lignes 106-123 la décrit en détail).
`POST /api/mon-frigo/inventaire` fait le même travail par un autre chemin et
**n'a pas reçu le même contrôle** : il ne valide que le préfixe `base:` et la
positivité de l'identifiant, puis dépose le lot ; le travailleur de fond appelle
ensuite `FrigoBase::definirStock($utilisateur, $idAliment, $quantite)` sans
jamais vérifier à qui appartient `$idAliment`. Un compte authentifié peut donc
poster `{"lignes":[{"reference":"base:<id d'un aliment d'Alice>","quantite":1}]}`
et faire écrire une ligne de stock sur un aliment d'Alice. Conséquence
exacte que le commentaire du fichier annonce pour l'autre route : Alice ne peut
plus supprimer son aliment (`AlimentSuppressionProcessor` compte les lignes de
stock **tous comptes confondus**, `api/src/State/AlimentSuppressionProcessor.php:41-51`)
et n'a aucun moyen de défaire ce blocage depuis l'application. Effet secondaire :
un identifiant inexistant produit une violation de clé étrangère dont le message
DBAL brut est rendu au demandeur via `GET /api/mon-frigo/inventaire/dernier`
(`AppliqueInventaire.php:171-178` → `InventaireLots::terminer`), ce qui permet
d'énumérer les identifiants d'aliments existants et expose le texte SQL.

**Correction proposée.** Appliquer le même filtre que l'autre route. Le plus sûr
est de le faire au dépôt, avant d'écrire le lot, en une seule requête :

```sql
SELECT id FROM aliment WHERE id = ANY(:ids) AND utilisateur_id = :u
```

et refuser le lot (422) si un identifiant manque à l'appel — donc en réutilisant
`alimentAccessible()` ou une variante en lot. Doubler le contrôle dans
`AppliqueInventaire::appliquerUne` (le travailleur a déjà `$utilisateur`) coûte
trois lignes et protège le jour où un autre appelant déposera un lot.
Accessoirement, ne renvoyer que `$e->getMessage()` filtré, ou un motif générique,
pour les échecs de type contrainte.
**Effort : 45 min à 1 h**, tests unitaires compris (`tests/Service/InventaireUneLigneTest.php` existe déjà).

---

## M-02 — ✅ corrigé le 15 septembre 2026 — Le jeton de rafraîchissement vivait un an

- **Gravité : MOYENNE**
- **Statut : ✅ CORRIGÉ EN ENTIER le 15 septembre 2026.** Fenêtre à 90 jours glissants (14 sept.), puis `GET /api/mes-sessions` et `DELETE /api/mes-sessions/{id}` (15 sept.). Le refus rend un **404 identique** pour « n'existe pas », « pas à toi » et « pas un UUID ». Le contrôle de propriété est **dans la requête**, pas dans un `if` qui suit. Une erreur PHPStan a disparu au passage (`$creeLe` était en base et inaccessible au code) : les 8 connues deviennent 7. **Reste non fait** : l'écran — les deux routes ne sont atteignables qu'au `curl`, elles n'apportent donc encore rien à l'utilisateur — et le marquage « c'est cette session-ci » — le contrôleur vit sous le pare-feu JWT et ne voit pas le jeton de rafraîchissement du client. — `DUREE` est passée de `+1 year` à `+90 days`, toujours glissante : une session active ne le sent pas, un appareil oublié cesse d'être une porte trois mois plus tard au lieu de douze. **Ce qui manquait vraiment reste manquant** : rien ne permet de constater ni de couper UNE session. L'option 1 ci-dessous — `GET /api/mes-sessions` + `DELETE /api/mes-sessions/{id}` — reste la vraie réponse, et n'a pas été faite.
- **Emplacement :** `api/src/Service/JetonsRafraichissement.php:27` (`DUREE = '+1 year'`), `:65-85` (prolongation à chaque usage, pas de rotation), `api/src/Entity/JetonRafraichissement.php:91-94`

**Ce qui se passe.** Le jeton est tiré sur 256 bits et n'est stocké qu'en
SHA-256 — c'est bien. Mais son échéance est repoussée d'un an **à chaque
utilisation** et il n'est jamais remplacé. Un jeton copié (sauvegarde de
téléphone, appareil revendu, journal de proxy si le corps est tracé) ouvre donc
un accès permanent, indétectable : le porteur légitime ne dispose d'aucun écran
listant ses sessions, et rien ne trahit un second usage. Les seuls leviers de
révocation existent et fonctionnent (déconnexion, changement de mot de passe →
`UtilisateurProcessor.php:86-89`, désactivation du compte →
`ComptesController.php:148-153`), mais ils sont tous « tout ou rien » et
supposent qu'on soupçonne quelque chose.

Le choix de ne pas faire de rotation est argumenté dans le code et le compromis
se défend pour cet usage. Ce qui manque n'est pas la rotation, c'est la
**visibilité** : rien ne permet de constater ni de couper une session précise.

**Correction proposée.** Deux options, par ordre de rapport qualité/prix :
1. Une route `GET /api/mes-sessions` (id, `creeLe`, `expireLe`, dernière
   utilisation) + `DELETE /api/mes-sessions/{id}` — la table porte déjà tout
   sauf « vu le », qu'il suffit d'écrire dans `prolonger()`. **Effort : 2 h.**
2. Ramener `DUREE` à 90 jours glissants : une session réellement active ne le
   sent pas, un appareil oublié cesse d'être une porte trois mois plus tard au
   lieu d'un an. **Effort : 5 min.**

---

## M-03 — ✅ corrigé le 14 septembre 2026 — Les messages d'exception brute remontaient jusqu'au client

- **Gravité : MOYENNE**
- **Statut : CORRIGÉ aux trois emplacements.** Le détail va au journal, le client reçoit un motif court et stable. L'échec reste **nommé** — une ligne qui disparaît en silence serait pire — mais la carte interne de la base ne sort plus. Un témoin vérifie les deux faces : que le SQL ne parte pas, et que le journal le conserve, faute de quoi on aurait échangé une fuite contre un angle mort.
- **Trouvé au passage** : `AppliqueInventaire::traiter()` et `InventaireLots` déclaraient `utilisateur_id: int` alors que la colonne est un UUID et que le code fait `Uuid::fromString` dessus. Faux depuis toujours, masqué par un `(string)` posé juste avant. Relevé par PHPStan en écrivant le test.
- **Emplacement :** `api/src/Service/AppliqueInventaire.php:177` (`return $e->getMessage();`, stocké dans `echecs` puis rendu par `GET /api/mon-frigo/inventaire/dernier`), `api/src/Controller/PlansController.php:193` (idem via `deduits/ignores`), `api/src/State/FusionExerciceProcessor.php:92-94`

**Ce qui se passe.** Sur les chemins où une exception est rattrapée pour ne pas
casser le traitement, c'est `$e->getMessage()` qui est renvoyé tel quel. Pour
une exception DBAL, ce message contient la requête SQL complète, les noms de
tables et de contraintes, et parfois les paramètres. Aucun secret ne fuit, mais
la carte interne de la base est offerte à tout compte authentifié — combiné à
E-01, c'est ce qui rend l'énumération d'identifiants confortable.

**Correction proposée.** Journaliser `$e` (le `LoggerInterface` est déjà injecté
dans `AppliqueInventaire`) et rendre au client un motif court et stable :
`'Cette ligne n’a pas pu être appliquée.'`. Garder le texte de Grocy, lui, qui
est utile et déjà tronqué à 200 caractères (`FrigoGrocy::corpsDe`).
**Effort : 30 min.**

---

## F-01 — `security.route_loader.logout` chargé sans aucun pare-feu de déconnexion

- **Gravité : FAIBLE**
- **Statut : CONFIRMÉ**
- **Emplacement :** `api/config/routes/security.yaml:1-3` ; aucun `logout:` dans `api/config/packages/security.yaml`

**Ce qui se passe.** Vérifié à l'exécution : `debug:router` ne produit **aucune**
route de déconnexion — le chargeur itère sur les pare-feux ayant une
configuration `logout`, il n'y en a aucun, il rend une collection vide. Aucun
impact de sécurité. C'est du fichier mort qui donne l'impression qu'une
déconnexion Symfony existe, alors que la vraie déconnexion est
`POST /api/deconnexion` (`SessionController::deconnexion`).

**Correction proposée.** Supprimer `api/config/routes/security.yaml`.
**Effort : 2 min.**

---

## F-02 — CORS de production : `http://` accepté et `localhost:5173` autorisé

- **Gravité : FAIBLE**
- **Statut : CONFIRMÉ**
- **Emplacement :** `docker-compose.yml:107` (`CORS_ALLOW_ORIGIN: '^https?://(carnet\.mickael-pol\.fr|localhost:5173)$$'`), `api/config/packages/nelmio_cors.yaml`

**Ce qui se passe.** Le motif accepte le schéma `http` sur le domaine de
production et laisse un poste de développement appeler l'API de production.
L'exposition réelle est faible : l'authentification passe par un en-tête
`Authorization` et non par un cookie, donc CORS n'est pas la frontière qui
protège les données ; et `allow_credentials` n'est pas activé.

**Correction proposée.** `^https://carnet\.mickael-pol\.fr$` en production, et
laisser `localhost` au fichier `.env` de développement.
**Effort : 5 min.**

---

## F-03 — Aucun en-tête de sécurité servi par Caddy

- **Gravité : FAIBLE**
- **Statut : CONFIRMÉ**
- **Emplacement :** `docker/Caddyfile:15-109` (aucune directive `header` autre que `Content-Type` et `Cache-Control`)

**Ce qui se passe.** Ni `X-Content-Type-Options`, ni `X-Frame-Options` /
`frame-ancestors`, ni `Referrer-Policy`. Le HTTPS et le HSTS sont éventuellement
posés par le proxy DSM en amont — non vérifiable depuis ce dépôt. Le front est
une SPA React (qui échappe par défaut) : le risque concret se limite au
détournement par cadre (clickjacking) et au *MIME sniffing*.

**Correction proposée.** Trois lignes dans le bloc `handle` du front :
`X-Content-Type-Options nosniff`, `X-Frame-Options DENY`,
`Referrer-Policy strict-origin-when-cross-origin`.
**Effort : 10 min.**

---

## F-04 — Le catalogue d'exercices n'isole rien, et `Exercice::$creePar` n'est jamais renseigné

- **Gravité : FAIBLE**
- **Statut : CONFIRMÉ** — la piste signalée dans la commande est réelle mais son impact est plus petit qu'attendu
- **Emplacement :** `api/src/Entity/Exercice.php:50` (`new GetCollection()` sans `security:`), `:59` (`Post` ouvert à `ROLE_USER`), `:204-206` (`creePar`), `:189-191` (`source` par défaut `'perso'`)

**Ce qui se passe.** Confirmation point par point :
- `Exercice` n'implémente pas `ProprieteUtilisateur` et aucune extension Doctrine
  ne le vise, `FiltreProprietaire` compris. Vérifié par recherche
  exhaustive de `creePar` / `cree_par` dans `src/` : **`Exercice::setCreePar()`
  n'est appelé nulle part**. La colonne est donc toujours `NULL`, y compris pour
  les exercices créés par l'API — contrairement à `Aliment`, dont
  `AlimentProcessor` renseigne le propriétaire.
- Conséquence : **il n'y a pas de fuite au sens strict** — il n'y a rien à
  filtrer, aucune donnée n'est marquée comme appartenant à quelqu'un. Le
  catalogue est commun, ce que la doc de classe assume explicitement
  (« Referentiel COMMUN d'exercices. Chacun peut en ajouter, tout le monde en
  profite »).
- Ce qui reste, et qui est réel : le nom d'un exercice créé par un compte est
  visible de tous les autres, et le commentaire de tri ligne 66-67 (« tes
  exercices restent en tête ») décrit un comportement qui n'existe pas — avec
  plusieurs comptes, `source = 'perso'` remonte les exercices de **tout le
  monde**. Un nom d'exercice peut être personnel (« Rééducation épaule Dr X »).
- L'écriture est ouverte à tout compte (`Post` : `ROLE_USER`), sans suppression
  possible (aucune opération `Delete`, la fusion est réservée à `ROLE_ADMIN`) et
  sans limite de volume ni de taille sur `instructions`. Un compte peut donc
  polluer durablement un catalogue servi en une page de 1500 entrées à tous.

**Correction proposée.** Trancher explicitement entre les deux lectures :
1. **Le catalogue reste commun** (statu quo assumé) : supprimer `Exercice::$creePar`
   et sa colonne, corriger le commentaire de tri ligne 66-67 qui affirme le
   contraire. **Effort : 20 min.**
2. **Les exercices « perso » redeviennent privés** : renseigner `creePar` par un
   processeur calqué sur `AlimentProcessor`, ajouter un `FiltreExercice`
   (`creePar IS NULL OR creePar = :courant`), et autoriser
   l'auteur à modifier/supprimer les siens. **Effort : 2 à 3 h**, migration de
   données comprise (les exercices existants restent `NULL` = communs, ce qui est
   le bon défaut).

---

## F-05 — `Modele::$partage` est inopérant : le `security:` l'autorise, le filtre Doctrine l'interdit

- **Gravité : FAIBLE**
- **Statut : CORRIGÉ le 15 septembre 2026 — option 1, en entier**
- **Emplacement :** `api/src/Entity/Modele.php:27` (`security: "object.getUtilisateur() == user or object.isPartage()"`) contre `api/src/Doctrine/FiltreProprietaire.php:37-46` (`applyToItem` s'applique à toute `ProprieteUtilisateur`)

**Ce qui se passe.** L'expression de sécurité prévoit qu'un modèle marqué
`partage` soit lisible par les autres comptes, mais `FiltreProprietaire` pose
`WHERE utilisateur = :courant` **avant** que l'expression ne soit évaluée : le
modèle n'est jamais trouvé, la réponse est 404. Ce n'est pas un trou — c'est
l'inverse, la fermeture gagne — mais c'est une fonctionnalité morte, et une
expression de sécurité qui ment sur ce que le système autorise finit par être
recopiée là où elle ferait effet.

**Correction proposée.** Soit retirer `or object.isPartage()` et le champ
`partage`, soit exclure explicitement `Modele` de `FiltreProprietaire` en
lecture d'item et laisser le `security:` décider. La première option est plus
sûre tant que la fonctionnalité n'est pas demandée.
**Effort : 15 min (option 1), 1 h (option 2, avec tests).**

**Ce qui a été fait.** L'**option 1**, sur décision du propriétaire le
15 septembre 2026 : *le partage de modèle ne doit pas être possible dans
l'application.* L'option 2 a été explicitement écartée — elle aurait déplacé
l'isolation d'une extension Doctrine vers une expression de sécurité, le
contraire de la règle 2.

Les quatre endroits coupés ensemble, une moitié de suppression étant pire que
rien : `api/src/Entity/Modele.php` (clause, champ, accesseurs, groupes) ·
`db/manuel/33-retirer-le-partage-de-modele.sql` doublée dans `db/01-schema.sql`
(règle 1, `verifier-schema.sh` au vert) · `front/src/api/types.ts`,
`hooks/seances.ts` et `app/modele/[id].tsx` · plus `db/manuel/jeu-demo.sql`,
sans quoi le jeu de démonstration n'aurait plus chargé.

Aucune donnée perdue, relevé **avant** d'écrire : les trois modèles portaient
`partage = false`, et le front envoyait `false` en dur à chaque création.

`ModeleExposeTest::testAucuneExpressionDeSecuriteNePrometCeQueLeFiltreInterdit`
interdit la rechute sur cette entité comme sur les autres.

---

## F-06 — `POST /api/utilisateurs` accepte un compte sans mot de passe

- **Gravité : FAIBLE**
- **Statut : CONFIRMÉ**
- **Emplacement :** `api/src/Entity/Utilisateur.php:56-59` (`motDePasseClair` : `Assert\Length(min: 10)` seulement, pas de `NotBlank`), `api/src/State/UtilisateurProcessor.php:67,74-76`

**Ce qui se passe.** `Assert\Length` laisse passer `null`. Un `POST` d'admin sans
`motDePasseClair` crée donc un compte dont la colonne `mot_de_passe` reste `''`.
Le compte est inutilisable (`password_verify` contre une chaîne vide échoue
toujours) mais il existe, il est `actif`, et rien ne le signale — il faudra une
intervention pour comprendre pourquoi la personne « ne peut pas se connecter ».
Réservé à `ROLE_ADMIN`, donc sans conséquence de sécurité directe.

**Correction proposée.** Un `#[Assert\NotBlank(groups: ['creation'])]` ou, plus
simple ici, un refus explicite dans `UtilisateurProcessor` quand
`$creation && null === $data->getMotDePasseClair()`.
**Effort : 15 min.**

---

## F-07 — Un `APP_SECRET` de développement subsiste dans l'historique git

- **Gravité : FAIBLE**
- **Statut : CONFIRMÉ**
- **Emplacement :** `api/.env.dev` (aujourd'hui ignoré par `.gitignore:/api/.env.dev`), présent dans les commits `80a1197` puis retiré par `b1b3de0`

**Ce qui se passe.** Le fichier a été retiré du suivi mais son contenu reste
dans l'historique. Aucun effet en production : `docker-compose.yml:102` impose
`APP_SECRET` par variable d'environnement et `APP_ENV=prod`. Le risque est celui
que le `.gitignore` décrit déjà lui-même — la réutilisation de ce secret
ailleurs. À signaler pour mémoire, pas à réparer en urgence.

**Correction proposée.** Ne rien faire (réécrire l'historique d'un dépôt déjà
déployé coûte plus que ça ne rapporte), mais s'assurer que cette valeur n'est
utilisée nulle part ailleurs.
**Effort : 5 min de vérification.**

---

## F-08 — Le catalogue d'exercices est ouvert en écriture sans plafond ni suppression

- **Gravité : FAIBLE**
- **Statut : CONFIRMÉ**
- **Emplacement :** `api/src/Entity/Exercice.php:59` (`Post`, `ROLE_USER`), `:69` (`paginationItemsPerPage: 1500`)

**Ce qui se passe.** Tout compte authentifié peut créer autant d'`Exercice` qu'il
veut — dans un catalogue servi à tous en une page de 1500 entrées —, sans limite
de débit ni de volume, et `instructions` est un `TEXT` non
borné. C'est un vecteur de dégradation du service, pas de compromission — et
dans un contexte de quelques comptes de confiance, l'exposition est faible.

**Correction proposée.** Si le besoin s'en fait sentir : `Assert\Length(max: …)`
sur `nom`, `instructions`, `musclesSecondaires`, et un limiteur de débit Symfony
sur ce `Post`.
**Effort : 45 min.**

---

## F-09 — Un exercice créé par un utilisateur ne peut plus être corrigé par lui

- **Gravité : FAIBLE**
- **Statut : CONFIRMÉ**
- **Emplacement :** `api/src/Entity/Exercice.php:62` (`Patch` : `ROLE_ADMIN`), aucune opération `Delete`

**Ce qui se passe.** `Post` est ouvert à `ROLE_USER`, `Patch` est réservé à
`ROLE_ADMIN` et il n'y a pas de `Delete`. Une faute de frappe dans le nom d'un
exercice qu'on vient d'ajouter n'est donc corrigible que par l'administrateur.
Ce n'est pas une faille — c'est le corollaire de F-04 : le modèle de propriété
des exercices n'est pas décidé, donc les droits ne peuvent pas l'être non plus.

**Correction proposée.** Se résout avec F-04 option 2 (`object.getCreePar() == user`
en `Patch` et `Delete`). Sinon, laisser tel quel et l'assumer par écrit.
**Effort : compris dans F-04.**

---

# Axes sans constat

- **Injection SQL / DQL : rien.** Toutes les requêtes de `src/` sont paramétrées.
  La seule construction par `sprintf` (`FiltreProprietaire.php:63`)
  n'interpole que l'alias racine du `QueryBuilder`, jamais une valeur client. Le seul autre morceau de SQL assemblé est
  `InventaireLots.php:208`, qui concatène une **constante de classe**
  (`SILENCE_MAXIMAL`).
- **Élévation de privilèges : rien.** `Utilisateur::$roles` porte
  `#[Groups(['utilisateur:lire'])]` seulement — aucun `POST`/`PATCH` ne peut
  l'écrire, et aucune route ne modifie les rôles. Un `ROLE_ADMIN` ne s'obtient
  que par `bin/console fitcarnet:creer-utilisateur --admin` ou par SQL.
  Corollaire à connaître : un second administrateur ne peut pas être nommé
  depuis l'application, ce qui rend la protection « dernier administrateur »
  d'autant plus nécessaire.
- **Désérialisation de champs sensibles : rien.** `roles`, `actif`, `creeLe`,
  `sourceFrigo`, `Exercice::creePar`, `Exercice::source`, `Exercice::public`,
  `PlanRepas::cuisineLe` et tous les champs `utilisateur` des
  `ProprieteUtilisateur` sont hors des groupes d'écriture. Vérifié entité par entité.
- **Invitations : rien de grave.** Jeton de 32 octets `random_bytes`, stocké en
  SHA-256 seulement, expiration à 7 jours, consommation atomique
  (`UPDATE … WHERE id = :id AND accepte_le IS NULL` dans la transaction de
  création du compte), adresse imposée par l'invitation et jamais par le
  formulaire, réponse identique pour « inconnu / expiré / déjà utilisé », rôle
  forcé à `ROLE_USER` et `sourceFrigo` à `base`. La séparation
  `^/api/invitation/` (public) / `/api/invitations` (admin) tient : la barre
  oblique finale empêche le motif d'attraper le pluriel — vérifié dans
  `security.yaml:71` et dans les routes réelles.
- **Appels sortants (Grocy) : rien.** URL et clé viennent de l'environnement
  (`config/services.yaml:44-47`), le chemin appelé est construit à partir de
  constantes et d'identifiants entiers (`FrigoGrocy::appeler`,
  `::inventorierUn`), la clé ne part que dans un en-tête, la vérification TLS
  n'est jamais désactivée, les pannes réseau sont converties en `RuntimeException`
  et rendues comme message plutôt qu'en 500. Le corps d'erreur Grocy est tronqué
  à 200 caractères, et seul le compte `sourceFrigo = 'grocy'` (l'administrateur)
  atteint ces routes.
- **`/api/docs` et `/api` : correctement fermés** (`security.yaml:119-121`,
  `ROLE_ADMIN` et `IS_AUTHENTICATED_FULLY`). Vérifié : `debug:router` ne montre
  aucune autre route hors `^/api`.

---

# Ce qui va bien

1. **La défense en profondeur sur l'isolation est réelle, pas déclarative.**
   Chaque `ProprieteUtilisateur` est protégée deux fois : par
   `FiltreProprietaire` au niveau de la requête SQL (donc y compris sur les
   collections, les filtres de recherche et les items) *et* par un
   `security: "object.getUtilisateur() == user"` par opération. L'un rattrape
   l'oubli de l'autre.
2. **Les champs sensibles sont hors des groupes d'écriture, systématiquement.**
   `roles` et `actif` en lecture seule, `utilisateur`/`creePar` posés par un
   processeur à partir du jeton et jamais du corps de requête. C'est la seule
   discipline qui rend une API Platform sûre par défaut, et elle est tenue sur
   les 11 ressources exposées.
3. **La gestion des mots de passe et des sessions est sérieuse.** Mot de passe
   actuel exigé pour changer son adresse ou son mot de passe (avec la dispense
   d'admin correctement limitée à *quelqu'un d'autre*), comparaison faite contre
   `previous_data` et non contre l'objet déjà désérialisé, révocation de toutes
   les sessions **après** la persistance, limitation à 5 essais par quart d'heure
   sur la connexion, `CompteActif` branché à la fois sur `json_login` et sur le
   pare-feu JWT, et re-vérifié à la main dans `SessionController` puisque cette
   route est hors pare-feu. Aucun de ces points n'est gratuit et aucun ne manque.
4. **Les secrets ne sont pas dans le dépôt.** `api/.env`, `.env.local` et
   `config/jwt/*.pem` sont ignorés et absents du suivi (vérifié par
   `git ls-files`). La base PostgreSQL n'a volontairement pas de `ports:` dans
   `docker-compose.yml`, et le commentaire explique pourquoi.
5. **Les protections de compte sont testables et testées.** `ProtectionDuCompte`
   est une classe pure — pas de base, pas de session — avec son test unitaire, et
   le `<= 1` plutôt que `=== 1` sur le compteur d'administrateurs actifs est le
   bon réflexe. `ComptesController` borne l'UUID par expression régulière avant
   d'interroger, et supprime les jetons de rafraîchissement dans la même
   transaction que la désactivation.
