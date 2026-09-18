#!/bin/sh
#
# fitcarnet — met la production a jour sur le NAS.
#
#   ./deployer-nas.sh              deploie SI le depot a bouge
#   ./deployer-nas.sh --force      redeploie meme sans nouveau commit
#   ./deployer-nas.sh --etat       dit ou on en est, ne touche a rien
#
# POURQUOI CE SCRIPT EXISTE, ET PAS UNE STACK GIT PORTAINER.
#
# Portainer CE sait cloner un depot Git, mais il le clone A L'INTERIEUR DE SON
# PROPRE CONTENEUR, dans /data/compose/<id>/. Le demon Docker du NAS, lui, ne
# voit pas ce chemin : tout `volume: ./db:...` echoue sur
#
#     Bind mount failed: '/data/compose/45/db' does not exist
#
# Resoudre les chemins relatifs d'une stack Git est une fonction de l'edition
# Business. On ne la contourne pas : on arrete de s'en servir. Le code arrive
# par un VRAI clone git, a un endroit fixe que le demon voit, et ce script le
# met a jour. Portainer continue d'afficher et de piloter les conteneurs — il
# ne possede simplement plus la stack.
#
# ECRIT EN sh, PAS EN bash. Le planificateur de taches de Synology execute ce
# qu'on lui donne avec le shell du systeme, et bash n'est pas garanti sur DSM.
#
set -eu

DOSSIER="/volume1/docker/fitcarnet"
BRANCHE="master"
JOURNAL="$DOSSIER/deploiement.log"
VERROU="$DOSSIER/.deploiement-en-cours"

FORCE=0
ETAT=0
for a in "$@"; do
    case "$a" in
        --force) FORCE=1 ;;
        --etat)  ETAT=1 ;;
        -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Option inconnue : $a" >&2; exit 2 ;;
    esac
done

dire() {
    # Tout part dans le journal ET a l'ecran. Le planificateur Synology
    # n'affiche rien : sans fichier, un deploiement rate a 4h du matin est un
    # deploiement dont personne n'apprend jamais l'existence.
    echo "$(date '+%Y-%m-%d %H:%M:%S')  $*" | tee -a "$JOURNAL"
}

echec() { dire "ECHEC — $*"; exit 1; }

[ -d "$DOSSIER/.git" ] || echec "$DOSSIER n'est pas un clone git. Voir DEPLOIEMENT.md."
cd "$DOSSIER"

# --------------------------------------------------------------- git
#
# DSM n'a pas forcement git. Plutot que d'imposer une installation par
# Entware — qui survit mal aux mises a jour de DSM — on passe par une image
# Docker quand la commande manque. C'est la meme chose, en plus lent au
# premier appel.
if command -v git >/dev/null 2>&1; then
    GIT="git"
else
    GIT="docker run --rm -v $DOSSIER:/git -w /git -u $(id -u):$(id -g) alpine/git"
fi

# `docker compose` (DSM 7, Container Manager) ou `docker-compose` (DSM 6).
if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
else
    echec "Ni « docker compose » ni « docker-compose » sur ce NAS."
fi

# ------------------------------------------------------------- secrets
#
# Le fichier n'est PAS dans git — c'est le seul endroit du deploiement que tu
# remplis a la main, une fois. On le verifie avant de toucher au code : mieux
# vaut refuser tout de suite que s'arreter au milieu, apres le pull, avec une
# production a moitie a jour.
[ -f "$DOSSIER/.env" ] || echec "$DOSSIER/.env est absent.
    Il doit contenir DB_PASSWORD, APP_SECRET, JWT_PASSPHRASE, GROCY_URL, GROCY_API_KEY."

for cle in DB_PASSWORD APP_SECRET JWT_PASSPHRASE; do
    grep -q "^$cle=." "$DOSSIER/.env" || echec "$cle manque (ou est vide) dans $DOSSIER/.env"
done

# -------------------------------------------------------------- etat
$GIT fetch --quiet origin "$BRANCHE" || echec "Impossible de joindre Gitea."

ICI=$($GIT rev-parse HEAD)
LA=$($GIT rev-parse "origin/$BRANCHE")

if [ "$ETAT" -eq 1 ]; then
    echo "installe : $ICI"
    echo "publie   : $LA"
    [ "$ICI" = "$LA" ] && echo "-> a jour" || echo "-> en retard, lance ./deployer-nas.sh"
    exit 0
fi

if [ "$ICI" = "$LA" ] && [ "$FORCE" -eq 0 ]; then
    # SILENCIEUX. Cette branche est prise toutes les cinq minutes par le
    # planificateur : y ecrire une ligne noierait les vrais deploiements sous
    # trois cents lignes de « rien a faire » par jour.
    exit 0
fi

