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
#   - catalogue (.sql)  : exercices, emplacements — aucune donnée
#                         personnelle. À utiliser si la production contient
#                         déjà des comptes. Les aliments n'en sont pas :
#                         chacun appartient à un compte.
#
# UN FICHIER QUI PORTE SON NOM DÉFINITIF EST COMPLET. Tout ce qui s'écrit ici
# passe d'abord par un « .partiel », renommé seulement après relecture. Voir
# `sauvegarde_complete` pour le pourquoi.
#
set -euo pipefail

COMPOSE="${COMPOSE:-compose.dev.yml}"
SERVICE="${SERVICE:-db}"
BASE="${BASE:-fitcarnet}"
UTILISATEUR="${UTILISATEUR:-fitcarnet}"
DOSSIER="${DOSSIER:-sauvegardes}"
GARDER="${GARDER:-14}"          # nombre de sauvegardes conservées

# En dessous, ce n'est pas une sauvegarde : c'est un fichier tronqué avec une
# extension rassurante. Les dumps réels de cette base pèsent 150 à 200 Ko
# depuis août 2026 — 20 Ko laissent de la marge sans rien laisser passer.
# Même seuil que `sauvegarde-nas.sh:30`, volontairement.
TAILLE_MINIMALE="${TAILLE_MINIMALE:-20000}"

dc() { docker compose -f "$COMPOSE" "$@"; }
horodatage() { date +%Y-%m-%d_%H%M%S; }
echec() { echo "ÉCHEC — $*" >&2; exit 1; }

# Le fichier en cours d'écriture, que le piège ci-dessous doit effacer si on
# n'arrive jamais au renommage. Variable GLOBALE, et non `local` : un `trap`
# s'exécute dans son propre cadre et ne verrait pas une variable de fonction —
# il effacerait alors le fichier nommé par la chaîne vide, c'est-à-dire rien,
# et le `.partiel` survivrait justement dans le seul cas où il gêne.
PARTIEL=""

nettoyer_partiel() {
    if [[ -n "$PARTIEL" ]]; then
        rm -f "$PARTIEL"
        # Vider derrière soi : le piège EXIT se déclenche aussi après un
        # `exit` volontaire, et on ne veut pas d'un second passage.
        PARTIEL=""
    fi
}
# EXIT couvre la fin normale, le `set -e`, `echec` et Ctrl+C (INT).
# Il ne couvre PAS un `kill -9` ni une coupure de courant : dans ce cas le
# `.partiel` reste sur le disque, ce qui est exactement le comportement voulu —
# visible, ignoré par `--lister` et par la rotation, jamais pris pour bon.
trap nettoyer_partiel EXIT

# --------------------------------------------------------------- complète

sauvegarde_complete() {
    mkdir -p "$DOSSIER"
    local fichier="$DOSSIER/fitcarnet_$(horodatage).dump"
    PARTIEL="$fichier.partiel"

    echo "Sauvegarde complète en cours…"

    # -Fc : format compressé, restaurable sélectivement avec pg_restore.
    #
    # ON ÉCRIT DANS UN « .partiel ». Une redirection `>` crée le fichier AVANT
    # de savoir si pg_dump réussit : disque plein, conteneur tué, Ctrl+C, et il
    # restait un `.dump` tronqué portant la bonne date et le bon nom, listé par
    # `--lister` comme les autres. On ne s'en apercevait que le jour de la
    # restauration. Constat 7 de l'audit du 14 septembre 2026 : le correctif
    # avait été fait sur `sauvegarde-nas.sh` en août et pas ici.
    #
    # Aggravant, corrigé du même coup : `rotation()` garde les 14 fichiers les
    # plus récents. Le tronqué étant le plus récent, il était conservé — et
    # c'est une bonne sauvegarde ancienne qui sautait à sa place.
    if ! dc exec -T "$SERVICE" pg_dump -U "$UTILISATEUR" -d "$BASE" -Fc > "$PARTIEL"; then
        echec "pg_dump a échoué. Aucune sauvegarde n'a été écrite."
    fi

    local taille
    taille=$(wc -c < "$PARTIEL")
    if (( taille < TAILLE_MINIMALE )); then
        echec "sauvegarde de $taille octets seulement, c'est trop peu pour être vraie."
    fi

    # `pg_restore --list` relit l'archive : elle prouve qu'elle est lisible, ce
    # qu'une taille ne prouve pas. Une sauvegarde qu'on n'a jamais essayé de
    # relire n'est pas une sauvegarde, c'est un espoir.
    if ! dc exec -T "$SERVICE" pg_restore --list > /dev/null 2>&1 < "$PARTIEL"; then
        echec "l'archive produite est illisible par pg_restore."
    fi

    # `mv` sur un même système de fichiers est atomique : à partir d'ici, le
    # nom définitif ne peut désigner qu'un fichier entier et relu.
    mv "$PARTIEL" "$fichier"
    PARTIEL=""

    echo "→ $fichier ($(du -h "$fichier" | cut -f1))"

    resume
    rotation
}

