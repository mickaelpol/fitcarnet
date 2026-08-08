# -*- coding: utf-8 -*-
"""
Renseigne les macros de tes produits Grocy depuis la table Ciqual de l'Anses.

Pourquoi Ciqual plutot qu'une base americaine : la convention europeenne
compte les fibres SEPAREMENT des glucides, et a 2 kcal/g. Une table americaine
les inclut dans les glucides. Sur des amandes, l'ecart va de 4,8 g a 21,5 g de
glucides pour 100 g — un facteur quatre. Comme tes objectifs et tes emballages
suivent la convention europeenne, toute la base doit la suivre aussi.

Prealable — telecharger la table :
    https://ciqual.anses.fr/#/cms/download/node/20
    Prendre le format EXCEL, le poser a cote de ce script.

Usage :
    pip install openpyxl
    GROCY_URL=... GROCY_API_KEY=... python3 ciqual_vers_grocy.py Table_Ciqual.xlsx
    GROCY_URL=... GROCY_API_KEY=... python3 ciqual_vers_grocy.py Table_Ciqual.xlsx --appliquer

Le script cherche chaque produit Grocy dans Ciqual a partir d'une table de
correspondance ci-dessous, verifie la coherence energetique de chaque valeur
retenue, et n'ecrit qu'apres ton accord.

Source des donnees : Anses. Table Ciqual de composition nutritionnelle des
aliments. https://ciqual.anses.fr/
"""

import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request

try:
    from openpyxl import load_workbook
except ImportError:
    sys.exit("Installe le lecteur de tableur :  pip install openpyxl")

GROCY_URL = os.environ.get("GROCY_URL", "").rstrip("/")
API_KEY = os.environ.get("GROCY_API_KEY", "")
APPLIQUER = "--appliquer" in sys.argv
FICHIERS = [a for a in sys.argv[1:] if not a.startswith("--")]

if not GROCY_URL or not API_KEY:
    sys.exit("Renseigne GROCY_URL et GROCY_API_KEY dans l'environnement.")
if not FICHIERS:
    sys.exit("Indique le fichier Ciqual :  python3 ciqual_vers_grocy.py Table_Ciqual.xlsx")

CIQUAL = FICHIERS[0]

if not os.path.isfile(CIQUAL):
    voisins = sorted(f for f in os.listdir('.') if f.lower().endswith(('.xlsx', '.xls')))
    sys.exit(
        f"Fichier introuvable : {CIQUAL}\n"
        + (f"Tableurs presents ici : {', '.join(voisins)}\n" if voisins
           else "Aucun tableur dans ce dossier.\n")
        + "Telecharge la table au format EXCEL depuis\n"
        "  https://ciqual.anses.fr/#/cms/download/node/20\n"
        "et pose-la a cote de ce script.")

# ---------------------------------------------------------------------
#  Correspondance : produit Grocy -> aliment Ciqual
#
#  La recherche se fait sur les mots-cles du libelle Ciqual. Le premier
#  aliment dont le nom contient TOUS les mots est retenu ; on prefere les
#  libelles courts, plus generiques.
#
#  categorie et ratio ne figurent pas dans Ciqual : ils viennent du plan.
#    ratio  feculents : cuit / sec   ·   proteines : cuit / cru
# ---------------------------------------------------------------------

# Libellés Ciqual EXACTS, quand la recherche par mots-clés se trompe.
# Utilise --chercher « amande » pour découvrir le libellé réel, puis
# recopie-le ici. Une correspondance exacte n'est jamais réinterprétée.
EXACTS = {
    "semoule complete": "Semoule ou graine de couscous complète, cuite, sans sel ajouté",
    "boeuf hache 5":    "Boeuf, steak haché 5% MG cru",
    "blanc de poulet":  "Poulet, filet sans peau cru",
}

