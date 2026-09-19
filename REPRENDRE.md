# Où on en est — reprendre le travail

Ce fichier dit **ce qui reste à faire, dans l'ordre**, et **les décisions en
vigueur** — ce que ni le code ni les commits ne racontent. À lire en arrivant,
à tenir à jour en repartant.

Il a été réécrit de zéro le 18 septembre 2026. L'ancien journal, avec
l'histoire détaillée du 7 au 17 septembre (les pannes, leurs dates, comment
elles ont été trouvées), est archivé dans
[docs/journal-2026-09.md](docs/journal-2026-09.md) : on y cherche le *pourquoi*
d'une ligne de code, pas ce qui reste à faire.

---

## L'état, au 19 septembre 2026

- **Tout est poussé sur Gitea**, et donc déployé : la tâche planifiée du NAS
  tire `master` toutes les 5 minutes. **La production a été contrôlée le
  18 septembre** — schéma conforme aux migrations 34-35-36, parcours réel
  éprouvé sur un compte jetable puis retiré (section 2.1). **Ce contrôle date du
  déploiement de 11 h 43 ; les migrations 37 et 38 sont parties APRÈS** (13 h 36
  et 21 h 06) et rien dans le dépôt ne dit qu'elles ont été vérifiées en
  production. À refaire avant de s'appuyer sur cette ligne.
- **Tests** : 649 côté front plus 33 de rendu, 419 côté API (1 043 assertions),
  tous verts. PHPStan : **5 erreurs connues**, pas une de plus — c'était 7
  jusqu'au 18 septembre 2026, deux ont disparu avec le code qui les portait.
- **Contrôles de base**, tous verts : `verifier-schema.sh` (base neuve
  identique à base migrée), `verifier-migrations.sh`, `verifier-jeux.sh`,
  `test_import_carnet.py`.
- **Dernier chantier** : les mots de passe (section 2.6) — règle durcie à douze
  caractères et quatre familles, jauge de force, écran de changement, bandeau
  d'avertissement sur tous les onglets. Puis **la passe de contrôle à six
  agents** avant l'APK (skill `passe-de-controle`), et ses correctifs.
- **L'APK n'est PAS publié.** Tout est prêt et vérifié ; `./publier-android.sh`
  se lance par le propriétaire du projet, jamais par Claude.
- **Audit de septembre** : 79 constats, **78 clos, 1 ouvert** — le seul restant, **02#8**, est hors dépôt (une tâche DSM, voir §2.2). Aucun
  critique ni élevé. Les fermetures sont récapitulées en section 2.4.

---

## 1. En arrivant sur un poste

Deux postes travaillent sur ce dépôt, synchronisés **par Gitea seulement** :
`~/perso/fitcarnet` sur l'un, `~/fitcarnet` sur l'autre. Chacun a **sa propre
base de dev et son propre `node_modules`**.

```bash
git pull
docker compose -f compose.dev.yml up -d
db/manuel/rattraper-dev.sh       # APRÈS TOUT PULL qui apporte une migration
cd front && npm install          # si package.json a bougé, ou si les tests de rendu ne compilent pas
```

Puis vérifier qu'on part d'un socle sain :

```bash
cd front && npm test                                                  # 649 + 33, 0 échec
docker exec fitcarnet-app-dev sh -c 'cd /app && bin/phpunit'          # 419 tests, 1 043 assertions
db/manuel/verifier-schema.sh                                          # « identiques »
db/manuel/verifier-migrations.sh                                      # vert
db/manuel/verifier-jeux.sh                                            # vert
```

Un rouge **avant** d'avoir touché à quoi que ce soit vient de l'environnement,
pas du code : le régler d'abord.

**Le premier message à donner à Claude**, selon ce qu'on reprend :

> Lis `REPRENDRE.md`. On publie l'APK : d'abord la passe de contrôle
> (skill `passe-de-controle`), et **c'est moi qui lance `publier-android.sh`**.
> Ne travaille pas sur une autre branche que `master` sans me le demander.

> Lis `REPRENDRE.md` et `presentation/demonstration.md`. On prépare le
> tournage : d'abord les trois arbitrages de la section 2.3, puis les comptes
> de démonstration sur le NAS, puis bobine par bobine.

> Lis `REPRENDRE.md`. Il ne reste qu'un constat d'audit, **02#8**, et il se
> règle sur le NAS, pas dans le dépôt (section 2.2). Pour la suite, la section 3
> dit par quoi continuer.

---

## 2. Ce qui reste à faire, dans l'ordre

### 2.1 ~~Contrôler la production, retirer la migration 34~~ — fait le 18 septembre

