#!/usr/bin/env bash
# =====================================================================
#  rattraper-dev — rejouer les migrations sur la base de DÉVELOPPEMENT
#
#  POURQUOI CE SCRIPT EXISTE, ET CE QU'IL A COÛTÉ DE NE PAS L'AVOIR.
#
#  Le 15 septembre 2026, l'agent de vérification bout en bout a constaté que
#  `POST /api/connexion` répondait **HTTP 500 pour tous les comptes**.
#  L'application était entièrement inutilisable en développement. Les 750 tests
#  étaient au vert.
#
#      SQLSTATE[42703]: Undefined column: 7
#      ERROR: column "vu_le" of relation "jeton_rafraichissement" does not exist
#
#  Le mot de passe était vérifié, le JWT fabriqué, puis l'insertion du jeton de
#  rafraîchissement faisait tomber toute la réponse.
#
#  LA CAUSE N'EST PAS UNE MIGRATION FAUTIVE. `compose.dev.yml` ne monte `./db`
#  que dans `/docker-entrypoint-initdb.d`, que PostgreSQL ne joue **qu'à la
#  création du volume**. Le volume `pgdata_dev` avait six jours ; les migrations
#  écrites depuis n'y étaient jamais passées.
#
#  La production, elle, guérit toute seule : `entrypoint-prod.sh` rejoue
#  `db/manuel/` à chaque démarrage. **Le développement ne le fait jamais.** Et la
#  panne qui en résulte est un 500 opaque, pas un message qui nomme la migration
#  manquante.
#
#  À LANCER APRÈS CHAQUE `git pull` QUI APPORTE UNE MIGRATION, et chaque fois
#  qu'une erreur SQL parle d'une colonne ou d'une table absente.
#
#  Les migrations sont idempotentes : le relancer sans raison ne coûte rien.
#
#  Usage :  db/manuel/rattraper-dev.sh
# =====================================================================
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTENEUR="${CONTENEUR_DB:-fitcarnet-db-dev}"
BASE="${BASE:-fitcarnet}"

vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
gris()  { printf '\033[90m%s\033[0m\n' "$*"; }

docker ps --format '{{.Names}}' | grep -qx "$CONTENEUR" || {
    rouge "Le conteneur $CONTENEUR ne tourne pas."
    rouge "Lance d'abord : docker compose -f compose.dev.yml up -d"
    exit 1
}

# ---------------------------------------------------------------- migrations
#
# LA MÊME LISTE QUE `installer.sh`, ET C'EST LE CINQUIÈME ENDROIT À TENIR.
#
# CINQ, PAS QUATRE — et ce fichier disait « QUATRE » en énumérant cinq noms.
# Le 20 septembre 2026, ce décompte a coûté exactement ce qu'il annonçait : les
# migrations 40, 41 et 42 sont arrivées, les quatre autres listes ont été
# corrigées, et CELLE-CI est restée à `3[0-9]`. Un second poste qui fait
# `git pull` puis `rattraper-dev.sh` n'aurait eu ni `aliment_reference`, ni les
# 3 484 lignes CIQUAL, ni la recherche floue — SANS LE MOINDRE SIGNAL, parce
# que le garde de `verifier-schema.sh` ne regarde que sa propre liste.
#
# Quand tu ajoutes une décennie, elle va dans CINQ fichiers :
#   celui-ci, `installer.sh`, `docker/entrypoint-prod.sh`,
#   `db/manuel/verifier-migrations.sh`, `db/manuel/verifier-schema.sh`.
#
# ET CE N'EST PAS QU'UNE AFFAIRE DE DIZAINES. Le 21 septembre 2026, ce script
# était le seul des cinq à ne pas jouer `db/03-ciqual.sql` : les migrations
# passaient, `aliment_reference` existait — et restait VIDE. Sur le second
# poste, le rattachement d'un aliment au catalogue ne proposait rien, sans un
# message. `verifier-migrations.sh` compare désormais les cinq listes entre
# elles, et pas seulement chacune au dossier `db/manuel/`.
migrations=""
for fichier in \
    "$RACINE"/db/manuel/aliment-fibres.sql \
    "$RACINE"/db/manuel/1[0-9]-*.sql \
    "$RACINE"/db/manuel/2[0-9]-*.sql \
    "$RACINE"/db/manuel/3[0-9]-*.sql \
    "$RACINE"/db/manuel/4[0-9]-*.sql \
    "$RACINE"/db/03-ciqual.sql
do
    [[ -f "$fichier" ]] && migrations+="$fichier"$'\n'
done

gris "Migrations, dans l'ordre d'installer.sh — sur $BASE ($CONTENEUR)"

echecs=0
while IFS= read -r fichier; do
    [[ -z "$fichier" ]] && continue
    nom="$(basename "$fichier")"

    if erreur=$(docker exec -i "$CONTENEUR" \
            psql -U fitcarnet -d "$BASE" -v ON_ERROR_STOP=1 -q < "$fichier" 2>&1); then
        gris "  ✓ $nom"
    else
        rouge "  ✗ $nom"
        printf '%s\n' "$erreur" | grep -E '^(ERROR|psql:)' | head -3 | sed 's/^/      /'
        echecs=$((echecs + 1))
    fi
done <<< "$migrations"

echo
if (( echecs )); then
    rouge "✗ $echecs migration(s) en échec. La base est peut-être à moitié à jour."
    exit 1
fi

vert "✓ La base de développement est à jour."
gris "  Un doute ? db/manuel/verifier-schema.sh compare une base neuve à une base migrée."
