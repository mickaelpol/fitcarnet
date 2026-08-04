# fitcarnet — démarrer le développement

Environnement local : **WSL2 + Docker + PhpStorm**, identique à la production
(FrankenPHP, PHP 8.3, PostgreSQL 16) avec Xdebug en plus.

---

## 1. Le dépôt

Sur Gitea, crée le dépôt **vide** `fitcarnet` (sans README ni .gitignore, on les
apporte). Puis dans WSL :

```bash
cd ~/projets                     # ou l'emplacement de ton choix
git clone ssh://git@gitea.mickael-pol.fr:2222/mickael/fitcarnet.git
cd fitcarnet
```

Copie dedans les fichiers déjà livrés :

```
fitcarnet/
├─ compose.dev.yml         ← développement (ici)
├─ docker-compose.yml      ← production (NAS)
├─ docker/
│  ├─ Dockerfile
│  └─ Caddyfile
└─ db/
   ├─ 01-schema.sql
   └─ 02-donnees.sql
```

> **Important** : travaille toujours dans le système de fichiers **Linux** de WSL
> (`~/projets/...`), jamais dans `/mnt/c/...`. Les entrées/sorties y sont dix
> fois plus rapides et les permissions ne posent pas de problème.

---

## 2. Lancer l'environnement

```bash
docker compose -f compose.dev.yml up -d
docker compose -f compose.dev.yml logs -f app     # Ctrl+C pour quitter
```

- API : http://localhost:8080
- Base : `localhost:5432`, utilisateur/mot de passe `fitcarnet`

La base est créée et peuplée automatiquement au premier lancement
(50 aliments, 20 exercices). Pour repartir de zéro :
`docker compose -f compose.dev.yml down -v`

---

## 3. Installer Symfony + API Platform

Le dossier `api/` doit être **vide** (hors `.git`). Depuis la racine du dépôt :

```bash
docker compose -f compose.dev.yml exec app bash

# --- dans le conteneur ---
cd /tmp
composer create-project symfony/skeleton:^7.3 sf --no-interaction
cp -a /tmp/sf/. /app/
rm -rf /tmp/sf

cd /app
composer require api                       # API Platform
composer require symfony/uid
composer require lexik/jwt-authentication-bundle
composer require --dev symfony/maker-bundle doctrine/doctrine-fixtures-bundle phpunit/phpunit symfony/test-pack

# clés JWT (utilise la passphrase définie dans compose.dev.yml)
php bin/console lexik:jwt:generate-keypair --overwrite

exit
```

Vérifie : http://localhost:8080/api doit afficher l'interface d'API Platform.

---

## 4. PhpStorm

**Interpréteur PHP**
Settings → PHP → CLI Interpreter → `...` → **From Docker** → *Docker Compose*
→ fichier `compose.dev.yml`, service `app`. PhpStorm détecte PHP 8.3 et Xdebug.

**Serveur de débogage**
Settings → PHP → Servers → `+`
- Name : **fitcarnet** *(doit correspondre exactement à `PHP_IDE_CONFIG`)*
- Host : `localhost`, Port : `8080`
- Coche **Use path mappings** : `<racine du dépôt>/api` → `/app`

**Xdebug**
Settings → PHP → Debug → Debug port : **9003**.
Xdebug est en mode `trigger` : il ne s'active que sur demande.
- Active l'écoute (icône téléphone dans la barre d'outils)
- Ajoute `?XDEBUG_TRIGGER=1` à l'URL, ou installe l'extension navigateur
- En CLI : `XDEBUG_TRIGGER=1 php bin/console ...`

> Pour déboguer **toutes** les requêtes sans déclencheur, remplace
> `xdebug.start_with_request=trigger` par `yes` dans `docker/Dockerfile`
> (cible `dev`) et reconstruis l'image.

**Base de données**
View → Tool Windows → Database → `+` → PostgreSQL
`localhost:5432`, base/utilisateur/mot de passe : `fitcarnet`.

---

## 5. Le fichier .gitignore

À créer à la racine avant le premier commit :

```gitignore
/api/vendor/
/api/var/
/api/.env.local
/api/.env.*.local
/api/config/jwt/*.pem
/front/node_modules/
/front/dist/
/.idea/
.env
```

`vendor/` n'est **jamais** versionné : il se reconstruit avec
`composer install`.

---

## 6. Cycle de travail

```
WSL2 (code + test) → git push → Gitea → webhook n8n → NAS (git pull)
```

On ne modifie **jamais** le code directement sur le NAS : il ne fait que suivre
la branche `master`. Le déploiement automatique sera mis en place une fois
l'API fonctionnelle.

---

## Étape suivante

Entités Doctrine des 12 tables (sans régénération du schéma : la base fait foi),
authentification JWT et création de comptes réservée à l'admin.
