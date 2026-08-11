#!/bin/sh
# =====================================================================
#  fitcarnet — ce qui doit être vrai AVANT que l'application réponde.
#
#  Ce fichier existe parce que la mise en production est devenue un `git
#  pull`. Portainer récupère le nouveau commit et redémarre le conteneur ;
#  personne n'ouvre plus de terminal sur le NAS. Tout ce qu'on y faisait à la
#  main doit donc se faire ici, au démarrage, et se faire À CHAQUE FOIS sans
#  rien casser quand il n'y a rien à faire.
#
#  QUATRE GESTES, DANS CET ORDRE, ET L'ORDRE EST LE SUJET
#
#    1. les dépendances PHP — sans elles, rien ne démarre ;
#    2. les clés JWT — sans elles, personne ne se connecte ;
#    3. les migrations — le code neuf peut attendre une colonne neuve ;
#    4. le cache Symfony — il fige le schéma et les routes, donc il vient
#       APRÈS la base, jamais avant.
#
#  Chaque étape est idempotente et le dit. Un démarrage sans changement ne
#  doit rien écrire et ne rien coûter.
#
#  ON S'ARRÊTE À LA PREMIÈRE ERREUR (`set -e`). Une application qui démarre
#  sur des migrations à moitié jouées est pire qu'une application qui ne
#  démarre pas : la seconde se voit tout de suite.
# =====================================================================
set -e

APP=/app
bleu()  { printf '\033[0;36m▸ %s\033[0m\n' "$1"; }
ok()    { printf '  \033[0;32m✓\033[0m %s\n' "$1"; }
souci() { printf '  \033[0;31m✗ %s\033[0m\n' "$1" >&2; }

cd "$APP"

# ------------------------------------------------------ 0. le fichier `.env`
#
# SYMFONY EXIGE CE FICHIER, MÊME QUAND IL N'EN A BESOIN DE RIEN.
#
# `Dotenv::bootEnv()` ouvre `/app/.env` avant tout le reste, et lève
#
#     Unable to read the "/app/.env" environment file
#
# s'il est absent — y compris quand TOUTES les variables sont déjà dans
# l'environnement du conteneur, ce qui est exactement notre cas.
#
# Ce fichier n'arrive pas par git : le `.gitignore` du dépôt ignore `.env` À
# N'IMPORTE QUELLE PROFONDEUR, donc `api/.env` avec lui. Chez Symfony ce
# fichier contient des valeurs par DÉFAUT et se versionne normalement ; ici
# il a servi de fichier de secrets en développement, et le remettre dans git
# reviendrait à y pousser un mot de passe. On préfère l'écrire ici.
#
# Deux lignes suffisent. Les vraies valeurs viennent de `docker-compose.yml`,
# et Dotenv N'ÉCRASE PAS une variable déjà définie dans l'environnement : ce
# fichier ne peut donc rien contredire.
if [ ! -f "$APP/.env" ]; then
    bleu "Fichier .env"
    printf 'APP_ENV=prod\nAPP_DEBUG=0\n' > "$APP/.env"
    ok "créé (les vraies valeurs viennent de l'environnement du conteneur)"
fi

# ------------------------------------------------------- 1. dépendances PHP

# `vendor/` est hors du dépôt — c'est du code tiers, versionné par
# `composer.lock` et pas par git. On l'installe donc ici, et seulement quand
# le verrou a bougé : une empreinte gardée à côté évite de refaire trois
# minutes de travail à chaque redémarrage.
EMPREINTE_ATTENDUE=$(md5sum composer.lock | cut -d' ' -f1)
EMPREINTE_POSEE=$(cat vendor/.fitcarnet-lock 2>/dev/null || echo "")

if [ "$EMPREINTE_ATTENDUE" != "$EMPREINTE_POSEE" ]; then
    bleu "Dépendances PHP"
    composer install --no-dev --optimize-autoloader --no-interaction --no-progress \
        || { souci "composer install a échoué — le NAS a-t-il accès au réseau ?"; exit 1; }
    echo "$EMPREINTE_ATTENDUE" > vendor/.fitcarnet-lock
    ok "installées"
else
    ok "Dépendances PHP déjà à jour"
fi

# ------------------------------------------------------------ 2. clés JWT

# Elles ne sont PAS dans le dépôt, et ne doivent pas y être. Générées ici au
# premier démarrage, elles survivent aux suivants parce qu'un `git pull` ne
# touche pas aux fichiers qu'il ne connaît pas.
#
# Attention : les régénérer déconnecte tout le monde. D'où
# `--skip-if-exists`, et surtout : ne jamais supprimer ce dossier « pour
# repartir propre ».
if [ ! -f config/jwt/private.pem ]; then
    bleu "Clés JWT"
    php bin/console lexik:jwt:generate-keypair --skip-if-exists --no-interaction \
        || { souci "génération des clés impossible — JWT_PASSPHRASE est-il défini ?"; exit 1; }
    ok "générées"
else
    ok "Clés JWT déjà présentes"
fi

# ----------------------------------------------------------- 3. migrations

# PostgreSQL ne joue `db/` qu'à la CRÉATION du volume. Tout ce qui vient
# après une base déjà née passe par `db/manuel/`, et personne n'est là pour
# le lancer à la main.
#
# L'ORDRE EST ÉCRIT, PAS TRIÉ. `aliment-fibres.sql` crée une colonne dont
# 16, 17 et 19 ont besoin : par ordre alphabétique il passait après « 23 »,
# et trois migrations échouaient. Même liste que dans `installer.sh`.
#
# `jeu-essai.sql` (démonstration) et `audit-catalogue.sql` (rapport de
# lecture) n'en sont pas et n'ont rien à faire ici.
if [ -d "$APP/db/manuel" ]; then
    bleu "Migrations"
    for f in \
        "$APP"/db/manuel/aliment-fibres.sql \
        "$APP"/db/manuel/1[0-9]-*.sql \
        "$APP"/db/manuel/2[0-9]-*.sql
    do
        [ -f "$f" ] || continue
        if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>&1; then
            :
        else
            souci "$(basename "$f") a échoué. Rejoue-la seule pour voir l'erreur :"
            souci "  docker exec -it fitcarnet-app psql \"\$DATABASE_URL\" -f $f"
            exit 1
        fi
    done
    ok "à jour"
else
    ok "db/manuel absent — rien à migrer"
fi

# --------------------------------------------------------- 4. cache Symfony

# APRÈS les migrations : le cache fige le schéma et les routes. Le chauffer
# avant reviendrait à mémoriser une base qui n'existe pas encore, et
# l'application servirait des erreurs jusqu'au redémarrage suivant.
bleu "Cache Symfony"
php bin/console cache:clear  --no-interaction --quiet
php bin/console cache:warmup --no-interaction --quiet
ok "chauffé"

printf '\033[0;32m▸ fitcarnet est prêt\033[0m\n'

# `exec` : FrankenPHP devient le processus 1 et reçoit les signaux d'arrêt de
# Docker. Sans lui, ce script resterait le père, avalerait le SIGTERM, et
# chaque arrêt attendrait dix secondes avant d'être tué de force.
exec "$@"
