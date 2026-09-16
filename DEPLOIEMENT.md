# Déploiement

```bash
./publier.sh "ce qui change"
```

Une commande. L'API, le site web et les téléphones. Le reste de ce document
explique ce qu'elle fait, ce qu'il a fallu poser **une seule fois** pour
qu'elle marche, et les deux cas où elle ne suffit pas.

---

## Il y a TROIS chemins, pas un

C'est la seule chose à retenir, et c'est ce qui rend `publier.sh` nécessaire.

| Ce qui change | Par où ça passe | Qui le déclenche |
|---|---|---|
| **API Symfony** | `git push` → le NAS tire et redémarre | tâche planifiée, toutes les 5 min |
| **Site web** (`carnet.mickael-pol.fr`) | `npm run build:web` → `front/dist` versionné → même `git push` | idem |
| **JavaScript de l'app Android** | `eas update` → **serveurs d'Expo** | toi, à la main |
| **Code natif de l'app Android** | nouvel APK déposé sur le NAS | toi, quelques fois par an |

**Le NAS ne met pas à jour les téléphones.** Il ne le peut pas : une
application installée n'interroge pas ton serveur, elle interroge celui
d'Expo. Un `git push` ne touche **aucun** téléphone. C'est le piège de ce
dispositif, et `publier.sh` existe pour que tu n'aies jamais à y penser.

---

## `publier.sh`

```bash
./publier.sh "correction du calcul des fibres"
./publier.sh "…" --sans-mobile      # rien pour les téléphones
./publier.sh "…" --sans-web         # pas de reconstruction du front
./publier.sh "…" --nas root@nas     # déploie tout de suite au lieu d'attendre
```

Quatre étapes : les tests du front, `npm run build:web`, `commit` + `push`,
`eas update`.

**Il refuse de publier du JavaScript quand du code natif a changé.** Si
`front/package.json` bouge, ou les greffons et blocs `android`/`ios` de
`app.json`, il s'arrête et t'envoie sur `publier-android.sh`. La raison n'est
pas cosmétique : du JavaScript qui appelle un module natif absent fait planter
l'application **au démarrage**, sur tous les téléphones — et une application
qui ne démarre plus ne peut plus recevoir le correctif. Il faut alors passer
chez chacun avec un APK.

**Il refuse aussi si `updates.url` manque dans `app.json`.** Sans cette
adresse, `eas update` publie dans le vide : la commande réussit, affiche un
identifiant, et aucun téléphone ne voit jamais rien.

---

## Ce que tu fais toi-même, quand même

**Le build web est dans le script**, mais si tu pousses à la main, ne
l'oublie pas :

```bash
cd front && npm run build:web && cd ..
```

`front/dist` est versionné — volontairement. L'image de production n'a pas
Node : l'y ajouter reviendrait à embarquer un compilateur JavaScript pour
regénérer, à chaque démarrage, des fichiers qui ne changent qu'au moment où
l'on pousse. Le prix est un gros diff à chaque déploiement, illisible mais
inoffensif. Un front absent en production, lui, ne se voit qu'une fois la
stack démarrée.

---

## Le NAS

### Pourquoi pas une stack Git Portainer

J'avais écrit cette stack en chemins relatifs — `./api`, `./db` — en comptant
sur Portainer pour les résoudre dans son clone. Ça ne marche pas en édition
**CE** : Portainer clone à l'intérieur de son propre conteneur, dans
`/data/compose/<id>/`, un chemin que le démon Docker du NAS ne voit pas.

```
Bind mount failed: '/data/compose/45/db' does not exist
```

Résoudre les chemins relatifs d'une stack Git est une fonction de l'édition
**Business**. On ne la contourne pas : on arrête de s'en servir. Le code
arrive par un **vrai clone git** à `/volume1/docker/fitcarnet`, que le démon
voit ; `docker-compose.yml` n'utilise que des chemins absolus ; et
`deployer-nas.sh` fait le `pull` puis le `up`. Portainer reste utilisable pour
regarder les conteneurs et lire les journaux — il ne possède plus la stack.

### `deployer-nas.sh`

```bash
./deployer-nas.sh --etat     # dit où on en est, ne touche à rien
./deployer-nas.sh            # déploie si le dépôt a bougé
./deployer-nas.sh --force    # redéploie quand même
```