# -------------------------------------------------------------- catalogue

sauvegarde_catalogue() {
    mkdir -p "$DOSSIER"
    local fichier="$DOSSIER/catalogue_$(horodatage).sql"
    PARTIEL="$fichier.partiel"

    echo "Export du référentiel commun…"
    # --data-only : le schéma est déjà créé par db/01-schema.sql
    # --column-inserts : lisible, et résistant à un changement d'ordre des colonnes
    #
    # Même « .partiel » que pour le dump complet : un export interrompu au
    # milieu d'un INSERT reste un fichier .sql d'apparence normale, et psql le
    # rejouera jusqu'à la ligne coupée avant d'échouer, base à moitié peuplée.
    #
    # AUCUNE TABLE QUI PORTE `utilisateur_id`. Le 17 septembre 2026, `-t aliment`
    # figurait encore ici : les aliments de tous les comptes partaient sous la
    # mention « AUCUNE donnée personnelle », dans un fichier que l'autre base
    # refuse, faute des comptes qu'il désigne. `verifier-migrations.sh` lit la
    # liste ci-dessous et la confronte au schéma.
    if ! dc exec -T "$SERVICE" pg_dump -U "$UTILISATEUR" -d "$BASE" \
        --data-only --column-inserts \
        -t emplacement -t exercice \
        > "$PARTIEL"; then
        echec "pg_dump a échoué. Aucun catalogue n'a été écrit."
    fi

    # Un `--data-only` sur des tables vides réussit et ne produit qu'un
    # en-tête : le fichier existe, pèse deux cents octets, et ne contient rien.
    if ! grep -q '^INSERT INTO' "$PARTIEL"; then
        echec "l'export ne contient aucune ligne INSERT — le référentiel est vide ?"
    fi

    mv "$PARTIEL" "$fichier"
    PARTIEL=""

    echo "→ $fichier ($(du -h "$fichier" | cut -f1))"
    echo
    echo "Ce fichier ne contient AUCUNE donnée personnelle :"
    echo "  ni compte, ni aliment, ni séance, ni modèle, ni stock, ni objectif."
}

# ------------------------------------------------------------ restauration

restaurer() {
    local fichier="$1"
    [[ -f "$fichier" ]] || { echo "Fichier introuvable : $fichier" >&2; exit 1; }

    # Un « .partiel » est une écriture interrompue, pas une sauvegarde. Le
    # restaurer, ce serait écraser la base avec la moitié d'un dump — et par
    # dessus le marché il partirait dans la branche `psql` faute de finir
    # par `.dump`.
    if [[ "$fichier" == *.partiel ]]; then
        echec "« $fichier » est une écriture interrompue, pas une sauvegarde. À supprimer."
    fi

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
    # `-name 'fitcarnet_*.dump'` ne peut pas attraper un `fitcarnet_….dump.partiel` :
    # une écriture interrompue ne compte pas dans les GARDER, et ne fait donc
    # sauter aucune sauvegarde valide.
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

    # Les « .partiel » sont exclus : les afficher au milieu des autres est
    # exactement ce qu'on cherche à éviter. Ils sont comptés à part, parce
    # qu'un `.partiel` qui traîne signale une sauvegarde qui a échoué — le
    # taire serait remplacer un mensonge par un silence.
    ls -lh "$DOSSIER" | tail -n +2 \
        | awk '$9 !~ /\.partiel$/ {printf "  %-42s %6s  %s %s %s\n", $9, $5, $6, $7, $8}'

    local restes
    restes=$(find "$DOSSIER" -name '*.partiel' | wc -l)
    if (( restes > 0 )); then
        echo
        echo "  $restes écriture(s) interrompue(s) (.partiel) — ce ne sont PAS des"
        echo "  sauvegardes : la sauvegarde correspondante a échoué. À supprimer."
    fi
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
