# Déploiement

Un `git push` sur `master` met la production à jour. Rien d'autre.

Ce document dit comment ça marche, ce qu'il faut faire **une seule fois** pour
que ça marche, et ce qui reste à ta charge à chaque déploiement.

---

## Le principe

```
WSL ──push──▶ Gitea (NAS) ──▶ deployer-nas.sh, sur le NAS
                                 │  git pull --ff-only
                                 │  docker compose up -d --build
                                 ▼
                       le conteneur, en démarrant :
                       1. installe les dépendances PHP
                       2. génère les clés JWT si absentes
                       3. joue les migrations
                       4. chauffe le cache
```

**Ce n'est pas Portainer qui déploie**, et c'est une correction, pas un choix
initial. J'avais écrit cette stack en chemins relatifs — `./api`, `./db` — en
comptant sur la stack Git de Portainer pour les résoudre dans son clone. Ça ne
marche pas en édition **CE** : Portainer clone à l'intérieur de son propre
conteneur, dans `/data/compose/<id>/`, un chemin que le démon Docker du NAS ne
voit pas. Le déploiement s'arrête sur

```
Bind mount failed: '/data/compose/45/db' does not exist
```

Résoudre les chemins relatifs d'une stack Git est une fonction de l'édition
**Business**. On ne la contourne pas : on arrête de s'en servir.

Le code arrive donc par un **vrai clone git**, à `/volume1/docker/fitcarnet`,
que le démon voit ; `docker-compose.yml` n'utilise que des chemins absolus ;
et `deployer-nas.sh` fait le `pull` puis le `up`. **Portainer reste
utilisable** pour regarder les conteneurs, lire les journaux, redémarrer — il
ne possède simplement plus la stack.

---

## Ce que tu fais à chaque déploiement

```bash
cd front && npm run build:web && cd ..
git add -A && git commit -m "…" && git push
```

**Le build du front est à toi**, et c'est le seul geste manuel qui reste.
L'image de production n'a pas Node : l'y ajouter reviendrait à embarquer un
compilateur JavaScript pour regénérer, à chaque démarrage, des fichiers qui ne
changent qu'au moment où l'on pousse. `front/dist` est donc versionné —
volontairement, malgré le gros diff que ça produit.

**Si tu oublies le build**, la production sert l'ancien front avec la nouvelle
API. C'est le seul mode de panne de ce dispositif, et il est silencieux. Le
jour où ça arrive une fois de trop, on ajoutera un hook `pre-push`.

Le NAS prend le commit dans les cinq minutes. Pour ne pas attendre :

```bash
ssh mickael@nas '/volume1/docker/fitcarnet/deployer-nas.sh'
```

---

## À faire une seule fois

### 1. Le dépôt sur Gitea

Depuis WSL, le dépôt est déjà poussé :

```bash
git remote -v      # origin  ssh://git@gitea.mickael-pol.fr:2222/mickael/fitcarnet.git
```

Pour le NAS, crée un **jeton d'accès** dans Gitea : *Paramètres → Applications
→ Générer un nouveau jeton*, portée **repository: read**. Un jeton en lecture
seule, pas ton mot de passe : s'il fuite, il ne permet que de lire ce dépôt, et
tu le révoques sans rien changer d'autre.

### 2. Le clone, sur le NAS

En SSH sur le NAS, en `root` (ou `sudo -i`) :

```bash
mkdir -p /volume1/docker/fitcarnet
cd /volume1/docker/fitcarnet
```

**`git clone` refuse un dossier non vide**, et celui-ci contient déjà `pgdata/`
et `telecharger/`. On fait donc l'équivalent en trois gestes :

```bash
git init
git remote add origin https://JETON@gitea.mickael-pol.fr/mickael/fitcarnet.git
git fetch origin master
git checkout -f -B master origin/master
```

Remplace `JETON` par le jeton de l'étape 1. Il finit écrit en clair dans
`.git/config` — c'est le prix du sans-mot-de-passe. Ferme la porte :

```bash
chmod 600 .git/config
```

> **Si `git` n'existe pas sur ton DSM**, ne l'installe pas par Entware : ça
> survit mal aux mises à jour de DSM. `deployer-nas.sh` passe tout seul par une
> image Docker quand la commande manque. Pour ces quatre lignes d'installation,
> fais pareil :
> ```bash
> docker run --rm -v /volume1/docker/fitcarnet:/git -w /git alpine/git init
> ```
> …et ainsi de suite, en préfixant chaque commande.

### 3. Les secrets, dans `.env`

Un seul fichier, **jamais dans le dépôt** (il est dans `.gitignore`) :

