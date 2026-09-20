#!/usr/bin/env python3
"""Fabrique db/03-ciqual.sql depuis Table_Ciqual_2025.xlsx.

POURQUOI CE SCRIPT EXISTE, ET POURQUOI ON NE LE LANCE PRESQUE JAMAIS.

`Table_Ciqual_2025.xlsx` pèse 1,5 Mo, n'est PAS versionné (`.gitignore`), et un
clone neuf ne l'a donc pas. Or la table de référence doit exister chez tout le
monde : c'est elle qui permettra de rattacher un aliment à un sous-groupe, donc
de savoir ce qu'il EST.

On génère donc une fois un `db/03-ciqual.sql` versionné, relu en revue comme
n'importe quel fichier du dépôt, et chargé à l'installation. Le tableur reste la
source ; le SQL en est la photographie datée.

    python3 ciqual_vers_sql.py          # écrit db/03-ciqual.sql

CE QUE CETTE TABLE NE FERA JAMAIS : remplir les valeurs d'un aliment. Décidé par
le propriétaire du projet le 20 septembre 2026, et c'est la règle 7 :

    « la table CIQUAL ne doit en rien décider des macros des aliments […] un riz
      basmati acheté par l'utilisateur A peut ne pas avoir les mêmes macros que
      le riz basmati de l'utilisateur B »

L'étiquette d'un paquet est la vérité pour CET aliment ; CIQUAL est une moyenne
générique. Les valeurs sont reprises ici pour UN SEUL usage : avertir quand une
saisie s'en écarte très fortement — « tu as saisi 90 kcal, un aliment de ce type
en fait ~350, vérifie ton étiquette ». Un avertissement, jamais une substitution,
et jamais un refus : un produit allégé ou enrichi s'écarte légitimement.

L'ÉNERGIE SE LIT DANS LA COLONNE « Règlement UE N° 1169/2011 » (règle 3), celle
qui compte les fibres à 2 kcal/g comme la règle 4. La colonne voisine « N x
facteur Jones » donne 348 au lieu de 350 pour le riz blanc cru : elle se trompe
de convention, et elle est PIÉGEUSE parce qu'elle porte presque le même nom.
"""

import sys
import unicodedata
from pathlib import Path

RACINE = Path(__file__).resolve().parent
TABLEUR = RACINE / "Table_Ciqual_2025.xlsx"
SORTIE = RACINE / "db" / "03-ciqual.sql"

# Les colonnes retenues, par leur indice dans la feuille. Le tableur en compte
# 84 ; huit suffisent. Le libelle complet est garde en commentaire parce que
# c'est lui qui permet de verifier qu'on n'a pas glisse d'une colonne.
COLONNES = {
    "groupe_code": 0,      # alim_grp_code
    "sousgroupe_code": 1,  # alim_ssgrp_code
    "groupe": 3,           # alim_grp_nom_fr
    "sousgroupe": 4,       # alim_ssgrp_nom_fr
    "code": 6,             # alim_code
    "nom": 7,              # alim_nom_fr
    "kcal100": 10,         # « Energie, Reglement UE N° 1169 2011 (kcal/100 g) »
    "prot100": 14,         # « Proteines, N x facteur de Jones (g/100 g) »
    "gluc100": 16,         # « Glucides (g/100 g) »
    "lip100": 17,          # « Lipides (g/100 g) »
    "fibres100": 26,       # « Fibres alimentaires (g/100 g) »
}

# Garde-fou : si l'Anses reordonne ses colonnes, on ne veut pas ecrire des
# lipides dans la colonne des glucides sans que personne le voie.
# Les libelles tels que le tableur les porte VRAIMENT : l'unite y est separee
# par un retour a la ligne, pas par une barre oblique — « (kcal 100 g) » et non
# « (kcal/100 g) ». Releve en ecrivant ce garde-fou, qui a refuse la premiere
# version : il sert deja.
ATTENDU = {
    6: "alim_code",
    7: "alim_nom_fr",
    10: "energie, reglement ue n° 1169 2011 (kcal 100 g)",
    14: "proteines, n x facteur de jones (g 100 g)",
    16: "glucides (g 100 g)",
    17: "lipides (g 100 g)",
    26: "fibres alimentaires (g 100 g)",
}


def sans_accent(texte: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texte)
        if unicodedata.category(c) != "Mn"
    )


def aplati(entete) -> str:
    """Le libelle d'une colonne, sans retours a la ligne ni accents."""
    return sans_accent(" ".join(str(entete or "").split())).lower()