# ------------------------------------------------------------ verrou
#
# Deux `docker compose up --build` en parallele sur les memes conteneurs,
# c'est une production dans un etat que personne ne sait decrire. `mkdir` est
# atomique sur tous les systemes de fichiers ; `flock` ne l'est pas partout.
if ! mkdir "$VERROU" 2>/dev/null; then
    dire "Un deploiement est deja en cours ($VERROU). J'abandonne celui-ci."
    exit 0
fi
# Le verrou saute quoi qu'il arrive — y compris si le NAS coupe le script au
# milieu. Un verrou orphelin bloquerait tous les deploiements suivants, en
# silence, jusqu'a ce qu'on s'en apercoive des semaines plus tard.
trap 'rmdir "$VERROU" 2>/dev/null || true' EXIT INT TERM

dire "=== deploiement : $ICI -> $LA"

# On retient a quoi CE script ressemble avant le pull. Voir plus bas.
MOI="$DOSSIER/deployer-nas.sh"
EMPREINTE_AVANT=$(md5sum "$MOI" | cut -d' ' -f1)

# --------------------------------------------------------------- pull
#
# `--ff-only` : on REFUSE de fusionner. Si la production a diverge, c'est que
# quelqu'un a commite directement sur le NAS, et un merge automatique
# fabriquerait un etat qui n'existe dans aucun depot. On s'arrete, bruyamment.
$GIT merge --ff-only "origin/$BRANCHE" \
    || echec "La production a divergé de origin/$BRANCHE.
    Regarde ce qui traine ici :  cd $DOSSIER && git status && git log --oneline -5
    Puis, si le NAS ne doit rien garder :  git reset --hard origin/$BRANCHE"

dire "code a jour"

# CE SCRIPT PEUT SE METTRE A JOUR LUI-MEME, ET C'EST UN PIEGE.
#
# `sh` ne charge pas le fichier en memoire : il le lit au fur et a mesure, en
# retenant sa position. Un `git pull` qui reecrit ce fichier pendant qu'il
# tourne decale tout ce qui suit — dans le meilleur des cas l'ancienne version
# finit tranquillement (c'est ce qui est arrive la premiere fois, et on a
# simplement cru que le correctif n'avait pas pris), dans le pire `sh` reprend
# sa lecture au milieu d'une ligne et execute n'importe quoi.
#
# On se relance donc proprement quand on a change. `--force` parce que le code
# est deja a jour : sans lui, la nouvelle instance constaterait qu'il n'y a
# rien de neuf et sortirait sans rien deployer.
if [ "$EMPREINTE_AVANT" != "$(md5sum "$MOI" | cut -d' ' -f1)" ]; then
    dire "ce script vient d'etre mis a jour : je me relance"
    rmdir "$VERROU" 2>/dev/null || true
    trap - EXIT INT TERM
    exec "$MOI" --force
fi

# ------------------------------------------------------------- stack
#
# `--build` a chaque fois : Docker ne reconstruit que si le Dockerfile ou son
# contexte ont change, et le cout d'un `up` sans build sur un Dockerfile
# modifie, c'est une production qui tourne sur l'ancienne image sans que rien
# ne le dise.
dire "docker compose up -d --build"
$COMPOSE --env-file "$DOSSIER/.env" -f "$DOSSIER/docker-compose.yml" up -d --build \
    >>"$JOURNAL" 2>&1 \
    || echec "docker compose a échoué. Les 40 dernières lignes :
$(tail -40 "$JOURNAL")"

# ON REDEMARRE L'APPLICATION, MEME QUAND COMPOSE DIT N'AVOIR RIEN A FAIRE.
#
# `up -d` ne recree un conteneur que si sa CONFIGURATION change. Or presque
# tout ce qu'on deploie arrive par des montages : `api/`, `docker/Caddyfile`,
# `front/dist`, `telecharger/`. Un push qui ne touche qu'au code laisse donc
# le conteneur intact — et compose annonce fierement que tout est a jour.
#
# Ce n'est pas un detail de confort. Le point d'entree joue les MIGRATIONS et
# vide le cache Symfony ; sans redemarrage, une migration poussee n'est jamais
# appliquee et le cache continue de servir les anciennes routes. La panne est
# silencieuse et n'apparait que plus tard, sur une colonne absente.
#
# On l'a decouvert sur un Caddyfile corrige qui ne prenait pas : le conteneur
# affichait « Up 13 minutes » apres un deploiement qui venait de reussir.
# `fitcarnet-taches` EST DANS LA LISTE, ET C'EST ENCORE PLUS VRAI POUR LUI.
#
# L'application est un serveur : chaque requete repart d'un code relu. Le
# conteneur des taches est UN SEUL processus PHP qui tourne pendant des
# semaines — il a charge ses classes au demarrage et ne les relira jamais.
# Sans ce redemarrage, il appliquerait les inventaires avec le code d'il y a
# trois deploiements, sans que rien ne le signale.
# DANS CET ORDRE, ET PAS D'UN SEUL `restart` — constat 02#9 de l'audit.
#
# `docker compose restart fitcarnet-app fitcarnet-taches` redemarre les deux
# conteneurs SANS REEVALUER `depends_on`. La garantie posee dans
# docker-compose.yml — « fitcarnet-taches attend que fitcarnet-app soit
# healthy » — ne valait donc que pour le tout premier `up`, jamais pour le
# chemin de deploiement reel. Les travailleurs repartaient avec le NOUVEAU code
# pendant que fitcarnet-app en etait encore a `composer install` (jusqu'a trois
# minutes) et a ses migrations : ils appliquaient des inventaires contre une
# base pas encore migree et un vendor/ a moitie ecrit, sur le meme /app monte.
#
# On arrete donc les travailleurs, on redemarre l'application, on ATTEND
# qu'elle soit saine, et on les relance. C'est la main qui refait ce que
# `depends_on` aurait fait.
# Une fonction, PAS un tableau : ce script tourne sous /bin/sh, et `x=(...)`
# est un bashisme que le shell du NAS refuserait — le deploiement mourrait a
# cette ligne. `$COMPOSE` reste non protege : il vaut « docker compose » ou
# « docker-compose », et c'est la decoupe en deux mots qu'on veut ici.
composer_la() {
    $COMPOSE --env-file "$DOSSIER/.env" -f "$DOSSIER/docker-compose.yml" "$@"
}

