# -*- coding: utf-8 -*-
"""
Importe les données de l'ancien carnet HTML (carnet.json) dans fitcarnet.

Ce que fait le script :
  - apparie chaque exercice du JSON à celui déjà présent en base, par nom
    normalisé (insensible à la casse et aux accents) ;
  - crée les modèles, leurs exercices et leurs séries cibles ;
  - crée les séances, leurs exercices et leurs séries réalisées ;
  - convertit les temps « 4:21 » en secondes.

Ce qu'il ne fait pas :
  - il ne crée AUCUN exercice manquant : il te les liste, à toi de décider.
    Créer en silence produirait des doublons du type « Dips » / « dips ».

Usage :
    python3 import_carnet.py carnet.json --email mickael@mickael-pol.fr
    python3 import_carnet.py carnet.json --email ... --appliquer

Sans --appliquer, le script montre ce qu'il ferait sans rien écrire.

Connexion : par défaut la base de développement exposée sur localhost:5432.
    --hote / --port / --base / --utilisateur / --motdepasse pour ajuster.
"""

import argparse
import json
import sys
import unicodedata
from typing import Any

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    sys.exit("Installe le pilote PostgreSQL :  pip install psycopg2-binary")


# ---------------------------------------------------------------- outils

def normaliser(nom: str) -> str:
    """« Écartés couché haltères » -> « ecartes couche halteres »."""
    sans_accent = unicodedata.normalize("NFD", nom or "")
    sans_accent = sans_accent.encode("ascii", "ignore").decode()

    return " ".join(sans_accent.lower().split())


def en_secondes(valeur: Any) -> int | None:
    """« 4:21 » -> 261 ; « 42 » -> 42 ; vide -> None."""
    if valeur is None:
        return None
    t = str(valeur).strip()
    if not t:
        return None
    if ":" in t:
        parts = t.split(":")
        try:
            return int(parts[0] or 0) * 60 + int(parts[1] or 0)
        except ValueError:
            return None
    try:
        return int(float(t))
    except ValueError:
        return None


def en_nombre(valeur: Any) -> float | None:
    if valeur is None:
        return None
    t = str(valeur).strip().replace(",", ".")
    if not t:
        return None
    try:
        return float(t)
    except ValueError:
        return None


def en_entier(valeur: Any) -> int | None:
    n = en_nombre(valeur)

    return None if n is None else int(n)


MODES = {"charge": "charge", "iso": "iso", "time": "chrono", "chrono": "chrono"}

# Le carnet HTML nomme ses champs en anglais : « exercises », « sets »,
# « reps » / « weight » / « sec », et les objectifs « tReps » / « tWeight ».
CLE_EXERCICES = "exercises"



# ---------------------------------------------------------------- import

