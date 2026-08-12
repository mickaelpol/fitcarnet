# Mettre fitcarnet à jour

Tout part de **WSL**, à la racine du dépôt. Tu ne lances jamais rien sur le
NAS, sauf pour regarder ce qui s'est passé.

```bash
cd ~/perso/fitcarnet
```

---

## Le cas normal — 9 fois sur 10

Écrans, calculs, textes, styles, code de l'API.

```bash
./publier.sh "ce qui change"
```

**C'est tout.** Le script enchaîne : tests du front → build du site web →
commit → push → mise à jour des téléphones.

| Ce qui arrive où | Quand |
|---|---|
| Site web et API | dans les 5 minutes |
| Téléphones | au prochain démarrage de l'application |

Pressé ? `./publier.sh "…" --nas root@nas` déclenche le déploiement tout de
suite au lieu d'attendre.

---

## Si tu as ajouté une dépendance ou un greffon

`publier.sh` **refusera de partir** et te le dira. C'est voulu : une mise à
jour JavaScript ne livre pas de code natif, et du JavaScript qui appelle un
module absent fait planter l'application au démarrage — sur tous les
téléphones, sans possibilité d'y pousser le correctif.

1. **Le site et l'API d'abord**, sans toucher aux téléphones :
   ```bash
   ./publier.sh "ce qui change" --sans-mobile
   ```
   Sans cette étape, tes changements d'API resteraient sur ton disque pendant
   toute la construction de l'APK. `--sans-mobile` est obligatoire : sans lui
   le script refuse, et il a raison.

2. **Déploie et vérifie que le serveur tient**, sur le NAS :
   ```bash
   /volume1/docker/fitcarnet/deployer-nas.sh
   docker logs fitcarnet-app --tail 30
   ```
   Avant, pas après : une construction EAS coûte vingt minutes et incrémente
   le `versionCode` de façon irréversible. Autant savoir que le serveur
   répond avant de les dépenser.

3. ```bash
   ./publier-android.sh --notes "ce qui change"
   ```
   Environ 10 minutes, plus la file d'attente. Il lance les tests, vérifie les
   greffons, assemble le JavaScript en local, puis incrémente les numéros et
   construit l'APK.

4. Télécharger l'APK depuis la page qu'EAS affiche, le renommer
   **`fitcarnet.apk`**, et le déposer sur le NAS dans
   `/volume1/docker/fitcarnet/telecharger/`.

5. ```bash
   git add front/app.json telecharger/version.json
   git commit -m "version 1.0.X (Y)"
   git push
   ```

### Si la construction échoue sans que tu aies rien fait de mal

Regarde **où** elle échoue. Si le journal EAS s'arrête sur :

```
Downloading https://services.gradle.org/distributions/gradle-X.Y.Z-bin.zip
java.net.SocketException  /  HTTP response code: 503
```

alors **aucune ligne de fitcarnet n'a été lue**. Gradle — l'outil de
compilation — n'a pas pu être téléchargé sur les machines d'Expo. Ce fichier
est en réalité hébergé chez GitHub, qui refuse parfois de le servir aux
adresses des serveurs de build.

Ne cherche pas dans ton code : relance, espacé d'une heure. C'est arrivé
quatre fois de suite le 12 août avant de passer tout seul.

### Ce que ça coûte à ceux qui utilisent l'application

Un nouvel APK doit être **réinstallé à la main** par chacun — tu distribues
hors Play Store, il n'y a pas de mise à jour automatique. C'est la seule
forme de mise à jour qui demande une action à tes utilisateurs. Une raison de
plus de grouper les changements natifs plutôt que d'en publier au fil de
l'eau.

**L'APK d'abord, le push ensuite.** Le `version.json` annonce aux téléphones
qu'une version existe : s'il arrive avant le fichier, ils vont sur une adresse
morte.

Les gens installent — ou réinstallent — depuis
**`https://carnet.mickael-pol.fr/telecharger/`**. Un bandeau apparaît aussi
dans l'onglet **Compte** de ceux qui ont une version en retard.

---

## Si tu touches à la base de données

1. Écris la migration dans `db/manuel/`, numérotée à la suite des autres.
   Elle doit pouvoir être rejouée sans casse : le conteneur les rejoue
   **toutes**, à chaque démarrage.

2. Sauvegarde d'abord, sur le NAS :
   ```bash
   /volume1/docker/fitcarnet/sauvegarde-nas.sh
   ```
   La sauvegarde automatique date de 4 h du matin. Une migration destructive
   passée à 14 h s'appliquerait sur des données dont la dernière copie a dix
   heures.

3. ```bash
   ./publier.sh "ce qui change"
   ```

---

## Quand je te livre des fichiers

```bash
fitsync
```

**Lis la liste « Fichiers qui seraient écrasés ».** `fitsync` ne va que de
Windows vers WSL : si un fichier que tu as modifié dans WSL y figure, la
version Windows gagne — même si elle est plus vieille. C'est comme ça qu'on a
perdu deux `channel` dans `eas.json` sans s'en apercevoir.

En cas de doute, avant de commiter :

```bash
git diff
```

Et si `fitsync` a écrasé quelque chose qu'il ne fallait pas :

```bash
git checkout -- le/fichier
```

Les versions écrasées sont aussi gardées dans `~/.fitsync-backup/`.

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

- **`git clean -xdf` sur le NAS.** Le clone git contient `pgdata/` — ta base
  de données. Elle est dans le `.gitignore`, mais ne tente pas le diable.
- **Supprimer `api/config/jwt/`** « pour repartir propre ». Les clés y sont
  générées une fois ; les régénérer déconnecte tout le monde.
- **Changer `JWT_PASSPHRASE`** dans le `.env` du NAS. Même effet, en pire :
  les clés existantes deviennent illisibles.
- **`doctrine:schema:update --force`.** Jamais sur ce projet. Les migrations
  sont écrites à la main, dans `db/manuel/`, et dans un ordre qui compte.