**Il redémarre `fitcarnet-app` à chaque déploiement, systématiquement.** Ce
n'est pas du confort : `docker compose up -d` ne recrée un conteneur que si sa
*configuration* change, or presque tout ce qu'on déploie arrive par des
montages — `api/`, `docker/Caddyfile`, `front/dist`, `telecharger/`. Un push
qui ne touche qu'au code laissait donc le conteneur intact, et compose
annonçait fièrement que tout était à jour. Sans redémarrage, **le point
d'entrée ne rejoue ni les migrations ni le cache Symfony** : une migration
poussée n'est jamais appliquée, et la panne n'apparaît que plus tard, sur une
colonne absente.

**Il se relance quand il vient d'être modifié.** `sh` lit un script au fur et
à mesure, en retenant sa position ; un `git pull` qui le réécrit pendant qu'il
tourne décale tout ce qui suit. Au mieux l'ancienne version finit
tranquillement — c'est arrivé, et on a cru que le correctif n'avait pas pris.
Au pire `sh` reprend sa lecture au milieu d'une ligne.

**Un verrou**, en `mkdir` — atomique partout, contrairement à `flock`. Deux
`docker compose up --build` en parallèle laissent une production dans un état
que personne ne sait décrire.

**`merge --ff-only`.** Il refuse de fusionner. Si la production a divergé,
c'est que quelqu'un a commité directement sur le NAS ; un merge automatique
fabriquerait un état qui n'existe dans aucun dépôt.

**Il regarde après.** `up -d` rend la main dès que Docker a *lancé* les
conteneurs, pas quand l'application répond. Le script attend quinze secondes,
cherche les conteneurs `fitcarnet-*` arrêtés, et recopie leurs trente
dernières lignes de journal avant d'échouer.

Journal : `/volume1/docker/fitcarnet/deploiement.log`.

### `sauvegarde-nas.sh`

Tous les jours à 4 h, quatorze conservées, dans
`/volume1/docker/sauvegardes-fitcarnet` — **hors du clone git**, pour qu'un
`git clean` ne puisse jamais les emporter.

Il écrit d'abord un `.partiel` : une redirection `>` crée le fichier *avant*
de savoir si `pg_dump` réussit, et un échec laisse un `.dump` de zéro octet
avec la bonne date et le bon nom, qui ressemble à une sauvegarde jusqu'au jour
où on en a besoin. Il vérifie ensuite la taille, puis **relit l'archive avec
`pg_restore --list`** : une sauvegarde qu'on n'a jamais essayé d'ouvrir n'est
pas une sauvegarde, c'est un espoir.

```bash
./sauvegarde-nas.sh --lister
```

Pour restaurer, la marche à suivre est en commentaire à la fin du script.

---

## À faire une seule fois

### 1. Le jeton Gitea

*Paramètres → Applications → Générer un nouveau jeton*, portée **repository:
read** uniquement. Il finira en clair dans `.git/config` sur le NAS : autant
qu'il ne puisse rien faire d'autre que lire ce dépôt.

### 2. Le clone, sur le NAS

DSM n'a pas `git`. Ne l'installe pas par Entware — ça survit mal aux mises à
jour de DSM ; `deployer-nas.sh` bascule tout seul sur une image Docker quand
la commande manque. Pour l'installation, fais pareil :

```bash
sudo -i
GIT="docker run --rm -v /volume1/docker/fitcarnet:/git -w /git alpine/git"

mkdir -p /volume1/docker/fitcarnet
$GIT init
$GIT remote add origin https://JETON@gitea.mickael-pol.fr/mickael/fitcarnet.git
$GIT fetch origin master
$GIT checkout -f -B master origin/master
chmod 600 /volume1/docker/fitcarnet/.git/config
```

`git clone` refuse un dossier non vide, et celui-ci contient déjà `pgdata/` et
`telecharger/` — d'où ces quatre gestes plutôt qu'un seul. Le `checkout -f`
écrase les copies manuelles de `api/`, `db/`, `docker/`, `front/`. Il ne
touche ni à `pgdata/`, ni à `.env`, ni à l'APK : git ne connaît pas ces
fichiers.

### 3. Les secrets, dans `.env`

Un seul fichier, sur le NAS, jamais dans le dépôt :

```bash
sudo sh -c 'umask 077; cat > /volume1/docker/fitcarnet/.env <<EOF
DB_PASSWORD=…
APP_SECRET=$(openssl rand -hex 32)
JWT_PASSPHRASE=$(openssl rand -hex 32)
GROCY_URL=https://grocy.mickael-pol.fr
GROCY_API_KEY=…
EOF'
```