```bash
cat > /volume1/docker/fitcarnet/.env <<'EOF'
DB_PASSWORD=…
APP_SECRET=…
JWT_PASSPHRASE=…
GROCY_URL=
GROCY_API_KEY=
EOF
chmod 600 /volume1/docker/fitcarnet/.env
```

| Variable | Ce que c'est |
|---|---|
| `DB_PASSWORD` | mot de passe PostgreSQL. **Fixé à la création du volume** : le changer ensuite ne fait que casser la connexion. |
| `APP_SECRET` | secret Symfony. Le changer invalide les cookies signés, sans plus. |
| `JWT_PASSPHRASE` | protège la clé privée JWT. **La changer déconnecte tout le monde** et rend les clés existantes illisibles. |
| `GROCY_URL`, `GROCY_API_KEY` | facultatifs. Vides, l'application le détecte et l'explique. |

Note-les ailleurs qu'ici. Elles ne sont récupérables nulle part si tu les
perds : le mot de passe de la base est dans le volume, la passphrase n'est
écrite nulle part.

`deployer-nas.sh` **refuse de déployer** si ce fichier manque ou si une de ces
trois clés est vide. Il refuse **avant** le `git pull` : mieux vaut ne rien
faire que s'arrêter au milieu, avec une production à moitié à jour.

### 4. Le premier déploiement

```bash
chmod +x /volume1/docker/fitcarnet/deployer-nas.sh
/volume1/docker/fitcarnet/deployer-nas.sh --force
```

`--force` parce que le clone est déjà au dernier commit : sans lui, le script
constate qu'il n'y a rien de neuf et sort sans rien faire.

Ce qui s'est passé est dans `/volume1/docker/fitcarnet/deploiement.log`.

### 5. Le déclenchement automatique

*DSM → Panneau de configuration → Planificateur de tâches → Créer → Tâche
déclenchée… non : **Tâche planifiée → Script défini par l'utilisateur**.*

- **Utilisateur** : `root` (il faut le démon Docker)
- **Planification** : tous les jours, **répéter toutes les 5 minutes**
- **Script** : `/volume1/docker/fitcarnet/deployer-nas.sh`
- **Notification par e-mail** : coche « envoyer uniquement en cas d'erreur »

**Cinq minutes de latence, et je préfère ça à un webhook.** Un webhook demande
quelque chose qui écoute en HTTP sur le NAS et qui a le droit de lancer Docker
— une pièce de plus à sécuriser et à réparer, pour gagner quatre minutes sur un
déploiement que tu fais quelques fois par semaine. Le script sort en quelques
dixièmes de seconde et **sans écrire une ligne** quand rien n'a bougé : il ne
coûte rien et ne noie pas le journal.

Si un jour l'attente devient pesante, le raccourci est déjà écrit :
`ssh nas /volume1/docker/fitcarnet/deployer-nas.sh`.

---

## `deployer-nas.sh`, en trois garde-fous

```bash
./deployer-nas.sh --etat     # dit où on en est, ne touche à rien
./deployer-nas.sh            # déploie si le dépôt a bougé
./deployer-nas.sh --force    # redéploie quand même
```

**Un verrou.** Deux `docker compose up --build` en parallèle sur les mêmes
conteneurs laissent une production dans un état que personne ne sait décrire.
Le verrou est un `mkdir` — atomique partout, contrairement à `flock` — et il
saute même si le NAS coupe le script au milieu.

**`merge --ff-only`.** Le script refuse de fusionner. Si la production a
divergé, c'est que quelqu'un a commité directement sur le NAS ; un merge
automatique fabriquerait un état qui n'existe dans aucun dépôt. Il s'arrête, et
il dit quoi taper.

**Il regarde après.** `up -d` rend la main dès que Docker a *lancé* les
conteneurs, pas quand l'application répond : un conteneur qui meurt sur une
migration ratée sort de cette commande avec un code 0. Le script attend quinze
secondes, cherche les conteneurs `fitcarnet-*` arrêtés, et recopie leurs trente
dernières lignes de journal avant d'échouer.

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

- **Il ne teste rien.** Un commit qui casse le typage part en production comme
  un autre. `npm test` avant de pousser reste à ta charge.
- **Il ne sait pas revenir en arrière.** Revenir à la version d'avant, c'est
  `git revert` puis `git push` — donc un aller-retour complet, pas un bouton.
- **Il ne sauvegarde pas avant de migrer.** Une migration destructive
  s'appliquerait sans filet. `./sauvegarde.sh` avant tout déploiement qui
  touche au schéma.

Ces trois trous se bouchent le jour où ils font mal, pas avant.

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
eas update --branch production --message "ce qui change"
```

Les téléphones prennent la mise à jour au démarrage suivant. Rien à annoncer,
rien à installer.

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
