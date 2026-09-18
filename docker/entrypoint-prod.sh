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
# des migrations suivantes ont eu besoin : par ordre alphabétique il passait
# après « 23 », et trois migrations échouaient. Même liste que dans
# `installer.sh`.
#
# `jeu-essai.sql` (démonstration) n'en est pas une et n'a rien à faire ici.
#
# ON COUPE LA QUERY STRING DE `DATABASE_URL` AVANT DE LA DONNER A psql.
#
# Cette URL est ecrite POUR DOCTRINE : `?serverVersion=16&charset=utf8`. Ce
# sont des parametres de Doctrine, pas de PostgreSQL, et libpq les refuse :
#
#     psql: error: invalid URI query parameter: "serverVersion"
#
# La panne etait deroutante parce que la MEME migration, jouee a la main
# depuis le conteneur PostgreSQL, passait sans un mot — la, on ne passe pas
# par cette URL. Le point d'entree, lui, avalait la sortie d'erreur et ne
# disait que « aliment-fibres.sql a echoue ».
DSN_PSQL=${DATABASE_URL%%\?*}

if [ -d "$APP/db/manuel" ]; then
    bleu "Migrations"
    for f in \
        "$APP"/db/manuel/aliment-fibres.sql \
        "$APP"/db/manuel/1[0-9]-*.sql \
        "$APP"/db/manuel/2[0-9]-*.sql \
        "$APP"/db/manuel/3[0-9]-*.sql
    do
        [ -f "$f" ] || continue
        # ON MONTRE L'ERREUR, ON NE LA CACHE PAS.
        #
        # La version precedente envoyait la sortie dans /dev/null et se
        # contentait d'un « a echoue, rejoue-la pour voir ». Il a fallu un
        # aller-retour complet sur le NAS pour apprendre que psql refusait la
        # query string de DATABASE_URL — une ligne que le conteneur avait
        # sous les yeux et qu'il a jetee.
        if ! ERREUR=$(psql "$DSN_PSQL" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1); then
            souci "$(basename "$f") a échoué :"
            printf '%s\n' "$ERREUR" | tail -15 >&2
            souci "Pour la rejouer seule, depuis le NAS :"
            souci "  docker exec -i fitcarnet-db psql -U fitcarnet -d fitcarnet \\"
            souci "    -v ON_ERROR_STOP=1 < db/manuel/$(basename "$f")"
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

# ------------------------------------------------- 5. ménage des invitations

# LE SEUL RENDEZ-VOUS PÉRIODIQUE QUE CETTE PILE POSSÈDE — constat 02#17.
#
# Les invitations acceptées, périmées ou devenues orphelines (compte supprimé,
# `utilisateur_id` mis à NULL) s'accumulaient sans fin dans l'écran
# d'administration. Il fallait un balayage régulier ; ajouter un planificateur
# ou un conteneur pour une table de quelques lignes aurait coûté plus que le
# problème. Un démarrage est un rendez-vous suffisant pour une rétention de
# trente jours : si la pile ne redémarre pas de trois mois, la seule
# conséquence est une ligne de plus à l'écran.
#
# APRÈS le cache, parce que la commande a besoin d'un conteneur de services
# chauffé. ET SANS POUVOIR EMPÊCHER LE DÉMARRAGE : `|| true`. Un ménage qui
# échoue — base lente, colonne inattendue — est un désagrément ; refuser de
# démarrer l'application pour cette raison serait une panne. Le journal garde
# la trace, `docker logs fitcarnet-app` la montre.
bleu "Invitations"
php bin/console app:invitations:purger --no-interaction || souci "purge des invitations ignorée (sans conséquence)"

printf '\033[0;32m▸ fitcarnet est prêt\033[0m\n'

# `exec` : FrankenPHP devient le processus 1 et reçoit les signaux d'arrêt de
# Docker. Sans lui, ce script resterait le père, avalerait le SIGTERM, et
# chaque arrêt attendrait dix secondes avant d'être tué de force.
exec "$@"
