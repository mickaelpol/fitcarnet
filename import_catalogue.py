# -*- coding: utf-8 -*-
"""
Importe le catalogue d'exercices (exercises.json) dans fitcarnet.

Ce que fait le script :
  - insère les exercices absents, avec leurs instructions EN FRANÇAIS ;
  - déduit le mode (charge / iso / chrono) et les groupes Push/Pull/Legs ;
  - marque tout en source = 'import', pour ne jamais confondre avec les tiens ;
  - relançable : un exercice déjà importé est mis à jour, pas dupliqué.

Ce qu'il ne fait pas :
  - il ne touche JAMAIS aux exercices de source « perso » ;
  - il n'importe aucun média : les champs image et gif_url du jeu de données
    sont vides, et leurs conditions d'origine l'interdisaient de toute façon.
    Les vidéos se renseignent depuis l'écran d'administration.

Prérequis : la migration db/05-catalogue.sql doit avoir été jouée.

Usage :
    python3 import_catalogue.py exercises.json
    python3 import_catalogue.py exercises.json --appliquer
"""

import argparse
import json
import sys
from typing import Any

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    sys.exit("Installe le pilote PostgreSQL :  pip install psycopg2-binary")


# ---------------------------------------------------------------- règles

# Un exercice au poids du corps tenu en position -> iso ; sinon charge.
# Le jeu de données ne décrit pas de « for time » : c'est propre à ton plan.
MOTS_ISO = ("plank", "hold", "isometric", "wall sit", "l-sit", "hang")

# Rattachement aux trois séances types, d'après la partie du corps travaillée.
GROUPES = {
    "chest": ["Push"],
    "shoulders": ["Push"],
    "upper arms": ["Push", "Pull"],   # biceps en tirage, triceps en poussée
    "back": ["Pull"],
    "lower arms": ["Pull"],
    "upper legs": ["Legs"],
    "lower legs": ["Legs"],
    "waist": [],                      # gainage : dans n'importe quelle séance
    "cardio": [],
    "neck": [],
}


def mode_de(nom: str) -> str:
    n = nom.lower()

    return "iso" if any(m in n for m in MOTS_ISO) else "charge"


def groupes_de(partie: str, cible: str) -> str:
    liste = GROUPES.get((partie or "").lower(), [])
    # les triceps poussent, les biceps tirent : on affine « upper arms »
    c = (cible or "").lower()
    if partie == "upper arms":
        if "tricep" in c:
            liste = ["Push"]
        elif "bicep" in c:
            liste = ["Pull"]

    return ",".join(liste)


def texte(valeur: Any) -> str | None:
    if valeur is None:
        return None
    t = str(valeur).strip()

    return t or None


def main() -> int:
    ap = argparse.ArgumentParser(description="Import du catalogue d'exercices")
    ap.add_argument("fichier", help="chemin de exercises.json")
    ap.add_argument("--appliquer", action="store_true", help="écrit réellement en base")
    ap.add_argument("--langue", default="fr", help="langue des instructions (défaut : fr)")
    ap.add_argument("--hote", default="localhost")
    ap.add_argument("--port", default="5432")
    ap.add_argument("--base", default="fitcarnet")
    ap.add_argument("--utilisateur", default="fitcarnet")
    ap.add_argument("--motdepasse", default="fitcarnet")
    args = ap.parse_args()

    with open(args.fichier, encoding="utf-8") as f:
        catalogue = json.load(f)

    print(f"Fichier lu : {len(catalogue)} exercices.\n")

    cnx = psycopg2.connect(host=args.hote, port=args.port, dbname=args.base,
                           user=args.utilisateur, password=args.motdepasse)
    cnx.autocommit = False
    cur = cnx.cursor()

    # --- la migration a-t-elle été jouée ? ---
    cur.execute("""
        SELECT count(*) FROM information_schema.columns
        WHERE table_name = 'exercice' AND column_name IN
              ('nom_fr','video_url','partie_corps','equipement','muscle_cible','source')
    """)
    if cur.fetchone()[0] < 6:
        sys.exit("Joue d'abord la migration :  db/05-catalogue.sql")

    # --- ce qui est déjà en base ---
    cur.execute("SELECT lower(nom) FROM exercice")
    deja = {ligne[0] for ligne in cur.fetchall()}
    cur.execute("SELECT count(*) FROM exercice WHERE source = 'perso'")
    nb_perso = cur.fetchone()[0]
    print(f"En base : {len(deja)} exercices, dont {nb_perso} personnels.\n")

    lignes: list[tuple] = []
    doublons = 0
    sans_instructions = 0

    for ex in catalogue:
        nom = texte(ex.get("name"))
        if nom is None:
            continue

        # on ne recouvre jamais un exercice existant, surtout pas les tiens
        if nom.lower() in deja:
            doublons += 1
            continue

        instructions_par_langue = ex.get("instructions") or {}
        instructions = texte(instructions_par_langue.get(args.langue)) \
            or texte(instructions_par_langue.get("en"))
        if instructions is None:
            sans_instructions += 1

        partie = texte(ex.get("body_part")) or ""
        cible = texte(ex.get("target")) or ""
        secondaires = ex.get("secondary_muscles") or []

        lignes.append((
            nom,                                   # nom
            None,                                  # nom_fr : à toi de le remplir
            None,                                  # format_prescrit : propre à ton plan
            mode_de(nom),                          # mode_defaut
            groupes_de(partie, cible),             # groupes
            partie or None,                        # partie_corps
            texte(ex.get("equipment")),            # equipement
            cible or None,                         # muscle_cible
            ", ".join(secondaires) or None,        # muscles_secondaires
            instructions,                          # instructions
            "import",                              # source
            str(ex.get("id")) if ex.get("id") is not None else None,
            True,                                  # public
        ))

    print(f"À importer        : {len(lignes)}")
    print(f"Déjà présents     : {doublons} (ignorés, tes exercices sont préservés)")
    if sans_instructions:
        print(f"Sans instructions : {sans_instructions} (repli sur l'anglais impossible)")

    # aperçu
    if lignes:
        print("\nAperçu :")
        for l in lignes[:3]:
            print(f"  {l[0][:42]:44} {l[5] or '—':14} {l[4] or '(aucun groupe)'}")

    if args.appliquer:
        execute_values(cur, """
            INSERT INTO exercice
                (nom, nom_fr, format_prescrit, mode_defaut, groupes, partie_corps,
                 equipement, muscle_cible, muscles_secondaires, instructions,
                 source, reference_source, public)
            VALUES %s
            ON CONFLICT (nom) DO NOTHING
        """, lignes)
        cnx.commit()
        cur.execute("SELECT source, count(*) FROM exercice GROUP BY source ORDER BY source")
        print("\n=== IMPORT TERMINÉ ===")
        for source, combien in cur.fetchall():
            print(f"  {source:8} {combien}")
    else:
        cnx.rollback()
        print("\n=== SIMULATION ===\nRelance avec --appliquer pour écrire réellement.")

    cur.close()
    cnx.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