# ---------------------------------------------------------------------
#  Ratios cuit / sec, dérivés de Ciqual plutôt que devinés.
#
#  La cuisson n'ajoute que de l'eau : l'énergie totale se conserve. Donc
#  100 g de riz sec à 350 kcal donnent, une fois cuits à 187 kcal/100 g,
#  350 / 187 = 187 g... soit un ratio de 1,87 et non 3.
#
#  Pour chaque féculent on indique son libellé À L'ÉTAT SEC ; le script
#  calcule le ratio en divisant les deux énergies. Idem pour les viandes,
#  où la cuisson RETIRE de l'eau et où le ratio est inférieur à 1.
# ---------------------------------------------------------------------

AUTRE_ETAT = {
    "riz complet":      "Riz complet, cru",
    "riz basmati":      "Riz blanc, cru",
    "quinoa":           "Quinoa, cru",
    "pates completes":  "Pâtes sèches, semi-complètes, crues",
    "semoule complete": "Semoule de blé dur, crue",
    "boulgour":         "Boulgour de blé, cru",
}

# Aliments absents de Ciqual : valeurs relevées sur l'emballage.
# Renseigne ici ce que dit ta boîte, c'est toujours plus juste qu'une moyenne.
ETIQUETTES = {
    #  produit Grocy   : (categorie, kcal, prot, gluc, lip, ratio, source)
    "skyr": ("lait", 54, 9.4, 4.0, 0, 1, "étiquette Milbona"),
}

CORRESPONDANCE = {
    # produit Grocy (mots-cles)   : (mots-cles Ciqual, categorie, ratio)
    "flocons d avoine":     ("flocons d'avoine",            "fec",  1),
    "fraise":               ("fraise, crue",                "fruit", 1),
    "oeufs entiers":        ("oeuf, cru",                   "prot", 1),
    "blancs d oeufs":       ("blanc d'oeuf, cru",           "prot", 1),
    "skyr":                 ("skyr",                        "lait", 1),
    "banane":               ("banane, crue",                "fruit", 1),
    "amandes":              ("amande",                      "ole",  1),
    "patate douce":         ("patate douce, cuite",         "fec",  1),
    "concombre":            ("concombre, cru",              "leg",  1),
    "haricots verts":       ("haricot vert, cuit",          "leg",  1),
    "saumon":               ("saumon, cru",                 "prot", 0.85),
    "huile":                ("huile d'avocat",              "huile", 1),
    "blanc de poulet":      ("poulet, blanc, cru",          "prot", 0.75),
    "framboise":            ("framboise, crue",             "fruit", 1),
    "myrtille":             ("myrtille, crue",              "fruit", 1),
    "mure":                 ("mûre, crue",                  "fruit", 1),
    "pomme":                ("pomme, crue",                 "fruit", 1),
    "poire":                ("poire, crue",                 "fruit", 1),
    "ananas":               ("ananas, cru",                 "fruit", 1),
    "brocoli":              ("brocoli, cuit",               "leg",  1),
    "courgette":            ("courgette, cuite",            "leg",  1),
    "epinard":              ("épinard, cuit",               "leg",  1),
    "carotte":              ("carotte, cuite",              "leg",  1),
    "chou fleur":           ("chou-fleur, cuit",            "leg",  1),
    "poireau":              ("poireau, cuit",               "leg",  1),
    "ratatouille":          ("ratatouille",                 "leg",  1),
    "pommes de terre":      ("pomme de terre, cuite",       "fec",  1),
    "truite":               ("truite, crue",                "prot", 0.85),
    "cabillaud":            ("cabillaud, cru",              "prot", 0.85),
    "haut de cuisse de poulet": ("poulet, cuisse, crue",    "prot", 0.75),
    "escalope de dinde":    ("dinde, escalope, crue",       "prot", 0.75),
    "escalope de veau":     ("veau, escalope, crue",        "prot", 0.75),
    "boeuf hache 5":        ("boeuf, viande hachée, 5%",    "prot", 0.78),
    "noix":                 ("noix, séchée",                "ole",  1),
    "noisette":             ("noisette",                    "ole",  1),
    "beurre de cacahuete":  ("beurre de cacahuète",         "ole",  1),
    "riz complet":          ("riz complet, cuit",           "fec",  3),
    "riz basmati":          ("riz blanc, cuit",             "fec",  3),
    "quinoa":               ("quinoa, cuit",                "fec",  2.75),
    "pates completes":      ("pâtes complètes, cuites",     "fec",  2.2),
    "semoule complete":     ("semoule, cuite",              "fec",  3),
    "boulgour":             ("boulgour, cuit",              "fec",  2.5),
    "sardines":             ("sardine, à l'huile",          "prot", 1),
    "thon au naturel":      ("thon, au naturel",            "prot", 1),
    "petits pois":          ("petit pois, cuit",            "leg",  1),
    "jus de citron":        ("jus de citron",               "autre", 1),
    "lait":                 ("lait demi-écrémé",            "lait", 1),
    "camembert":            ("camembert",                   "lait", 1),
    "emmental":             ("emmental",                    "lait", 1),
    "pain de mie complet":  ("pain de mie complet",         "fec",  1),
}

