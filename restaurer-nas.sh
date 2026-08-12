#!/bin/sh
#
# fitcarnet — restaure la base de PRODUCTION depuis une sauvegarde, sur le NAS.
#
#   ./restaurer-nas.sh --essai              restaure dans une base JETABLE et compare
#   ./restaurer-nas.sh --essai --fichier F  meme chose, sur une sauvegarde precise
#   ./restaurer-nas.sh --vraiment           restaure la PRODUCTION (destructif)
#   ./restaurer-nas.sh --lister             les sauvegardes disponibles
#
# POURQUOI UN SCRIPT ET PAS UNE COMMANDE SYMFONY.
#
# Une commande `bin/console` a besoin que l'application demarre, donc que la
# base reponde. Or le jour ou l'on restaure, c'est precisement parce que la
# base est perdue. Un outil de secours qui depend de ce qu'il repare ne sert a
# rien au moment ou l'on en a besoin — c'est la seule chose qu'on lui demande.
#
# ECRIT EN sh, comme ses deux voisins : le planificateur DSM n'a pas bash
# garanti, et le jour de la panne on ne veut pas decouvrir ca.
#
# ------------------------------------------------------------------------
# `--essai` EST LE MODE PAR DEFAUT DE LA REFLEXION, PAS UNE OPTION DE CONFORT.
#
# Une sauvegarde qu'on n'a jamais restauree n'est pas une sauvegarde, c'est une
# hypothese. Ce mode la verifie sans rien risquer : il restaure dans une base
# jetable, compte les lignes des tables principales, les compare a la
# production, puis supprime la base d'essai. A lancer de temps en temps, quand
# tout va bien — c'est le seul moment ou on peut se permettre de decouvrir que
# ca ne marche pas.
# ------------------------------------------------------------------------
#
set -eu

CONTENEUR="fitcarnet-db"
APPLICATION="fitcarnet-app"
BASE="fitcarnet"
UTILISATEUR="fitcarnet"
DOSSIER="/volume1/docker/sauvegardes-fitcarnet"
BASE_ESSAI="essai_restauration"

# Les tables qu'on compte pour dire « les donnees sont la ». Ce ne sont pas
# toutes les tables : ce sont celles dont un chiffre nul ou aberrant se
# remarque immediatement.
TABLES="utilisateur exercice aliment seance serie modele"

dire()  { echo "$(date '+%Y-%m-%d %H:%M:%S')  $*"; }
echec() { dire "ECHEC — $*"; exit 1; }

psql_() { docker exec "$CONTENEUR" psql -U "$UTILISATEUR" -d "$1" -t -A -c "$2"; }

# ------------------------------------------------------------- arguments

MODE=""
FICHIER=""
while [ $# -gt 0 ]; do
    case "$1" in
        --essai)     MODE="essai";  shift ;;
        --vraiment)  MODE="vrai";   shift ;;
        --lister)    MODE="lister"; shift ;;
        --fichier)   FICHIER="${2:?--fichier attend un chemin}"; shift 2 ;;
        *)           echec "option inconnue : $1" ;;
    esac
done

if [ -z "$MODE" ]; then
    # PAS DE MODE PAR DEFAUT. Le plus naturel serait de restaurer ; c'est
    # justement pour ca qu'on refuse. Une commande destructrice ne doit jamais
    # etre celle qu'on obtient en tapant le nom du script par curiosite.
    echec "precise ce que tu veux :  --essai  |  --vraiment  |  --lister"
fi

if [ "$MODE" = "lister" ]; then
    ls -lht "$DOSSIER"/fitcarnet_*.dump 2>/dev/null || echo "aucune sauvegarde"
    exit 0
fi

# ------------------------------------------------------ choix du fichier

if [ -z "$FICHIER" ]; then
    FICHIER=$(ls -1t "$DOSSIER"/fitcarnet_*.dump 2>/dev/null | head -1 || true)
    [ -n "$FICHIER" ] || echec "aucune sauvegarde dans $DOSSIER"
fi
[ -f "$FICHIER" ] || echec "fichier introuvable : $FICHIER"

docker inspect -f '{{.State.Running}}' "$CONTENEUR" 2>/dev/null | grep -q true \
    || echec "$CONTENEUR ne tourne pas."

# ON RELIT L'ARCHIVE AVANT DE TOUCHER A QUOI QUE CE SOIT. `pg_restore --list`
# echoue sur un fichier tronque ou corrompu. Le decouvrir maintenant coute une
# seconde ; le decouvrir apres avoir supprime la base de production coute tout.
docker exec -i "$CONTENEUR" pg_restore --list > /dev/null 2>&1 < "$FICHIER" \
    || echec "archive illisible : $(basename "$FICHIER")"

