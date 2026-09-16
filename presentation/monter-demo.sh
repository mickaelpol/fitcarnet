#!/usr/bin/env bash
# =====================================================================
#  MONTE LA DÉMONSTRATION DE FITCARNET À PARTIR DU TOURNAGE CONTINU.
#
#  Entrée  : le .webm déposé par presentation/tournage/tourner.mjs
#  Sortie  : presentation/fitcarnet-demonstration.mp4
#
#  MUETTE, ET C'EST VOULU. Elle se commente en direct devant le client :
#  une voix off enfermerait le rythme et on ne pourrait plus s'arrêter sur
#  une question. Les cartons annoncent, les parcours montrent, la légende du
#  bas rattrape celui qui a décroché deux secondes, et demonstration.md
#  donne le texte à dire.
#
#  (`script-narration.md` a porté ce texte jusqu'au 17 septembre 2026, où il a
#  été absorbé dans `presentation/demonstration.md` avec trois autres documents.)
#
#  Usage :  ./presentation/monter-demo.sh
# =====================================================================
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRUT="$RACINE/tournage/brut"
SORTIE="$RACINE/fitcarnet-demonstration.mp4"

TRAVAIL="$(mktemp -d)"
trap 'rm -rf "$TRAVAIL"' EXIT

# ---------------------------------------------------------------------
#  LA TABLE DE DÉCOUPAGE — LE SEUL RÉGLAGE À TOUCHER APRÈS VISIONNAGE.
#
#  Un tournage n'est jamais deux fois de la même longueur : les temps de
#  chargement varient, et `tourner.mjs` avale les étapes qui échouent sans
#  s'arrêter, ce qui décale tout ce qui suit. Ces bornes sont donc à
#  RECALER À CHAQUE TOURNAGE, elles ne se devinent pas du code.
#
#  Une entrée par séquence, au format "début:fin" en SECONDES depuis le
#  début du brut. `fin` comme borne finale veut dire « jusqu'au bout du
#  fichier » — pratique pour la dernière séquence, dont la longueur dépend
#  de la fermeture du navigateur.
#
#  POUR RECALER : lire `presentation/tournage/decoupe.json`, que le tournage
#  écrit lui-même en notant l'instant où il passe d'une séquence à l'autre, et
#  reporter ses `debut` ici. Ne pas les relever à l'œil dans un lecteur : c'est
#  long, et faux à la seconde près. Le script vérifie que les bornes croissent
#  et tiennent dans la durée réelle, et refuse de monter sinon plutôt que de
#  produire un film aux coupes fausses.
#
#  ATTENTION AU DÉCALAGE SILENCIEUX : si une séquence du tournage échoue, tout
#  ce qui suit remonte dans le brut, les bornes restent valides — et les cartons
#  annoncent alors le mauvais parcours. Relire decoupe.json à chaque tournage.
# ---------------------------------------------------------------------
#  CES BORNES NE SONT PAS DEVINÉES : elles viennent de
#  `presentation/tournage/decoupe.json`, que le tournage écrit lui-même en
#  notant l'instant où il passe d'une séquence à l'autre. Les relever à l'œil
#  dans un lecteur serait long et faux ; le script qui pilote le navigateur,
#  lui, sait exactement quand il a changé d'écran.
DECOUPE=(
    "0:7"         # 1 · connexion
    "7:23"        # 2 · frigo, le stock
    "23:39"       # 3 · frigo, l'inventaire
    "39:50"       # 4 · repas, les cibles
    "50:80"       # 5 · repas, composer
    "80:94"       # 6 · repas, batch cooking
    "94:126"      # 7 · séances, liste puis détail
    "126:fin"     # 8 · modèles
)

