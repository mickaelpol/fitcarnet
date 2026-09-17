---
name: verification-android
description: Faire tourner fitcarnet sur le vrai moteur d'Android — émulateur d'Android Studio côté Windows, Expo Go, Metro dans WSL, pilotage par adb.exe — pour éprouver un parcours, lire l'écran, filmer, puis tout remettre en place. Porte les pièges qui ont chacun coûté un faux résultat le 15 septembre 2026.
---

# Éprouver fitcarnet sur Android

Node et Chromium ne sont pas Android. Le moteur est Hermes, le `fetch` est celui
de React Native, le clavier filtre ce qu'on tape. Le 15 septembre 2026, c'est
sur l'émulateur qu'un poids de 42,5 kg s'est révélé enregistré **425 kg** —
alors que 577 tests passaient.

**Expo Go n'est pas l'APK de production** : pas de notifications distantes
(retirées d'Expo Go au SDK 53 — l'erreur `expo-notifications` au lancement est
attendue), `expo-updates` inactif. Tout le reste — écrans, saisie, réseau, stockage
— est le vrai.

## 0. Ce qu'il y a sur cette machine

```bash
SDK=/mnt/c/Users/micka/AppData/Local/Android/Sdk      # sinon : ls -d /mnt/c/Users/*/AppData/Local/Android/Sdk
ADB=$SDK/platform-tools/adb.exe
$SDK/emulator/emulator.exe -list-avds                  # Medium_Phone_API_36.1 (Android 16, x86_64, Play Store)
$SDK/emulator/emulator.exe -accel-check | tail -1      # WHPX … usable
```

L'émulateur tourne **côté Windows** : WSL n'a pas d'USB, mais pilote très bien
`adb.exe` et `emulator.exe`.

## 1. Démarrer

**L'émulateur**, en arrière-plan (sa fenêtre s'ouvre sous Windows) :

```bash
$SDK/emulator/emulator.exe -avd Medium_Phone_API_36.1 -no-snapshot-save -no-boot-anim   # run_in_background
```

**Attendre la fin du démarrage** — pas seulement qu'`adb` voie l'appareil. Une
commande qui COMMENCE par `sleep N` est refusée par l'environnement : écris une
boucle `until`.

```bash
$ADB wait-for-device
until [ "$($ADB shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 3; done
```

**Expo Go pour le SDK 54**, s'il n'est pas installé (`$ADB shell pm list packages | grep host.exp.exponent`) :

```bash
URL=$(curl -s https://api.expo.dev/v2/versions/latest \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["sdkVersions"]["54.0.0"]["androidClientUrl"])')
mkdir -p /mnt/c/Users/micka/AppData/Local/Temp/fitcarnet-android
curl -sL -o /mnt/c/Users/micka/AppData/Local/Temp/fitcarnet-android/expo-go.apk "$URL"
(cd /mnt/c && $ADB install -r 'C:\Users\micka\AppData\Local\Temp\fitcarnet-android\expo-go.apk')
```

`adb.exe` est un programme Windows : il veut un chemin Windows.

**Metro**, en arrière-plan, et la redirection de son port :

```bash
$ADB reverse tcp:8081 tcp:8081
cd "$(git rev-parse --show-toplevel)"/front && npx expo start --go --localhost --port 8081 --clear   # run_in_background
$ADB shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081
```

## 2. Les pièges — chacun a produit un faux résultat

### Le bundle n'est peut-être pas ton code

- **`CI=1` désactive le rechargement de Metro** (« *reloads are disabled* »). Il
  sert l'ancien code, sans erreur : une correction semble inopérante. Ne le passe
  pas, ou relance Metro après chaque modification.
- **Un bundle de quelques Ko est un message d'erreur**, pas du code — Expo Go
  continue alors sur l'ancien. Le 15 septembre : `UnableToResolveError` sur un
  fichier créé pendant que Metro tournait.