**Schéma de production vérifié** (`\d aliment`, `\d stock`) : `utilisateur_id`
NOT NULL, l'index `aliment_nom_unique_par_compte`, la contrainte
`aliment_id_utilisateur_unique`, et côté stock la clé composite
`stock_aliment_du_meme_compte_fkey` — **sans** `stock_aliment_id_fkey` ni
`stock_quantite_check`, ce dernier remplacé par `stock_quantite_positive`. Les
migrations 34, 35 et 36 sont donc passées. Déploiement du 18 septembre à 11:43,
tous les conteneurs sains ; `/api` répond 401 sans jeton, `/api/etat` dit `ok`.

**Épreuve d'écriture, sur un compte jetable** (`epreuve-verif@test.local`, créé
sans `--grocy`, retiré ensuite — les comptes existants lisent Grocy et
n'écrivent donc pas dans la table `aliment`) : frigo vide à l'arrivée, aliment
créé **avec un propriétaire**, ligne de stock acceptée sur son propre aliment,
suppression **refusée** tant que le stock existe (« Cet aliment est encore dans
un frigo (1 ligne de stock) »), puis quantité mise à zéro par l'inventaire,
appliquée en tâche de fond, et suppression acceptée. Compteurs identiques avant
et après : 4 comptes, 0 aliment, 0 stock.

**`db/manuel/34-aliments-par-compte.sql` est retiré** (commit à part).
`verifier-schema.sh` : base neuve et base migrée identiques.
`verifier-migrations.sh` : tous les garde-fous posés. **Le 34 libéré ne se
reprend jamais.** Ce paragraphe a dit « la prochaine prend le 37 » jusqu'au
19 septembre 2026 : les 37 et 38 étaient déjà posées le 18 (`a52c882` à 13 h 36,
`f4a49ec` à 21 h 06), et suivre cette ligne aurait produit un numéro déjà pris.
**Ne pas écrire de numéro en dur ici** — la règle est dans `schema-base` et elle
se suffit : *le numéro qui suit le plus haut présent*, que `ls db/manuel/` donne
en une seconde.

**Conséquence acceptée** : une sauvegarde d'avant le 17 septembre ne redémarre
plus seule — la 35 s'arrête et demande de rejouer la 34 depuis l'historique
(`git show 1068054:db/manuel/34-aliments-par-compte.sql`). `DEPLOIEMENT.md` le
dit à l'endroit de la restauration.

**À savoir pour la démonstration** : la production ne contient **aucun aliment**
(la 34 a supprimé ceux sans propriétaire, et les deux comptes lisent Grocy). Un
compte de démonstration devra donc recevoir `jeu-essai.sql` puis `jeu-demo.sql`.

### 2.1 bis — une limite du front, mesurée et laissée telle quelle

**Le calculateur rend ses résultats dans un `ScrollView`**, qui dessine TOUT
d'un coup (`app/(onglets)/repas.tsx`, et de même dans `planRelu`,
`etapeReglage`, `etapeBatch`). La documentation React Native déconseille le
`ScrollView` pour une longue liste — mais **virtualiser n'apporterait presque
rien ici** : la liste extérieure, ce sont les JOURS, et un plan réaliste en
compte trois à sept. Le poids est à l'intérieur de chaque jour (quatre repas ×
leurs aliments, avec leurs champs de saisie), et virtualiser à ce niveau-là
demande des listes imbriquées, que React Native gère mal.

**Ce qui n'est pas borné** : rien n'empêche de cocher un mois entier au
calendrier. Le jour où l'écran devient lent, c'est cette limite qu'il faut
regarder — pas la liste des jours.

Les cinq `FlatList` du projet ont toutes leur `keyExtractor`. Seule celle des
**1 338 exercices** a vu son `renderItem` sortir du JSX (18 septembre) : elle
seule se redessinait entièrement à chaque frappe dans la recherche. Les autres
gardent le leur en ligne — leurs appelants passent des fonctions recréées à
chaque rendu, une mémoïsation intérieure n'y changerait rien.

### 2.2 À faire par toi, sur le NAS

~~**Régénérer la clé d'API Grocy.**~~ **Fait** — le propriétaire l'a confirmé le
18 septembre 2026. L'ancienne avait été collée dans une conversation le
15 septembre et était à considérer comme publiée.

**Sortir les sauvegardes du NAS — constat d'audit 02#8.** Base et sauvegardes
vivent toutes deux sur `/volume1` : une panne de volume, un rançongiciel ou une
suppression du dossier `docker/` emporte les deux d'un coup. Aucune ligne de
code ne peut corriger cela — il faut une tâche DSM (Hyper Backup ou un `rsync`)
qui copie `/volume1/docker/sauvegardes-fitcarnet` **ailleurs**. Puis, une fois :
reprendre le dernier `.dump` **depuis la destination** et le relire avec
`./restaurer-nas.sh --essai`. Le détail est dans `DEPLOIEMENT.md`, section
« Ce que ces sauvegardes NE protègent pas ».