# ---------------------------------------------------------------------
#  LES TEXTES, DANS L'ORDRE DES SÉQUENCES.
#
#  Quatre champs séparés par « | » : chapitre | titre | sous-titre | légende.
#  Ils sont dans UN SEUL tableau pour qu'on ne puisse pas renuméroter le
#  carton sans renuméroter le chapitre : ce sont les mêmes séquences vues
#  de deux endroits, elles doivent se déplacer ensemble.
#
#  Le champ chapitre reste sobre : ffmetadata donne un sens particulier à
#  « = », « ; », « # » et « \ », qu'on évite plutôt que de les échapper.
# ---------------------------------------------------------------------
SEQUENCES=(
    "1. Ouverture|1 · Ouverture|Un compte par invitation, une session déjà ouverte|Ouverture de l'application — chaque compte ne voit que ses propres données"
    "2. Le frigo, le stock|2 · Le frigo — le stock|Ce qu'il y a, où c'est rangé, et ce que ça vaut|Stock par emplacement · le détail d'un aliment, tel qu'on le pèse"
    "3. Le frigo, l'inventaire|3 · Le frigo — l'inventaire|On ne corrige que ce qui a bougé|Trois écarts saisis · envoi en lot · application en tâche de fond"
    "4. Les repas, les cibles|4 · Les repas — les cibles|Une cible par repas, pas seulement un total pour la journée|Cibles par repas · un repas déplié montre sa part de la journée"
    "5. Les repas, composer|5 · Les repas — composer|Quatre repas calculés à partir du stock réellement disponible|Composition · quantités à peser, écart à la cible affiché en clair"
    "6. Les repas, batch cooking|6 · Les repas — batch cooking|Une cuisson, plusieurs boîtes|Fournées et répartition en boîtes · le cru et le cuit ne se confondent pas"
    "7. Les séances|7 · Les séances|La liste, puis le détail : une série saisie, le 1RM suit|Saisie d'une série · le 1RM estimé se recalcule sous les yeux"
    "8. Les modèles|8 · Les modèles|Les programmes qui servent de patron aux séances|Programmes types · le patron d'où partent les séances"
)

# ---------------------------------------------------------------------
#  Réglages d'image. La taille est celle du viewport de `tourner.mjs` :
#  la changer ici sans la changer là-bas ferait rescaler tout le film.
# ---------------------------------------------------------------------
L=1440; H=900                    # le viewport de tourner.mjs
IPS=25                           # tourner.mjs enregistre à 25 im/s
CARTON_SECONDES=4                # le temps de lire un titre à voix haute

FOND="0x0f1114"; OR="0xe8b84b"; GRIS="0xb9bec6"
POLICE="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
POLICE_G="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# x264 identique partout : le démultiplexeur `concat` recolle sans réencoder,
# donc le moindre écart de profil ou d'échelle de temps entre deux morceaux
# donne un fichier qui se lit chez soi et saccade chez le client.
ENCODAGE=(-c:v libx264 -preset medium -crf 20 -profile:v high -level 4.1
          -pix_fmt yuv420p -r "$IPS" -video_track_timescale 12800 -an)

echec() { printf 'monter-demo : %s\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------------
#  Vérifications préalables. Toutes AVANT le premier encodage : découvrir
#  qu'une police manque après six minutes de calcul est une perte sèche.
# ---------------------------------------------------------------------
for outil in ffmpeg ffprobe; do
    command -v "$outil" >/dev/null 2>&1 || echec "$outil est introuvable. Installer ffmpeg."
done

for fonte in "$POLICE" "$POLICE_G"; do
    [ -r "$fonte" ] || echec "police absente : $fonte (paquet fonts-dejavu-core)"
done

[ "${#DECOUPE[@]}" -eq "${#SEQUENCES[@]}" ] \
    || echec "DECOUPE a ${#DECOUPE[@]} entrées et SEQUENCES ${#SEQUENCES[@]} : il en faut autant."

# Le nom du brut est un hash que Playwright change à chaque tournage : on ne
# peut que le chercher. `tourner.mjs` vide brut/ avant d'enregistrer, mais un
# tournage interrompu peut en laisser deux — on prend alors le plus récent.
[ -d "$BRUT" ] || echec "répertoire absent : $BRUT — lancer d'abord presentation/tournage/tourner.mjs"

mapfile -t TROUVES < <(find "$BRUT" -maxdepth 1 -type f -name '*.webm' -printf '%T@ %p\n' \
                       | sort -rn | cut -d' ' -f2-)

if [ "${#TROUVES[@]}" -eq 0 ]; then
    echec "aucun .webm dans $BRUT — lancer d'abord :
  DEMO_MDP='…' node presentation/tournage/tourner.mjs"
fi

SOURCE="${TROUVES[0]}"
[ "${#TROUVES[@]}" -gt 1 ] && printf '  %d .webm présents, on prend le plus récent.\n' "${#TROUVES[@]}"

# Un webm encore en cours d'écriture n'a pas de durée lisible. Le dire
# franchement vaut mieux que de couper huit séquences dans un fichier
# tronqué et de ne s'en apercevoir qu'à la projection.
DUREE_BRUT="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SOURCE" 2>/dev/null || true)"
case "$DUREE_BRUT" in
    ''|N/A|0) echec "durée illisible dans $(basename "$SOURCE") : fichier tronqué, ou tournage encore en cours." ;;