# Ces produits n'ont pas leur place dans un calculateur de diete.
EXCLUSIONS = ("glace", "sorbet", "coca", "orangina", "madeleine", "bonbon",
              "biscuit", "gateau", "chips", "soda")

# Colonnes du tableur Ciqual.
#
# « exact » d'abord : Ciqual place les noms de GROUPES avant celui de
# l'aliment (alim_grp_nom_fr, alim_ssgrp_nom_fr, puis alim_nom_fr). Une
# recherche par mots-cles retiendrait le groupe — « fruits, legumes… » —
# et aucun aliment ne serait jamais trouve.
COLONNES = {
    "nom":    {"exact": "alim nom fr", "mots": ()},
    "kcal":   {"exact": None, "mots": ("energie", "reglement", "kcal")},
    "prot":   {"exact": None, "mots": ("proteines", "jones")},
    "gluc":   {"exact": None, "mots": ("glucides", "100")},
    "lip":    {"exact": None, "mots": ("lipides", "100")},
    "fibres": {"exact": None, "mots": ("fibres", "100")},
}


def normaliser(s) -> str:
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()

    return " ".join("".join(c if c.isalnum() else " " for c in s).split())


def nombre(valeur):
    """Ciqual note « < 0,5 », « traces », « - » : on ramene a un flottant."""
    if valeur is None:
        return None
    t = str(valeur).strip().replace(",", ".").replace("\u00a0", "")
    if t in ("", "-", "traces", "Traces"):
        return 0.0
    t = t.lstrip("<").strip()
    m = re.match(r"^-?\d+(?:\.\d+)?", t)

    return float(m.group()) if m else None


def api(methode, chemin, corps=None):
    donnees = json.dumps(corps).encode() if corps is not None else None
    requete = urllib.request.Request(
        GROCY_URL + "/api" + chemin, data=donnees, method=methode,
        headers={"GROCY-API-KEY": API_KEY, "Content-Type": "application/json",
                 "Accept": "application/json"})
    try:
        with urllib.request.urlopen(requete, timeout=30) as r:
            contenu = r.read().decode()

            return json.loads(contenu) if contenu else {}
    except urllib.error.HTTPError as e:
        sys.exit(f"Grocy a répondu {e.code} : {e.read().decode()[:200]}")
    except urllib.error.URLError as e:
        sys.exit(f"Grocy est injoignable : {e.reason}")


# ------------------------------------------------------------ lecture Ciqual