| Variable | Ce que c'est |
|---|---|
| `DB_PASSWORD` | **Fixé à la création du volume PostgreSQL.** Sur une base qui existe déjà, le changer ne fait que casser la connexion — il faut remettre l'ancien, ou réaligner le rôle : `ALTER USER fitcarnet WITH PASSWORD '…'` par le socket local, qui est en `trust`. |
| `APP_SECRET` | secret Symfony. Le changer invalide les cookies signés, sans plus. |
| `JWT_PASSPHRASE` | protège la clé privée JWT. **La changer déconnecte tout le monde** et rend les clés existantes illisibles. |
| `GROCY_URL`, `GROCY_API_KEY` | facultatifs. Vides, l'application le détecte et l'explique. |

`deployer-nas.sh` refuse de déployer si le fichier manque ou si une des trois
premières clés est vide — et il refuse **avant** le `git pull`, pas au milieu.

> **Un piège qu'on a payé.** Le socket local de PostgreSQL est en `trust` :
> une connexion par `127.0.0.1` réussit **sans vérifier le mot de passe**.
> Tester une clé par là ne prouve rien. Le conteneur applicatif, lui, arrive
> par le réseau Docker, où la règle est `scram-sha-256`.

### 4. Le premier déploiement

```bash
chmod +x /volume1/docker/fitcarnet/deployer-nas.sh
/volume1/docker/fitcarnet/deployer-nas.sh --force
```

`--force` parce que le clone est déjà au dernier commit : sans lui, le script
constate qu'il n'y a rien de neuf et sort.

### 5. Les deux tâches planifiées

*DSM → Panneau de configuration → Planificateur de tâches → Créer → Tâche
planifiée → Script défini par l'utilisateur.* Utilisateur **`root`** dans les
deux cas — il faut le démon Docker.

| Tâche | Planification | Commande |
|---|---|---|
| `fitcarnet — deploiement` | tous les jours, **toutes les 5 minutes** | `/volume1/docker/fitcarnet/deployer-nas.sh` |
| `fitcarnet — sauvegarde` | tous les jours à **04:00** | `/volume1/docker/fitcarnet/sauvegarde-nas.sh` |

Coche **« Envoyer les détails d'exécution uniquement lorsque le script se
termine anormalement »**. Le script de déploiement ne dit rien quand il n'y a
rien à faire ; s'il parle, c'est que quelque chose a cassé.

**Cinq minutes de latence, et c'est un choix.** Un webhook demanderait quelque
chose qui écoute en HTTP sur le NAS et qui a le droit de lancer Docker — une
pièce de plus à sécuriser, pour gagner quatre minutes. Quand tu es pressé :
`./publier.sh "…" --nas root@nas`.

### 6. `eas update:configure`

```bash
cd front && eas update:configure
```

Écrit `updates.url` dans `app.json` : l'adresse où l'application ira chercher
ses mises à jour. **Cette adresse doit être dans l'APK installé** — après
cette commande, il faut donc republier un APK une fois. Ensuite seulement les
mises à jour JavaScript arrivent toutes seules.

---

## Ce que le conteneur fait tout seul, à chaque démarrage

Voir `docker/entrypoint-prod.sh`. Quatre gestes, et **l'ordre est le sujet** :

1. **Dépendances PHP** — `composer install --no-dev`, et seulement si
   `composer.lock` a bougé. Une empreinte gardée dans `vendor/` évite de
   refaire trois minutes de travail à chaque redémarrage.
2. **Clés JWT** — générées au premier démarrage, jamais régénérées ensuite.
   Elles survivent aux `git pull` parce que git ne touche pas aux fichiers
   qu'il ne connaît pas. **Ne supprime jamais `api/config/jwt/` « pour
   repartir propre »** : tout le monde serait déconnecté.
3. **Migrations** — `db/manuel/`, dans l'ordre écrit à la main, jamais trié.
   PostgreSQL ne joue `db/` qu'à la création du volume ; tout ce qui vient
   après passe par là, et personne n'est sur le NAS pour le lancer.
4. **Cache Symfony** — **après** la base. Il fige le schéma et les routes : le
   chauffer avant reviendrait à mémoriser une base qui n'existe pas encore.

Le script s'arrête à la première erreur. Une application qui démarre sur des
migrations à moitié jouées est pire qu'une application qui ne démarre pas : la
seconde se voit tout de suite.

```bash
# ce qui s'est passé au dernier démarrage
docker logs fitcarnet-app | head -40
```