- **Vérifie donc le bundle que demande Expo Go**, via le manifeste, avant chaque
  épreuve :

```bash
URL=$(curl -s -H 'expo-platform: android' -H 'Accept: application/expo+json,application/json' http://localhost:8081/ \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["launchAsset"]["url"])')
curl -s "$URL" -o /dev/shm/bundle.js; du -h /dev/shm/bundle.js      # plusieurs Mo
grep -aoF '<un identifiant ou un texte du changement>' /dev/shm/bundle.js | wc -l
```

  En développement le bundle n'est pas minifié : les noms de fonctions s'y
  trouvent.
- **Forcer le rechargement côté téléphone** : `$ADB shell am force-stop host.exp.exponent`
  puis rouvrir `exp://127.0.0.1:8081`.

### L'adresse de l'API ne vient pas de la ligne de commande

`client.ts` lit le module **`expo/virtual/env`**, que Metro remplit depuis les
fichiers `.env` — **pas** `process.env`. `EXPO_PUBLIC_API_URL=… npx expo start`
et `EXPO_NO_DOTENV=1` n'y changent RIEN : le 15 septembre, un test « face à un
serveur muet » a parlé à la vraie API.

- Par défaut, `front/.env` donne `http://192.168.1.118:8080/api` : l'émulateur
  l'atteint directement par l'adresse du poste. Rien à rediriger.
- Pour viser une autre adresse : un **`front/.env.local` temporaire** (ignoré par
  git, prioritaire sur `.env`), Metro relancé avec `--clear`, et **le fichier
  retiré à la fin**. Le bundle porte alors les DEUX valeurs : y trouver la bonne
  ligne ne prouve rien. **La preuve est dans le journal du serveur visé**, et
  dans l'absence de requête chez l'autre :

```bash
docker logs --since 3m fitcarnet-app-dev 2>&1 | grep -F '"uri": "/api/connexion"'
```

### L'écran bouge sous tes doigts

- **Relis l'arbre des éléments après CHAQUE geste.** Une sauvegarde qui affiche
  « enregistré » décale la page de 82 px ; un clavier qui s'ouvre aussi. Une
  coordonnée relevée avant n'est plus la bonne.
- **Vise le plus PETIT élément cliquable qui contient le texte.** Le premier
  trouvé est le plus externe : son centre tombe sur une autre ligne. Le
  15 septembre, « Chest press machine » a ainsi ajouté « Développé incliné haltères ».