def lire_ciqual(chemin):
    print(f"Lecture de {chemin}…")
    try:
        classeur = load_workbook(chemin, read_only=True, data_only=True)
    except Exception as e:
        # Un fichier .xls ancien, un ZIP corrompu, un telechargement interrompu :
        # tous finissent ici, et une trace Python n'aide personne.
        sys.exit(f"Lecture impossible de {chemin} : {e}\n"
                 "Attendu : le format EXCEL (.xlsx) de la table Ciqual.")
    feuille = classeur[classeur.sheetnames[0]]
    lignes = feuille.iter_rows(values_only=True)

    entetes = [normaliser(c) for c in next(lignes)]

    index = {}
    for cle, regle in COLONNES.items():
        # une correspondance exacte prime toujours
        if regle["exact"] is not None:
            for i, titre in enumerate(entetes):
                if titre == regle["exact"]:
                    index[cle] = i
                    break
        if cle in index:
            continue
        # à défaut, le titre le plus COURT contenant tous les mots-clés :
        # « Glucides (g/100 g) » plutôt que « Glucides assimilables… »
        candidats = [(len(t), i) for i, t in enumerate(entetes)
                     if all(normaliser(m) in t for m in regle["mots"])]
        if candidats:
            index[cle] = min(candidats)[1]

    manquantes = [c for c in COLONNES if c not in index]
    if manquantes:
        print("\nColonnes introuvables :", ", ".join(manquantes))
        print("Titres disponibles :")
        for t in entetes[:25]:
            print("   ", t[:70])
        sys.exit("\nLe format du fichier a changé. Signale-le-moi avec cette liste.")

    print("  colonnes retenues :")
    for cle in COLONNES:
        print(f"    {cle:7} -> {entetes[index[cle]][:64]}")
    print()

    aliments = []
    for ligne in lignes:
        nom = ligne[index["nom"]]
        if not nom:
            continue
        aliments.append({
            "nom": str(nom),
            "cle": normaliser(nom),
            "kcal": nombre(ligne[index["kcal"]]),
            "prot": nombre(ligne[index["prot"]]),
            "gluc": nombre(ligne[index["gluc"]]),
            "lip": nombre(ligne[index["lip"]]),
            "fibres": nombre(ligne[index["fibres"]]),
        })

    print(f"  {len(aliments)} aliments lus.\n")

    return aliments


# Mots qui, dans un libellé Ciqual, en font un TOUT AUTRE aliment.
# « Amande » et « Dragée amande » partagent un mot mais rien d'autre :
# 5,6 g de glucides contre 75,7. Sans ce garde-fou, la recherche par
# mots-clés produit des correspondances catastrophiques.
PIEGES = (
    "huile", "dragee", "dragees", "creme", "plantain", "confit", "confite",
    "sirop", "sucre", "sucree", "chocolat", "praline", "grillee", "grille",
    "sale", "salee", "fume", "fumee", "pane", "panee", "farine", "poudre",
    "boisson", "jus de fruits", "nectar", "conserve au sirop", "beignet",
    "gateau", "biscuit", "glace", "sorbet", "pate a", "puree de",
)


def chercher(aliments, motifs: str, tolerer_pieges: bool = False):
    """
    Le meilleur libellé Ciqual pour ces mots-clés.

    Trois filtres successifs, du plus sûr au plus permissif :
      1. le libellé COMMENCE par les mots demandés — « Amande » avant
         « Dragée amande » ;
      2. il ne contient aucun mot piège ;
      3. à égalité, le plus court l'emporte.

    Un aliment sans énergie est écarté : Ciqual laisse des trous, et une
    valeur à zéro fausserait tout un repas.
    """
    mots = normaliser(motifs).split()
    if not mots:
        return None

    candidats = [a for a in aliments if all(m in a["cle"] for m in mots)]
    candidats = [a for a in candidats if a["kcal"] and a["kcal"] > 0]

    if not tolerer_pieges:
        propres = [a for a in candidats
                   if not any(p in a["cle"] for p in PIEGES
                              if p not in normaliser(motifs))]
        if propres:
            candidats = propres

    if not candidats:
        return None

    debut = normaliser(motifs).split(",")[0].strip()
    candidats.sort(key=lambda a: (not a["cle"].startswith(debut), len(a["nom"])))

    return candidats[0]