dire "arret des travailleurs d'inventaire"
composer_la stop fitcarnet-taches >>"$JOURNAL" 2>&1 \
    || echec "l'arrêt des travailleurs a échoué. Les 40 dernières lignes :
$(tail -40 "$JOURNAL")"

dire "redemarrage de fitcarnet-app"
composer_la restart fitcarnet-app >>"$JOURNAL" 2>&1 \
    || echec "le redémarrage a échoué. Les 40 dernières lignes :
$(tail -40 "$JOURNAL")"

# La sonde de fitcarnet-app tourne toutes les 15 s et tolere 20 echecs : cinq
# minutes au pire. On attend six, puis on renonce en le disant — demarrer les
# travailleurs sur une application qui n'a pas fini serait exactement le defaut
# qu'on corrige ici.
dire "attente de fitcarnet-app (sain)"
# Une boucle comptee a la main plutot que `seq` : busybox l'a, mais on ne
# depend pas d'un binaire de plus pour attendre.
SANTE=inconnu
ESSAIS=0
while [ "$ESSAIS" -lt 72 ]; do
    SANTE=$(docker inspect -f '{{.State.Health.Status}}' fitcarnet-app 2>/dev/null || echo inconnu)
    if [ "$SANTE" = "healthy" ]; then
        break
    fi
    ESSAIS=$((ESSAIS + 1))
    sleep 5
done

if [ "$SANTE" != "healthy" ]; then
    dire "$(docker logs --tail 30 fitcarnet-app 2>&1)"
    echec "fitcarnet-app n'est pas sain après six minutes (état : $SANTE).
Les travailleurs restent ARRÊTÉS : ils tourneraient contre une base non migrée.
Relancer à la main une fois la cause corrigée :
  $COMPOSE --env-file $DOSSIER/.env -f $DOSSIER/docker-compose.yml start fitcarnet-taches"
fi

dire "fitcarnet-app est sain, demarrage des travailleurs"
composer_la start fitcarnet-taches >>"$JOURNAL" 2>&1 \
    || echec "le démarrage des travailleurs a échoué. Les 40 dernières lignes :
$(tail -40 "$JOURNAL")"

# ------------------------------------------------------------ verdict
#
# `up -d` rend la main des que Docker a LANCE les conteneurs, pas quand
# l'application repond. Un conteneur qui demarre puis meurt sur une migration
# ratee sort de cette commande avec un code 0. On regarde donc apres.
sleep 15
MORTS=$(docker ps -a --filter "name=fitcarnet-" --filter "status=exited" --format '{{.Names}}' | tr '\n' ' ')
if [ -n "$MORTS" ]; then
    dire "ATTENTION — conteneurs arretes : $MORTS"
    dire "$(docker logs --tail 30 ${MORTS%% *} 2>&1)"
    echec "La stack est montée mais un conteneur est mort."
fi

dire "en ligne — $(docker ps --filter 'name=fitcarnet-' --format '{{.Names}} ({{.Status}})' | tr '\n' ' ')"

# Les images sans nom s'accumulent a chaque `--build` et remplissent le NAS en
# quelques mois. On ne supprime QUE les orphelines : pas de `-a`, qui
# emporterait les images d'autres piles arretees.
docker image prune -f >/dev/null 2>&1 || true

# Le journal ne grandit pas indefiniment.
if [ "$(wc -l < "$JOURNAL")" -gt 5000 ]; then
    tail -2000 "$JOURNAL" > "$JOURNAL.tmp" && mv "$JOURNAL.tmp" "$JOURNAL"
fi

dire "=== termine"
