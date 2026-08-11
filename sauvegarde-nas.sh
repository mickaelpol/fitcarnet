#!/bin/sh
#
# fitcarnet — sauvegarde la base de PRODUCTION, sur le NAS.
#
#   ./sauvegarde-nas.sh              une sauvegarde, et rotation
#   ./sauvegarde-nas.sh --lister     ce qui existe, sans rien ecrire
#
# A LANCER PAR LE PLANIFICATEUR DE TACHES DE DSM, UNE FOIS PAR JOUR.
#
# `sauvegarde.sh` (a la racine) vise la base de DEVELOPPEMENT, par
# `compose.dev.yml`. Celle du NAS n'etait sauvegardee que le jour ou quelqu'un
# y pensait — c'est-a-dire le jour d'une migration risquee, et jamais la
# veille de la panne.
#
# ECRIT EN sh : le planificateur DSM n'a pas bash garanti.
#
# LES SAUVEGARDES VIVENT HORS DU CLONE GIT, volontairement. Le depot est
# checkout a /volume1/docker/fitcarnet ; un `git clean` y passerait dessus.
#
set -eu

CONTENEUR="fitcarnet-db"
BASE="fitcarnet"
UTILISATEUR="fitcarnet"
DOSSIER="/volume1/docker/sauvegardes-fitcarnet"
GARDER=14
# En dessous, ce n'est pas une sauvegarde : c'est un fichier vide avec une
# extension rassurante. Une base qui contient le catalogue d'exercices pese
# des centaines de kilo-octets.
TAILLE_MINIMALE=20000

mkdir -p "$DOSSIER"

if [ "${1:-}" = "--lister" ]; then
    ls -lh "$DOSSIER" 2>/dev/null || echo "aucune sauvegarde"
    exit 0
fi

dire() { echo "$(date '+%Y-%m-%d %H:%M:%S')  $*"; }
echec() { dire "ECHEC — $*"; exit 1; }

docker inspect -f '{{.State.Running}}' "$CONTENEUR" 2>/dev/null | grep -q true \
    || echec "$CONTENEUR ne tourne pas. Rien n'a ete sauvegarde."

FICHIER="$DOSSIER/fitcarnet_$(date +%Y-%m-%d_%H%M%S).dump"

# `-Fc` : format compresse, restaurable table par table avec pg_restore. Un
# `.sql` brut ne se restaure qu'en entier, et pese trois fois plus.
#
# ON ECRIT DANS UN FICHIER TEMPORAIRE. Une redirection `>` cree le fichier
# AVANT de savoir si pg_dump reussit : un echec laisse un `.dump` de zero
# octet, avec la bonne date et le bon nom, qui ressemble a une sauvegarde
# jusqu'au jour ou on en a besoin.
if ! docker exec "$CONTENEUR" pg_dump -U "$UTILISATEUR" -d "$BASE" -Fc > "$FICHIER.partiel" 2>/tmp/fitcarnet-dump.err; then
    rm -f "$FICHIER.partiel"
    echec "pg_dump : $(cat /tmp/fitcarnet-dump.err)"
fi

TAILLE=$(wc -c < "$FICHIER.partiel")
if [ "$TAILLE" -lt "$TAILLE_MINIMALE" ]; then
    rm -f "$FICHIER.partiel"
    echec "sauvegarde de $TAILLE octets seulement, c'est trop peu pour etre vraie."
fi

# `pg_restore --list` relit l'archive : elle prouve qu'elle est lisible, ce
# qu'une taille ne prouve pas. Une sauvegarde qu'on n'a jamais essaye de
# relire n'est pas une sauvegarde, c'est un espoir.
if ! docker exec -i "$CONTENEUR" pg_restore --list > /dev/null 2>&1 < "$FICHIER.partiel"; then
    rm -f "$FICHIER.partiel"
    echec "l'archive produite est illisible par pg_restore."
fi

mv "$FICHIER.partiel" "$FICHIER"
dire "$(basename "$FICHIER") — $(( TAILLE / 1024 )) Ko"

# ------------------------------------------------------------- rotation
#
# On garde les GARDER plus recentes. Sans ca le volume se remplit en silence
# pendant des mois, et c'est le NAS entier qui s'arrete — y compris la base
# qu'on croyait proteger.
NOMBRE=$(ls -1 "$DOSSIER"/fitcarnet_*.dump 2>/dev/null | wc -l)
if [ "$NOMBRE" -gt "$GARDER" ]; then
    ls -1t "$DOSSIER"/fitcarnet_*.dump | tail -n +$((GARDER + 1)) | while read -r vieux; do
        rm -f "$vieux"
        dire "supprimee : $(basename "$vieux")"
    done
fi

dire "$NOMBRE sauvegarde(s) dans $DOSSIER"

# ---------------------------------------------------------------------
#  POUR RESTAURER, le jour venu :
#
#    docker stop fitcarnet-app
#    docker exec fitcarnet-db psql -U fitcarnet -d postgres \
#      -c "DROP DATABASE fitcarnet WITH (FORCE)"
#    docker exec fitcarnet-db psql -U fitcarnet -d postgres \
#      -c "CREATE DATABASE fitcarnet OWNER fitcarnet"
#    docker exec -i fitcarnet-db pg_restore -U fitcarnet -d fitcarnet \
#      --no-owner --no-privileges < /volume1/docker/sauvegardes-fitcarnet/....dump
#    docker start fitcarnet-app
# ---------------------------------------------------------------------