def candidats_pour(aliments, motifs: str, combien: int = 6):
    """Les libellés possibles, pour choisir à la main."""
    mots = normaliser(motifs).split()
    trouves = [a for a in aliments if all(m in a["cle"] for m in mots)]
    trouves.sort(key=lambda a: len(a["nom"]))

    return trouves[:combien]


# Au-dela, une pesee ne corrige plus le ratio : elle le contredit. Cinquante
# pour cent laisse toute la place aux differences reelles — eau, feu, temps de
# cuisson — sans laisser passer un facteur deux.
ECART_PESEE_MAX = 0.5


def pesees_de(produit) -> tuple[float, float] | None:
    """
    Les deux pesées deja saisies dans Grocy, si elles tiennent debout.

    Grocy renvoie les champs personnalises sous « userfields » de chaque
    produit — jamais un par un, ce qui couterait un appel HTTP par produit.
    """
    champs = produit.get("userfields") or {}
    avant = nombre(champs.get("pesee_avant"))
    apres = nombre(champs.get("pesee_apres"))
    if not avant or not apres or avant <= 0 or apres <= 0:
        return None

    return avant, apres


def coherent(a) -> tuple[bool, float]:
    """Vérifie l'énergie : 4·P + 4·G + 2·fibres + 9·L, convention européenne."""
    if a["kcal"] is None or a["kcal"] <= 0:
        return False, 0.0
    calcul = (4 * (a["prot"] or 0) + 4 * (a["gluc"] or 0)
              + 2 * (a["fibres"] or 0) + 9 * (a["lip"] or 0))

    return abs(calcul - a["kcal"]) / a["kcal"] <= 0.12, calcul


# -------------------------------------------------------------------- main

