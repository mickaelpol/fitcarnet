#!/usr/bin/env bash
#
# fitcarnet — sauvegarde et restauration de la base.
#
#   ./sauvegarde.sh                    sauvegarde complète (développement)
#   ./sauvegarde.sh --catalogue        n'exporte que le référentiel commun
#   ./sauvegarde.sh --restaurer FICHIER
#   ./sauvegarde.sh --lister
#
# Deux formats, deux usages :
#   - complet   (.dump) : restauration à l'identique, y compris ton compte.
#                         C'est ce qu'il faut pour peupler une production VIDE.
#   - catalogue (.sql)  : aliments, exercices, emplacements — aucune donnée
#                         personnelle. À utiliser si la production contient
#                         déjà des comptes.
#
set -euo pipefail

COMPOSE="${COMPOSE:-compose.dev.yml}"
SERVICE="${SERVICE:-db}"
BASE="${BASE:-fitcarnet}"
UTILISATEUR="${UTILISATEUR:-fitcarnet}"
DOSSIER="${DOSSIER:-sauvegardes}"
GARDER="${GARDER:-14}"          # nombre de sauvegardes conservées

dc() { docker compose -f "$COMPOSE" "$@"; }
horodatage() { date +%Y-%m-%d_%H%M%S; }

# --------------------------------------------------------------- complète

sauvegarde_complete() {
    mkdir -p "$DOSSIER"
    local fichier="$DOSSIER/fitcarnet_$(horodatage).dump"

    echo "Sauvegarde complète en cours…"
    # -Fc : format compressé, restaurable sélectivement avec pg_restore
    dc exec -T "$SERVICE" pg_dump -U "$UTILISATEUR" -d "$BASE" -Fc > "$fichier"

    local taille
    taille=$(du -h "$fichier" | cut -f1)
    echo "→ $fichier ($taille)"

    resume
    rotation
}

# -------------------------------------------------------------- catalogue

sauvegarde_catalogue() {
    mkdir -p "$DOSSIER"
    local fichier="$DOSSIER/catalogue_$(horodatage).sql"

    echo "Export du référentiel commun…"
    # --data-only : le schéma est déjà créé par db/01-schema.sql
    # --column-inserts : lisible, et résistant à un changement d'ordre des colonnes
    dc exec -T "$SERVICE" pg_dump -U "$UTILISATEUR" -d "$BASE" \
        --data-only --column-inserts \
        -t aliment -t emplacement -t exercice \
        > "$fichier"

    echo "→ $fichier ($(du -h "$fichier" | cut -f1))"
    echo
    echo "Ce fichier ne contient AUCUNE donnée personnelle :"
    echo "  ni compte, ni séance, ni modèle, ni stock, ni objectif."
}

# ------------------------------------------------------------ restauration

restaurer() {
    local fichier="$1"
    [[ -f "$fichier" ]] || { echo "Fichier introuvable : $fichier" >&2; exit 1; }

    echo "ATTENTION : la base « $BASE » va être ÉCRASÉE par $fichier."
    read -r -p "Taper « oui » pour confirmer : " reponse
    [[ "$reponse" == "oui" ]] || { echo "Annulé."; exit 0; }

    if [[ "$fichier" == *.dump ]]; then
        # --clean --if-exists : on repart d'une base propre sans la recréer
        dc exec -T "$SERVICE" pg_restore -U "$UTILISATEUR" -d "$BASE" \
            --clean --if-exists --no-owner --no-privileges < "$fichier"
    else
        dc exec -T "$SERVICE" psql -U "$UTILISATEUR" -d "$BASE" < "$fichier"
    fi

    echo "Restauration terminée."
    resume
}

# ------------------------------------------------------------------ divers

resume() {
    echo
    dc exec -T "$SERVICE" psql -U "$UTILISATEUR" -d "$BASE" -q -c "
        SELECT 'utilisateurs' AS table, count(*) FROM utilisateur
        UNION ALL SELECT 'aliments',   count(*) FROM aliment
        UNION ALL SELECT 'exercices',  count(*) FROM exercice
        UNION ALL SELECT '  dont vidéo', count(video_url) FROM exercice
        UNION ALL SELECT 'séances',    count(*) FROM seance
        UNION ALL SELECT 'séries',     count(*) FROM serie
        UNION ALL SELECT 'modèles',    count(*) FROM modele
        ORDER BY 1;"
}

rotation() {
    local nombre
    nombre=$(find "$DOSSIER" -name 'fitcarnet_*.dump' | wc -l)
    if (( nombre > GARDER )); then
        find "$DOSSIER" -name 'fitcarnet_*.dump' -printf '%T@ %p\n' \
            | sort -n | head -n $(( nombre - GARDER )) | cut -d' ' -f2- \
            | xargs -r rm --
        echo "Rotation : $(( nombre - GARDER )) ancienne(s) sauvegarde(s) supprimée(s)."
    fi
}

lister() {
    [[ -d "$DOSSIER" ]] || { echo "Aucune sauvegarde."; exit 0; }
    ls -lh "$DOSSIER" | tail -n +2 | awk '{printf "  %-42s %6s  %s %s %s\n", $9, $5, $6, $7, $8}'
}

# -------------------------------------------------------------------- main

case "${1:-}" in
    --catalogue) sauvegarde_catalogue ;;
    --restaurer) restaurer "${2:?Indique le fichier à restaurer}" ;;
    --lister)    lister ;;
    -h|--help)   sed -n '2,20p' "$0" | sed 's/^# \?//' ;;
    "")          sauvegarde_complete ;;
    *)           echo "Option inconnue : $1" >&2; exit 1 ;;
esac
