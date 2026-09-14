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
# LES TRAVAILLEURS N'ONT PAS DE NOM DE CONTENEUR FIXE, ET NE PEUVENT PAS EN
# AVOIR : ils tournent en deux exemplaires (`docker-compose.yml`,
# `replicas: 2`, et un `container_name` ne peut designer qu'un conteneur). On
# les retrouve par leur etiquette compose plutot que par un nom ecrit ici :
# elle survit au prefixe de projet que Portainer ajoute devant, et au
# troisieme exemplaire le jour ou un second compte passera sur Grocy.
SERVICE_TACHES="fitcarnet-taches"
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

en_marche() { docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null | grep -q true; }

# --------------------------------------------- ce qui ecrit dans la base
#
# LE SCRIPT SE CONTREDISAIT — constat E4 de l'audit du 7 septembre 2026,
# corrige le 14 septembre 2026.
#
# Il ecrit plus bas, depuis toujours, que restaurer sous une application qui
# ecrit produit une base a moitie ancienne et a moitie neuve — et il n'arretait
# que `fitcarnet-app`. Les deux travailleurs d'inventaire, eux, interrogent la
# base toutes les deux secondes et SAVENT survivre a sa disparition :
# `TraiterInventaires` attrape l'exception, ferme la connexion et reessaie. Ce
# qui les rend increvables un jour de mise a jour les faisait traverser le
# `DROP DATABASE` sans rien remarquer.

# Ce qui a ete arrete, dans l'ordre ou il faudra le relancer.
ARRETES=""
# Passe a 0 entre le `DROP DATABASE` et la fin de la restauration. Dans cette
# fenetre, une base a moitie remplie : remettre les ecrivains en marche y
# serait pire que de les laisser a terre.
BASE_INTACTE=1
# Renseigne juste avant le remplacement ; le piege de sortie s'en sert pour
# dire comment revenir en arriere.
FILET=""

travailleurs() {
    NOMS=$(docker ps --format '{{.Names}}' \
        --filter "label=com.docker.compose.service=$SERVICE_TACHES" 2>/dev/null || true)
    if [ -z "$NOMS" ]; then
        # Repli sur le nom : une pile montee a la main n'a pas les etiquettes
        # de compose.
        NOMS=$(docker ps --format '{{.Names}}' --filter "name=$SERVICE_TACHES" 2>/dev/null || true)
    fi
    [ -z "$NOMS" ] || echo "$NOMS"
    return 0
}

arreter_les_ecrivains() {
    # `docker ps` ne liste que ce qui tourne : on ne redemarrera donc jamais un
    # conteneur que quelqu'un avait arrete expres avant nous.
    for C in $APPLICATION $(travailleurs); do
        if en_marche "$C"; then
            docker stop "$C" > /dev/null || echec "impossible d'arreter $C."
            ARRETES="$ARRETES $C"
            dire "  arrete : $C"
        else
            dire "  ($C ne tournait pas)"
        fi
    done

    # UN FILTRE QUI NE RAMENE RIEN RESSEMBLE EXACTEMENT A « IL N'Y EN A PAS ».
    # Le jour ou le service sera renomme, on veut le lire ici plutot que de le
    # deduire d'un frigo corrige a l'envers trois jours plus tard.
    if [ -z "$(travailleurs)" ]; then
        dire "  aucun conteneur « $SERVICE_TACHES » trouve. Ce qui tourne encore :"
        docker ps --format '    {{.Names}} ({{.Status}})' --filter "name=fitcarnet" || true
    fi
}

attendre_l_application() {
    # `depends_on: service_healthy` est une notion de compose ; `docker start`
    # ne la connait pas. Les travailleurs relances avant que l'application ait
    # fini de rejouer `db/manuel/` chercheraient des tables en cours de
    # migration. On attend la sonde, jusqu'aux trois minutes du `start_period`
    # declare dans docker-compose.yml.
    I=0
    while [ "$I" -lt 60 ]; do
        SANTE=$(docker inspect \
            -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}sans-sonde{{end}}' \
            "$APPLICATION" 2>/dev/null || echo absente)
        case "$SANTE" in
            healthy|sans-sonde|absente) return 0 ;;
        esac
        sleep 3
        I=$((I + 1))
    done
    dire "  $APPLICATION n'est toujours pas « healthy ». On relance les travailleurs"
    dire "  quand meme : ils savent attendre une base qui ne repond pas encore, et"
    dire "  les laisser a terre en silence serait pire."
    return 0
}