esac

printf '  source  %s (%.0f s)\n' "$(basename "$SOURCE")" "$DUREE_BRUT"

# ---------------------------------------------------------------------
#  Contrôle de la table de découpage contre la durée réelle du brut.
# ---------------------------------------------------------------------
precedent=0
for rang in "${!DECOUPE[@]}"; do
    debut="${DECOUPE[$rang]%%:*}"
    fin="${DECOUPE[$rang]##*:}"
    [ "$fin" = "fin" ] && fin="${DUREE_BRUT%.*}"

    case "$debut$fin" in
        *[!0-9]*) echec "DECOUPE[$rang] = « ${DECOUPE[$rang]} » : attendu « début:fin » en secondes entières." ;;
    esac
    [ "$fin" -gt "$debut" ] || echec "DECOUPE[$rang] = « ${DECOUPE[$rang]} » : la fin doit dépasser le début."
    [ "$debut" -ge "$precedent" ] || echec "DECOUPE[$rang] recule sur la précédente : les bornes doivent croître."
    awk -v f="$fin" -v d="$DUREE_BRUT" 'BEGIN{exit !(f<=d+1)}' \
        || echec "DECOUPE[$rang] finit à ${fin}s, le brut n'en fait que ${DUREE_BRUT%.*}. Recaler la table."
    precedent="$fin"
done

# ---------------------------------------------------------------------
#  Fabrication des morceaux.
#
#  `textfile=` et non `text=` : les titres portent des accents et des
#  apostrophes françaises, que la ligne de filtre de ffmpeg mange — deux
#  niveaux d'échappement, un pour le shell, un pour le graphe de filtres.
#  Écrire le texte dans un fichier supprime les deux.
# ---------------------------------------------------------------------
carton() {   # carton <fichier> <titre> <sous-titre>
    local sortie="$1" titre="$2" sous="$3"
    printf '%s' "$titre" > "$TRAVAIL/titre.txt"
    printf '%s' "$sous"  > "$TRAVAIL/sous.txt"
    ffmpeg -y -loglevel error \
        -f lavfi -i "color=c=$FOND:s=${L}x${H}:d=$CARTON_SECONDES:r=$IPS" \
        -vf "drawtext=fontfile=$POLICE_G:textfile=$TRAVAIL/titre.txt:expansion=none:\
fontcolor=white:fontsize=64:x=(w-tw)/2:y=(h/2)-90,\
drawtext=fontfile=$POLICE:textfile=$TRAVAIL/sous.txt:expansion=none:\
fontcolor=$GRIS:fontsize=30:x=(w-tw)/2:y=(h/2)+20,\
drawbox=x=0:y=0:w=iw:h=4:color=$OR:t=fill,setsar=1" \
        "${ENCODAGE[@]}" "$sortie"
}

segment() {  # segment <fichier> <début> <durée> <légende>
    local sortie="$1" debut="$2" duree="$3" legende="$4"
    printf '%s' "$legende" > "$TRAVAIL/legende.txt"
    # setpts=PTS-STARTPTS : après un `-ss`, les horodatages du webm de
    # Playwright repartent de l'instant de coupe et le morceau commence par
    # plusieurs secondes de gel une fois recollé.
    ffmpeg -y -loglevel error -ss "$debut" -t "$duree" -i "$SOURCE" \
        -vf "setpts=PTS-STARTPTS,fps=$IPS,\
scale=${L}:${H}:force_original_aspect_ratio=decrease,\
pad=${L}:${H}:(ow-iw)/2:(oh-ih)/2:color=$FOND,setsar=1,\
drawbox=x=0:y=ih-64:w=iw:h=64:color=$FOND@0.97:t=fill,\
drawtext=fontfile=$POLICE:textfile=$TRAVAIL/legende.txt:expansion=none:\
fontcolor=$GRIS:fontsize=26:x=44:y=h-46,\
drawbox=x=0:y=0:w=iw:h=4:color=$OR:t=fill" \
        "${ENCODAGE[@]}" "$sortie"
}

