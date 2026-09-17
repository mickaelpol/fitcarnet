#!/usr/bin/env bash
# =====================================================================
#  PRÉPARER LA DÉMONSTRATION DE FITCARNET — LE POINT D'ENTRÉE UNIQUE.
#
#  Entrée  : l'application qui tourne, et le jeu de données chargé EN DEUX
#            TEMPS (jeu-essai.sql PUIS jeu-demo.sql).
#  Sorties : presentation/captures/*.jpg            les images
#            presentation/fitcarnet-presentation.html les slides
#            presentation/fitcarnet-dossier.html      ce qu'on dit, dans l'ordre
#            presentation/fitcarnet-tournage.html     quoi filmer, plan par plan, minuté
#            presentation/fitcarnet-demonstration.mp4 la vidéo (option --video)
#
#  POURQUOI UN SEUL SCRIPT.
#
#  Jusqu'au 17 septembre 2026, préparer une démonstration demandait d'ouvrir
#  huit documents et de lancer plusieurs commandes dans le bon ordre. Deux
#  d'entre eux se contredisaient, et la liste « avant d'entrer dans la salle »
#  de `demo-30-minutes.md` ne citait que `jeu-demo.sql` : en la suivant à la
#  lettre on arrivait avec un FRIGO VIDE, et le frigo est le premier tiers de la
#  démonstration. Relevé par `verite-documentaire` le 16 septembre 2026.
#
#  TOUTES LES VÉRIFICATIONS SONT FAITES AVANT LE PREMIER TRAVAIL. Découvrir
#  qu'il manque Playwright après quatre minutes de capture est une perte sèche —
#  c'est la règle déjà appliquée dans `monter-demo.sh`.
#
#  Usage :  ./presentation/preparer-demonstration.sh [--captures] [--slides]
#                                                    [--dossier] [--video]
#           (sans option : captures + slides + dossier)
# =====================================================================
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPOT="$(cd "$RACINE/.." && pwd)"

ADRESSE="${DEMO_URL:-http://localhost:8080}"
COMPTE="${DEMO_COMPTE:-demo@fitcarnet.local}"

echec() { printf '\npreparer-demonstration : %s\n' "$1" >&2; exit 1; }
titre() { printf '\n\033[1m%s\033[0m\n' "$1"; }
bon()   { printf '  ✓ %s\n' "$1"; }
note()  { printf '  · %s\n' "$1"; }

aide() {
    # De la ligne 3 jusqu'au trait de fermeture du cartouche, celui-ci retiré.
    # PAS UN NUMÉRO DE LIGNE EN DUR : la première version disait « 3,25 » et
    # coupait l'usage en deux dès qu'on ajoutait une ligne de commentaire.
    sed -n '3,/^# =\{20,\}$/p' "${BASH_SOURCE[0]}" | sed '$d' | sed 's/^#\s\{0,2\}//'
    cat <<'FIN'

CE QU'IL ATTEND
  - l'application joignable (DEMO_URL, défaut http://localhost:8080) ;
  - un compte de démonstration (DEMO_COMPTE) et son mot de passe (DEMO_MDP) ;
  - LE JEU DE DONNÉES CHARGÉ EN DEUX TEMPS, dans cet ordre :
        1) db/manuel/jeu-essai.sql   les aliments et le stock
        2) db/manuel/jeu-demo.sql    l'historique — il ne pose NI l'un NI l'autre
    Les commandes exactes sont dans presentation/demonstration.md, partie I.1.

FACULTATIF
  DEMO_ADMIN_COMPTE / DEMO_ADMIN_MDP  les quatre écrans d'administration
  DEMO_SEANCE / DEMO_MODELE           ouvrir une séance / un modèle précis
  DEMO_ECRIRE=1                       les deux images de l'inventaire en tâche
                                      de fond — ELLES ÉCRIVENT (voir ci-dessous)
  ffmpeg + fonts-dejavu-core          pour --video

CE QU'IL ÉCRIT
  RIEN, par défaut : il lit l'application par le navigateur, comme un
  utilisateur, et ne touche ni à la base ni aux comptes.
  DEMO_ECRIRE=1 est la seule exception, et elle est explicite : les captures
  12 et 13 déposent trois corrections d'inventaire sur le compte de
  démonstration, parce que « Tu peux quitter l'écran, ça continue tout seul »
  ne s'obtient pas en regardant. Le stock bouge pour de bon — rejoue ensuite
  db/manuel/jeu-essai.sql. Sans ce drapeau, deux slides afficheront
  « capture manquante », et c'est le moindre mal.

CE QU'IL NE FAIT PAS
  Le recalage de la table de découpage de monter-demo.sh reste manuel, et il ne
  se devine pas du code — voir --video.
FIN
}

# ---------------------------------------------------------------------
#  Les options.
# ---------------------------------------------------------------------
FAIRE_CAPTURES=0; FAIRE_SLIDES=0; FAIRE_DOSSIER=0; FAIRE_VIDEO=0; CHOISI=0

