#!/usr/bin/env bash
#
# fitcarnet — installation complète, en une commande.
#
#   ./installer.sh --email ton@adresse.fr
#   ./installer.sh --email ton@adresse.fr --repartir-de-zero
#   ./installer.sh --email ton@adresse.fr --sans-catalogue
#
# --mot-de-passe est FACULTATIF : sans lui, le mot de passe est demandé sans
# écho. Dans les deux cas il doit respecter la règle du projet — 12 caractères
# au minimum, une minuscule, une majuscule, un chiffre et un caractère spécial
# (durcie le 18 septembre 2026, voir api/regles/motdepasse.json). Un mot de
# passe trop faible arrête le script en disant ce qui lui manque.
#
# Enchaîne : base, référentiel, compte, objectifs, catalogue, séances,
# sauvegarde. Chaque étape est vérifiée avant de passer à la suivante ;
# au moindre échec le script s'arrête en disant où et pourquoi.
#
# Sans --repartir-de-zero, une base existante est CONSERVÉE : le script
# complète ce qui manque au lieu de tout écraser.
#
set -euo pipefail

COMPOSE="${COMPOSE:-compose.dev.yml}"
BASE="${BASE:-fitcarnet}"
UTILISATEUR="${UTILISATEUR:-fitcarnet}"
CATALOGUE="${CATALOGUE:-exercises.json}"
CARNET="${CARNET:-donnees-perso/carnet.json}"
CIBLES="${CIBLES:-db/manuel/cibles.sql}"

EMAIL=""
NOM="Mickaël"
REPARTIR=0
SANS_CATALOGUE=0
SANS_CARNET=0
MOT_DE_PASSE=""

# ------------------------------------------------------------- présentation

VERT=$'\033[0;32m'; ROUGE=$'\033[0;31m'; JAUNE=$'\033[0;33m'; GRIS=$'\033[0;90m'; RAZ=$'\033[0m'
etape=0

titre()  { etape=$((etape + 1)); printf '\n%s──  %d. %s%s\n' "$JAUNE" "$etape" "$1" "$RAZ"; }
ok()     { printf '   %s✓%s %s\n' "$VERT" "$RAZ" "$1"; }
info()   { printf '   %s%s%s\n' "$GRIS" "$1" "$RAZ"; }
echec()  { printf '\n%s✗ %s%s\n\n' "$ROUGE" "$1" "$RAZ" >&2; exit 1; }

dc()   { docker compose -f "$COMPOSE" "$@"; }
sql()  { dc exec -T db psql -U "$UTILISATEUR" -d "$BASE" -tAc "$1" 2>/dev/null || echo ""; }

# ------------------------------------------------------------------ options

while [[ $# -gt 0 ]]; do
    case "$1" in
        --email)             EMAIL="${2:?}"; shift 2 ;;
        --nom)               NOM="${2:?}"; shift 2 ;;
        --mot-de-passe)      MOT_DE_PASSE="${2:?}"; shift 2 ;;
        --repartir-de-zero)  REPARTIR=1; shift ;;
        --sans-catalogue)    SANS_CATALOGUE=1; shift ;;
        --sans-carnet)       SANS_CARNET=1; shift ;;
        -h|--help)           sed -n '2,18p' "$0" | sed 's/^# \?//'; exit 0 ;;
        *)                   echec "Option inconnue : $1" ;;
    esac
done

[[ -n "$EMAIL" ]] || echec "Indique l'adresse du compte :  ./installer.sh --email ton@adresse.fr"
[[ "$EMAIL" == *@*.* ]] || echec "Adresse invalide : $EMAIL"

# ------------------------------------------------------------ vérifications

titre "Vérifications préalables"

command -v docker >/dev/null || echec "Docker est introuvable."
[[ -f "$COMPOSE" ]] || echec "$COMPOSE est introuvable. Lance ce script depuis la racine du dépôt."
[[ -f db/01-schema.sql ]] || echec "db/01-schema.sql est introuvable."
ok "Docker et les fichiers du dépôt"

python3 -c 'import psycopg2' 2>/dev/null \
    || echec "Le pilote PostgreSQL manque :  pip install psycopg2-binary"
ok "Pilote PostgreSQL"

if (( ! SANS_CATALOGUE )) && [[ ! -f "$CATALOGUE" ]]; then
    info "$CATALOGUE absent — téléchargement…"
    curl -fsSL -o "$CATALOGUE" \
      https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json \
      || echec "Téléchargement impossible. Récupère le fichier à la main, ou utilise --sans-catalogue."
fi
(( SANS_CATALOGUE )) || ok "Catalogue : $CATALOGUE ($(du -h "$CATALOGUE" | cut -f1))"

if (( ! SANS_CARNET )) && [[ ! -f "$CARNET" ]]; then
    info "$CARNET absent : les séances ne seront pas importées."
    SANS_CARNET=1
fi
(( SANS_CARNET )) || ok "Carnet : $CARNET"

# ------------------------------------------------------------------- base

