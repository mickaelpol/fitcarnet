#!/usr/bin/env bash
# =====================================================================
#  verifier-migrations — les migrations survivent-elles à de VRAIES données ?
#
#  CE QUE verifier-schema.sh NE VOIT PAS
#  Son compagnon compare deux schémas sur des bases quasi vides. Une migration
#  qui ne casse que devant une valeur aberrante y passe sans un bruit : aucune
#  ligne concernée, aucune erreur. C'est exactement le trou par lequel É2 est
#  passé.
#
#  CE QUI EST ÉPROUVÉ ICI
#  On installe le schéma, on y met les valeurs fausses que `25-garde-fous.sql`
#  dit lui-même avoir constatées (kcal_100 = -350, cible.kcal = -600,
#  serie.reps = -12), puis on joue les migrations dans l'ordre d'installer.sh.
#
#  Elles doivent toutes réussir, et les garde-fous doivent être posés. Si une
#  migration échoue ici, elle échouera au prochain démarrage du conteneur
#  applicatif : `entrypoint-prod.sh` rejoue db/manuel/ à chaque fois, avec
#  ON_ERROR_STOP=1 et set -e. Une migration qui ne supporte pas les données
#  qu'elle prétend nettoyer empêche la production de redémarrer.
#
#  Sûreté : PostgreSQL jetable, nom unique, détruit à la sortie. Aucune base
#  réelle n'est touchée.
#
#  Usage :  db/manuel/verifier-migrations.sh
# =====================================================================
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTENEUR="fitcarnet-verif-migrations-$$"

rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
gris()  { printf '\033[90m%s\033[0m\n' "$*"; }

nettoyer() { docker rm -f "$CONTENEUR" >/dev/null 2>&1 || true; }
trap nettoyer EXIT INT TERM

psql_() { docker exec -i -e PGPASSWORD=verif "$CONTENEUR" psql -U verif -d essai -v ON_ERROR_STOP=1 -q "$@"; }

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
    -e POSTGRES_USER=verif -e POSTGRES_PASSWORD=verif -e POSTGRES_DB=essai \
    postgres:16 >/dev/null

attendre_postgres essai || exit 1

gris "Schéma initial..."
psql_ < "$RACINE/db/01-schema.sql"
[[ -f "$RACINE/db/02-donnees.sql" ]] && psql_ < "$RACINE/db/02-donnees.sql"

# ------------------------------------------------ retour avant la migration 25
#
# ON RECULE LE SCHÉMA, ET C'EST TOUT L'OBJET DE CE SCRIPT.
#
# Ce test rejoue les migrations sur des données ABERRANTES, celles qui ont été
# réellement observées en base avant que les garde-fous n'existent. Or depuis
# la correction de C2 (14 septembre 2026), `01-schema.sql` porte ces garde-fous
# — comme il le doit, une base neuve étant censée valoir une base migrée. Les
# valeurs aberrantes ne peuvent donc plus être insérées : le script échouait à
# l'injection, en annonçant une contrainte violée comme si c'était un défaut.
#
# On retire donc les contraintes que la migration 25 pose, pour retrouver
# l'état d'une base de PRODUCTION d'avant cette migration. C'est exactement le
# cas que ce script existe pour éprouver : les migrations savent-elles nettoyer
# ce qui traîne, ou refusent-elles de s'appliquer et bloquent-elles le
# redémarrage ? Les migrations les recréent ensuite, en `IF NOT EXISTS`.
gris "Retour à l'état d'avant les garde-fous (migration 25)..."
psql_ <<'SQL'
ALTER TABLE aliment      DROP CONSTRAINT IF EXISTS aliment_valeurs_positives;
ALTER TABLE aliment      DROP CONSTRAINT IF EXISTS aliment_ratio_borne;
ALTER TABLE aliment      DROP CONSTRAINT IF EXISTS aliment_pesees_positives;
ALTER TABLE cible        DROP CONSTRAINT IF EXISTS cible_valeurs_positives;
ALTER TABLE stock        DROP CONSTRAINT IF EXISTS stock_quantite_positive;
ALTER TABLE serie        DROP CONSTRAINT IF EXISTS serie_valeurs_positives;
ALTER TABLE modele_serie DROP CONSTRAINT IF EXISTS modele_serie_valeurs_positives;
SQL