---

## Ce que ce dispositif ne fait pas

- **Il ne teste que si tu passes par `publier.sh`.** Un `git push` direct part
  en production sans qu'une seule ligne de test soit jouée. Le NAS ne teste
  rien : il tire, il redémarre.
- **Il ne sait pas revenir en arrière.** Revenir à la version d'avant, c'est
  `git revert` puis `git push` — un aller-retour complet, pas un bouton. Pour
  la base, en revanche, il y a quatorze sauvegardes, et la marche à suivre est
  en commentaire à la fin de `sauvegarde-nas.sh`.
- **Il ne sauvegarde pas avant de migrer.** La sauvegarde est quotidienne, à
  4 h. Une migration destructive poussée à 14 h s'appliquerait sur des données
  dont la dernière copie a dix heures. Avant un déploiement qui touche au
  schéma, lance `sauvegarde-nas.sh` à la main d'abord.
- **Il ne vérifie pas que le site répond.** Il vérifie que les conteneurs
  tournent, ce qui n'est pas la même chose.

Ces trous se bouchent le jour où ils font mal, pas avant.

---

# L'application Android

Deux mécanismes, et il faut les distinguer une fois pour toutes.

| Ce qui change | Comment ça arrive sur les téléphones |
|---|---|
| **JavaScript** — écrans, calculateur, solveur, textes. 90 % de ce que tu fais. | `eas update`. **Automatique et invisible**, au démarrage suivant. Personne ne touche à rien. |
| **Natif** — un module ajouté, une permission, une sonnerie embarquée, une montée d'Expo SDK. Quelques fois par an. | Nouvel APK, et **un appui sur « Installer »** par téléphone. |

Ce second cas n'est pas un manque de ce projet : **Android interdit à une
application d'en installer une autre sans confirmation**. C'est une protection
du système. Le seul moyen de s'en passer serait le Play Store, qui met à jour
tout seul — 25 $ une fois, si un jour l'appui devient pesant.

## Comment les gens l'installent

Tu envoies **une adresse**, et rien d'autre :

```
https://carnet.mickael-pol.fr/telecharger/
```

`telecharger/index.html` est versionné et arrive par `git pull`. La page dit
les trois gestes qu'Android impose — l'avertissement « ce fichier peut être
dangereux », l'autorisation de la source, puis Installer — parce que c'est
exactement là que quelqu'un abandonne : le téléchargement réussit, l'appui sur
le fichier ne donne rien, et personne ne comprend pourquoi.

Elle porte aussi un QR code, pour passer d'un ordinateur à un téléphone, et la
marche à suivre iPhone : pas d'APK, on épingle le site sur l'écran d'accueil.

> **Le Caddyfile utilisait `handle` et pas `handle_path`.** `handle` ne retire
> pas le préfixe de l'URL : avec `root * /telecharger`, une requête sur
> `/telecharger/fitcarnet.apk` allait chercher
> `/telecharger/telecharger/fitcarnet.apk`. 404 sur l'APK **et** sur
> `version.json` — donc aucune mise à jour jamais proposée, sans une ligne
> dans les journaux pour le dire.

## La première fois

```bash
cd front
npx expo install expo-updates expo-application expo-splash-screen

# Le paquet s'appelle `eas-cli`, la commande `eas`. `npx eas` cherche un
# paquet « eas » qui n'expose aucun exécutable, et npm répond « could not
# determine executable to run » — un message qui n'aide personne.
npm install -g eas-cli
eas login && eas init          # écrit l'identifiant de projet dans app.json
```

`eas init` ajoute `extra.eas.projectId` et l'URL des mises à jour dans
`app.json` : c'est ce qui relie tes `eas update` à ton application.

Tu récupères un APK, tu l'envoies aux téléphones concernés. C'est le seul
moment où il faut passer par un lien ou un câble.

## Les quatre profils de build

`eas.json` n'accepte aucune clé de son cru — pas de commentaire possible dans
ce fichier, il est validé strictement. La différence qui compte est donc ici.

| Profil | Ce que c'est | Quand |
|---|---|---|
| `local` | APK **autonome** qui parle au WSL (`192.168.1.118:8080`). Il embarque son JavaScript et se lance seul. | Vérifier l'icône, l'écran de lancement et le comportement réel avant que le NAS ne serve l'API. |
| `development` | **Client de développement** : il ne contient pas ton code, il le charge depuis Metro à chaque lancement. Tire `expo-dev-client`. | Développer du natif. **Inutilisable pour montrer l'application à quelqu'un** — il exige un serveur allumé sur ton poste. |
| `preview` | Autonome, pointé sur le NAS en HTTPS. | Essayer une version avant de la publier. |
| `production` | Idem, canal de mise à jour `production`. | Ce que les gens installent. |