if (( REPARTIR )); then
    titre "Remise à zéro"
    printf '   %sTOUTES les données vont être effacées.%s\n' "$ROUGE" "$RAZ"
    read -r -p "   Taper « oui » pour confirmer : " reponse
    [[ "$reponse" == "oui" ]] || echec "Annulé."
    # L'ECHEC N'EST PLUS AVALE (constat 02#19, 17 septembre 2026). Un
    # `|| true` suivi de « Volumes supprimés » annonçait une remise à zéro qui
    # n'avait peut-être pas eu lieu, puis l'installation repartait sur
    # l'ancienne base en croyant partir d'une base neuve.
    dc down -v >/dev/null 2>&1 \
        || echec "La remise à zéro a échoué. Relance « docker compose -f compose.dev.yml down -v » pour voir l'erreur."
    ok "Volumes supprimés"
fi

titre "Base de données"

dc up -d db >/dev/null 2>&1 || echec "Le conteneur de base n'a pas démarré."

printf '   '
for _ in $(seq 1 60); do
    if dc exec -T db pg_isready -U "$UTILISATEUR" -d "$BASE" >/dev/null 2>&1; then
        printf '\n'; break
    fi
    printf '.'; sleep 1
done
dc exec -T db pg_isready -U "$UTILISATEUR" -d "$BASE" >/dev/null 2>&1 \
    || echec "La base ne répond pas après une minute. Regarde :  docker compose -f $COMPOSE logs db"
ok "Base prête"

