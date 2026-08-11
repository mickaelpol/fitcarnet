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
dire "redemarrage de fitcarnet-app"
$COMPOSE --env-file "$DOSSIER/.env" -f "$DOSSIER/docker-compose.yml" \
    restart fitcarnet-app >>"$JOURNAL" 2>&1 \
    || echec "le redémarrage a échoué. Les 40 dernières lignes :
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