# ------------------------------------------------ retour avant la migration 35
# Même principe : une base d'avant la 35 n'a qu'une clé simple de `stock` vers
# `aliment`, qui laisse une ligne de stock viser l'aliment d'un AUTRE compte.
# On la remet, pour que l'injection ci-dessous puisse poser une telle ligne et
# que la migration ait à la nettoyer.
gris "Retour à l'état d'avant la clé stock → aliment du même compte (migration 35)..."
psql_ <<'SQL'
ALTER TABLE stock   DROP CONSTRAINT IF EXISTS stock_aliment_du_meme_compte_fkey;
ALTER TABLE aliment DROP CONSTRAINT IF EXISTS aliment_id_utilisateur_unique;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_aliment_id_fkey') THEN
        ALTER TABLE stock ADD CONSTRAINT stock_aliment_id_fkey
            FOREIGN KEY (aliment_id) REFERENCES aliment(id) ON DELETE RESTRICT;
    END IF;
END $$;
SQL

# ---------------------------------------------------------------- données
# Les valeurs sont celles citées en tête de 25-garde-fous.sql : ce ne sont pas
# des cas inventés pour le test, ce sont celles qui ont été observées en base.
gris "Injection des valeurs aberrantes constatées..."
psql_ <<'SQL'
INSERT INTO utilisateur (email, mot_de_passe, nom)
VALUES ('essai@verif.local', 'x', 'Essai');

INSERT INTO aliment (utilisateur_id, nom, categorie, kcal_100, prot_100, gluc_100, lip_100)
SELECT id, 'Aliment a signe faux', 'fec', -350, -20, 12, -3
FROM   utilisateur WHERE email = 'essai@verif.local';

INSERT INTO cible (utilisateur_id, repas, kcal, prot, gluc, lip)
SELECT id, 'R1', -600, 40, 60, 20 FROM utilisateur WHERE email = 'essai@verif.local';

INSERT INTO exercice (nom, groupes, muscle_cible)
VALUES ('Exercice essai', 'pectoraux', 'pectoraux');

INSERT INTO seance (utilisateur_id, date, type)
SELECT id, CURRENT_DATE, 'Push' FROM utilisateur WHERE email = 'essai@verif.local';

INSERT INTO seance_exercice (seance_id, exercice_id, ordre)
SELECT s.id, e.id, 1 FROM seance s, exercice e WHERE e.nom = 'Exercice essai' LIMIT 1;

INSERT INTO serie (seance_exercice_id, ordre, reps, poids)
SELECT id, 1, -12, -100 FROM seance_exercice LIMIT 1;

-- Le reste d'É1 : un compte a posé du stock sur l'aliment d'un autre. La
-- ligne légitime du propriétaire, elle, doit survivre à la migration.
INSERT INTO utilisateur (email, mot_de_passe, nom)
VALUES ('autre@verif.local', 'x', 'Autre');

INSERT INTO stock (utilisateur_id, aliment_id, emplacement_id, quantite)
SELECT u.id, a.id, (SELECT min(id) FROM emplacement), 50
FROM   utilisateur u, aliment a
WHERE  u.email IN ('autre@verif.local', 'essai@verif.local');
SQL

# ------------------------------------------------------------ migrations
gris "Migrations, dans l'ordre d'installer.sh..."
migrations=""
for fichier in \
    "$RACINE"/db/manuel/aliment-fibres.sql \
    "$RACINE"/db/manuel/1[0-9]-*.sql \
    "$RACINE"/db/manuel/2[0-9]-*.sql \
    "$RACINE"/db/manuel/3[0-9]-*.sql
do
    [[ -f "$fichier" ]] && migrations+="$fichier"$'\n'
done

echecs=0
while IFS= read -r fichier; do
    [[ -z "$fichier" ]] && continue
    if erreur=$(psql_ < "$fichier" 2>&1); then
        gris "  ✓ $(basename "$fichier")"
    else
        rouge "  ✗ $(basename "$fichier")"
        printf '%s\n' "$erreur" | grep -E '^(ERROR|psql:)' | head -3 | sed 's/^/      /'
        echecs=$((echecs + 1))
    fi
done <<< "$migrations"

# ------------------------------------------------------------ garde-fous
# Une migration peut « réussir » sans rien poser : sans ON_ERROR_STOP, psql
# continue après une erreur et sort 0. On vérifie donc le résultat, pas le
# code de sortie.
gris "Contrôle des garde-fous posés..."
attendues=(
    aliment_valeurs_positives
    aliment_ratio_borne
    aliment_pesees_positives
    cible_valeurs_positives
    serie_valeurs_positives
    modele_serie_valeurs_positives
    aliment_id_utilisateur_unique
    stock_aliment_du_meme_compte_fkey
)

manquantes=0
for contrainte in "${attendues[@]}"; do
    presente=$(psql_ -tAc "SELECT count(*) FROM pg_constraint WHERE conname = '$contrainte';")
    if [[ "$presente" == "1" ]]; then
        gris "  ✓ $contrainte"
    else
        rouge "  ✗ $contrainte — absente"
        manquantes=$((manquantes + 1))
    fi
