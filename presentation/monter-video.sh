#!/usr/bin/env bash
# =====================================================================
#  Monte la vidéo de démonstration de fitcarnet.
#
#  MUETTE, ET C'EST VOULU. Elle se commente en direct devant le client :
#  une voix off enfermerait le rythme, et on ne pourrait plus s'arrêter sur
#  une question. Les cartons annoncent, les parcours montrent, et le script
#  de narration (script-narration.md) donne le texte à dire, minuté.
#
#  Les parcours sont RALENTIS : à vitesse réelle, une saisie dure une seconde
#  et personne ne voit ce qui s'est passé.
#
#  Usage :  ./presentation/monter-video.sh
# =====================================================================
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANIM="$RACINE/animations"
TRAVAIL="$(mktemp -d)"
trap 'rm -rf "$TRAVAIL"' EXIT

L=1568; H=652                       # la taille native des captures
FOND="0x0f1114"; OR="0xe8b84b"; GRIS="0xb9bec6"
POLICE="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
POLICE_G="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

carton() {   # carton <fichier> <duree> <titre> <sous-titre>
    local sortie="$1" duree="$2" titre="$3" sous="$4"
    printf '%s' "$titre" > "$TRAVAIL/t.txt"
    printf '%s' "$sous"  > "$TRAVAIL/s.txt"
    ffmpeg -y -loglevel error \
        -f lavfi -i "color=c=$FOND:s=${L}x${H}:d=$duree:r=25" \
        -vf "drawtext=fontfile=$POLICE_G:textfile=$TRAVAIL/t.txt:fontcolor=white:fontsize=64:x=(w-tw)/2:y=(h/2)-70,\
drawtext=fontfile=$POLICE:textfile=$TRAVAIL/s.txt:fontcolor=$GRIS:fontsize=30:x=(w-tw)/2:y=(h/2)+30,\
drawbox=x=0:y=0:w=iw:h=4:color=$OR:t=fill" \
        -c:v libx264 -pix_fmt yuv420p -r 25 "$sortie"
}

parcours() { # parcours <fichier> <gif> <ralenti> <legende>
    local sortie="$1" gif="$2" ralenti="$3" legende="$4"
    printf '%s' "$legende" > "$TRAVAIL/l.txt"
    # La légende reste affichée en bas : elle rappelle ce qu'on regarde à
    # quelqu'un qui a décroché deux secondes.
    ffmpeg -y -loglevel error -i "$gif" \
        -vf "setpts=$ralenti*PTS,fps=25,scale=${L}:${H}:force_original_aspect_ratio=decrease,\
pad=${L}:${H}:(ow-iw)/2:(oh-ih)/2:color=$FOND,\
drawbox=x=0:y=ih-58:w=iw:h=58:color=$FOND@0.85:t=fill,\
drawtext=fontfile=$POLICE:textfile=$TRAVAIL/l.txt:fontcolor=$GRIS:fontsize=26:x=40:y=h-42,\
drawbox=x=0:y=0:w=iw:h=4:color=$OR:t=fill" \
        -c:v libx264 -pix_fmt yuv420p -r 25 "$sortie"
}

echo "  cartons…"
carton "$TRAVAIL/00.mp4" 5 "fitcarnet" "Démonstration — deux parcours en conditions réelles"
carton "$TRAVAIL/02.mp4" 6 "1 · L'inventaire du frigo" "On ne corrige que ce qui a bougé, et le traitement part en tâche de fond"
carton "$TRAVAIL/04.mp4" 6 "2 · Composer les repas" "Quatre repas calculés à partir du stock réellement disponible"
carton "$TRAVAIL/06.mp4" 6 "Merci" "Les questions, maintenant"

echo "  parcours…"
parcours "$TRAVAIL/03.mp4" "$ANIM/demo-inventaire.gif"  3.0 \
    "Saisie d'un écart · envoi · application en tâche de fond · le stock passe de 623,5 g à 480 g"
parcours "$TRAVAIL/05.mp4" "$ANIM/demo-calculateur.gif" 3.5 \
    "Composition · les quatre repas obtenus, écart à la cible en couleur"

echo "  assemblage…"
for f in 00 02 03 04 05 06; do echo "file '$TRAVAIL/$f.mp4'"; done > "$TRAVAIL/liste.txt"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$TRAVAIL/liste.txt" \
    -c:v libx264 -pix_fmt yuv420p -movflags +faststart \
    "$RACINE/fitcarnet-demonstration.mp4"

duree=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$RACINE/fitcarnet-demonstration.mp4")
poids=$(du -h "$RACINE/fitcarnet-demonstration.mp4" | cut -f1)
printf '  ✓ fitcarnet-demonstration.mp4 — %.0f s, %s\n' "$duree" "$poids"
