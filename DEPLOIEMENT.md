# Déploiement

Un `git push` sur `master` met la production à jour. Rien d'autre.

Ce document dit comment ça marche, ce qu'il faut faire **une seule fois** pour
que ça marche, et ce qui reste à ta charge à chaque déploiement.

---

## Le principe

```
WSL ──push──▶ Gitea (NAS) ──webhook──▶ Portainer ──▶ git pull + rebuild + restart
                                                          │
                                                          ▼
                                              le conteneur, en démarrant :
                                              1. installe les dépendances PHP
                                              2. génère les clés JWT si absentes
                                              3. joue les migrations
                                              4. chauffe le cache
```

**Portainer clone le dépôt lui-même.** C'est pour ça que `docker-compose.yml`
n'utilise plus que des chemins relatifs — `./api`, `./db`, `./docker`
désignent le clone, donc toujours le commit qui vient d'être tiré. Il ne peut
plus y avoir d'écart entre ce qui tourne et ce qui est versionné.

**Une seule exception, voulue :** le répertoire de données de PostgreSQL reste
un chemin absolu sur le disque du NAS (`/volume1/docker/fitcarnet/pgdata`).
Les données ne vivent pas dans un dépôt, et un clone qu'on referait ne doit
surtout pas emporter la base avec lui.

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

---

## À faire une seule fois

### 1. Le dépôt sur Gitea

Crée le dépôt, puis depuis WSL :

```bash
git remote add nas https://gitea.ton-nas/mickael/fitcarnet.git
git push -u nas master
```

### 2. Les secrets, dans Portainer

Trois variables, dans la section « Environment variables » de la stack. Elles
ne sont **jamais** dans le dépôt :

| Variable | Ce que c'est |
|---|---|
| `DB_PASSWORD` | mot de passe PostgreSQL. **Fixé à la création du volume** : le changer ensuite ne fait que casser la connexion. |
| `APP_SECRET` | secret Symfony. Le changer invalide les cookies signés, sans plus. |
| `JWT_PASSPHRASE` | protège la clé privée JWT. **La changer déconnecte tout le monde** et rend les clés existantes illisibles. |
| `GROCY_URL`, `GROCY_API_KEY` | facultatifs. Vides, l'application le détecte et l'explique. |

Note-les ailleurs qu'ici. Elles ne sont récupérables nulle part si tu les
perds : le mot de passe de la base est dans le volume, la passphrase n'est
écrite nulle part.

### 3. La stack Portainer

*Stacks → Add stack → Repository.*

- **Repository URL** : celle de Gitea
- **Reference** : `refs/heads/master`
- **Compose path** : `docker-compose.yml`
- **Automatic updates** : activer, et choisir **Webhook** plutôt que
  *Polling*. Le polling interroge Gitea toutes les N minutes pour découvrir
  qu'il ne s'est rien passé ; le webhook ne parle que quand il y a quelque
  chose à dire.
- Coche **Re-pull image and redeploy** — la stack construit son image depuis
  `./docker`, elle doit la reconstruire quand le `Dockerfile` change.

Portainer affiche alors une URL de webhook. Copie-la.

### 4. Le webhook, côté Gitea

*Dépôt → Settings → Webhooks → Add Webhook → Gitea.*

- **Target URL** : celle donnée par Portainer
- **HTTP Method** : `POST`
- **Trigger** : *Push events* uniquement
- **Branch filter** : `master`

Gitea et Portainer étant sur la même machine, l'appel ne sort pas du NAS.

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
