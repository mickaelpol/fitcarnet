#!/usr/bin/env bash
# =====================================================================
#  verifier-jeux — les jeux de données se chargent-ils comme on le dit ?
#
#  POURQUOI CE SCRIPT EXISTE
#  `jeu-essai.sql` et `jeu-demo.sql` ne sont joués par aucun lanceur : on les
#  passe à la main, avant une démonstration, sur un compte qu'on vient de
#  créer. Rien ne les éprouvait. Le 17 septembre 2026, `verite-documentaire`
#  a trouvé que la « remise à zéro » décrite partout — `psql -v ecraser=oui`
#  — ne levait PAS le garde-fou : le fichier lisait un réglage serveur,
#  `current_setting('psql.ecraser')`, qu'une variable psql ne pose pas. La
#  commande échouait donc toujours, au pire moment : entre deux bobines.
#
#  CE QUI EST ÉPROUVÉ ICI, dans l'ordre de `presentation/demonstration.md` :
#    1. le schéma, les données de départ, un compte ordinaire ;
#    2. le jeu d'essai adapté à ce compte par `sed`, deux fois (idempotent) ;
#    3. le jeu de démonstration, et les chiffres que la documentation annonce ;
#    4. un second passage SANS `-v ecraser=oui` : refusé, rien d'effacé ;
#    5. un passage AVEC : accepté, et les mêmes chiffres.
#
#  Sûreté : PostgreSQL jetable, nom unique, détruit à la sortie. Aucune base
#  réelle n'est touchée.
#
#  Usage :  db/manuel/verifier-jeux.sh
# =====================================================================
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTENEUR="fitcarnet-verif-jeux-$$"
COMPTE="demo@fitcarnet.local"

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[90m%s\033[0m\n' "$*"; }

nettoyer() { docker rm -f "$CONTENEUR" >/dev/null 2>&1 || true; }
trap nettoyer EXIT INT TERM

psql_() { docker exec -i -e PGPASSWORD=verif "$CONTENEUR" psql -U verif -d essai -v ON_ERROR_STOP=1 -q "$@"; }

echecs=0
verifier() {
    local quoi="$1" attendu="$2" obtenu="$3"
    if [[ "$obtenu" == "$attendu" ]]; then
        gris "  ✓ $quoi : $obtenu"
    else
        rouge "  ✗ $quoi : $obtenu au lieu de $attendu"
        echecs=$((echecs + 1))
    fi
}

compter() {
    psql_ -tAc "
        SELECT (SELECT count(*) FROM aliment)    || ' aliments, '
            || (SELECT count(*) FROM stock)      || ' lignes de stock, '
            || (SELECT count(*) FROM seance)     || ' séances, '
            || (SELECT count(*) FROM serie)      || ' séries, '
            || (SELECT count(*) FROM plan_repas) || ' plans, '
            || (SELECT count(*) FROM cible)      || ' cibles';"
}

gris "Démarrage d'un PostgreSQL jetable..."
docker run -d --name "$CONTENEUR" \
    -e POSTGRES_USER=verif -e POSTGRES_PASSWORD=verif -e POSTGRES_DB=essai \
    postgres:16 >/dev/null

# Le serveur temporaire d'initdb répond aussi : deux réponses de suite.
reussites=0
for _ in $(seq 1 60); do
    if psql_ -tAc 'SELECT 1' >/dev/null 2>&1; then
        reussites=$((reussites + 1))
        [[ $reussites -ge 2 ]] && break
    else
        reussites=0
    fi
    sleep 1
done
(( reussites >= 2 )) || { rouge "PostgreSQL n'a pas démarré."; exit 1; }

gris "Schéma, données de départ, compte ordinaire..."
psql_ < "$RACINE/db/01-schema.sql"
psql_ < "$RACINE/db/02-donnees.sql"
psql_ -c "INSERT INTO utilisateur (email, mot_de_passe, nom) VALUES ('$COMPTE', 'x', 'Démo');"

gris "Jeu d'essai, deux fois..."
sed 's/essai@/demo@/' "$RACINE/db/manuel/jeu-essai.sql" | psql_ >/dev/null 2>&1
sed 's/essai@/demo@/' "$RACINE/db/manuel/jeu-essai.sql" | psql_ >/dev/null 2>&1
verifier "jeu d'essai rejoué" "8 aliments, 8 lignes de stock, 0 séances, 0 séries, 0 plans, 0 cibles" "$(compter)"

gris "Jeu de démonstration..."
psql_ < "$RACINE/db/manuel/jeu-demo.sql" >/dev/null 2>&1
attendu="8 aliments, 8 lignes de stock, 23 séances, 123 séries, 2 plans, 4 cibles"
verifier "jeu de démonstration" "$attendu" "$(compter)"

gris "Second passage sans -v ecraser=oui..."
if sortie=$(psql_ < "$RACINE/db/manuel/jeu-demo.sql" 2>&1); then
    rouge "  ✗ accepté : le garde-fou n'a rien arrêté"
    echecs=$((echecs + 1))
else
    verifier "refus qui dit pourquoi" "oui" \
        "$(grep -q 'EFFACERAIT' <<< "$sortie" && echo oui || echo "non — $sortie")"
fi
verifier "rien d'effacé par le refus" "$attendu" "$(compter)"

gris "Passage avec -v ecraser=oui..."
if sortie=$(psql_ -v ecraser=oui < "$RACINE/db/manuel/jeu-demo.sql" 2>&1); then
    verifier "remise à zéro" "$attendu" "$(compter)"
else
    rouge "  ✗ refusé malgré -v ecraser=oui"
    printf '%s\n' "$sortie" | grep -E 'ERROR|ERREUR' | head -2 | sed 's/^/      /'
    echecs=$((echecs + 1))
fi

echo
if (( echecs == 0 )); then
    vert "✓ Les jeux se chargent, se rejouent, et le garde-fou se lève quand on le demande."
    exit 0
fi

rouge "✗ $echecs vérification(s) en échec. La procédure de presentation/demonstration.md ne marche pas telle quelle."
exit 1