for argument in "$@"; do
    case "$argument" in
        --captures) FAIRE_CAPTURES=1; CHOISI=1 ;;
        --slides)   FAIRE_SLIDES=1;   CHOISI=1 ;;
        --dossier)  FAIRE_DOSSIER=1;  CHOISI=1 ;;
        --video)    FAIRE_VIDEO=1;    CHOISI=1 ;;
        --tout)     FAIRE_CAPTURES=1; FAIRE_SLIDES=1; FAIRE_DOSSIER=1; FAIRE_VIDEO=1; CHOISI=1 ;;
        -h|--aide|--help) aide; exit 0 ;;
        *) echec "option inconnue « $argument ». Voir --aide." ;;
    esac
done

if [ "$CHOISI" -eq 0 ]; then
    FAIRE_CAPTURES=1; FAIRE_SLIDES=1; FAIRE_DOSSIER=1
fi

# ---------------------------------------------------------------------
#  1. LES PRÉREQUIS, TOUS AVANT LE PREMIER TRAVAIL.
# ---------------------------------------------------------------------
titre "1 · Les prérequis"

command -v python3 >/dev/null 2>&1 || echec "python3 est introuvable : il construit les slides et le dossier."
bon "python3 $(python3 -c 'import sys;print(".".join(map(str,sys.version_info[:3])))')"

[ -r "$RACINE/demonstration.md" ] \
    || echec "presentation/demonstration.md est absent — c'est la SEULE source du dossier et de l'inventaire."
bon "demonstration.md ($(wc -l < "$RACINE/demonstration.md") lignes)"

if [ "$FAIRE_CAPTURES" -eq 1 ] || [ "$FAIRE_VIDEO" -eq 1 ]; then
    command -v node >/dev/null 2>&1 || echec "node est introuvable : il pilote le navigateur."
    bon "node $(node --version)"

    [ -d "$RACINE/tournage/node_modules/playwright" ] \
        || echec "Playwright n'est pas installé. Depuis presentation/tournage/ :
  npm install && npx playwright install chromium"
    bon "playwright présent"

    # L'APPLICATION DOIT RÉPONDRE, ET ON LE VÉRIFIE ICI PLUTÔT QU'EN PLEIN
    # PARCOURS : un `goto` qui expire au bout de 45 s donne un message de
    # Playwright, pas une adresse à corriger.
    if ! curl -fsS -o /dev/null --max-time 8 "$ADRESSE/" 2>/dev/null; then
        echec "l'application ne répond pas sur $ADRESSE
  Démarre-la :  docker compose -f compose.dev.yml up -d
  ou vise-la :  DEMO_URL='https://…' $0"
    fi
    bon "application joignable sur $ADRESSE"

    [ -n "${DEMO_MDP:-}" ] || echec "DEMO_MDP n'est pas défini — le mot de passe du compte de démonstration.
  DEMO_MDP='…' $0
  (compte visé : $COMPTE — change-le avec DEMO_COMPTE)"
    bon "compte de démonstration : $COMPTE"

    if [ -z "${DEMO_ADMIN_COMPTE:-}" ] || [ -z "${DEMO_ADMIN_MDP:-}" ]; then
        note "sans DEMO_ADMIN_COMPTE / DEMO_ADMIN_MDP : les 4 écrans d'administration seront sautés"
    fi
fi

if [ "$FAIRE_VIDEO" -eq 1 ]; then
    for outil in ffmpeg ffprobe; do
        command -v "$outil" >/dev/null 2>&1 || echec "$outil est introuvable, et --video en a besoin. Installer ffmpeg."
    done
    bon "ffmpeg présent"
fi

# ---------------------------------------------------------------------
#  2. LE JEU DE DONNÉES — LE PIÈGE QUI COÛTE LA DÉMONSTRATION.
#
#  On ne contrôle la base que si le conteneur de développement est là. Sur une
#  instance distante, c'est `capturer.mjs` qui rattrape le cas : il refuse une
#  capture de frigo vide plutôt que de la livrer.
#
#  SEULEMENT QUAND ON VA LIRE L'APPLICATION. La première version contrôlait
#  toujours, et `--slides --dossier` s'arrêtait donc sur « aucune ligne de
#  stock » — alors que reconstruire le HTML depuis la matière ne demande ni
#  base, ni application, ni compte. Relevé en éprouvant ce script le
#  17 septembre 2026, le jour même où il a été écrit.
# ---------------------------------------------------------------------
if [ "$FAIRE_CAPTURES" -eq 1 ] || [ "$FAIRE_VIDEO" -eq 1 ]; then
titre "2 · Le jeu de données (en deux temps)"

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'fitcarnet-db-dev'; then
    compte_sql() {
        docker exec fitcarnet-db-dev psql -U fitcarnet -d fitcarnet -At -c "$1" 2>/dev/null || echo ""
    }
    ALIMENTS="$(compte_sql "select count(*) from stock s join utilisateur u on u.id = s.utilisateur_id where lower(u.email) = lower('$COMPTE')")"
    SEANCES="$(compte_sql "select count(*) from seance s join utilisateur u on u.id = s.utilisateur_id where lower(u.email) = lower('$COMPTE')")"

    if [ -z "$ALIMENTS" ]; then
        note "base de dév présente, mais la requête n'a rien rendu — contrôle sauté"
    else
        if [ "$ALIMENTS" -eq 0 ]; then
            echec "le compte $COMPTE n'a AUCUNE ligne de stock.
  C'est db/manuel/jeu-essai.sql qui pose les aliments et le stock, et il se
  charge EN PREMIER. jeu-demo.sql n'en pose aucun — son en-tête le dit.
  Sans lui, l'onglet « Mon frigo » est vide, et c'est le premier tiers de la
  démonstration. Les commandes : presentation/demonstration.md, partie I.1."
        fi
        bon "$ALIMENTS lignes de stock (jeu-essai.sql)"

        if [ "${SEANCES:-0}" -eq 0 ]; then
            note "aucune séance : db/manuel/jeu-demo.sql n'est pas chargé — pas de courbe de 1RM,
    et les bobines 6 et 7 n'ont rien à montrer. À charger APRÈS jeu-essai.sql."
        else
            bon "$SEANCES séances (jeu-demo.sql)"
        fi
    fi