# le schéma n'est joué qu'à la création du volume : on vérifie qu'il est là
nb_tables=$(sql "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
(( nb_tables >= 17 )) || echec "Seulement $nb_tables tables, il en faut au moins 17. Le schéma n'a pas été appliqué — relance avec --repartir-de-zero."
ok "$nb_tables tables"

nb_aliments=$(sql "SELECT count(*) FROM aliment;")
nb_perso=$(sql "SELECT count(*) FROM exercice WHERE source='perso';")
nb_chrono=$(sql "SELECT count(*) FROM exercice WHERE mode_defaut='chrono' AND source='perso';")
# Zéro aliment sur une installation neuve est le comportement ATTENDU : chaque
# compte saisit les valeurs de ce qu'il a acheté. Ce n'est donc pas un
# contrôle, juste un état des lieux — d'où le `ok` et non un `echec`.
ok "$nb_aliments aliment(s), $nb_perso exercices personnels dont $nb_chrono en chrono"

# ------------------------------------------------- migrations manuelles

titre "Migrations"

# db/ est monté dans docker-entrypoint-initdb.d et ne s'exécute qu'à la
# création de la base ; il décrit désormais le schéma d'AUJOURD'HUI. Sur une
# base neuve, ce qui suit ne trouve donc rien à faire — et c'est normal.
# db/manuel/ reste le seul chemin pour faire évoluer une base qui EXISTE
# DÉJÀ, puisque PostgreSQL ne rejoue jamais db/.
#
# L'ORDRE EST EXPLICITE, ET C'EST UNE CORRECTION.
#
# On listait ces fichiers avec `find … | sort`, c'est-à-dire dans l'ordre
# ALPHABÉTIQUE. Trois conséquences, toutes silencieuses jusqu'au jour de
# l'installation :
#
#   - « aliment-fibres.sql » passait APRÈS « 23-… » alors qu'il crée la
#     colonne `fibres_100` dont des migrations suivantes avaient besoin.
#     Vérifié : sur une base vierge, trois migrations sur quatorze
#     échouaient, et l'installateur s'arrêtait là.
#   - « jeu-essai.sql » — un jeu de DÉMONSTRATION rattaché à un compte
#     d'essai — était joué comme une migration, sur toute installation.
#
# Un tri alphabétique qui fait office d'ordre de dépendances marche jusqu'au
# jour où un nom commence par une lettre. On liste donc à la main.
migrations=""
for fichier in \
    db/manuel/aliment-fibres.sql \
    db/manuel/1[0-9]-*.sql \
    db/manuel/2[0-9]-*.sql \
    db/manuel/3[0-9]-*.sql
do
    [[ -f "$fichier" ]] && migrations+="$fichier"$'\n'
done
migrations=$(printf '%s' "$migrations")

if [[ -z "$migrations" ]]; then
    info "aucune migration à jouer"
else
    for fichier in $migrations; do
        # ON_ERROR_STOP, ET L'ERREUR AFFICHÉE PLUTÔT QUE JETÉE.
        #
        # Sans lui, psql poursuit après une erreur et sort 0 : cette boucle
        # affichait « ✓ » sur un fichier à moitié appliqué. C'est ainsi que
        # « ✓ 25-garde-fous.sql » s'est affiché alors que la migration échouait
        # à sa PREMIÈRE instruction, laissant les six garde-fous absents — et
        # personne pour le dire, puisque 2>&1 partait dans /dev/null.
        #
        # entrypoint-prod.sh le fait correctement depuis le début ; l'écart
        # entre les deux chemins d'installation était le vrai défaut.
        if erreur=$(dc exec -T db psql -U "$UTILISATEUR" -d "$BASE" \
                       -v ON_ERROR_STOP=1 -q < "$fichier" 2>&1); then
            ok "$(basename "$fichier")"
        else
            # ces scripts sont idempotents : un échec signale un vrai souci
            printf '%s\n' "$erreur" | tail -10 >&2
            echec "$(basename "$fichier") a échoué. Rejoue-le seul pour voir l'erreur :
   docker compose -f $COMPOSE exec -T db psql -U $UTILISATEUR -d $BASE \\
     -v ON_ERROR_STOP=1 < $fichier"
        fi
    done
fi

# ------------------------------------------------------------------ compte

titre "Compte administrateur"

dc up -d app >/dev/null 2>&1 || echec "Le conteneur applicatif n'a pas démarré."
sleep 2
dc exec -T app php bin/console cache:clear --quiet >/dev/null 2>&1 || true

existe=$(sql "SELECT count(*) FROM utilisateur WHERE lower(email)=lower('$EMAIL');")
if [[ "$existe" == "1" ]]; then
    ok "Le compte $EMAIL existe déjà"
else
    if [[ -n "$MOT_DE_PASSE" ]]; then
        dc exec -T app php bin/console fitcarnet:creer-utilisateur \
            "$EMAIL" "$NOM" --admin --grocy -p "$MOT_DE_PASSE" >/dev/null \
            || echec "Création du compte impossible."
    else
        printf '\n'
        dc exec app php bin/console fitcarnet:creer-utilisateur \
            "$EMAIL" "$NOM" --admin --grocy \
            || echec "Création du compte impossible."
    fi
    ok "Compte créé : $EMAIL"
fi

# --------------------------------------------------------------- objectifs

titre "Objectifs par repas"

if [[ -f "$CIBLES" ]]; then
    # on injecte l'adresse plutôt que d'obliger à éditer le fichier
    sed "s|v_email       TEXT := '[^']*'|v_email       TEXT := '$EMAIL'|" "$CIBLES" \
        | dc exec -T db psql -U "$UTILISATEUR" -d "$BASE" -q >/dev/null 2>&1 \
        || echec "Les objectifs n'ont pas pu être enregistrés."
    nb_cibles=$(sql "SELECT count(*) FROM cible;")
    ok "$nb_cibles objectifs enregistrés"
else
    info "$CIBLES absent — étape ignorée"
fi

# ---------------------------------------------------------------- catalogue

if (( ! SANS_CATALOGUE )); then
    titre "Catalogue d'exercices"
    deja=$(sql "SELECT count(*) FROM exercice WHERE source='import';")
    if (( deja > 0 )); then
        ok "$deja exercices déjà importés"
    else
        python3 import_catalogue.py "$CATALOGUE" --appliquer >/dev/null \
            || echec "L'import du catalogue a échoué. Relance-le seul pour voir l'erreur."
        importes=$(sql "SELECT count(*) FROM exercice WHERE source='import';")
        ok "$importes exercices importés"
    fi
fi

# ----------------------------------------------------------------- séances

if (( ! SANS_CARNET )); then
    titre "Séances et modèles"
    deja=$(sql "SELECT count(*) FROM seance;")
    if (( deja > 0 )); then
        ok "$deja séances déjà présentes — import ignoré pour éviter les doublons"
    else
        python3 import_carnet.py "$CARNET" --email "$EMAIL" --appliquer >/dev/null \
            || echec "L'import du carnet a échoué. Relance-le seul pour voir l'erreur."
        s=$(sql "SELECT count(*) FROM seance;")
        m=$(sql "SELECT count(*) FROM modele;")
        se=$(sql "SELECT count(*) FROM serie;")
        ok "$m modèles, $s séances, $se séries"
    fi
fi

# -------------------------------------------------------------- sauvegarde

titre "Sauvegarde"

if [[ -x ./sauvegarde.sh ]]; then
    ./sauvegarde.sh >/dev/null 2>&1 && ok "Sauvegarde créée dans sauvegardes/" \
        || info "La sauvegarde a échoué — sans gravité, relance ./sauvegarde.sh"
else
    info "sauvegarde.sh absent ou non exécutable — étape ignorée"
fi

# ------------------------------------------------------------------ résumé

printf '\n%s──  Installation terminée%s\n\n' "$VERT" "$RAZ"
dc exec -T db psql -U "$UTILISATEUR" -d "$BASE" -c "
    SELECT 'aliments'      AS contenu, count(*) FROM aliment
    UNION ALL SELECT 'exercices',       count(*) FROM exercice
    UNION ALL SELECT '  dont personnels', count(*) FROM exercice WHERE source='perso'
    UNION ALL SELECT '  avec vidéo',    count(video_url) FROM exercice
    UNION ALL SELECT '  ratio mesuré',   count(pesee_avant) FROM aliment
    UNION ALL SELECT 'objectifs',       count(*) FROM cible
    UNION ALL SELECT 'modèles',         count(*) FROM modele
    UNION ALL SELECT 'séances',         count(*) FROM seance
    UNION ALL SELECT 'séries',          count(*) FROM serie;"

printf '\nPour lancer l'"'"'application :\n'
printf '   %scd front && npx expo start%s\n' "$GRIS" "$RAZ"
printf 'Connexion : %s\n\n' "$EMAIL"