def main() -> int:
    aliments = lire_ciqual(CIQUAL)

    # --chercher « amande » : liste les libellés Ciqual disponibles
    if "--chercher" in sys.argv:
        terme = sys.argv[sys.argv.index("--chercher") + 1]
        print(f"Libellés contenant « {terme} » :\n")
        for a in candidats_pour(aliments, terme, 20):
            print(f"  {a['nom'][:58]:60} {a['kcal'] or 0:6.1f} kcal · "
                  f"{a['prot'] or 0:5.1f} P · {a['gluc'] or 0:5.1f} G · {a['lip'] or 0:5.1f} L")
        print("\nRecopie le bon libellé dans EXACTS, en tête du script.")

        return 0
    produits = api("GET", "/objects/products")

    trouves, sans_correspondance, introuvables, suspects = [], [], [], []
    ratios_corriges, depuis_etiquette, ratios_mesures = [], [], []
    pesees_ecartees = []

    for produit in produits:
        cle = normaliser(produit["name"])

        if any(mot in cle.split() for mot in EXCLUSIONS):
            sans_correspondance.append((produit["name"], "hors diète"))
            continue

        # une valeur relevée sur l'emballage prime sur tout
        etiquette = next((m for m in ETIQUETTES if all(x in cle for x in m.split())), None)
        if etiquette is not None:
            categorie, kcal, prot, gluc, lip, ratio, source = ETIQUETTES[etiquette]
            depuis_etiquette.append((produit["name"], source))
            trouves.append((produit, {"nom": f"({source})", "kcal": kcal, "prot": prot,
                                      "gluc": gluc, "lip": lip, "fibres": 0},
                            categorie, ratio, True))
            continue

        entree = None
        for motif, valeurs in CORRESPONDANCE.items():
            if all(m in cle for m in motif.split()):
                if entree is None or len(motif) > len(entree[0]):
                    entree = (motif, valeurs)
        if entree is None:
            sans_correspondance.append((produit["name"], "non répertorié"))
            continue

        motif_produit, (motifs_ciqual, categorie, ratio) = entree

        # un libellé exact prime sur la recherche par mots-clés
        aliment = None
        if motif_produit in EXACTS:
            vise = normaliser(EXACTS[motif_produit])
            aliment = next((a for a in aliments if a["cle"] == vise), None)
            if aliment is None:
                aliment = chercher(aliments, EXACTS[motif_produit])
        if aliment is None:
            aliment = chercher(aliments, motifs_ciqual)
        if aliment is None:
            introuvables.append((produit["name"], motifs_ciqual))
            continue

        # ratio dérivé de Ciqual quand les deux états sont connus
        if motif_produit in AUTRE_ETAT and aliment and aliment["kcal"]:
            sec = chercher(aliments, AUTRE_ETAT[motif_produit])
            if sec and sec["kcal"]:
                calcule = round(sec["kcal"] / aliment["kcal"], 2)
                if 0.4 <= calcule <= 5:
                    if abs(calcule - ratio) / ratio > 0.1:
                        ratios_corriges.append(
                            (produit["name"], ratio, calcule, sec["nom"]))
                    ratio = calcule

        # TA balance passe avant Ciqual : un ratio derive d'une moyenne
        # nationale ne vaut pas deux pesees faites sur TON riz, avec TON eau
        # et TON temps de cuisson. On ne les ecrase donc jamais, on les
        # utilise.
        #
        # Sauf quand la mesure contredit la physique. La cuisson n'ajoute que
        # de l'eau : l'energie se conserve. Une pesee qui doublerait le ratio
        # attendu impliquerait un aliment deux fois moins calorique une fois
        # cuit, ce qui n'arrive pas — c'est une erreur de saisie, une pesee
        # faite apres rincage, ou l'eau restee dans la casserole.
        #
        # Ecrire ce ratio-la fausserait toutes les quantites de cet aliment,
        # en silence. On garde donc l'ancien et on le dit.
        pesees = pesees_de(produit)
        if pesees is not None:
            mesure = round(pesees[1] / pesees[0], 2)
            if not (0.4 <= mesure <= 5):
                pesees_ecartees.append(
                    (produit["name"], mesure, ratio, pesees, "hors de tout ordre de grandeur"))
            elif abs(mesure - ratio) / ratio > ECART_PESEE_MAX:
                pesees_ecartees.append(
                    (produit["name"], mesure, ratio, pesees,
                     f"{abs(mesure - ratio) / ratio:.0%} d'ecart avec Ciqual"))
            else:
                if abs(mesure - ratio) / ratio > 0.02:
                    ratios_mesures.append((produit["name"], ratio, mesure, pesees))
                ratio = mesure

        # Ciqual laisse des trous : une énergie nulle n'est pas une donnée,
        # et l'écrire fausserait silencieusement tous les repas concernés
        if not aliment["kcal"] or aliment["kcal"] <= 0:
            introuvables.append((produit["name"],
                                 f"{motifs_ciqual} — « {aliment['nom']} » sans énergie"))
            continue

        ok, calcul = coherent(aliment)
        if not ok:
            suspects.append((produit["name"], aliment["nom"], aliment["kcal"], calcul))

        trouves.append((produit, aliment, categorie, ratio, ok))

    # ---------- rapport ----------
    print(f"=== {len(trouves)} produit(s) appariés sur {len(produits)} ===\n")
    print(f"{'Produit Grocy':32} {'Ciqual':40} {'kcal':>6} {'P':>6} {'G':>6} {'L':>6}")
    print("-" * 100)
    for produit, aliment, categorie, ratio, ok in trouves:
        marque = "" if ok else "  ?"
        print(f"{produit['name'][:31]:32} {aliment['nom'][:39]:40} "
              f"{aliment['kcal'] or 0:6.1f} {aliment['prot'] or 0:6.1f} "
              f"{aliment['gluc'] or 0:6.1f} {aliment['lip'] or 0:6.1f}{marque}")

    if ratios_corriges:
        print(f"\n{len(ratios_corriges)} ratio(s) recalculé(s) depuis Ciqual :")
        for nom, avant, apres, libelle in ratios_corriges:
            print(f"  {nom[:26]:28} {avant} -> {apres}   (d'après « {libelle[:38]} »)")
        print("  Le ratio dit combien pèsent 100 g de sec une fois cuits.")

    if ratios_mesures:
        print(f"\n{len(ratios_mesures)} ratio(s) repris de TES pesées :")
        for nom, avant, apres, (pa, pb) in ratios_mesures:
            print(f"  {nom[:26]:28} {avant} -> {apres}   ({pa:g} g avant → {pb:g} g après)")
        print("  Ces pesées ne sont pas réécrites : le script ne mesure rien.")

    if pesees_ecartees:
        print(f"\n{len(pesees_ecartees)} pesee(s) ECARTEE(S) — le ratio de Ciqual est conserve :")
        for nom, mesure, garde, (pa, pb), motif in pesees_ecartees:
            print(f"  ! {nom[:26]:28} {pa:g} g -> {pb:g} g donnerait {mesure}, "
                  f"on garde {garde}")
            print(f"    {motif}. Repese, ou corrige les deux champs dans Grocy.")

    if depuis_etiquette:
        print(f"\n{len(depuis_etiquette)} valeur(s) venue(s) d'un emballage :")
        for nom, source in depuis_etiquette:
            print(f"  {nom[:36]:38} {source}")

    if suspects:
        print(f"\n{len(suspects)} valeur(s) dont l'énergie ne colle pas à ses macros :")
        for nom, ciqual, annonce, calcul in suspects:
            print(f"  ? {nom[:28]:30} {annonce:6.0f} annoncées, {calcul:6.0f} calculées")
        print("  Souvent bénin (arrondis, alcool, polyols), mais vérifie ces lignes.")

    if introuvables:
        print(f"\n{len(introuvables)} produit(s) sans équivalent Ciqual :")
        for nom, motifs in introuvables:
            print(f"  - {nom}   (cherché : « {motifs} »)")
        print("  Adapte les mots-clés dans CORRESPONDANCE, en tête du script.")

    if sans_correspondance:
        print(f"\n{len(sans_correspondance)} produit(s) ignoré(s) :")
        for nom, raison in sans_correspondance:
            print(f"  - {nom[:40]:42} ({raison})")

    # ---------- écriture ----------
    if not APPLIQUER:
        print("\n=== SIMULATION ===\nRelance avec --appliquer pour écrire dans Grocy.")

        return 0

    print("\nÉcriture dans Grocy…")
    for index, (produit, aliment, categorie, ratio, _) in enumerate(trouves, 1):
        champs = {
            "cat": categorie,
            "kcal100": round(aliment["kcal"] or 0, 1),
            "prot100": round(aliment["prot"] or 0, 2),
            "gluc100": round(aliment["gluc"] or 0, 2),
            "lip100": round(aliment["lip"] or 0, 2),
            "ratio": ratio,
        }

        # Les fibres sont une VALEUR CIQUAL, au meme titre que les glucides :
        # elles s'ecrivent. Absentes de la table, on ecrit une chaine vide et
        # non zero — « inconnu » et « aucune fibre » ne se valent pas, et le
        # controle de coherence du front en tient compte.
        champs["fibres100"] = (round(aliment["fibres"], 2)
                               if aliment.get("fibres") is not None else "")

        # pesee_avant et pesee_apres ne sont PAS ecrites, et c'est un choix.
        # L'application les presente comme « mesure : 100 g avant cuisson ->
        # 187 g apres ». Or le script ne pese rien : il divise deux energies
        # Ciqual. Y poser 100 et 187 ferait passer une derivation pour une
        # mesure, et effacerait au passage les pesees reelles a chaque
        # reimport. Le ratio, lui, est bien ecrit — c'est la valeur utile.

        api("PUT", f"/userfields/products/{produit['id']}", champs)
        if index % 10 == 0:
            print(f"  [{index}/{len(trouves)}]", flush=True)

    print(f"\n=== {len(trouves)} produits renseignés ===")
    print("Source : Anses, Table Ciqual de composition nutritionnelle des aliments.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