done

# ------------------------------------------------------- valeurs nettoyées
restantes=$(psql_ -tAc "
    SELECT (SELECT count(*) FROM aliment WHERE kcal_100 < 0 OR prot_100 < 0 OR gluc_100 < 0 OR lip_100 < 0)
         + (SELECT count(*) FROM cible   WHERE kcal < 0 OR prot < 0 OR gluc < 0 OR lip < 0)
         + (SELECT count(*) FROM serie   WHERE reps < 0 OR poids < 0);")

# ------------------------------------------ stock sur l'aliment d'un autre
# La ligne étrangère doit être partie, la légitime restée — et la base doit
# désormais refuser d'en poser une nouvelle, quel que soit le chemin.
stock_faux=0
etranger=$(psql_ -tAc "
    SELECT count(*) FROM stock s JOIN aliment a ON a.id = s.aliment_id
     WHERE s.utilisateur_id <> a.utilisateur_id;")
legitime=$(psql_ -tAc "
    SELECT count(*) FROM stock s JOIN aliment a ON a.id = s.aliment_id
     WHERE s.utilisateur_id = a.utilisateur_id;")
if [[ "$etranger" != "0" ]]; then
    rouge "  ✗ $etranger ligne(s) de stock visent encore l'aliment d'un autre compte"
    stock_faux=$((stock_faux + etranger))
fi
if [[ "$legitime" != "1" ]]; then
    rouge "  ✗ la ligne de stock du propriétaire a disparu ($legitime au lieu de 1)"
    stock_faux=$((stock_faux + 1))
fi
if psql_ -c "INSERT INTO stock (utilisateur_id, aliment_id, emplacement_id, quantite)
             SELECT u.id, a.id, (SELECT max(id) FROM emplacement), 1
             FROM utilisateur u, aliment a WHERE u.email = 'autre@verif.local';" >/dev/null 2>&1; then
    rouge "  ✗ la base accepte encore du stock sur l'aliment d'un autre compte"
    stock_faux=$((stock_faux + 1))
else
    gris "  ✓ la base refuse du stock sur l'aliment d'un autre compte"
fi

if [[ "$restantes" != "0" ]]; then
    rouge "  ✗ $restantes valeur(s) négative(s) encore en base après nettoyage"
fi

# ------------------------------------------------- conformite des lanceurs
# Une migration qui echoue doit le DIRE. Sans `-v ON_ERROR_STOP=1`, psql
# poursuit apres une erreur et sort 0 : le lanceur affiche « ✓ » sur un fichier
# a moitie applique, et la divergence s'installe sans bruit. C'est le
# mecanisme, pas une hypothese — `installer.sh` annonçait « ✓ 25-garde-fous.sql »
# alors que la migration echouait a sa premiere instruction.
gris "Conformité des scripts qui jouent les migrations..."
nonconformes=0
for lanceur in installer.sh docker/entrypoint-prod.sh; do
    chemin="$RACINE/$lanceur"
    [[ -f "$chemin" ]] || continue

    # Les lignes psql qui lisent un fichier de migration, par « < » ou par « -f ».
    lignes=$(grep -nE 'psql .*(-f "?\$|< "?\$)' "$chemin" || true)
    [[ -z "$lignes" ]] && continue

    while IFS= read -r ligne; do
        [[ -z "$ligne" ]] && continue
        if [[ "$ligne" != *ON_ERROR_STOP* ]]; then
            rouge "  ✗ $lanceur:${ligne%%:*} joue une migration sans ON_ERROR_STOP"
            nonconformes=$((nonconformes + 1))
        fi
    done <<< "$lignes"
done
(( nonconformes == 0 )) && gris "  ✓ tous les lanceurs s'arrêtent à la première erreur"

echo
if (( echecs == 0 && manquantes == 0 && nonconformes == 0 && stock_faux == 0 )) && [[ "$restantes" == "0" ]]; then
    vert "✓ Les migrations passent sur des données réelles, tous les garde-fous sont posés."
    exit 0
fi

rouge "✗ $echecs migration(s) en échec, $manquantes garde-fou(s) manquant(s), $restantes valeur(s) négative(s) restante(s), $nonconformes lanceur(s) non conforme(s), $stock_faux défaut(s) de stock entre comptes."
rouge "  En l'état, le conteneur applicatif ne redémarrerait pas : entrypoint-prod.sh"
rouge "  rejoue db/manuel/ à chaque démarrage, avec ON_ERROR_STOP=1 et set -e."
exit 1
