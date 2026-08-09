#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TA BALANCE PASSE AVANT CIQUAL — et ces tests le prouvent.

Le script d'import a longtemps affirme cette phrase en commentaire et fait
l'inverse dans le code : une pesee de 84 g de riz sec pour 393 g cuits donnait
un rendement de 4,68 la ou Ciqual disait 2,26, l'ecart depassait le seuil, et
la mesure etait jetee en silence. L'utilisateur voyait une colonne « cuit »
fausse sans savoir pourquoi.

Ce qu'on a compris depuis : une pesee et une table ne se contredisent pas,
elles decrivent deux produits differents. 84 g de riz sec portent 73 g de
matiere seche ; qu'ils rendent 393 g veut dire que CE riz-la contient 81 %
d'eau contre 70 % pour le riz moyen. Les deux existent. Le seul tort est de
garder le rendement de l'un avec les macros de l'autre.

Aucune dependance : `python3 test_ciqual.py`. Le script principal sort si
GROCY_URL manque, on en extrait donc les fonctions pures par l'AST plutot que
de l'importer.
"""

import ast
import os
import sys

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      "ciqual_vers_grocy.py")

A_EXTRAIRE = {"macros_depuis_le_sec", "sens_du_rendement", "ECART_PESEE_MAX",
              "AUTRE_ETAT", "CORRESPONDANCE", "desaccords", "normaliser",
              "MOTS_DECISIFS", "valeurs_saisies_a_la_main", "SAISIE_MANUELLE",
              "EXACTS", "CHAMPS_REQUIS"}


def fonctions_pures():
    """Les fonctions sans effet de bord du script, sorties de leur contexte."""
    source = open(SCRIPT, encoding="utf-8").read()
    arbre = ast.parse(source)
    morceaux = []
    for noeud in arbre.body:
        if isinstance(noeud, ast.FunctionDef) and noeud.name in A_EXTRAIRE:
            morceaux.append(ast.get_source_segment(source, noeud))
        elif (isinstance(noeud, ast.Assign)
              and getattr(noeud.targets[0], "id", None) in A_EXTRAIRE):
            morceaux.append(ast.get_source_segment(source, noeud))

    manquantes = A_EXTRAIRE - {
        n.name if isinstance(n, ast.FunctionDef) else getattr(n.targets[0], "id", "")
        for n in arbre.body
        if isinstance(n, (ast.FunctionDef, ast.Assign))
    }
    if manquantes:
        sys.exit(f"Introuvables dans le script : {', '.join(sorted(manquantes))}")

    espace = {"unicodedata": __import__("unicodedata"), "re": __import__("re")}
    exec("\n\n".join(morceaux), espace)  # noqa: S102 — code du depot, pas une entree
    return espace


BOITE = fonctions_pures()
macros_depuis_le_sec = BOITE["macros_depuis_le_sec"]
sens_du_rendement = BOITE["sens_du_rendement"]

# Riz blanc cru, Ciqual. C'est l'etiquette : une valeur stable, mesuree sur un
# produit sec, qui ne depend d'aucune facon de cuisiner.
RIZ_SEC = {
    "nom": "Riz blanc, cru", "cle": "riz blanc cru",
    "kcal": 350, "prot": 7.12, "gluc": 75.0, "lip": 1.58, "fibres": 3.2,
}

ECHECS = []
PASSES = 0


def verifier(quoi, condition):
    global PASSES
    if condition:
        PASSES += 1
    else:
        ECHECS.append(quoi)


def presque(a, b, marge=1e-9):
    return abs(a - b) <= marge


# ---------------------------------------------------- la pesee du 8 aout

recalcule = macros_depuis_le_sec(RIZ_SEC, 4.68)

verifier("84 g secs pour 393 g cuits donnent ~75 kcal/100 g",
         presque(recalcule["kcal"], 74.79, 0.1))
verifier("... et ~16 g de glucides pour 100 g",
         presque(recalcule["gluc"], 16.03, 0.1))

verifier("la cuisson n'ajoute que de l'eau : la part de glucides ne bouge pas",
         presque(recalcule["gluc"] / recalcule["kcal"], 75.0 / 350))
verifier("... ni celle des lipides",
         presque(recalcule["lip"] / recalcule["kcal"], 1.58 / 350))
verifier("... ni celle des fibres",
         presque(recalcule["fibres"] / recalcule["kcal"], 3.2 / 350))

# Le rendement de Ciqual redonne les valeurs de Ciqual : le calcul n'invente
# rien, il applique la meme conservation d'energie dans l'autre sens.
table = macros_depuis_le_sec(RIZ_SEC, 2.26)
verifier("le rendement de la table redonne les macros de la table (kcal)",
         presque(table["kcal"], 155, 1))
verifier("... et les glucides", presque(table["gluc"], 33.2, 0.5))

# ------------------------------------------- ce qui compte a la cuisine

# L'invariant central, et il est contre-intuitif : quel que soit le rendement,
# le poids SEC a peser pour atteindre une cible de glucides ne bouge pas. Le
# rendement se simplifie. Seule la colonne « cuit » en depend.
CIBLE_GLUCIDES = 60.0
attendu = CIBLE_GLUCIDES * 100 / RIZ_SEC["gluc"]

for rendement in (1.87, 2.26, 3.0, 4.68, 5.5):
    a = macros_depuis_le_sec(RIZ_SEC, rendement)
    grammes_cuits = CIBLE_GLUCIDES / (a["gluc"] / 100)
    a_peser = grammes_cuits / rendement
    verifier(f"poids sec a peser identique a un rendement de {rendement}",
             presque(a_peser, attendu, 1e-9))

# ... mais le poids servi, lui, change du simple au triple.
petit = macros_depuis_le_sec(RIZ_SEC, 1.87)
gros = macros_depuis_le_sec(RIZ_SEC, 4.68)
verifier("le poids servi, lui, suit bien le rendement",
         (CIBLE_GLUCIDES / (gros["gluc"] / 100))
         > 2 * (CIBLE_GLUCIDES / (petit["gluc"] / 100)))

# ------------------------------------------------------- les garde-fous

verifier("un rendement nul ne produit rien",
         macros_depuis_le_sec(RIZ_SEC, 0) is None)
verifier("un rendement negatif ne produit rien",
         macros_depuis_le_sec(RIZ_SEC, -2) is None)
verifier("sans etat sec connu, on ne recalcule pas",
         macros_depuis_le_sec(None, 3) is None)
verifier("un etat sec sans energie ne sert a rien",
         macros_depuis_le_sec({"nom": "x", "cle": "x", "kcal": 0}, 3) is None)

# ------------------------------------------------- le sens du rendement

verifier("riz tres hydrate a 4.68 : accepte",
         sens_du_rendement("fec", 4.68) is None)
verifier("truite tres cuite a 0.53 : acceptee",
         sens_du_rendement("prot", 0.53) is None)
verifier("courgette qui rend son eau a 0.73 : acceptee",
         sens_du_rendement("leg", 0.73) is None)

verifier("une viande ne gagne pas de poids en cuisant",
         sens_du_rendement("prot", 1.4) is not None)
verifier("un feculent ne perd pas de poids en cuisant",
         sens_du_rendement("fec", 0.8) is not None)
verifier("un rendement nul est refuse",
         sens_du_rendement("fec", 0) is not None)
verifier("un rendement de 8 est hors de tout ordre de grandeur",
         sens_du_rendement("leg", 8) is not None)


# ------------------------------- l'energie ne se conserve QUE pour un grain

# La dérivation du rendement par l'énergie repose sur « la cuisson n'ajoute
# que de l'eau ». C'est vrai d'un grain sec, qui absorbe sans rien perdre.
# C'est faux d'un légume à l'eau bouillante, dont les sucres et les minéraux
# partent dans la casserole.
#
# La version precedente y avait mis les legumes, et le resultat parlait de
# lui-meme : epinard 1 -> 1.70, soit 119 g crus pour servir 200 g cuits, la
# ou il en faut 500 a 700. Facteur cinq, sur toutes les portions de legumes.
AUTRE_ETAT = BOITE["AUTRE_ETAT"]
CORRESPONDANCE = BOITE["CORRESPONDANCE"]

for cle in AUTRE_ETAT:
    entree = CORRESPONDANCE.get(cle)
    verifier(f"« {cle} » est bien un féculent, pas un légume",
             entree is not None and entree[1] == "fec")

for interdit in ("brocoli", "epinard", "courgette", "carotte", "poireau",
                 "chou fleur", "haricots verts", "petits pois",
                 "patate douce", "pommes de terre"):
    verifier(f"« {interdit} » ne doit plus déduire son rendement de l'énergie",
             interdit not in AUTRE_ETAT)

verifier("les grains secs, eux, y sont restés",
         {"riz basmati", "riz complet", "quinoa", "boulgour",
          "pates completes", "semoule complete"} <= set(AUTRE_ETAT))

# ------------------------------------------- un légume se pèse CRU

# 200 g de brocoli sur la balance, 150 g dans l'assiette après la vapeur.
# On pèse ce qu'on sort du frigo, donc les valeurs doivent être celles du
# CRU — et à la vapeur seule l'eau part, donc c'est exact. Chaque légume doit
# viser une entrée Ciqual crue, sinon la colonne « à cuire » ment.
for cle, (motifs, categorie, _ratio) in CORRESPONDANCE.items():
    if categorie != "leg":
        continue
    verifier(f"« {cle} » vise bien un libellé Ciqual CRU",
             "cuit" not in motifs and "cuite" not in motifs)


# ----------------------------- « au naturel » n'est pas « à l'huile »

# Ciqual distingue « Sardine, au naturel » (182 kcal, 9,3 g de lipides) et
# « Sardine, à l'huile » (217 kcal, 13,7 g). Une boîte de 100 g mal appariée,
# ce sont 4,4 g de lipides comptés en trop — plus de TROIS fois la tolérance
# d'un repas entier. Et rien ne le voyait : les deux libellés contiennent
# « sardine », la recherche par mots-clés prenait le premier venu.
desaccords = BOITE["desaccords"]

APPARIEMENTS = [
    # (produit Grocy, libellé Ciqual, faut-il alerter ?)
    ("Sardines (boite au naturel)", "Sardine, à l'huile, appertisée, égouttée", True),
    ("Sardines (boite au naturel)", "Sardine, au naturel, appertisée, égouttée", False),
    ("Lait", "Lait demi-écrémé, UHT", True),
    ("Pain de mie blanc", "Pain de mie complet, préemballé", True),
    # ... et les appariements légitimes, qui ne doivent RIEN déclencher :
    ("Thon au naturel", "Thon, au naturel, appertisé, égoutté", False),
    ("huile d'avocat (vierge)", "Huile d'avocat", False),
    ("Riz complet", "Riz complet, cuit, sans sel ajouté", False),
    ("Boulgour", "Boulgour de blé, cuit, sans sel ajouté", False),
    ("Blanc de poulet", "Poulet, filet sans peau cru", False),
    ("Oeufs entiers", "Oeuf cru", False),
    ("Noisettes", "Noisette, sans sel ajouté", False),
    ("Pain de mie complet", "Pain de mie complet, préemballé", False),
    ("Saumon frais", "Saumon, élevage, cru", False),
    ("Petits pois", "Petits pois, crus", False),
]

for produit, ciqual, alerte in APPARIEMENTS:
    trouve = bool(desaccords(produit, ciqual))
    verifier(
        f"« {produit} » -> « {ciqual[:34]} » : "
        + ("doit alerter" if alerte else "ne doit rien dire"),
        trouve == alerte)

# « cru » et « cuit » diffèrent légitimement — « Blanc de poulet » vise
# « Poulet, filet sans peau cru ». « sel » et « sucre » traînent dans la
# moitié des libellés Ciqual sous la forme « sans sel ajouté ».
for mot in ("cru", "cuit", "sel", "sucre"):
    verifier(f"« {mot} » ne doit pas être un mot décisif",
             mot not in BOITE["MOTS_DECISIFS"])

# Les sardines ne sont plus dans la table : voir plus bas.


# ------------------------- ce que tu as saisi ne s'ecrase pas

# Aucune table ne couvre tout. Ciqual n'a pas de sardine « au naturel » — que
# du cru (160 kcal), du grillé (194) et cinq versions à l'huile (194 à 224).
# Pour ces produits, l'étiquette de la boîte bat n'importe quelle moyenne.
#
# Encore faut-il que la saisie survive : tant que l'import réécrivait tout à
# chaque passage, recopier une étiquette ne servait à rien.
saisie = BOITE["valeurs_saisies_a_la_main"]

verifier("un produit marqué « moi » est laissé intact",
         saisie({"userfields": {"source_valeurs": "moi"}}))
verifier("... même avec des espaces autour",
         saisie({"userfields": {"source_valeurs": "  moi  "}}))
verifier("un produit écrit par le script ne l'est pas",
         not saisie({"userfields": {"source_valeurs": "ciqual"}}))
verifier("un produit sans marque non plus",
         not saisie({"userfields": {}}))
verifier("ni un produit sans champs du tout",
         not saisie({}))
verifier("ni un produit dont le champ est vide",
         not saisie({"userfields": {"source_valeurs": ""}}))

# Ciqual n'ayant pas d'equivalent honnete, les sardines sortent de la table.
verifier("les sardines ne sont plus appariées automatiquement",
         "sardines" not in CORRESPONDANCE)

# ------------------------- un libellé exact est un choix, pas un accident

# Le contrôle des mots décisifs existe pour rattraper la recherche par
# mots-clés. Quand quelqu'un a cherché dans la table, lu la liste et recopié
# le libellé exact, se méfier de sa décision n'a plus de sens.
EXACTS = BOITE["EXACTS"]

verifier("le lait est tranché par un libellé exact",
         EXACTS.get("lait") == "Lait demi-écrémé, UHT")
verifier("... et ce libellé aurait bien déclenché l'alerte sans ça",
         bool(desaccords("Lait", "Lait demi-écrémé, UHT")))

for cle, libelle in EXACTS.items():
    verifier(f"« {cle} » a un libellé exact non vide",
             isinstance(libelle, str) and len(libelle) > 3)


# --------------------------- le script pose lui-même les champs dont il a besoin

# Grocy refuse une écriture entière si UN champ manque, avec un 400 laconique :
# « Field source_valeurs is not a valid userfield of the given entity ». Le
# script crée donc ce qu'il lui faut, plutôt que de dépendre de grocy_macros.py
# — dont le --appliquer réécrivait au passage les macros de tous les produits
# depuis sa propre table, effaçant le travail fait ici.
CHAMPS_REQUIS = BOITE["CHAMPS_REQUIS"]
noms_champs = {c[0] for c in CHAMPS_REQUIS}

for indispensable in ("cat", "kcal100", "prot100", "gluc100", "lip100", "ratio",
                      "fibres100", "pesee_avant", "pesee_apres", "source_valeurs"):
    verifier(f"le champ « {indispensable} » sera créé au besoin",
             indispensable in noms_champs)

verifier("chaque champ a un libellé et un type",
         all(len(c) == 3 and all(isinstance(x, str) and x for x in c)
             for c in CHAMPS_REQUIS))


if __name__ == "__main__":
    total = PASSES + len(ECHECS)
    print(f"{PASSES}/{total} vérifications passées")
    for echec in ECHECS:
        print(f"  ÉCHEC : {echec}")
    sys.exit(1 if ECHECS else 0)