duree_de() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

: > "$TRAVAIL/liste.txt"
: > "$TRAVAIL/bornes.txt"

for rang in "${!SEQUENCES[@]}"; do
    IFS='|' read -r chapitre titre sous legende <<< "${SEQUENCES[$rang]}"
    debut="${DECOUPE[$rang]%%:*}"
    fin="${DECOUPE[$rang]##*:}"
    [ "$fin" = "fin" ] && fin="${DUREE_BRUT%.*}"

    numero="$(printf '%02d' "$rang")"
    printf '  %s  %s\n' "$numero" "$titre"

    carton  "$TRAVAIL/${numero}a.mp4" "$titre" "$sous"
    segment "$TRAVAIL/${numero}b.mp4" "$debut" "$((fin - debut))" "$legende"

    printf "file '%s'\n" "$TRAVAIL/${numero}a.mp4" "$TRAVAIL/${numero}b.mp4" >> "$TRAVAIL/liste.txt"
    # Les durées RÉELLES des deux morceaux, pas celles qu'on a demandées :
    # l'arrondi à l'image près décale de quelques centièmes par séquence, et
    # au huitième chapitre le saut tombe au milieu du parcours précédent.
    printf '%s\t%s\t%s\n' "$chapitre" \
        "$(duree_de "$TRAVAIL/${numero}a.mp4")" \
        "$(duree_de "$TRAVAIL/${numero}b.mp4")" >> "$TRAVAIL/bornes.txt"
done

# ---------------------------------------------------------------------
#  Les chapitres, pour sauter d'un parcours à l'autre pendant les questions
#  d'un client. Chaque chapitre commence SUR SON CARTON : on atterrit sur le
#  titre, pas au milieu d'un défilement qu'il faudrait expliquer.
# ---------------------------------------------------------------------
{
    printf ';FFMETADATA1\n'
    printf 'title=fitcarnet — démonstration\n'
    depart_ms=0
    while IFS=$'\t' read -r chapitre duree_carton duree_segment; do
        longueur_ms="$(awk -v a="$duree_carton" -v b="$duree_segment" \
                       'BEGIN{printf "%d", (a+b)*1000}')"
        printf '\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=%d\nEND=%d\ntitle=%s\n' \
            "$depart_ms" "$((depart_ms + longueur_ms))" "$chapitre"
        depart_ms=$((depart_ms + longueur_ms))
    done < "$TRAVAIL/bornes.txt"
} > "$TRAVAIL/chapitres.txt"

echo "  assemblage…"
# `-c copy` : les morceaux sortent tous du même encodeur avec les mêmes
# réglages, les recoller n'a pas à les réencoder une deuxième fois — ce qui
# coûterait une génération de qualité sur du texte à l'écran.
ffmpeg -y -loglevel error -f concat -safe 0 -i "$TRAVAIL/liste.txt" \
    -c copy "$TRAVAIL/assemble.mp4"

# Passe séparée pour les chapitres : `concat` ne sait pas prendre les
# métadonnées d'une seconde entrée. Elle ne réencode rien.
ffmpeg -y -loglevel error -i "$TRAVAIL/assemble.mp4" -i "$TRAVAIL/chapitres.txt" \
    -map 0 -map_chapters 1 -c copy -movflags +faststart "$SORTIE"

duree="$(duree_de "$SORTIE")"
poids="$(du -h "$SORTIE" | cut -f1)"
nombre="$(ffprobe -v error -show_chapters -of csv=p=0 "$SORTIE" | grep -c . || true)"
printf '\n  %s\n  %d min %02d s · %s · %s chapitres\n' \
    "$(basename "$SORTIE")" \
    "$(awk -v d="$duree" 'BEGIN{printf "%d", d/60}')" \
    "$(awk -v d="$duree" 'BEGIN{printf "%d", d%60}')" \
    "$poids" "$nombre"