- **Surimpressions à fermer** : le menu de développement d'Expo Go au premier
  lancement (« Continue »), « Bluetooth keeps stopping » (propre à l'image de
  l'émulateur), la permission de notifications (déclenchée par le minuteur de repos).

### Le clavier filtre ce que tu tapes

Un champ `decimal-pad` n'accepte que **le séparateur décimal de la langue**.
L'émulateur est en anglais : la virgule y est refusée AVANT d'atteindre
l'application. Pour éprouver un téléphone français :

```bash
$ADB shell cmd locale set-app-locales host.exp.exponent --locales fr-FR   # puis force-stop et relancer
```

Et à la fin : `--locales ""`.

## 3. Piloter et lire l'écran

```python
import re, subprocess, time
ADB = '/mnt/c/Users/micka/AppData/Local/Android/Sdk/platform-tools/adb.exe'

def adb(*a):
    return subprocess.run([ADB, *a], capture_output=True).stdout.decode('utf-8', 'replace').replace('\r', '')

def noeuds():
    """Les éléments affichés : texte, description, classe, cliquable, rectangle."""
    adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml')
    res = []
    for m in re.finditer(r'<node [^>]*>', adb('exec-out', 'cat', '/sdcard/ui.xml')):
        n = m.group(0)
        def g(k):
            r = re.search(k + r'="([^"]*)"', n); return r.group(1) if r else ''
        b = list(map(int, re.findall(r'\d+', g('bounds')))) or [0, 0, 0, 0]
        res.append({'t': g('text'), 'd': g('content-desc'), 'c': g('class').split('.')[-1],
                    'clic': g('clickable') == 'true', 'b': b})
    return res

def plus_petit_cliquable(ns, motif):
    txt = next((n for n in ns if re.search(motif, n['t'] + ' ' + n['d'])), None)
    if txt is None: return None
    c = [n for n in ns if n['clic'] and n['b'][0] <= txt['b'][0] and n['b'][1] <= txt['b'][1]
         and n['b'][2] >= txt['b'][2] and n['b'][3] >= txt['b'][3]]
    return min(c, key=lambda n: (n['b'][2]-n['b'][0]) * (n['b'][3]-n['b'][1])) if c else txt

def taper(n, pause=2.0):
    adb('shell', 'input', 'tap', str((n['b'][0]+n['b'][2])//2), str((n['b'][1]+n['b'][3])//2))
    time.sleep(pause)
```

- **Saisir** : toucher le champ, puis `adb shell input text '42.5'` — un caractère
  à la fois si l'on veut relire le champ entre deux frappes. Pour vider :
  `input keyevent 123` (fin) puis plusieurs `input keyevent 67`.
- **Fermer le clavier** : `input keyevent 111`.
- **Les onglets** portent une description `« ◼, Séances »` : cherche celle qui se
  termine par `, <Onglet>`.
- **Repartir sans session** : `$ADB shell pm clear host.exp.exponent` — efface
  aussi le cache et le premier lancement.
- **Une capture** : `$ADB exec-out screencap -p > "$(git rev-parse --show-toplevel)"/presentation/tournage/captures-verification/<nom>.png`,
  puis la lire avec l'outil Read.
- **Le journal JavaScript** : `$ADB logcat -c` avant, `$ADB logcat -d -s ReactNativeJS:W ReactNativeJS:E AndroidRuntime:E` après.

## 4. Filmer

```bash
$ADB shell screenrecord --time-limit 170 --bit-rate 8000000 /sdcard/capture.mp4   # run_in_background
# … le parcours …
$ADB shell pkill -INT screenrecord          # arrêt propre : le fichier est finalisé
$ADB pull /sdcard/capture.mp4 "$(git rev-parse --show-toplevel)"/presentation/captures/<fonctionnalite>/<nn>-<scenario>.mp4
$ADB shell rm /sdcard/capture.mp4
```

Trois minutes au plus par fichier. Le curseur n'apparaît pas : pour montrer les
touchers, `$ADB shell settings put system show_touches 1` (et `0` à la fin).

## 5. Serveur muet, réseau coupé

Pour éprouver un délai de garde : un serveur qui accepte sans répondre, sur un
port libre, redirigé vers l'émulateur, et l'API pointée dessus par
`front/.env.local`.

```bash
python3 -u -c '
import socket
s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("0.0.0.0", 9999)); s.listen(64); gardes = []
while True:
    c, a = s.accept(); gardes.append(c); print("connexion acceptee de", a, flush=True)
'   # run_in_background
$ADB reverse tcp:9999 tcp:9999
```

Le 15 septembre : « Le serveur ne répond pas (plus de 30 s) » à 32 s, connexion
reçue par le serveur muet, aucune par l'API réelle.

## 6. Tout remettre en place, et le prouver

```bash
fuser -k 8081/tcp 9999/tcp
$ADB reverse --remove-all
$ADB shell cmd locale set-app-locales host.exp.exponent --locales ""
$ADB shell settings put system show_touches 0
$ADB emu kill
rm -f "$(git rev-parse --show-toplevel)"/front/.env.local   # la racine du dépôt : son chemin change d'un poste à l'autre
rm -rf /mnt/c/Users/micka/AppData/Local/Temp/fitcarnet-android
```

Puis les données de test, selon `donnees-de-test`. Vérifie : aucun port en
écoute, aucune redirection, `front/.env.local` absent, `front/.env` intact,
zéro compte `@test.local`.
