#!/usr/bin/env bash
# =====================================================================
#  verifier-schema — une base neuve est-elle identique à une base migrée ?
#
#  LA RÈGLE QUE CE SCRIPT FAIT RESPECTER
#  Toute évolution du schéma s'écrit DEUX fois : dans db/01-schema.sql, qui
#  décrit la base telle qu'elle est aujourd'hui, ET dans une migration
#  numérotée de db/manuel/, qui amène une base existante jusque-là.
#
#  POURQUOI CE SCRIPT EXISTE
#  L'audit de septembre 2026 a construit les deux bases et comparé les dumps :
#  312 lignes de différence. Les tables `complement` et `inventaire_lot` et
#  sept contraintes CHECK de positivité n'existaient QUE dans les migrations.
#  La production ne le voyait pas, parce qu'entrypoint-prod.sh rejoue db/manuel/
#  à chaque démarrage — mais une installation neuve n'avait ni compléments, ni
#  file d'inventaire, ni aucun garde-fou : elle acceptait kcal_100 = -350.
#  INSTALLATION.md proposait déjà ce contrôle en dernière ligne. Personne ne
#  l'avait jamais lancé. Le voici, exécutable.
#
#  CE QUE CE SCRIPT NE VÉRIFIE PAS
#  Il compare des SCHÉMAS. Une migration qui échouerait sur des données réelles
#  (un UPDATE ... SET colonne = NULL sur une colonne NOT NULL, par exemple)
#  passe ici sans bruit tant qu'aucune ligne n'est concernée. Le jeu de données
#  de db/02-donnees.sql est chargé pour s'en approcher, pas pour le garantir.
#
#  Sûreté : tout se passe dans un conteneur PostgreSQL jetable, portant un nom
#  unique, détruit à la sortie quelle qu'elle soit. Aucune base réelle n'est
#  touchée — ni celle de développement, ni celle du NAS.
#
#  Usage :
#    db/manuel/verifier-schema.sh          silencieux si tout va bien
#    db/manuel/verifier-schema.sh -v       affiche le diff complet
# =====================================================================
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTENEUR="fitcarnet-verif-schema-$$"
IMAGE="postgres:16"
VERBEUX="${1:-}"

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[90m%s\033[0m\n' "$*"; }

nettoyer() { docker rm -f "$CONTENEUR" >/dev/null 2>&1 || true; }
trap nettoyer EXIT INT TERM

psql_() { docker exec -i -e PGPASSWORD=verif "$CONTENEUR" psql -U verif -d "$1" -v ON_ERROR_STOP=1 -q; }

attendre_postgres() {
    # Le conteneur postgres demarre un serveur TEMPORAIRE pour initdb, puis le
    # coupe et lance le vrai. `pg_isready` repond « oui » au temporaire : on
    # attend donc une vraie requete servie, deux fois de suite, sur la base
    # visee. Sans ca le script echoue une fois sur deux, au hasard du timing.
    local reussites=0
    for _ in $(seq 1 60); do
        if docker exec -e PGPASSWORD=verif "$CONTENEUR" \
               psql -U verif -d "$1" -tAc 'SELECT 1' >/dev/null 2>&1; then
            reussites=$((reussites + 1))
            [[ $reussites -ge 2 ]] && return 0
        else
            reussites=0
        fi
        sleep 1
    done

    rouge "PostgreSQL n'a pas demarre."
    docker logs "$CONTENEUR" 2>&1 | tail -5
    return 1
}

gris "Démarrage d'un PostgreSQL jetable..."
docker run -d --name "$CONTENEUR" \
    -e POSTGRES_USER=verif -e POSTGRES_PASSWORD=verif -e POSTGRES_DB=postgres \
    "$IMAGE" >/dev/null

attendre_postgres postgres || exit 1

# ------------------------------------------------------------------ base A
# Ce que produit une installation NEUVE : le schéma initial, rien d'autre.
gris "Base A — 01-schema.sql seul (installation neuve)"
docker exec -i -e PGPASSWORD=verif "$CONTENEUR" createdb -U verif base_a
psql_ base_a < "$RACINE/db/01-schema.sql"
[[ -f "$RACINE/db/02-donnees.sql" ]] && psql_ base_a < "$RACINE/db/02-donnees.sql"

# ------------------------------------------------------------------ base B
# Ce que produit une base EXISTANTE ayant reçu toutes les migrations, dans
# l'ordre exact d'installer.sh — écrit à la main, jamais trié alphabétiquement.
gris "Base B — 01-schema.sql + toutes les migrations (base migrée)"
docker exec -i -e PGPASSWORD=verif "$CONTENEUR" createdb -U verif base_b
psql_ base_b < "$RACINE/db/01-schema.sql"
[[ -f "$RACINE/db/02-donnees.sql" ]] && psql_ base_b < "$RACINE/db/02-donnees.sql"

migrations=""
for fichier in \
    "$RACINE"/db/manuel/aliment-fibres.sql \
    "$RACINE"/db/manuel/1[0-9]-*.sql \
    "$RACINE"/db/manuel/2[0-9]-*.sql \
    "$RACINE"/db/manuel/3[0-9]-*.sql
do
    [[ -f "$fichier" ]] && migrations+="$fichier"$'\n'
done

echec_migration=0
while IFS= read -r fichier; do
    [[ -z "$fichier" ]] && continue
    if ! psql_ base_b < "$fichier" >/dev/null 2>&1; then
        rouge "  ✗ $(basename "$fichier") a échoué"
        psql_ base_b < "$fichier" 2>&1 | grep -E '^(ERROR|psql:)' | head -3 | sed 's/^/      /'
        echec_migration=1
    fi
done <<< "$migrations"

if (( echec_migration )); then
    rouge "Au moins une migration a échoué. Le schéma comparé ci-dessous est incomplet."
fi

# ------------------------------------------------------------------ diff
# --schema-only : on compare des structures, pas des lignes.
# --no-owner --no-privileges : le propriétaire dépend de l'installation.
vidange() {
    docker exec -e PGPASSWORD=verif "$CONTENEUR" \
        pg_dump -U verif --schema-only --no-owner --no-privileges "$1" \
        | sed '/^\\\(un\)\?restrict /d'
}
#
# LE `sed` N'EST PAS UNE COMMODITÉ, IL EST INDISPENSABLE.
#
# pg_dump 17 encadre sa sortie de `\restrict <jeton>` / `\unrestrict <jeton>`,
# où le jeton est TIRÉ AU SORT À CHAQUE APPEL. Deux vidanges de la MÊME base
# différaient donc toujours de deux lignes : le script ne pouvait pas annoncer
# « identiques », même sur une base parfaitement alignée, et son critère de
# réussite était hors d'atteinte.
#
# Constaté le 14 septembre 2026, en corrigeant C2 : sur les 280 lignes
# annoncées, deux étaient ce bruit-là.

TMP="$(mktemp -d)"
trap 'nettoyer; rm -rf "$TMP"' EXIT INT TERM
vidange base_a > "$TMP/a.sql"
vidange base_b > "$TMP/b.sql"

if diff -q "$TMP/a.sql" "$TMP/b.sql" >/dev/null; then
    vert "✓ Base neuve et base migrée sont identiques."
    exit 0
fi

lignes=$(diff "$TMP/a.sql" "$TMP/b.sql" | grep -c '^[<>]' || true)
rouge "✗ Base neuve et base migrée DIVERGENT — $lignes lignes de différence."
echo
echo "  « < » n'existe que dans la base NEUVE   (à retirer du schéma, ou à migrer)"
echo "  « > » n'existe que dans la base MIGRÉE  (à replier dans db/01-schema.sql)"
echo

if [[ "$VERBEUX" == "-v" ]]; then
    diff "$TMP/a.sql" "$TMP/b.sql" || true
else
    diff "$TMP/a.sql" "$TMP/b.sql" | grep -E '^[<>].*(CREATE TABLE|CREATE INDEX|ADD CONSTRAINT|CREATE SEQUENCE|ALTER TABLE)' \
        | sed 's/^/  /' | head -40
    echo
    gris "  (relancer avec -v pour le diff complet)"
fi

exit 1