def main() -> int:
    ap = argparse.ArgumentParser(description="Import du carnet HTML vers fitcarnet")
    ap.add_argument("fichier", help="chemin du carnet.json")
    ap.add_argument("--email", required=True, help="compte destinataire")
    ap.add_argument("--appliquer", action="store_true",
                    help="écrit réellement en base (sinon simulation)")
    ap.add_argument("--hote", default="localhost")
    ap.add_argument("--port", default="5432")
    ap.add_argument("--base", default="fitcarnet")
    ap.add_argument("--utilisateur", default="fitcarnet")
    ap.add_argument("--motdepasse", default="fitcarnet")
    args = ap.parse_args()

    with open(args.fichier, encoding="utf-8") as f:
        carnet = json.load(f)

    sessions = carnet.get("sessions", [])
    modeles = [s for s in sessions if s.get("tpl")]
    seances = [s for s in sessions if not s.get("tpl") and s.get("date")]

    print(f"Fichier lu : {len(modeles)} modèle(s), {len(seances)} séance(s).\n")

    cnx = psycopg2.connect(host=args.hote, port=args.port, dbname=args.base,
                           user=args.utilisateur, password=args.motdepasse)
    cnx.autocommit = False
    cur = cnx.cursor()

    # --- compte destinataire ---
    cur.execute("SELECT id FROM utilisateur WHERE lower(email) = lower(%s)", (args.email,))
    ligne = cur.fetchone()
    if ligne is None:
        sys.exit(f"Aucun compte pour « {args.email} ».")
    utilisateur = ligne[0]

    # --- exercices déjà en base ---
    cur.execute("SELECT id, nom FROM exercice")
    par_nom = {normaliser(nom): eid for eid, nom in cur.fetchall()}
    print(f"{len(par_nom)} exercices en base.\n")

    # --- appariement ---
    inconnus: set[str] = set()
    for s in sessions:
        for ex in s.get(CLE_EXERCICES, []):
            nom = (ex.get("name") or "").strip()
            if nom and normaliser(nom) not in par_nom:
                inconnus.add(nom)

    if inconnus:
        print("=== EXERCICES INTROUVABLES EN BASE ===")
        for nom in sorted(inconnus):
            print(f"  - {nom}")
        print("\nCrée-les d'abord (via l'app ou en SQL), puis relance :")
        print("  INSERT INTO exercice (nom, format_prescrit, mode_defaut, groupes, public)")
        print("  VALUES ('Nom exact', '4 s × 12 rép', 'charge', 'Push', TRUE);\n")
        print("Les exercices non appariés seront IGNORÉS à l'import.\n")

    # --- modèles ---
    nb_modeles = nb_seances = 0

    for m in modeles:
        exercices = [e for e in m.get(CLE_EXERCICES, [])
                     if normaliser(e.get("name") or "") in par_nom]
        if not exercices:
            continue

        titre = (m.get("title") or "").strip() or None
        type_ = titre if titre in ("Push", "Pull", "Legs") else None
        print(f"MODÈLE « {titre or '—'} » : {len(exercices)} exercice(s)")

        if args.appliquer:
            # Pas de colonne `partage` : le partage de modèle n'existe pas
            # (migration 33). L'écrire faisait échouer tout l'import —
            # `test_import_carnet.py` le rejoue sur une base jetable.
            cur.execute(
                "INSERT INTO modele (utilisateur_id, nom, type) "
                "VALUES (%s, %s, %s) RETURNING id",
                (utilisateur, titre, type_))
            id_modele = cur.fetchone()[0]

            for ordre, ex in enumerate(exercices):
                cur.execute(
                    "INSERT INTO modele_exercice (modele_id, exercice_id, ordre, mode, notes) "
                    "VALUES (%s, %s, %s, %s, %s) RETURNING id",
                    (id_modele, par_nom[normaliser(ex["name"])], ordre,
                     MODES.get(ex.get("mode") or "", None), ex.get("notes") or None))
                id_me = cur.fetchone()[0]

                series = [
                    (id_me, i, en_entier(s.get("reps")), en_nombre(s.get("weight")),
                     en_secondes(s.get("sec")))
                    for i, s in enumerate(ex.get("sets", []))
                ]
                if series:
                    execute_values(cur,
                        "INSERT INTO modele_serie "
                        "(modele_exercice_id, ordre, reps_cible, poids_cible, secondes_cible) "
                        "VALUES %s", series)
        nb_modeles += 1

    # --- séances ---
    for s in seances:
        exercices = [e for e in s.get(CLE_EXERCICES, [])
                     if normaliser(e.get("name") or "") in par_nom]
        if not exercices:
            continue

        titre = (s.get("title") or "").strip() or None
        type_ = titre if titre in ("Push", "Pull", "Legs") else None
        total = sum(len(e.get("sets", [])) for e in exercices)
        print(f"SÉANCE {s.get('date')} « {titre or '—'} » : "
              f"{len(exercices)} exercice(s), {total} série(s)")

        if args.appliquer:
            cur.execute(
                "INSERT INTO seance (utilisateur_id, date, type) "
                "VALUES (%s, %s, %s) RETURNING id",
                (utilisateur, s["date"], type_))
            id_seance = cur.fetchone()[0]

            for ordre, ex in enumerate(exercices):
                cur.execute(
                    "INSERT INTO seance_exercice (seance_id, exercice_id, ordre, mode, notes) "
                    "VALUES (%s, %s, %s, %s, %s) RETURNING id",
                    (id_seance, par_nom[normaliser(ex["name"])], ordre,
                     MODES.get(ex.get("mode") or "", None), ex.get("notes") or None))
                id_se = cur.fetchone()[0]

                series = [
                    (id_se, i,
                     en_entier(st.get("reps")), en_nombre(st.get("weight")),
                     en_secondes(st.get("sec")), bool(st.get("done")),
                     en_entier(st.get("tReps")), en_nombre(st.get("tWeight")),
                     en_secondes(st.get("tSec")))
                    for i, st in enumerate(ex.get("sets", []))
                ]
                if series:
                    execute_values(cur,
                        "INSERT INTO serie (seance_exercice_id, ordre, reps, poids, secondes, "
                        "faite, reps_cible, poids_cible, secondes_cible) VALUES %s", series)
        nb_seances += 1

    if args.appliquer:
        cnx.commit()
        print(f"\n=== IMPORT TERMINÉ ===\n{nb_modeles} modèle(s), {nb_seances} séance(s) créés.")
    else:
        cnx.rollback()
        print(f"\n=== SIMULATION ===\n{nb_modeles} modèle(s) et {nb_seances} séance(s) seraient créés.")
        print("Relance avec --appliquer pour écrire réellement.")

    cur.close()
    cnx.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