## Ensuite, au quotidien

```bash
./publier.sh "ce qui change"
```

C'est `eas update --branch production` qui est lancé au bout, mais tu n'as pas
à t'en souvenir — et surtout, le site web et l'API partent dans le même geste.
Les téléphones prennent la mise à jour au démarrage suivant. Rien à annoncer,
rien à installer.

**`eas update` ne passe pas par le NAS.** Il publie sur les serveurs d'Expo,
que l'application interroge au lancement. Un `git push` seul ne touche aucun
téléphone : c'est la confusion la plus coûteuse de ce dispositif, parce que
tout a l'air d'avoir marché.

**`runtimeVersion` est réglé sur `appVersion`** : une mise à jour JavaScript
**refuse** de s'installer sur un APK dont la version ne correspond pas. C'est
le garde-fou qui empêche de pousser du code appelant un module natif absent —
sans lui, l'application planterait au démarrage sur les téléphones, et tu ne
pourrais plus rien y pousser pour la réparer.

## Quand le code natif change

```bash
./publier-android.sh --notes "Sonneries personnalisées"
```

**Ce script existe pour une seule raison** : `android.versionCode` dans
`app.json` et le `versionCode` du `version.json` doivent être **le même
nombre**. Le premier décide si Android accepte l'installation par-dessus
l'existant ; le second décide si l'application propose la mise à jour. Tenus à
la main dans deux fichiers, ils divergent — et la panne est silencieuse dans
les deux sens : en avance, le `version.json` propose un APK qui n'existe pas ;
en retard, il ne propose jamais celui qui existe.

Le script lance les tests d'abord. Un APK publié avec des tests rouges se
republie, et republier coûte un appui sur **chaque** téléphone : c'est le seul
endroit du projet où une erreur se paie autant de fois qu'il y a
d'utilisateurs.

Il incrémente ensuite `versionCode` de un — toujours de un, jamais en arrière,
Android n'accepte que des numéros croissants et un numéro sauté est perdu —,
avance le dernier segment de la version, écrit `telecharger/version.json`, et
lance EAS.

Il te reste **deux gestes** :

1. Télécharger l'APK depuis la page qu'EAS affiche, et le déposer sur le NAS
   dans `/volume1/docker/fitcarnet/telecharger/`. **L'APK d'abord, le
   `version.json` ensuite** — un manifeste qui annonce un fichier pas encore
   arrivé envoie les téléphones sur une adresse morte.
2. Commiter `front/app.json` et `telecharger/version.json`.

Au démarrage suivant, chaque téléphone en retard affiche un bandeau dans
l'onglet **Compte**, avec un bouton qui lance le téléchargement.

L'APK lui-même n'est **pas** dans git : des dizaines de mégaoctets à chaque
version, et il vit déjà sur le NAS. Son `version.json`, si — il doit rester en
face du `versionCode`.

### L'ordre des cinq gestes, quand une dépendance native change

`publier.sh` **refuse de partir** dans ce cas, et c'est voulu : une mise à jour
JavaScript ne livre pas de code natif, et du JavaScript qui appelle un module
absent fait planter l'application au démarrage — sur tous les téléphones, sans
possibilité d'y pousser le correctif.

1. `./publier.sh "ce qui change" --sans-mobile` — le site et l'API d'abord.
   Sans cette étape, tes changements d'API resteraient sur ton disque pendant
   toute la construction de l'APK.
2. `deployer-nas.sh` puis `docker logs fitcarnet-app --tail 30` — **avant, pas
   après** : une construction EAS coûte vingt minutes et incrémente le
   `versionCode` de façon irréversible. Autant savoir que le serveur répond
   avant de les dépenser.
3. `./publier-android.sh --notes "ce qui change"`.
4. Déposer l'APK renommé `fitcarnet.apk` sur le NAS.
5. Commiter `front/app.json` et `telecharger/version.json`.