def nombre(valeur):
    """Un nombre CIQUAL, ou None.

    VIDE N'EST PAS ZERO (regle 6). CIQUAL ecrit « - » pour « non mesure », et
    « traces » ou « < 0,1 » pour une presence trop faible pour etre chiffree.
    Aucun de ces trois ne vaut zero : on rend None, et la colonne est NULL.
    """
    if valeur is None:
        return None
    if isinstance(valeur, (int, float)):
        return float(valeur)

    texte = str(valeur).strip().replace(",", ".").replace(" ", "")
    if texte in ("", "-", "traces"):
        return None
    if texte.startswith("<"):
        return None
    try:
        return float(texte)
    except ValueError:
        return None


def litteral(valeur) -> str:
    if valeur is None:
        return "NULL"
    if isinstance(valeur, float):
        return f"{valeur:g}"
    return "'" + str(valeur).replace("'", "''") + "'"


def main() -> None:
    if not TABLEUR.exists():
        sys.exit(
            f"{TABLEUR.name} est absent.\n"
            "Il se telecharge sur ciqual.anses.fr et se pose a la racine du depot.\n"
            "Il n'est pas versionne (1,5 Mo) : seul le SQL qu'il produit l'est."
        )

    try:
        from openpyxl import load_workbook
    except ImportError:
        sys.exit("Installe le lecteur de tableur :  pip install openpyxl")

    import warnings
    warnings.filterwarnings("ignore")

    feuille = load_workbook(TABLEUR, read_only=True).worksheets[0]
    lignes = feuille.iter_rows(values_only=True)
    entetes = [aplati(e) for e in next(lignes)]

    for indice, attendu in ATTENDU.items():
        if entetes[indice] != attendu:
            sys.exit(
                f"La colonne {indice} devrait etre « {attendu} », elle contient\n"
                f"« {entetes[indice]} ». L'Anses a reordonne sa table : relis\n"
                "COLONNES avant de regenerer, sinon les valeurs changent de place\n"
                "en silence."
            )

    vues, valeurs = set(), []
    for ligne in lignes:
        code = ligne[COLONNES["code"]]
        nom = ligne[COLONNES["nom"]]
        if code is None or not nom:
            continue
        code = str(code).strip()
        if code in vues:
            continue
        vues.add(code)

        valeurs.append("({})".format(", ".join(litteral(v) for v in (
            code,
            " ".join(str(nom).split()),
            str(ligne[COLONNES["groupe_code"]] or "").strip(),
            " ".join(str(ligne[COLONNES["groupe"]] or "").split()),
            str(ligne[COLONNES["sousgroupe_code"]] or "").strip(),
            " ".join(str(ligne[COLONNES["sousgroupe"]] or "").split()),
            nombre(ligne[COLONNES["kcal100"]]),
            nombre(ligne[COLONNES["prot100"]]),
            nombre(ligne[COLONNES["gluc100"]]),
            nombre(ligne[COLONNES["lip100"]]),
            nombre(ligne[COLONNES["fibres100"]]),
        ))))

    SORTIE.parent.mkdir(exist_ok=True)
    with SORTIE.open("w", encoding="utf-8") as sortie:
        sortie.write(f"""-- ---------------------------------------------------------------------
--  CIQUAL 2025 — {len(valeurs)} aliments de reference
--
--  GENERE PAR `ciqual_vers_sql.py`, NE PAS MODIFIER A LA MAIN.
--  Source : Table_Ciqual_2025.xlsx, publiee par l'Anses (ciqual.anses.fr).
--  Le tableur pese 1,5 Mo et n'est pas versionne ; ce fichier en est la
--  photographie datee, relisible en revue et presente dans tout clone.
--
--  CE QUE CETTE TABLE NE FAIT JAMAIS : remplir les valeurs d'un aliment.
--  Decide le 20 septembre 2026 — « un riz basmati achete par l'utilisateur A
--  peut ne pas avoir les memes macros que le riz basmati de l'utilisateur B ».
--  L'etiquette d'un paquet est la verite pour CET aliment. Les valeurs
--  ci-dessous servent a AVERTIR quand une saisie s'en ecarte tres fortement,
--  jamais a la remplacer, jamais a la refuser.
--
--  L'energie vient de la colonne « Reglement UE N° 1169/2011 » (regle 3), pas
--  de « N x facteur Jones » qui se trompe de convention.
--
--  IDEMPOTENT : rejoue a chaque demarrage par entrypoint-prod.sh.
-- ---------------------------------------------------------------------

TRUNCATE aliment_reference;

INSERT INTO aliment_reference
    (code, nom, groupe_code, groupe, sousgroupe_code, sousgroupe,
     kcal100, prot100, gluc100, lip100, fibres100)
VALUES
""")
        sortie.write(",\n".join(valeurs))
        sortie.write(";\n")

    print(f"  {SORTIE.relative_to(RACINE)} : {len(valeurs)} aliments, "
          f"{SORTIE.stat().st_size // 1024} Ko")


if __name__ == "__main__":
    main()