remettre_en_route() {
    [ -n "$ARRETES" ] || return 0
    A_RELANCER="$ARRETES"
    # Vide AVANT de relancer : le piege de sortie repasse par ici, et « docker
    # start » joue deux fois n'est pas ce qu'on veut avoir a demeler dans le
    # journal du jour ou tout va mal.
    ARRETES=""
    for C in $A_RELANCER; do
        if docker start "$C" > /dev/null 2>&1; then
            dire "  relance : $C"
        else
            dire "  !! $C N'EST PAS REPARTI — relance-le a la main."
        fi
        # L'application avant les travailleurs, et on l'attend : c'est son
        # point d'entree qui rejoue les migrations.
        if [ "$C" = "$APPLICATION" ]; then
            attendre_l_application
        fi
    done
    return 0
}

# LE PIEGE DE SORTIE NE RELANCE PAS TOUJOURS, ET C'EST TOUT SON INTERET.
#
# Un `trap` qui redemarre tout quoi qu'il arrive reintroduirait la panne qu'on
# corrige : sur une restauration a moitie faite, il ferait repartir des
# travailleurs devant des lots d'inventaire perimes. Il y a donc deux sorties.
# Avant le remplacement — refus de l'archive, Ctrl-C pendant le filet — la base
# est intacte et tout doit repartir. Apres, on ne redemarre rien et on ecrit ce
# qui reste a terre, plutot que de le laisser decouvrir.
au_depart() {
    CODE=$?
    trap - EXIT
    if [ -n "$ARRETES" ]; then
        if [ "$BASE_INTACTE" = "1" ]; then
            dire "remise en route de ce qui avait ete arrete"
            remettre_en_route
        else
            dire ""
            dire "RIEN N'A ETE REDEMARRE, ET C'EST VOULU : la base a ete remplacee a"
            dire "moitie. Une application qui repart la-dessus sert des donnees fausses,"
            dire "et un travailleur y reprendrait de vieux lots d'inventaire."
            dire "Restent arretes :$ARRETES"
            [ -z "$FILET" ] || dire "Revenir a l'etat d'avant :  $0 --vraiment --fichier $FILET"
            dire "Repartir malgre tout :      docker start$ARRETES"
        fi
    fi
    exit "$CODE"
}
trap au_depart EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

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

    # CE QUE CETTE SAUVEGARDE FERAIT REPARTIR, ET PAS SEULEMENT CE QU'ELLE
    # CONTIENT. Un lot d'inventaire fige dans l'archive est du travail en
    # attente : sans le `--vraiment` ci-dessous, il repartirait vers Grocy avec
    # les quantites de ce jour-la. On le compte ici pour que le chiffre soit
    # connu AVANT de restaurer, pas apres.
    LOTS=$(psql_ "$BASE_ESSAI" \
        "SELECT CASE WHEN to_regclass('public.inventaire_lot') IS NULL THEN 0
                     ELSE (SELECT count(*) FROM inventaire_lot
                            WHERE statut IN ('en_attente', 'en_cours')) END")
    if [ "$LOTS" != "0" ]; then
        dire "$LOTS inventaire(s) fige(s) dans cette sauvegarde — « --vraiment » les"
        dire "marquera « echoue » au lieu de les rejouer."
    fi

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

# ON ARRETE LES ECRIVAINS AVANT MEME LE FILET, ET PAS SEULEMENT L'APPLICATION.
# Le filet aussi se prend base au repos : pris pendant qu'un lot part vers
# Grocy, il figerait un inventaire « en cours » qu'on retrouverait au tour
# suivant, le jour ou il faudrait s'en servir.
dire "arret de ce qui ecrit dans la base"
arreter_les_ecrivains

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

# A PARTIR D'ICI, LA BASE N'EST PLUS INTACTE. Restaurer sous une application
# qui ecrit produit une base a moitie ancienne et a moitie neuve, ce qui est
# pire que les deux : personne ne doit repartir avant la derniere ligne.
BASE_INTACTE=0

dire "remplacement de la base"
psql_ postgres "DROP DATABASE IF EXISTS $BASE WITH (FORCE)" > /dev/null
psql_ postgres "CREATE DATABASE $BASE OWNER $UTILISATEUR" > /dev/null

if ! docker exec -i "$CONTENEUR" pg_restore -U "$UTILISATEUR" -d "$BASE" \
        --no-owner --no-privileges < "$FICHIER"; then
    dire "pg_restore a rencontre des erreurs."
    exit 1
fi

# ------------------------------------------ les inventaires que l'archive ramene
#
# UNE SAUVEGARDE NE RAMENE PAS QUE DES DONNEES : ELLE RAMENE DU TRAVAIL A FAIRE.
#
# Constat E4. Un `inventaire_lot` fige en « en attente » ou « en cours » decrit
# un frigo tel qu'il etait le jour de la sauvegarde. Depuis, il a ete applique,
# ou il ne veut plus rien dire. Des que les travailleurs repartent,
# `reprendreLesAbandonnes()` le voit silencieux depuis bien plus de deux
# minutes, le remet en attente — jeton compris — et le repousse vers Grocy :
# de vieilles quantites ecrasent les vraies, et le frigo reel est corrige a
# l'envers, sans qu'aucune ligne du journal ne le dise.
#
# LES ARRETER NE SUFFISAIT DONC PAS : ca ne reculait la panne que du temps
# d'un `docker start`. Il faut clore ces lots pendant l'unique fenetre ou
# personne ne tourne, c'est-a-dire ici.
#
# « ECHOUE » ET PAS « TERMINE » : ils n'ont pas ete faits, on refuse seulement
# de les faire. L'ecran de rattrapage les montrera avec leur motif et
# l'utilisateur decidera s'il refait son inventaire — c'est lui qui a le frigo
# sous les yeux, pas nous.
if [ "$(psql_ "$BASE" "SELECT to_regclass('public.inventaire_lot') IS NOT NULL")" = "t" ]; then
    # `client_encoding` explicite : le motif part vers un ecran, avec ses
    # accents, et le conteneur n'a pas de locale UTF-8 garantie.
    NEUTRALISES=$(psql_ "$BASE" \
        "SET client_encoding TO 'UTF8';
         UPDATE inventaire_lot
            SET statut  = 'echoue',
                fini_le = now(),
                jeton   = NULL,
                echecs  = '[{\"reference\": \"\", \"motif\": \"Inventaire interrompu par une restauration de la base. Les quantités qu’il portait étaient celles de la sauvegarde : elles n’ont pas été renvoyées. Refais l’inventaire si le frigo a changé.\"}]'::jsonb
          WHERE statut IN ('en_attente', 'en_cours')
        RETURNING id" | wc -l | tr -d ' ')

    # ON RECOMPTE AU LIEU DE CROIRE L'UPDATE. `psql` sans `ON_ERROR_STOP`
    # rend une sortie vide aussi bien pour « zero lot » que pour « la commande
    # a echoue » — et annoncer « 0 neutralise » sur un echec serait le pire
    # des deux mondes.
    RESTANTS=$(psql_ "$BASE" \
        "SELECT count(*) FROM inventaire_lot WHERE statut IN ('en_attente', 'en_cours')")
    [ "$RESTANTS" = "0" ] || echec \
        "$RESTANTS inventaire(s) restaure(s) sont toujours a faire. Rien n'est
       redemarre : les relancer les repousserait vers Grocy avec les quantites
       de la sauvegarde."

    if [ "$NEUTRALISES" != "0" ]; then
        dire "$NEUTRALISES inventaire(s) restaure(s) marque(s) « echoue » — ils ne repartiront pas."
    fi
fi

# La base est de nouveau d'une seule piece : on peut remettre le monde en
# marche. `remettre_en_route` relance l'application, attend sa sonde, puis les
# travailleurs.
BASE_INTACTE=1
dire "remise en route de ce qui avait ete arrete"
remettre_en_route

for t in $TABLES; do
    printf '  %-14s %s\n' "$t" "$(psql_ "$BASE" "SELECT count(*) FROM $t")"
done

dire "restauration terminee."
dire "L'etat d'avant reste disponible : $(basename "$FILET")"