**Si la construction échoue sans que tu aies rien fait de mal**, regarde *où*.
Un journal EAS qui s'arrête sur `Downloading …gradle-X.Y.Z-bin.zip` avec un
`SocketException` ou un `503` signifie qu'**aucune ligne de fitcarnet n'a été
lue** : Gradle n'a pas pu être téléchargé sur les machines d'Expo. Ne cherche
pas dans ton code, relance une heure plus tard. C'est arrivé quatre fois de
suite le 12 août avant de passer tout seul.

---

## Si tu touches à la base de données

1. Écris la migration dans `db/manuel/`, numérotée à la suite des autres. Elle
   doit pouvoir être rejouée sans casse : le conteneur les rejoue **toutes**, à
   chaque démarrage.
2. Sauvegarde d'abord, sur le NAS : `/volume1/docker/fitcarnet/sauvegarde-nas.sh`.
   La sauvegarde automatique date de 4 h du matin ; une migration destructive
   passée à 14 h s'appliquerait sur des données dont la dernière copie a dix
   heures.
3. `./publier.sh "ce qui change"`.

---

## Quand quelque chose ne marche pas

```bash
# le déploiement a-t-il eu lieu ?
ssh nas 'tail -20 /volume1/docker/fitcarnet/deploiement.log'

# où en est le NAS par rapport à Gitea ?
ssh nas '/volume1/docker/fitcarnet/deployer-nas.sh --etat'

# pourquoi l'application ne démarre pas
ssh nas 'docker logs fitcarnet-app --tail 40'
```

Une erreur 500 côté site est toujours une exception PHP : le détail est dans
ces journaux, jamais dans la réponse HTTP.

---

## Ce que tu ne dois jamais faire

- **`git clean -xdf` sur le NAS.** Le clone git contient `pgdata/` — ta base de
  données. Elle est dans le `.gitignore`, mais ne tente pas le diable.
- **Supprimer `api/config/jwt/`** « pour repartir propre ». Les clés y sont
  générées une fois ; les régénérer déconnecte tout le monde.
- **Changer `JWT_PASSPHRASE`** dans le `.env` du NAS. Même effet, en pire : les
  clés existantes deviennent illisibles.
- **`doctrine:schema:update --force`.** Jamais sur ce projet. Les migrations
  sont écrites à la main, dans `db/manuel/`, et dans un ordre qui compte.

> **Ces quatre sections viennent de `MISE-A-JOUR.md`, fondu ici le 16 septembre
> 2026.** Une section n'a **pas** été reprise, et c'est la raison de la fusion :
> « Quand je te livre des fichiers » prescrivait `fitsync`, l'outil de
> synchronisation Windows → WSL qui est neutralisé et archivé depuis le
> 7 septembre, dont le clone est renommé `.OBSOLETE`, et dont `CLAUDE.md`,
> `README.md` et `NOUVELLE-MACHINE.md` interdisent tous les trois l'usage —
> c'est la cause du bug critique C1. Un document opérationnel qui commande la
> cause d'une panne connue est pire qu'un document absent.

---

## L'identité visuelle

Tout est dans `front/assets/images/`, et rien n'y a été choisi : le fond, le
doré et les quatre couleurs de macro viennent de `src/theme/index.ts`, la
police est celle des chiffres de l'application. Une icône qui n'a pas les
couleurs de l'écran qu'elle ouvre n'est pas une icône, c'est un autocollant.

Le motif est **l'anneau des quatre macros** — protéines, féculents, lipides,
légumes — avec le « f » de fitcarnet au centre. C'est le code couleur de toute
l'application, et le seul motif qui la résume ; il se lit encore à 48 pixels,
ce qu'aucun pictogramme détaillé ne fait.

| Fichier | Où il sert | Pourquoi il est différent |
|---|---|---|
| `icone.png` | iOS, web, magasins | carré plein, aucun masque |
| `icone-adaptative.png` | Android, écran d'accueil | **fond transparent et un quart de vide autour** : le lanceur rogne l'image selon le masque du téléphone — rond, carré, goutte — et Android ne garantit que le disque central |
| `lancement.png` | écran de chargement | **ni fond ni titre** : Expo le pose centré sur `backgroundColor`, une image avec fond donnerait un carré sur un carré |
| `notification.png` | barre d'état Android | **silhouette blanche sur transparent** : Android aplatit cette icône en une seule couleur, toute couleur y deviendrait un carré blanc |
| `favicon.png` | onglet du navigateur | coins arrondis, 196 px |

Ils sont regénérables : le script qui les dessine lit la charte, donc changer
une couleur dans `src/theme/index.ts` et redessiner suffit à tout remettre
d'aplomb.