### 2.3 Avant de tourner la démonstration

Tout le dossier est écrit (`presentation/demonstration.md`, un seul point
d'entrée : `./presentation/preparer-demonstration.sh`). **Trois arbitrages
d'abord** — chacun ferait tourner une prise pour rien :

| Point | Le problème | Les deux issues |
|---|---|---|
| **Le bandeau « Fibres inconnues »** | Le plan 4.1 de la bobine 4 et la slide 06 le montrent, mais `jeu-essai.sql` renseigne les fibres de ses huit aliments : il ne peut pas apparaître (`planCalcule.ts` exige un aliment aux fibres inconnues). | Un féculent du jeu aux fibres `NULL`, ou retirer le bandeau du plan et de la slide. |
| **Les habitudes de cuisson du compte de démonstration** | Aucun fichier ne les pose, et `presentation/tournage/capturer.mjs` clique « se mangent tels quels » : sur un compte neuf, la capture du batch cooking sort sans fournée. | `jeu-demo.sql` pose des habitudes, ou le script de capture les choisit. |
| **La tuile d'audit de la slide** | ~~« 61 / 79 clos »~~ — **tranché** : `construire.py:397` affiche « **78 / 79** clos · 1 ouvert (02#8, hors dépôt) ». Le seul constat encore ouvert est une tâche DSM qui ne vit pas dans le dépôt. | Réglé ; la tuile dit le vrai chiffre. |

Ensuite, dans l'ordre de `demonstration.md` (partie I) :

1. Créer les **deux comptes de démonstration en production** — un ordinaire,
   un administrateur (sans lui, les bobines 1 et 8 sont impossibles).
2. Y charger le jeu de données **en deux temps** : `jeu-essai.sql` (le frigo :
   8 aliments, 8 lignes de stock dont 6 garnies) puis `jeu-demo.sql`
   (l'histoire : 23 séances, 123 séries, 2 plans, 4 cibles). Toujours avec
   `psql -v ON_ERROR_STOP=1`, et **relire l'adresse dans les `sed`** :
   `jeu-demo.sql` efface avant de poser. La remise à zéro entre deux bobines
   se fait avec `-v ecraser=oui`.
3. Tourner les **huit bobines** avec scrcpy, **installé sur Windows** (WSL2 n'a
   aucun accès USB).
4. Remonter la vidéo à partir des prises.

La source Grocy n'est tournable que si `GROCY_URL` est renseigné sur
l'instance filmée. Sur la base de dev **du premier poste**, deux comptes
jetables servent aux captures (`demo-verif@test.local`,
`demo-admin-verif@test.local`) : les retirer une fois les captures refaites.

### 2.4 Les fermetures d'audit, et ce qu'elles ont coûté

Vérifiés un par un le 17 septembre 2026. Aucun critique, aucun élevé. La
preuve de chacun (fichier et ligne) est dans
[docs/audit-2026-09/README.md](docs/audit-2026-09/README.md), section « Ce qui
reste ouvert » ; le constat complet, dans le rapport indiqué (`02` = données et
infrastructure, `03` = front, `04` = tests et qualité).

**Les quatre arbitrages sont rendus, et les quatre sont en place** (18 septembre 2026). Les trois premiers tiennent en un tableau ; M5 a demandé une journée et sa propre section, juste après :

| Constat | Gravité | Ce qui retient |
|---|---|---|
| ~~**02#13**~~ | faible | **tranché le 18 septembre 2026 : rotation seule.** `json-file`, 10 Mo × 3, sur les trois services. Les limites CPU/mémoire sont refusées tant qu'aucune mesure ne les fonde |
| ~~**02#15**~~ | faible | **tranché le 18 septembre 2026 : gardé, et écrit** dans `compose.dev.yml` |
| ~~**02#17**~~ | faible | **tranché et fait le 18 septembre 2026** : `app:invitations:purger`, rétention 30 jours, jouée à chaque démarrage ; les **orphelines** (compte supprimé) partent sans délai ; bouton « Renvoyer un lien » sur l'écran d'administration |

**M5 est fait — 18 septembre 2026.** Sur le web, le coffre retombait sur
`localStorage` : le JWT **et** le jeton de rafraîchissement y étaient en clair,
lisibles par tout script de la page et persistants. Le rafraîchissement était le
plus exposé — il rouvre la session quatre-vingt-dix jours, là où le JWT expire en
une heure. C'était la seule chose du front qui, volée, donne un accès durable.

Ce qui limitait le risque : aucun contenu tiers dans la page, aucune publicité,
aucune bibliothèque chargée d'un CDN. Il aurait fallu une faille XSS **dans notre
propre code**. L'option « l'assumer par écrit » a été écartée au profit du
correctif.

Désormais, sur le web : le jeton de rafraîchissement n'arrive plus jusqu'au
JavaScript, il est dans un cookie `HttpOnly; SameSite=Strict; Path=/api` que
Symfony pose (`api/src/Service/CookieDeSession.php`) ; le JWT ne vit que dans une
variable de la page, et `amorcerSession()` en redemande un au cookie à chaque
chargement. **Sur Android rien ne change** : `expo-secure-store` s'adosse au
trousseau du système, et le client *déclare* son mode au serveur au lieu que
celui-ci le devine.

Trois choses à savoir :

- **`Secure` n'est pas écrit en dur** : `Response::prepare()` le pose d'après le
  schéma de la requête. HTTPS en production, pas en développement sur
  `http://localhost` — où un cookie `Secure` serait simplement jeté.
- **`nelmio_cors` active `allow_credentials`**, pour le seul développement
  (`expo start --web` sur `:8081`, l'API sur `:8080`). En production tout est sur
  la même origine. Conséquence : `CORS_ALLOW_ORIGIN` n'est plus une ligne
  anodine — l'élargir laisserait désormais un site tiers agir **avec le cookie**.
- **La bascule ne déconnecte personne** : un navigateur qui porte encore
  l'ancien jeton dans `localStorage` l'envoie une dernière fois, reçoit un
  cookie, et le `localStorage` est effacé au premier démarrage qui suit la mise
  à jour — même si la personne ne se reconnecte jamais.

**Ce que ça coûte, et on l'assume :** sur le web, le démarrage dépend désormais
d'un aller-retour avec le serveur. API éteinte ou lente, l'écran de chargement
dure jusqu'à trente secondes (le délai de garde de `client.ts`) avant que l'écran
de connexion n'apparaisse. On a écarté la parade évidente — rendre la main plus
tôt et laisser la session s'ouvrir derrière — parce que `connexion.tsx` ne
redirige pas quand la session s'ouvre toute seule : la personne resterait plantée
sur l'écran de connexion **en étant connectée**. À reprendre le jour où cet écran
saura s'effacer.

Preuve : `CookieDeSessionTest` (17 tests), six tests de `renouvellement.test.ts`
sur le mode cookie, les cinq chemins vérifiés à `curl` (web, natif, bascule,
déconnexion, cookie révoqué), et un parcours Chromium complet — `localStorage`
vide après connexion, cookie `HttpOnly` invisible de `document.cookie`, session
qui survit au rechargement, déconnexion qui emporte le cookie.

**Celui qui n'avait jamais été tranché est tranché :**

| Constat | Gravité | En une phrase |
|---|---|---|
| ~~**03 M13**~~ | moyenne | **Clos le 18 septembre 2026** : `noUncheckedIndexedAccess` est à `true`. 47 erreurs révélées, 0 restante, **aucun `!` ni `as` ajouté**. Le cœur du sujet était `algebre.ts` (22 erreurs) : une case absente y est désormais un **refus franc** (`ligneDe`/`caseDe` lèvent), jamais un `?? 0` — un zéro inventé dans une élimination de Gauss ne fait pas échouer le calcul, il le fait réussir sur un autre système, et rend des grammes à peser (règle 7). |

Pour les reprendre : un constat, un test rouge, un correctif, un commit ; puis
mettre à jour son statut dans le rapport et dans le README de l'audit.

### 2.5 Confort, dette connue, et ce qui attend un avis

| Quoi | Détail | Effort |
|---|---|---|
| **Table des paliers du 1RM** | Tranchée le 15 septembre (zone 70-90 %, pas de 2,5 %), mais trois points restent à ton avis : 95 % et 100 % retirés ; échauffement à 60/50/40 sans granularité fine ; sous 10 kg de 1RM, une ligne fusionnée peut perdre une prédiction juste à cause d'un voisin hors domaine. | à trancher |
| **Publier un exercice depuis l'administration** | `Exercice.public` n'est écrit par personne : aucun mécanisme de publication n'existe. L'ouvrir aux seuls administrateurs est la proposition « C » de la revue. | à trancher |
| **`choixRatio.tsx`** | dernier morceau du lot 6 ; il appartient à `editeurAliment.tsx`. | 1 h |
| **Le câblage des hooks React** | reste du lot 7 ; `@testing-library/react` est installé, la porte est ouverte. | ~4 h |
| **Extraire `LigneAliment` de `carteRepas.tsx`** | pour tester le composant comme `calcul/poidsServi.ts` l'est déjà. | 1 h |
| **Un second `tsconfig` pour les tests de rendu** | rendrait aux tests ordinaires la garde « pas d'import de `.tsx` ». | 1 h |
| **Les hooks de `.claude/settings.json`** | appellent graphify par un chemin absolu (`/home/micka/.local/bin/graphify`) : vrai sur les deux postes, faux sur un troisième. Non modifié. | 5 min |
| **Le graphe sémantique** | `graphify update .` est à jour pour le code ; la partie tirée des documents demande `/graphify . --update` (consomme des tokens ; `api/src` en fait partie, voir `CLAUDE.md`). | ~30 min |
| **`presentation/features.md`** | « ~288 capacités », inventaire du 14 septembre. **Mesuré le 19 septembre : ~80 renvois `fichier:ligne` tombent HORS de leur fichier** — `composer.ts` est passé de 827 à 135 lignes et `cuisson.ts` à 22 (barils de ré-export du 15 septembre), `repas.tsx` en a 667 pour des renvois jusqu'à `:2262`. Ce n'est plus « périmé par endroits », c'est un inventaire qu'on ne peut plus suivre. | 2 h |
| **Un troisième juge sans garde-fou : le 1RM** | `0.0333` et le plafond de 15 répétitions sont écrits DEUX fois — `front/src/calcul/performance.ts:31` et `api/src/Entity/SeanceExercice.php:126` — sans le dispositif qui protège les deux autres doubles juges. `RmEstimeTest.php` ne lit aucun fichier de règles et n'éprouve que le PHP : déplacer le plafond côté front laisse les deux suites vertes pendant que l'API expose un autre `rmEstime` dans `seance:lire`. C'est le constat E1 qui redevient possible. **Il manque `api/regles/rm.json`**, sur le modèle de `motdepasse.json` et `rendement.json`. Relevé le 19 septembre 2026. | 1 h |
| **Les renvois `fichier:ligne` de tout le corpus** | un balayage n'attrape que ceux qui pointent au-delà de la dernière ligne. Les **décalages silencieux** — un renvoi qui tombe dans le fichier, mais sur autre chose — ne se voient qu'à la lecture. Dix ont été trouvés dans `fonctionnalite-compte` le 19 septembre, dont un qui désignait un 422 pour un autre. Il en reste ~1 170 non relus. | au fil de l'eau |
| **Le réseau sortant des conteneurs** | constaté cassé le 9 septembre sur le poste d'alors (NAT Docker sous WSL2 : `composer install` impossible dans le conteneur). Non revérifié depuis. | à vérifier |

**Laissés en l'état, en connaissance de cause** — à reprendre seulement si le
besoin se présente :

- Un champ **connu mais non inscriptible** est ignoré en silence
  (`"utilisateur": …` dans un `POST /api/aliments` reçoit 201, sans effet ni
  fuite). Le refuser casserait les écrans qui renvoient `id` et `creeLe` —
  c'est l'échec de `allow_extra_attributes: false`, le 15 septembre.
- « J'ai cuisiné » dit « plus dans ton frigo » d'un aliment qui n'y a jamais
  été (plan qui cite l'aliment d'un autre compte). Libellé inexact.
- Les dates ne sortent pas toutes sous la même forme (`+02:00` dans la réponse
  de « J'ai cuisiné », `+00:00` à la relecture). L'instant est le même.
- `GET /api/utilisateurs/{id}` d'un autre compte rend 403 et non 404 : on
  apprend qu'un UUID existe. Un UUID v4 ne se devine pas.
- Un décalage d'affichage d'environ 13 px dans l'éditeur d'aliment après une
  saisie (Chromium, 1280×900). Origine non recherchée.

### 2.6 Mots de passe : durcis, et changeables par leur propriétaire (18 septembre 2026)

**Ce qui a changé.** La règle passe de « dix caractères » à **douze caractères,
une minuscule, une majuscule, un chiffre et un caractère spécial**. Le code
argumentait contre les règles de composition ; le propriétaire du projet a
tranché dans l'autre sens, et l'argument n'a pas été jeté : la longueur minimale
monte **en même temps** que les exigences arrivent, parce qu'une composition
imposée réduit l'aléatoire et que la longueur le rend.

**Un seul endroit décide**, `api/regles/motdepasse.json`, lu par les deux suites
de tests. Les trois portes de l'API (invitation, `PATCH` d'un compte, commande
console) passent par `App\Service\MotDePasse` ; le front a son jumeau assumé
(`front/src/calcul/motDePasse.ts`) parce que la jauge doit répondre pendant la
frappe.

**Chacun change son mot de passe** : `front/app/mot-de-passe.tsx`, depuis
l'onglet Compte. Mot de passe actuel exigé, nouveau tapé deux fois, jauge qui
nomme ce qui manque.

**Les comptes existants ne sont pas touchés**, et c'est la décision : personne ne
se retrouve dehors un matin. Ceux dont le mot de passe ne passerait plus sont
**signalés sur TOUS les écrans** par une ligne fine en haut, cliquable — et non
plus seulement sur l'onglet Compte, où l'on ne va que pour se déconnecter :
quelqu'un pouvait ne jamais l'apprendre, et donc ne jamais changer son mot de
passe. La carte détaillée reste sur l'onglet Compte. Le drapeau
`utilisateur.mot_de_passe_faible` (migration 38) est posé **à la connexion**,
seul instant où le serveur tient le mot de passe en clair : une empreinte ne se
relit pas pour savoir si elle contenait une majuscule.

**À SAVOIR AVANT D'ÉPROUVER, ET ÇA A PIÉGÉ DEUX FOIS** : le drapeau est
**recalculé à chaque connexion**. Le poser à la main en base puis se
reconnecter le remet donc à `false` aussitôt, et on croit que le bandeau ne
marche pas. Pour l'éprouver, deux façons — un compte dont le mot de passe est
*réellement* faible (le vrai chemin), ou poser le drapeau **sans se
reconnecter**, en sachant que `/api/moi` reste en cache une minute
(`staleTime`). Dans l'usage réel il n'y a aucun délai : le cache est purgé
avant la connexion, donc `/moi` est relu neuf juste après.

Un changement réussi **révoque toutes les sessions du compte, y compris celle
qui le fait**. C'est délibéré — un jeton de
rafraîchissement volé ne doit pas survivre au changement qu'il a motivé —, et
l'écran l'annonce au lieu de l'infliger.

**Ce qui n'est couvert par aucun test automatique** : l'enchaînement des trois
champs, la désactivation du bouton et le panneau de déconnexion vivent dans
`front/app/`, que `tsconfig.tests.json` ne compile pas. Les règles, elles, sont
couvertes. Rendre l'écran testable demanderait d'extraire sa décision vers
`src/` (un `peutChanger({ actuel, nouveau, confirmation })` et son `.test.ts`) —
c'est le levier du lot 6, non ouvert. En attendant, le parcours a été **éprouvé
dans Chromium de bout en bout** : bandeau, jauge nommant les quatre manques,
non-concordance, changement, déconnexion, reconnexion, bandeau disparu.

**ET CE TROU A COÛTÉ UN ÉCRAN BLANC LE 19 SEPTEMBRE, le jour même.** En
corrigeant l'enchaînement des champs de `front/app/invitation/[jeton].tsx`, deux
`useRef` ont été posés **après** les retours anticipés de l'écran. React exige
que tous les hooks soient appelés à chaque rendu : le lien expiré s'affichait
parfaitement, le lien **valable** ne rendait plus rien — pas un champ, page
blanche. `tsc` compile, les 680 tests restent verts, et l'écran d'entrée de tout
nouvel arrivant était mort. Vu par un script Playwright ouvrant l'URL avec un
vrai jeton ; le diagnostic est venu d'un écouteur `pageerror`, sans quoi on ne
lit qu'un délai dépassé qui ne dit rien. Le piège est écrit dans la skill
`front-fitcarnet` : **tous les hooks en haut, avant le premier `return`.**

---

### 2.7 Deux refontes proposées par les revues, et repoussées

Le **18** septembre 2026, deux confrontations à la documentation officielle (par
le MCP context7, **depuis la session principale** — `1e3a47d`, 20 h 40) ont
proposé des changements de structure côté front. *Ce paragraphe a porté « le
19 septembre » et « agent `revue-pile` » pendant quelques heures le 19 : c'était
faux deux fois, l'agent n'étant né qu'à 1 h 21 cette nuit-là (`b4a5cc0`) et sa
seule trouvaille front étant le `submitBehavior` de `Champ` (`6f5eb7f`).* **Aucun des
deux n'est un défaut** : le code marche et ses raisons sont écrites. Ils sont
notés ici pour ne pas être re-découverts, et pour que la décision de les
repousser soit lisible.

- **`Stack.Protected` à la place du portier par `useEffect`** (`front/app/_layout.tsx`).
  C'est le patron que documente aujourd'hui expo-router, et **il est bien
  présent dans le `node_modules` du projet** (expo-router 6.0.24). Il ferait
  disparaître le cycle de rendu fantôme que la garde de rendu masque
  actuellement, et nettoierait l'historique lui-même.
  *Ce qui retient* : son `guard` est un **booléen**, alors que `useConnecte`
  rend **trois** valeurs — `null` veut dire « je ne sais pas encore », et c'est
  la décision la mieux argumentée de `session.ts`. Le patron documenté pour ça
  est un `SplashScreenController` qui retient l'écran de lancement. Ce n'est
  donc pas un remplacement d'une ligne, c'est un chantier sur le chemin par
  lequel tout le monde entre.
- **Un `SessionProvider` React à la place de l'état de module** (`client.ts`).
  Même remarque : le résultat actuel est correct, éprouvé et mieux documenté
  que la plupart des `SessionProvider`. Le seul reproche est structurel — un
  état de session hors de React est invisible des outils de développement.

**Les deux se refondent ensemble.** Ne pas en faire un sans l'autre.

Deux autres points relevés et **assumés tels quels** :

- `refetchIntervalInBackground: true` (`front/src/api/hooks/frigo.ts`) **n'a
  aucun effet sur Android** : TanStack demande de câbler `AppState` sur son
  `focusManager`, ce que le projet ne fait pas. La ligne reste juste sur le
  web ; c'est son commentaire qui promet plus qu'il ne tient.
- Sur le web, le **cache** (`fitcarnet-cache-v1`) est dans `localStorage` et
  survit à la fermeture de l'onglet — nom, adresse, séances, frigo. M5 ne
  concernait que les **jetons** ; le reste est purgé à la connexion, à la
  déconnexion et à la fin de session, jamais à la fermeture.

---

## 3. Les décisions en vigueur — ne pas les rouvrir sans raison

- **Aucun SQL dans `src/Controller/`** (18 septembre 2026). Il vit dans
  `src/Repository/` — `CuissonsHabituelles`, `Comptes`, `Invitations` — avec les
  transactions qui l'accompagnent. Un contrôleur lit la requête, appelle,
  répond. C'est ce que montre la documentation Symfony 7.4 (consultée par
  context7) : du SQL brut, oui, mais dans un dépôt. Les trois dépôts ont été
  écrits **test d'abord**, et ces tests tiennent ce que le SQL portait sans le
  dire : l'ordre de suppression d'un compte, l'upsert des habitudes, et le fait
  que la liste des invitations ne sélectionne jamais l'empreinte d'un jeton.
- **La propriété d'un objet se demande au voter** `EstLeProprietaire` (attribut
  `MIEN`), pas à une comparaison écrite sur place. Il vaut pour toute entité
  `ProprieteUtilisateur`. **Les `#[IsGranted('ROLE_…')]` restent** : un rôle se
  vérifie ainsi ; un voter sert quand la décision porte sur un objet. Et il ne
  change pas la réponse — 404 dans les deux cas, « n'existe pas » et « pas à
  toi », pour ne pas apprendre à un inconnu quels identifiants existent.
- **Pousser, c'est déployer.** La tâche planifiée du NAS tire Gitea toutes les
  5 minutes. Avant un push qui touche au schéma : `sauvegarde-nas.sh` à la
  main (la sauvegarde automatique date de 4 h). Voir `DEPLOIEMENT.md`.
- **Chaque aliment appartient à un compte** (17 septembre 2026). Pas
  d'aliment commun, partagé ni « de référence » ; une base neuve n'en sème
  aucun. Conception : `docs/superpowers/specs/2026-09-17-aliments-tous-personnels-design.md`.
- **On repart sur une base saine** (17 septembre) : aucun utilisateur réel hors
  l'administrateur ; les sauvegardes d'avant le passage n'ont pas à rester
  restaurables telles quelles.
- **Les dates sont corrigées pour l'avenir seulement** (17 septembre). Les
  lignes écrites par l'API avant cette date gardent leur décalage d'une ou deux
  heures : rien ne distingue, ligne à ligne, ce que l'API a écrit de ce que la
  base a posé.
- **Il n'y a pas d'export « catalogue »** (`sauvegarde.sh --catalogue`,
  supprimé le 17 septembre) : le seul format de sauvegarde est le `.dump`, et
  restaurer la production, c'est `restaurer-nas.sh`.
- **Le stock s'écrit par `/api/mon-frigo`**, jamais par `/api/stocks`, qui est
  en lecture seule.
- **Le partage de modèle n'existe pas** (15 septembre) : il ne doit pas être
  possible dans l'application.
- **Les exercices** : catalogue commun, règle « public OU le mien » ; l'auteur
  corrige le sien, l'administrateur tous. Supprimer un compte emporte ses
  exercices personnels que plus personne ne cite.
- **L'architecture hexagonale** est un objectif assumé, **non commencé** ; elle
  ne se mélange jamais à une correction de bug dans un même commit.
- **Le TDD n'a pas d'exception** : le test échoue d'abord ; s'il passe du
  premier coup, on remet le code fautif pour le voir tomber.
- **Une seule arborescence par poste**, en terminal ; jamais de copie Windows
  (Claude Cowork refuse les chemins WSL, et deux copies ont produit le bug C1).
- **Les vérificateurs tournent sur `postgres:16`**, pas sur l'alpine : on adapte
  la machine (`docker pull postgres:16`), pas les scripts.
- **Keycloak a été supprimé** à la demande du propriétaire : ne jamais le
  relancer ni le réinstaller.
- **`presentation/fonctionnalites-par-onglet.md`** est la référence du besoin,
  écrite par le propriétaire : ne jamais la modifier.
- **graphify oriente, il ne remplace pas `grep`.**

---

## 4. Les pièges vérifiés, qui reviendront

- **Le développement ne rejoue jamais `db/manuel/`** : `compose.dev.yml` ne
  monte `./db` qu'à la création du volume. Sans `rattraper-dev.sh` après un
  pull, l'API répond 500 — le 15 septembre, dès la connexion, avec 750 tests
  verts.
- **Le glob des migrations s'arrête à `3[0-9]`** et vit dans **cinq** fichiers :
  `installer.sh`, `docker/entrypoint-prod.sh`, `db/manuel/verifier-migrations.sh`,
  `db/manuel/verifier-schema.sh`, `db/manuel/rattraper-dev.sh`. Une migration 40
  ne serait jouée nulle part.
- **`api/front` est un doublon de `front/dist`**, servi en dev, ignoré par git,
  et il périme en silence : après `npm run build:web`, faire
  `rm -rf api/front && cp -r front/dist api/front`.
- **Un test posé dans `front/app/` n'est jamais exécuté** : le motif de
  `tsconfig.tests.json` ne couvre que `src/`.
- **`npm test` exige Node 22** ; sous Node 20, l'erreur ne parle pas de version.
- **PHPUnit se lance dans le conteneur** : le PHP de l'hôte n'a ni `dom`, ni
  `mbstring`, ni `xmlwriter`.
- **Les commandes `psql` qui jouent un fichier portent `-v ON_ERROR_STOP=1`** :
  sans lui, une erreur s'affiche puis psql continue et sort en 0.
- **`Table_Ciqual_2025.xlsx` n'est pas versionnée** : la télécharger sur
  ciqual.anses.fr pour revérifier un chiffre.
- **`bin/console` exige `api/.env`**, et les clés JWT ne sont pas dans le dépôt
  (`bin/console lexik:jwt:generate-keypair --skip-if-exists`).
- **Si `fitcarnet-app-dev` tourne sans port publié**, un autre conteneur tenait
  le 8080 à sa création : libérer le port, puis
  `docker compose -f compose.dev.yml up -d --force-recreate app`.
- **Un plugin déclaré peut manquer sans un mot** : `installer-outils.sh` doit
  afficher « 5/5 plugins installés ».
- **Les scripts de la racine ne se lancent jamais « pour voir »** :
  `installer.sh`, `restaurer-nas.sh`, `deployer-nas.sh`, `publier*.sh`,
  `sauvegarde-nas.sh`.

---

## 5. Où trouver le reste

| Document | Ce qu'on y trouve |
|---|---|
| [CLAUDE.md](CLAUDE.md) | les sept règles non négociables, l'aiguillage des skills et des agents |
| [DEPLOIEMENT.md](DEPLOIEMENT.md) | publier, déployer, sauvegarder, restaurer |
| [NOUVELLE-MACHINE.md](NOUVELLE-MACHINE.md) | monter un poste de zéro |
| [docs/audit-2026-09/](docs/audit-2026-09/README.md) | les 79 constats, leur statut daté, la preuve de chaque constat ouvert |
| [presentation/demonstration.md](presentation/demonstration.md) | la démonstration : jeu de données, comptes, huit bobines, montage |
| [docs/journal-2026-09.md](docs/journal-2026-09.md) | l'ancien journal, archivé : l'histoire détaillée du 7 au 17 septembre |
| `docs/superpowers/` | la conception et le plan du chantier « aliments par compte » |

---

## 6. En repartant

1. Mettre à jour ce fichier : cocher ce qui est fait, ajouter ce qui a été
   décidé ou découvert. Le prochain à ouvrir le projet n'aura que ce qui est
   écrit.
2. `graphify update .`
3. Pousser — **c'est déployer**.
