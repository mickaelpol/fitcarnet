#!/usr/bin/env bash
#
# fitcarnet — installation complète, en une commande.
#
#   ./installer.sh --email ton@adresse.fr
#   ./installer.sh --email ton@adresse.fr --repartir-de-zero
#   ./installer.sh --email ton@adresse.fr --sans-catalogue
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
    dc down -v >/dev/null 2>&1 || true
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
(( nb_tables >= 12 )) || echec "Seulement $nb_tables tables. Le schéma n'a pas été appliqué — relance avec --repartir-de-zero."
ok "$nb_tables tables"

nb_aliments=$(sql "SELECT count(*) FROM aliment;")
nb_perso=$(sql "SELECT count(*) FROM exercice WHERE source='perso';")
nb_chrono=$(sql "SELECT count(*) FROM exercice WHERE mode_defaut='chrono' AND source='perso';")
ok "$nb_aliments aliments, $nb_perso exercices personnels dont $nb_chrono en chrono"

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
    UNION ALL SELECT 'objectifs',       count(*) FROM cible
    UNION ALL SELECT 'modèles',         count(*) FROM modele
    UNION ALL SELECT 'séances',         count(*) FROM seance
    UNION ALL SELECT 'séries',          count(*) FROM serie;"

printf '\nPour lancer l'"'"'application :\n'
printf '   %scd front && npx expo start%s\n' "$GRIS" "$RAZ"
printf 'Connexion : %s\n\n' "$EMAIL"