dire "sauvegarde : $(basename "$FICHIER") — $(( $(wc -c < "$FICHIER") / 1024 )) Ko"

# ------------------------------------------------------------------ essai

if [ "$MODE" = "essai" ]; then
    dire "restauration dans la base jetable « $BASE_ESSAI » — la production n'est pas touchee"

    psql_ postgres "DROP DATABASE IF EXISTS $BASE_ESSAI WITH (FORCE)" > /dev/null
    psql_ postgres "CREATE DATABASE $BASE_ESSAI OWNER $UTILISATEUR" > /dev/null

    docker exec -i "$CONTENEUR" pg_restore -U "$UTILISATEUR" -d "$BASE_ESSAI" \
        --no-owner --no-privileges < "$FICHIER" \
        || echec "pg_restore a echoue sur la base d'essai."

    ECARTS=0
    printf '%-14s %12s %12s\n' "table" "production" "restauree"
    for t in $TABLES; do
        # La production peut avoir bouge depuis la sauvegarde : on affiche les
        # deux, on ne crie que sur un ZERO. Un ecart de quelques lignes est
        # normal, une table vide ne l'est jamais.
        prod=$(psql_ "$BASE" "SELECT count(*) FROM $t")
        rest=$(psql_ "$BASE_ESSAI" "SELECT count(*) FROM $t")
        printf '%-14s %12s %12s' "$t" "$prod" "$rest"
        if [ "$rest" -eq 0 ] && [ "$prod" -ne 0 ]; then
            printf '   <-- VIDE ALORS QUE LA PRODUCTION NE L EST PAS'
            ECARTS=$((ECARTS + 1))
        fi
        printf '\n'
    done

    psql_ postgres "DROP DATABASE IF EXISTS $BASE_ESSAI WITH (FORCE)" > /dev/null
    dire "base d'essai supprimee"

    [ "$ECARTS" -eq 0 ] || echec "$ECARTS table(s) vide(s) : cette sauvegarde ne vaut rien."
    dire "cette sauvegarde est restaurable. Verifie quand meme les chiffres ci-dessus."
    exit 0
fi

# ---------------------------------------------------------------- la vraie

dire ""
dire "TU VAS REMPLACER LA BASE DE PRODUCTION PAR CELLE DU $(basename "$FICHIER")."
dire "Tout ce qui a ete saisi depuis sera perdu."
dire ""
printf 'Tape exactement  restaurer  pour continuer : '
read -r REPONSE
[ "$REPONSE" = "restaurer" ] || echec "annule."

# UNE SAUVEGARDE DE L'ETAT ACTUEL D'ABORD, MEME S'IL EST CASSE.
# On restaure justement quand quelque chose a mal tourne — et « mal tourne »
# ne veut pas dire « sans valeur ». Si la restauration se revele pire que le
# mal, il faut pouvoir revenir a l'instant d'avant.
FILET="$DOSSIER/avant-restauration_$(date +%Y-%m-%d_%H%M%S).dump"
if docker exec "$CONTENEUR" pg_dump -U "$UTILISATEUR" -d "$BASE" -Fc > "$FILET.partiel" 2>/dev/null; then
    mv "$FILET.partiel" "$FILET"
    dire "etat actuel mis de cote : $(basename "$FILET")"
else
    rm -f "$FILET.partiel"
    dire "l'etat actuel n'a pas pu etre sauvegarde — la base est sans doute deja perdue."
fi

# ON ARRETE L'APPLICATION. Restaurer sous une application qui ecrit produit
# une base a moitie ancienne et a moitie neuve, ce qui est pire que les deux.
dire "arret de $APPLICATION"
docker stop "$APPLICATION" > /dev/null 2>&1 || dire "($APPLICATION n'etait pas demarre)"

dire "remplacement de la base"
psql_ postgres "DROP DATABASE IF EXISTS $BASE WITH (FORCE)" > /dev/null
psql_ postgres "CREATE DATABASE $BASE OWNER $UTILISATEUR" > /dev/null

if ! docker exec -i "$CONTENEUR" pg_restore -U "$UTILISATEUR" -d "$BASE" \
        --no-owner --no-privileges < "$FICHIER"; then
    dire "pg_restore a rencontre des erreurs. L'application reste ARRETEE."
    dire "Pour revenir a l'etat d'avant :"
    dire "  $0 --vraiment --fichier $FILET"
    exit 1
fi

dire "redemarrage de $APPLICATION"
docker start "$APPLICATION" > /dev/null

for t in $TABLES; do
    printf '  %-14s %s\n' "$t" "$(psql_ "$BASE" "SELECT count(*) FROM $t")"
done

dire "restauration terminee."
dire "L'etat d'avant reste disponible : $(basename "$FILET")"