else
    note "conteneur fitcarnet-db-dev absent : contrôle du jeu de données délégué à capturer.mjs"
    note "rappel — 1) db/manuel/jeu-essai.sql (aliments et stock) PUIS 2) db/manuel/jeu-demo.sql (historique)"
fi
fi

# ---------------------------------------------------------------------
#  3. LES CAPTURES.
# ---------------------------------------------------------------------
if [ "$FAIRE_CAPTURES" -eq 1 ]; then
    titre "3 · Les images"
    # `|| true` VOLONTAIRE : capturer.mjs sort en échec dès qu'il manque UNE
    # image, et c'est bien — mais une capture manquante ne doit pas empêcher de
    # construire les slides, qui savent afficher « capture manquante ». On note
    # l'échec et on le redit à la fin.
    CAPTURES_EN_ECHEC=0
    node "$RACINE/tournage/capturer.mjs" || CAPTURES_EN_ECHEC=1
else
    CAPTURES_EN_ECHEC=0
fi

# ---------------------------------------------------------------------
#  4. LES SLIDES.
# ---------------------------------------------------------------------
if [ "$FAIRE_SLIDES" -eq 1 ]; then
    titre "4 · Les slides"
    python3 "$RACINE/construire.py"
fi

# ---------------------------------------------------------------------
#  5. LE DOSSIER.
# ---------------------------------------------------------------------
if [ "$FAIRE_DOSSIER" -eq 1 ]; then
    titre "5 · Le dossier"
    python3 "$RACINE/dossier.py"
fi

# ---------------------------------------------------------------------
#  6. LA VIDÉO — et le seul geste qui reste manuel.
# ---------------------------------------------------------------------
if [ "$FAIRE_VIDEO" -eq 1 ]; then
    titre "6 · La vidéo"
    node "$RACINE/tournage/tourner.mjs"

    printf '\n'
    note "tourner.mjs vient d'écrire tournage/decoupe.json avec les instants réels."
    note "monter-demo.sh porte une table DECOUPE écrite à la main : UN TOURNAGE N'EST"
    note "JAMAIS DEUX FOIS DE LA MÊME LONGUEUR, et une séquence qui échoue décale tout"
    note "ce qui suit sans que les bornes deviennent invalides — les cartons annoncent"
    note "alors le mauvais parcours. Relis decoupe.json et recale DECOUPE avant de monter."
    printf '\n'
    if [ -r "$RACINE/tournage/decoupe.json" ]; then
        python3 - "$RACINE/tournage/decoupe.json" <<'FIN'
import json, sys
for r in json.load(open(sys.argv[1], encoding="utf-8")):
    print(f"    {r['debut']:7.1f} → {r['fin']:7.1f}   {r['nom']}")
FIN
    fi
    printf '\n  Puis :  ./presentation/monter-demo.sh\n'
fi

# ---------------------------------------------------------------------
titre "C'est prêt"
for produit in fitcarnet-presentation.html fitcarnet-dossier.html fitcarnet-tournage.html fitcarnet-demonstration.mp4; do
    [ -r "$RACINE/$produit" ] && printf '  %s  (%s)\n' "$produit" "$(du -h "$RACINE/$produit" | cut -f1)"
done
if [ -d "$RACINE/captures" ]; then
    printf '  captures/  (%s images)\n' "$(find "$RACINE/captures" -name '*.jpg' | wc -l)"
fi
printf "\n  Ce qu'on dit, dans quel ordre : presentation/demonstration.md\n"

if [ "${CAPTURES_EN_ECHEC:-0}" -eq 1 ]; then
    printf '\n  \033[33mDes captures manquent (voir plus haut). Les slides afficheront « capture manquante ».\033[0m\n'
    exit 1
fi
