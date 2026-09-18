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
    sys.exit(
        "Renseigne GROCY_URL et GROCY_API_KEY dans l'environnement, en les\n"
        "EXPORTANT — sans « export », le shell les garde pour lui :\n"
        "  export GROCY_URL=https://grocy.exemple.fr\n"
        "  export GROCY_API_KEY=...")

# Sans schema, urllib remonte « unknown url type » au milieu du traitement,
# apres avoir lu 3 500 lignes de tableur pour rien. On le dit tout de suite,
# et on dit quoi taper.
if not GROCY_URL.startswith(("http://", "https://")):
    sys.exit(
        f"GROCY_URL doit commencer par https:// — reçu « {GROCY_URL} ».\n"
        f"  export GROCY_URL=https://{GROCY_URL}")
# --convertir-en-pese ne lit PAS Ciqual : il multiplie les valeurs deja
# presentes dans Grocy par leur propre rendement. Exiger le tableur pour cette
# commande-la reviendrait a demander une piece qui ne sert a rien.
SANS_CIQUAL = "--convertir-en-pese" in sys.argv

if not FICHIERS and not SANS_CIQUAL:
    sys.exit("Indique le fichier Ciqual :  python3 ciqual_vers_grocy.py Table_Ciqual.xlsx")

CIQUAL = FICHIERS[0] if FICHIERS else ""

if CIQUAL and not os.path.isfile(CIQUAL):
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
    # « semoule complete » pointait ici sur « Semoule ou graine de couscous
    # complète, CUITE ». Ce n'est pas la recherche par mots-cles qui a derape,
    # c'est cette ligne, ecrite a la main du temps ou les feculents portaient
    # leurs valeurs cuites. Depuis la refonte elle faisait ecrire 142 kcal
    # comme du grain sec, et en deduire un rendement de 0,41.
    #
    # Le libelle SEC existe bel et bien, et c'est « Semoule de blé dur, crue »
    # a 350 kcal. Mais il n'est pas COMPLET, et Ciqual n'a aucune entree de
    # semoule complete crue — seulement des cuites. On decrit donc ce qu'on
    # peut prouver, une semoule de ble dur. Garder le nom « complète » sur des
    # valeurs de semoule blanche serait remettre un mensonge a la place d'un
    # autre.
    "semoule":          "Semoule de blé dur, crue",
    # Ces deux-la visaient l'entree CUITE, comme la semoule et pour la meme
    # raison : ecrites du temps ou les feculents portaient leurs valeurs
    # cuites. Un audit les a mises en evidence, et je les ai d'abord ecartees
    # en disant « normal pour un tubercule ». Elles ne l'etaient pas : on
    # annoncait 95 kcal pour une pomme de terre qu'on pese crue a 80. Une
    # erreur de 19 %.
    "pommes de terre":  "Pomme de terre, sans peau, crue",
    "patate douce":     "Patate douce, crue",
    "pates completes":  "Pâtes sèches, au blé complet, crues",
    "boeuf hache 5":    "Boeuf, steak haché 5% MG cru",
    "blanc de poulet":  "Poulet, filet sans peau cru",
    # Verifie : c'est bien du demi-ecreme. Sans cette ligne, le controle des
    # mots decisifs signalait « ecreme » comme un desaccord possible — a
    # raison, tant que personne n'avait tranche.
    "lait":             "Lait demi-écrémé, UHT",
}

# ---------------------------------------------------------------------
#  Ratios cuit / sec, dérivés de Ciqual — POUR LES GRAINS SECS UNIQUEMENT.
#
#  L'hypothèse : la cuisson n'ajoute que de l'eau, donc l'énergie totale se
#  conserve. 100 g de riz sec à 350 kcal qui deviennent un produit à 155
#  kcal/100 g ont forcément gagné du poids d'un facteur 350 / 155 = 2,26.
#
#  ELLE NE VAUT QUE POUR UN GRAIN SEC. Un grain absorbe l'eau et ne perd
#  rien. Un légume à l'eau bouillante fait l'inverse : ses sucres et ses
#  minéraux PARTENT dans la casserole. L'énergie n'est plus conservée, et le
#  calcul rend n'importe quoi.
#
#  Ce n'est pas une inquiétude théorique, la version précédente l'a fait :
#
#      épinard   1 -> 1.70     (il faudrait donc en peser MOINS que ce qu'on sert)
#      poireau   1 -> 1.23
#      petits pois 1 -> 1.32
#
#  Un épinard à 1,70 dit qu'il faut peser 119 g crus pour en servir 200 g
#  cuits. Un épinard perd 60 à 70 % de sa masse : il en faut 500 à 700 g.
#  Facteur cinq, dans le mauvais sens, sur toutes les portions de légumes.
#
#  Les légumes et les tubercules sont donc SORTIS de cette table. Leur ratio
#  reste à 1 — « ce qu'on pèse est ce qu'on sert » — ce qui est exact tant
#  qu'on pèse la portion CUITE, et c'est la colonne que l'application affiche.
#  Le jour où l'on pèse vraiment ses courgettes, la mesure prend le relais :
#  c'est le seul chiffre qui vaille pour un légume.
# ---------------------------------------------------------------------

# Cette table a change de sens avec la refonte, et c'est le meilleur resume
# de ce qui a change partout ailleurs.
#
# AVANT : les macros exportees etaient celles du produit CUIT, et cette table
# donnait l'entree SECHE pour en deduire le rendement. Deux etats circulaient
# en meme temps, et il fallait un champ de plus pour dire lequel etait le bon.
#
# MAINTENANT : les macros exportees sont TOUJOURS celles du produit qu'on
# pese, donc du grain SEC. Cette table donne l'entree CUITE, et elle ne sert
# plus qu'a une chose : deduire le rendement par conservation de l'energie.
# Le rendement n'entre dans aucune macro — s'il est faux, seule l'annonce du
# poids servi est fausse.
ETAT_CUIT = {
    "riz complet":      "Riz complet, cuit",
    "riz basmati":      "Riz blanc, cuit",
    "quinoa":           "Quinoa, cuit",
    "pates completes":  "Pâtes sèches, au blé complet, cuites, sans sel ajouté",
    # La cuite qui va avec la seche : la NATURE, pas la complete. Les apparier
    # de force donnerait 2,46 au lieu de 2,13 — deux produits differents.
    "semoule":          "Semoule ou graine de couscous, cuite, sans sel ajouté",
    "boulgour":         "Boulgour de blé, cuit",
}

# Garde-fou : cette table ne doit contenir QUE des grains secs. L'energie ne
# se conserve qu'a la vapeur ou dans l'eau absorbee ; a l'eau bouillante, un
# legume perd ses sucres dans la casserole et le calcul rend une portion cinq
# fois trop petite. Le script refuse de demarrer plutot que de le faire.
GRAINS_SECS = set(ETAT_CUIT)

# Aliments absents de Ciqual : valeurs relevées sur l'emballage.
# Renseigne ici ce que dit ta boîte, c'est toujours plus juste qu'une moyenne.
ETIQUETTES = {
    #  produit Grocy   : (categorie, kcal, prot, gluc, lip, ratio, source)
    "skyr": ("lait", 54, 9.4, 4.0, 0, 1, "étiquette Milbona"),
}

# Les LEGUMES visent l'entree CRUE de Ciqual, pas la cuite.
#
# On pese ce qu'on sort du frigo : 200 g de brocoli sur la balance, 150 g dans
# l'assiette apres la vapeur. Personne ne pese un legume APRES cuisson. Tant
# qu'ils portaient leurs valeurs cuites, la colonne « a cuire » de l'ecran ne
# pouvait etre juste qu'en connaissant leur rendement — et ce rendement n'est
# pas derivable : a l'eau bouillante les sucres partent dans la casserole.
#
# Cela ne perd aucune precision, au contraire. A la vapeur, seule l'EAU part :
# les proteines, glucides et fibres de 200 g de brocoli cru sont encore la
# dans les 150 g cuits. Les compter sur le poids cru est exact.
#
# Leur ratio reste a 1 tant qu'aucune pesee n'existe — « je ne sais pas ce
# qu'il perd ». Il n'AFFICHE que le poids attendu dans l'assiette et ne touche
# plus aucune macro. Une pesee suffit a le rendre exact.
CORRESPONDANCE = {
    # produit Grocy (mots-cles)   : (mots-cles Ciqual, categorie, ratio)

    # Ces cinq-la ne sont pas encore dans mon Grocy : ils sont prets pour le
    # jour ou ils y entrent. Les mots-cles sont un pari : si l'un ne trouve
    # rien, le script le dit et le produit reste intact. « --chercher »
    # donnera alors le bon libelle.
    "fromage blanc":        ("fromage blanc, nature",       "lait", 1),
    "asperge":              ("asperge, crue",               "leg",  1),
    "champignon":           ("champignon de paris, cru",    "leg",  1),
    "colin":                ("lieu noir, cru",              "prot", 0.85),
    "tofu":                 ("tofu nature",                 "prot", 1),

    "flocons d avoine":     ("flocons d'avoine",            "fec",  1),
    "fraise":               ("fraise, crue",                "fruit", 1),
    "oeufs entiers":        ("oeuf, cru",                   "prot", 1),
    "blancs d oeufs":       ("blanc d'oeuf, cru",           "prot", 1),
    # (« skyr » vivait ici, et n'a jamais pu servir : ETIQUETTES est consulte
    #  AVANT cette table et l'intercepte a tous les coups. Retire le
    #  18 septembre 2026, constat 04#19 — deux lignes qui decrivent le meme
    #  produit, dont une inatteignable, c'est la garantie de corriger un jour
    #  celle qui ne sert a rien et de chercher ailleurs pourquoi rien ne
    #  change. Les valeurs du skyr viennent de l'emballage Milbona, et Ciqual
    #  n'a de toute facon aucune entree « skyr ».)
    "banane":               ("banane, crue",                "fruit", 1),
    "amandes":              ("amande",                      "ole",  1),
    "patate douce":         ("patate douce, crue",          "fec",  1),
    "concombre":            ("concombre, cru",              "leg",  1),
    "haricots verts":       ("haricot vert, cru",           "leg",  1),
    "saumon":               ("saumon, cru",                 "prot", 0.85),
    "huile":                ("huile d'avocat",              "huile", 1),
    "blanc de poulet":      ("poulet, blanc, cru",          "prot", 0.75),
    "framboise":            ("framboise, crue",             "fruit", 1),
    "myrtille":             ("myrtille, crue",              "fruit", 1),
    "mure":                 ("mûre, crue",                  "fruit", 1),
    "pomme":                ("pomme, crue",                 "fruit", 1),
    "poire":                ("poire, crue",                 "fruit", 1),
    "ananas":               ("ananas, cru",                 "fruit", 1),
    "brocoli":              ("brocoli, cru",                "leg",  1),
    "courgette":            ("courgette, crue",             "leg",  1),
    "epinard":              ("épinard, cru",                "leg",  1),
    "carotte":              ("carotte, crue",               "leg",  1),
    "chou fleur":           ("chou-fleur, cru",             "leg",  1),
    "poireau":              ("poireau, cru",                "leg",  1),
    "ratatouille":          ("ratatouille",                 "leg",  1),
    "pommes de terre":      ("pomme de terre, sans peau, crue", "fec", 1),
    "truite":               ("truite, crue",                "prot", 0.85),
    "cabillaud":            ("cabillaud, cru",              "prot", 0.85),
    "haut de cuisse de poulet": ("poulet, cuisse, crue",    "prot", 0.75),
    "escalope de dinde":    ("dinde, escalope, crue",       "prot", 0.75),
    "escalope de veau":     ("veau, escalope, crue",        "prot", 0.75),
    "boeuf hache 5":        ("boeuf, viande hachée, 5%",    "prot", 0.78),
    "noix":                 ("noix, séchée",                "ole",  1),
    "noisette":             ("noisette",                    "ole",  1),
    "beurre de cacahuete":  ("beurre de cacahuète",         "ole",  1),
    # Les grains visent desormais leur entree SECHE : c'est ce qu'on pose sur
    # la balance, et donc ce que les macros doivent decrire. Leur entree cuite
    # est dans ETAT_CUIT, et ne sert qu'a deduire le rendement.
    "riz complet":          ("riz complet, cru",            "fec",  3),
    "riz basmati":          ("riz blanc, cru",              "fec",  3),
    "quinoa":               ("quinoa, cru",                 "fec",  2.75),
    "pates completes":      ("pâtes sèches, au blé complet, crues", "fec", 2.2),
    "semoule":              ("semoule de blé dur, crue",     "fec",  2.13),
    "boulgour":             ("boulgour de blé, cru",        "fec",  2.5),
    "thon au naturel":      ("thon, au naturel",            "prot", 1),
    "petits pois":          ("petit pois, cru",             "leg",  1),
    "jus de citron":        ("jus de citron",               "autre", 1),
    "lait":                 ("lait demi-écrémé",            "lait", 1),
    "camembert":            ("camembert",                   "lait", 1),
    "emmental":             ("emmental",                    "lait", 1),
    "pain de mie complet":  ("pain de mie complet",         "fec",  1),
}

# Ces produits n'ont pas leur place dans un calculateur de diete.
# Produits que Ciqual ne couvre pas honnetement : il n'existe pas de sardine
# « au naturel » dans la table — seulement du cru, du grille et cinq versions
# a l'huile, de 194 a 224 kcal. Plutot que d'en choisir une au hasard, on
# laisse l'aliment a son proprietaire : il a l'etiquette sous les yeux.
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


def ecart_relatif(valeur, reference):
    """
    De combien `valeur` s'ecarte de `reference`, en proportion. None si la
    reference ne vaut rien : on ne compare pas a zero.

    Cette expression etait ecrite deux fois en clair, `abs(calcule - ratio) /
    ratio`, et `ratio` sort de CORRESPONDANCE, une table tenue a la main. Une
    frappe a 0 dans cette table faisait sauter TOUT l'import sur une
    ZeroDivisionError, pas seulement le produit fautif. Releve le
    18 septembre 2026 (constat 04#19).
    """
    if not reference:
        return None

    return abs(valeur - reference) / reference


def ecart_a_signaler(valeur, reference, tolerance: float) -> bool:
    """
    `valeur` s'ecarte-t-elle de `reference` au point qu'il faille le dire.

    Une reference a zero n'est pas une reference : on ne sait pas de combien
    on s'en ecarte, donc on le SIGNALE. Se taire reviendrait a laisser passer
    pour « conforme » un rendement dont on ignore tout — regle 7, un chiffre
    faux est pire qu'un refus de repondre.
    """
    ecart = ecart_relatif(valeur, reference)

    return ecart is None or ecart > tolerance


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


def aliment_detiquette(entree) -> dict:
    """
    Une ligne d'ETIQUETTES, presentee comme un aliment Ciqual.

    LES FIBRES SONT A None, ET CE N'EST PAS UN OUBLI. Ce chemin ecrivait
    `"fibres": 0` en dur, c'est-a-dire l'affirmation « ce produit n'a aucune
    fibre » — alors qu'une etiquette qui n'en parle pas ne dit rien du tout.
    Regle 6 : vide n'est pas zero. L'ecriture plus bas traduit ce None en
    chaine vide, exactement comme pour une valeur absente de Ciqual.
    Releve le 18 septembre 2026 (constat 04#19).
    """
    _categorie, kcal, prot, gluc, lip, _ratio, source = entree

    return {"nom": f"({source})", "kcal": kcal, "prot": prot,
            "gluc": gluc, "lip": lip, "fibres": None}


def argument_de(argv, option: str) -> str:
    """
    Le mot qui suit `option` sur la ligne de commande.

    Deux facons de se tromper, toutes deux silencieuses avant le
    18 septembre 2026 (constat 04#19) : l'option en dernier mot levait un
    IndexError nu, et une option qui en suivait une autre —
    « --chercher --appliquer » — passait pour un terme de recherche. Le script
    repondait alors « aucun libelle » a une question qu'il n'avait pas
    comprise. Un refus explicite vaut mieux qu'une reponse a cote.
    """
    suivant = argv.index(option) + 1
    if suivant >= len(argv) or argv[suivant].startswith("--"):
        sys.exit(f"« {option} » attend un mot juste apres lui.\n"
                 f"  Exemple :  python3 ciqual_vers_grocy.py Table.xlsx "
                 f"{option} « amande »")

    return argv[suivant]


# ------------------------------------------------------------ lecture Ciqual

def entetes_de(lignes, chemin: str) -> list:
    """
    La premiere ligne du classeur, normalisee, qui nomme les colonnes.

    Le `next(lignes)` etait nu : un classeur vide — un telechargement de zero
    octet, une feuille effacee — remontait un StopIteration et sa trace
    Python, seul accident de lecture du script a ne pas etre messagee.
    Releve le 18 septembre 2026 (constat 04#19).
    """
    premiere = next(lignes, None)
    if premiere is None:
        sys.exit(f"Le classeur {chemin} ne contient aucune ligne.\n"
                 "Attendu : la table Ciqual au format EXCEL, dont la premiere\n"
                 "ligne nomme les colonnes. Retelecharge-la depuis\n"
                 "  https://ciqual.anses.fr/#/cms/download/node/20")

    return [normaliser(c) for c in premiere]


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

    entetes = entetes_de(lignes, chemin)

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


def chercher(aliments, motifs: str):
    """
    Le meilleur libellé Ciqual pour ces mots-clés.

    Trois filtres successifs, du plus sûr au plus permissif :
      1. le libellé COMMENCE par les mots demandés — « Amande » avant
         « Dragée amande » ;
      2. il ne contient aucun mot piège ;
      3. à égalité, le plus court l'emporte.

    Un aliment sans énergie est écarté : Ciqual laisse des trous, et une
    valeur à zéro fausserait tout un repas.

    (Un drapeau `tolerer_pieges` trainait ici, jamais passe a True par aucun
     appelant. Retire le 18 septembre 2026, constat 04#19 : son seul effet
     aurait ete de PREFERER « Dragée amande » a « Amande », soit l'inverse de
     ce que la fonction promet. Le repli quand aucun candidat ne survit au
     filtre existe deja plus bas, et ne demande aucun drapeau.)
    """
    mots = normaliser(motifs).split()
    if not mots:
        return None

    candidats = [a for a in aliments if all(m in a["cle"] for m in mots)]
    candidats = [a for a in candidats if a["kcal"] and a["kcal"] > 0]

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


# ECART_PESEE_MAX et macros_depuis_le_sec vivaient ici.
#
# Leur histoire vaut d'etre gardee, parce qu'elle explique pourquoi ce fichier
# a maigri. Le seuil a d'abord servi a JETER une pesee : 84 g de riz sec pour
# 393 g cuits donnaient 4,68 la ou Ciqual disait 2,26, et le script gardait
# 2,26 en silence — juste sous un commentaire affirmant que « TA balance passe
# avant Ciqual ». La regle contredisait sa propre phrase.
#
# Il a ensuite servi a RECALCULER les macros cuites depuis l'etat sec, pour
# que le rendement mesure et les macros decrivent enfin le meme riz. C'etait
# juste, mais c'etait un rattrapage : il ne fallait reconcilier ces deux
# nombres que parce que les macros decrivaient le produit CUIT, donc dependaient
# du rendement.
#
# Les macros decrivent desormais le grain SEC. Le grain sec est le meme quelle
# que soit la casserole : une pesee ne peut plus contredire une table, elle ne
# fixe que le rendement. Il n'y a plus rien a reconcilier, donc plus de seuil,
# plus de recalcul, et plus de message a lire pour comprendre lequel des deux
# chiffres l'application a choisi.


# Bande dans laquelle tombe toute cereale ou legumineuse SECHE : c'est de la
# matiere seche, et la matiere seche fait 300 a 400 kcal aux 100 g. Toujours.
# Meme borne que `front/src/calcul/plausibilite.ts` — si tu la changes ici,
# change-la la-bas.
#
# CE COUPLE ETAIT DEFINI DEUX FOIS dans ce fichier, ici et juste avant
# `convertir_en_pese`, avec les memes valeurs et deux commentaires differents.
# La seconde definition est retiree le 17 septembre 2026 : c'est le motif qui
# venait de couter les macros du riz dans `test_ciqual.py` la veille — un
# fichier qui definit deux fois la meme constante finit par n'en corriger
# qu'une.
SEC_MINI, SEC_MAXI = 300, 400


def grain_sec_credible(aliment) -> bool:
    """
    L'entree Ciqual retenue pour un grain decrit-elle vraiment le produit SEC ?

    Ce controle a ete ajoute apres un vrai degat. EXACTS pointait
    « semoule complete » sur « Semoule ou graine de couscous complète, CUITE »
    a 142 kcal — une ligne ecrite a la main du temps ou les feculents
    portaient leurs valeurs cuites, et restee juste jusqu'a la refonte. Le
    script a donc ecrit 142 kcal comme si c'etait du sec, puis en a deduit un
    rendement de 0,41 : un feculent qui RETRECIT en cuisant. Deux valeurs
    fausses, ecrites sans un mot.

    La lecon vaut au-dela de cette ligne : un mauvais appariement ne se
    detecte pas sur les mots, puisque c'est justement quelqu'un qui a choisi
    ces mots. Il se detecte par la physique. 142 kcal ne peut pas etre de la
    matiere seche, quel que soit le libelle en face. On refuse alors
    l'aliment plutot que d'ecrire n'importe quoi.
    """
    return bool(aliment) and bool(aliment.get("kcal")) \
        and SEC_MINI <= aliment["kcal"] <= SEC_MAXI


def sens_du_rendement(categorie: str, ratio: float):
    """
    Le rendement va-t-il dans le bon sens ?

    Ce n'est pas une plage de tolerance, c'est un SENS : un feculent absorbe
    de l'eau, une viande en perd. A contresens, les deux colonnes de l'ecran
    s'inversent. Les bornes restent larges — 4,68 sur un riz tres hydrate et
    0,53 sur une truite tres cuite sont des mesures, pas des fautes.

    CETTE FONCTION DISAIT « MEME REGLE QUE L'API », ET C'ETAIT FAUX sur un
    point : le cas `leg` manquait. Un legume a 1,5 passait ici, quand l'ecran
    (`plausibilite.ts`), l'API (`RendementPlausible::sens`) et la contrainte
    `aliment_ratio_sens` le refusent tous les trois. Releve par la revue le
    16 septembre 2026, ajoute le meme jour.

    La bande finale 0,3-6, elle, n'existe QUE dans ce script : c'est un
    garde-fou d'ecriture, plus strict que l'API a dessein. Ne pas la decrire
    comme la regle commune.
    """
    if ratio <= 0:
        return "rendement nul ou negatif"
    if categorie in ("prot", "leg") and ratio > 1.05:
        quoi = "une viande" if categorie == "prot" else "un legume"
        return f"rendement {ratio:.2f} : {quoi} ne gagne pas de poids en cuisant"
    if categorie == "fec" and ratio < 1:
        return f"rendement {ratio:.2f} : un feculent ne perd pas de poids en cuisant"
    if not 0.3 <= ratio <= 6:
        return f"rendement {ratio:.2f} : hors de tout ordre de grandeur"

    return None


def rendement_par_energie(kcal_sec, kcal_cuit):
    """
    Le rendement d'un grain sec, deduit de la conservation de l'energie.

    100 g de riz sec a 350 kcal qui deviennent un produit a 155 kcal portent
    toujours les memes 350 kcal : ils pesent donc 2,26 fois plus. L'eau
    absorbee ne pese rien en calories. C'est vrai d'un grain, et FAUX d'un
    legume bouilli, dont les sucres partent dans la casserole — d'ou le
    garde-fou sur ETAT_CUIT, qui ne doit contenir que des grains secs.

    Sortie de `main` le 17 septembre 2026 : regle 5, aucune formule metier
    recopiee — et surtout, enfouie dans une fonction qui parle a Grocy, elle
    n'etait testable nulle part. `test_ciqual.py` l'eprouve maintenant directement.

    Rend None quand l'un des deux etats manque : sans couple, pas de
    rendement, et surtout pas un 1 par defaut (regle 6, vide n'est pas zero).
    """
    if not kcal_sec or not kcal_cuit:
        return None

    return round(kcal_sec / kcal_cuit, 2)


def rendement_derive_credible(categorie: str, ratio) -> bool:
    """
    Le rendement deduit de l'energie est-il utilisable ?

    Deux conditions, et la seconde n'est pas une tolerance : la bande 0,4-5
    ecarte un appariement absurde, `sens_du_rendement` ecarte un contresens.
    Un feculent qui RETRECIT vient d'une entree cuite mal choisie, jamais
    d'une cuisson exotique — c'est exactement ce qu'avait produit la semoule
    a 142 kcal. A defaut, on garde le rendement de table plutot que d'ecrire
    un chiffre deduit d'un mauvais couple.
    """
    return (ratio is not None and 0.4 <= ratio <= 5
            and sens_du_rendement(categorie, ratio) is None)


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


# ---------------------------------------------------------------------
#  Les mots qui changent tout.
#
#  Ciqual distingue « Sardine, au naturel » et « Sardine, a l'huile » : 182
#  kcal et 9,3 g de lipides d'un cote, 217 et 13,7 de l'autre. Une boite de
#  100 g mal appariee, c'est 4,4 g de lipides comptes en trop — plus de trois
#  fois la tolerance d'un repas ENTIER. Et rien ne le signalait : les deux
#  libelles contiennent « sardine », la recherche par mots-cles tombait sur le
#  premier venu.
#
#  Ces mots-la ne sont donc pas des details de libelle. Quand l'un figure d'un
#  cote et pas de l'autre, l'appariement est probablement faux, et on le dit.
#
#  « cru » et « cuit » n'y sont PAS : ils different legitimement — « Blanc de
#  poulet » vise « Poulet, filet sans peau cru ». « sel » et « sucre » non
#  plus : « sans sel ajoute » traine dans la moitie des libelles Ciqual.
MOTS_DECISIFS = ("naturel", "huile", "complet", "ecreme", "allege", "fume")


# ---------------------------------------------------------------------
#  CE QUE TU AS SAISI A LA MAIN NE S'ECRASE PAS.
#
#  Aucune table ne couvre tout. Ciqual n'a pas de sardine « au naturel » —
#  que du cru, du grille et cinq versions a l'huile, de 194 a 224 kcal. Pour
#  ces produits-la, l'etiquette de la boite bat n'importe quelle moyenne, et
#  c'est a son proprietaire de la saisir.
#
#  Encore faut-il que sa saisie survive. Tant que l'import ecrasait toutes
#  les valeurs a chaque passage, prendre le temps de recopier une etiquette
#  ne servait a rien : le lendemain, Ciqual reprenait la main.
#
#  Le produit porte donc un champ « source_valeurs ». L'application l'ecrit a
#  « moi » des qu'on modifie les macros a la main ; ce script ne touche alors
#  plus a cet aliment. Meme regle que pour les pesees : ce qui vient de
#  l'utilisateur passe devant.
SAISIE_MANUELLE = "moi"

# Les champs personnalises Grocy dont CE script a besoin, qu'il cree lui-meme.
#
# Un seul outil ecrit dans Grocy, et c'est celui-ci. Il a existe un
# grocy_macros.py qui savait aussi creer ces champs, mais son --appliquer
# reecrivait AU PASSAGE les macros de tous les produits depuis sa propre table
# — en valeurs CUITES, l'inverse de la convention du projet. Il a ete supprime
# en septembre 2026 : demander a quelqu'un de lancer l'un pour reparer l'autre
# etait un piege.
CHAMPS_REQUIS = [
    ("cat", "Catégorie", "text-single-line"),
    ("kcal100", "kcal / 100 g", "number-decimal"),
    ("prot100", "Protéines / 100 g", "number-decimal"),
    ("gluc100", "Glucides / 100 g", "number-decimal"),
    ("lip100", "Lipides / 100 g", "number-decimal"),
    ("fibres100", "Fibres / 100 g", "number-decimal"),
    ("ratio", "Ratio cuit / cru", "number-decimal"),
    ("pesee_avant", "Poids avant cuisson (g)", "number-decimal"),
    ("pesee_apres", "Poids apres cuisson (g)", "number-decimal"),
    ("source_valeurs", "Source des valeurs", "text-single-line"),
]


def creer_champs_manquants(appliquer: bool) -> list[str]:
    """Cree les champs personnalises absents. Rend ceux qui manquaient."""
    existants = {c["name"] for c in api("GET", "/objects/userfields")
                 if c.get("entity") == "products"}
    manquants = [c for c in CHAMPS_REQUIS if c[0] not in existants]

    for nom, libelle, type_ in manquants:
        if appliquer:
            api("POST", "/objects/userfields", {
                "entity": "products", "name": nom, "caption": libelle,
                "type": type_, "show_as_column_in_tables": 0})

    return [c[1] for c in manquants]


def valeurs_saisies_a_la_main(produit) -> bool:
    """L'utilisateur a-t-il renseigne les macros de ce produit lui-meme ?"""
    champs = produit.get("userfields") or {}

    return str(champs.get("source_valeurs") or "").strip() == SAISIE_MANUELLE


def desaccords(nom_produit: str, nom_ciqual: str) -> list[str]:
    """Les mots decisifs presents d'un cote et absents de l'autre."""
    produit, ciqual = normaliser(nom_produit), normaliser(nom_ciqual)

    return [
        mot for mot in MOTS_DECISIFS
        if (mot in produit) != (mot in ciqual)
    ]


def coherent(a) -> tuple[bool, float]:
    """Vérifie l'énergie : 4·P + 4·G + 2·fibres + 9·L, convention européenne."""
    if a["kcal"] is None or a["kcal"] <= 0:
        return False, 0.0
    calcul = (4 * (a["prot"] or 0) + 4 * (a["gluc"] or 0)
              + 2 * (a["fibres"] or 0) + 9 * (a["lip"] or 0))

    return abs(calcul - a["kcal"]) / a["kcal"] <= 0.12, calcul


# -------------------------------------------------------------------- main

# (SEC_MINI et SEC_MAXI etaient redefinis ici, aux memes valeurs qu'en haut du
#  fichier. Retires le 17 septembre 2026 : la definition unique vit au-dessus
#  de `grain_sec_credible`.)


def valeurs_au_sec(champs, ratio) -> dict:
    """
    Les macros d'un produit CUIT, ramenees au produit tel qu'on le pese.

    LA CONVERSION EST UNE MULTIPLICATION PAR LE RENDEMENT, et rien d'autre :
    la cuisson n'ajoute que de l'eau, elle dilue tout dans les memes
    proportions. 99 kcal et 22 g de glucides pour 100 g de riz cuit, avec un
    rendement de 3,53, redonnent 350 kcal et 78 g pour 100 g de riz sec.

    UN CHAMP VIDE RESTE ABSENT (regle 6) : « je ne sais pas » ne devient pas
    zero en passant par ici, sans quoi la conversion INVENTERAIT une fibre a
    0 g sur un produit dont on ignore les fibres.

    UN CHAMP ILLISIBLE, LUI, FAIT REFUSER LE PRODUIT ENTIER. Les champs de
    Grocy sont de la saisie libre : « n/a », « ? », « voir paquet » y entrent
    sans broncher. `nombre("n/a")` rend None, et `None * ratio` levait un
    TypeError que personne ne rattrapait — en plein `--appliquer`, donc APRES
    que les produits precedents etaient deja convertis dans Grocy. Une panne a
    mi-parcours laisse la base dans un etat que personne ne connait ; on
    refuse donc avant d'ecrire quoi que ce soit, et `convertir_en_pese` liste
    le produit au lieu de s'arreter. Releve le 18 septembre 2026
    (constat 04#19).

    Le refus porte sur le PRODUIT et pas sur le seul champ : convertir les
    kcal en laissant les glucides tels quels ecrirait un produit dont les
    valeurs ne decrivent plus le meme etat.

    Sortie de `convertir_en_pese` le 17 septembre 2026. Enfouie dans une
    fonction qui interroge Grocy en HTTP, la seule formule qui relie l'etat
    cuit a l'etat sec n'etait eprouvable nulle part.
    """
    converties = {}
    for champ in ("kcal100", "prot100", "gluc100", "lip100", "fibres100"):
        valeur = champs.get(champ)
        if valeur is None or str(valeur).strip() == "":
            continue          # « inconnu » ne devient pas zero
        brute = nombre(valeur)
        if brute is None:
            raise ValueError(
                f"le champ {champ} porte « {valeur} », qui n'est pas un nombre")
        converties[champ] = round(brute * ratio, 2)

    return converties


def convertir_en_pese(appliquer: bool) -> int:
    """
    Repasse au SEC les produits Grocy qui portent encore des valeurs CUITES.

    A lancer UNE fois, apres la refonte. Le passage normal du script suffit
    pour tout ce qu'il apparie lui-meme : il reecrit les valeurs depuis
    Ciqual, deja en etat sec. Restent les produits marques « moi » — ceux dont
    tu as saisi les macros a la main — que le script s'interdit de toucher.
    C'est justement le cas de ton riz basmati.

    LA CONVERSION EST UNE MULTIPLICATION PAR LE RENDEMENT, et rien d'autre :
    la cuisson n'ajoute que de l'eau, elle dilue tout dans les memes
    proportions. 99 kcal et 22 g de glucides pour 100 g de riz cuit, avec un
    rendement de 3,53, redonnent 350 kcal et 78 g pour 100 g de riz sec.

    ON NE CONVERTIT QUE CE QU'ON PEUT PROUVER. Si le resultat ne tombe pas
    dans la bande du grain sec, c'est que ces valeurs etaient deja fausses
    avant : les multiplier donnerait une autre valeur fausse, avec en prime
    l'air d'avoir ete verifiee. On les laisse et on les liste.
    """
    produits = api("GET", "/objects/products")
    convertis, laisses, illisibles = [], [], []

    for produit in produits:
        champs = produit.get("userfields") or {}
        if str(champs.get("cat") or "").strip() != "fec":
            continue

        kcal = nombre(champs.get("kcal100"))
        ratio = nombre(champs.get("ratio"))
        if not kcal or not ratio or ratio <= 1.3:
            continue          # un aliment qui ne gonfle pas n'a rien a convertir
        if kcal >= SEC_MINI:
            continue          # deja au sec : rien a faire, et c'est idempotent

        vise = kcal * ratio
        if not SEC_MINI <= vise <= SEC_MAXI:
            laisses.append((produit["name"], kcal, ratio, vise))
            continue

        # Ce try est tout l'interet du refus : un champ illisible coute UN
        # produit, nomme et liste, au lieu d'interrompre la boucle d'ecriture
        # au vingtieme produit sur cinquante.
        try:
            nouveaux = valeurs_au_sec(champs, ratio)
        except ValueError as illisible:
            illisibles.append((produit["name"], str(illisible)))
            continue

        convertis.append((produit["name"], kcal, nouveaux.get("kcal100"), ratio))
        if appliquer:
            api("PUT", f"/userfields/products/{produit['id']}", nouveaux)

    if convertis:
        etat = "converti(s)" if appliquer else "a convertir (--appliquer le fera)"
        print(f"{len(convertis)} produit(s) {etat} :")
        for nom, avant, apres, ratio in convertis:
            print(f"  {nom[:30]:32} {avant:6.1f} -> {apres:6.1f} kcal/100 g "
                  f"(x {ratio:g})")
        print("  Les valeurs decrivent desormais le produit tel que tu le peses.")
    else:
        print("Aucun produit ne porte encore des valeurs cuites. Rien a faire.")

    if laisses:
        print(f"\n{len(laisses)} produit(s) LAISSE(S) tels quels :")
        for nom, kcal, ratio, vise in laisses:
            print(f"  ! {nom[:30]:32} {kcal:6.1f} kcal, rendement {ratio:g} "
                  f"-> {vise:.0f}")
        print(f"  Aucun rendement ne les ramene entre {SEC_MINI} et {SEC_MAXI} kcal :")
        print("  leurs valeurs etaient deja fausses avant. Recopie la ligne du")
        print("  paquet dans « mon frigo », c'est la seule source fiable.")

    if illisibles:
        print(f"\n{len(illisibles)} produit(s) REFUSE(S), valeur illisible :")
        for nom, raison in illisibles:
            print(f"  ! {nom[:30]:32} {raison}")
        print("  Rien n'a ete converti pour eux, pas meme les champs lisibles :")
        print("  un produit a demi converti melangerait deux etats. Corrige la")
        print("  valeur dans Grocy et relance.")

    if not appliquer and convertis:
        print("\nRien n'a ete ecrit. Relance avec --appliquer.")

    return 0


def incoherences_des_tables(grains_secs, correspondance) -> list:
    """
    Ce qui, dans les tables ecrites a la main, interdit de demarrer.

    LE GARDE-FOU QUE GRAINS_SECS ANNONCAIT SANS L'ETRE. Son commentaire disait
    « le script refuse de demarrer plutot que de le faire », et la constante
    n'etait lue nulle part : le seul controle existant etait PAR PRODUIT, donc
    muet tant qu'aucun produit Grocy ne tombait dessus. Une table fautive
    pouvait dormir des mois. Ecrit le 18 septembre 2026 (constat 04#19).

    Deux fautes, toutes deux invisibles a la relecture :

      - un aliment dans ETAT_CUIT qui n'est pas un grain sec. On lui derive
        alors un rendement par l'energie, ce qui ne vaut que pour un grain :
        la version d'avant y avait mis les legumes et sortait epinard 1 ->
        1,70, soit 119 g a peser pour en servir 200 quand il en faut 500 a
        700 ;
      - un rendement absent, nul ou negatif dans CORRESPONDANCE. Il ne fait
        plus sauter l'import — `ecart_relatif` s'en garde — mais il serait
        ECRIT dans Grocy, ou « 0 » signifie que 100 g de sec donnent 0 g de
        cuit. Regle 7 : on refuse plutot que d'ecrire un chiffre faux.
    """
    fautes = []

    for grain in sorted(grains_secs):
        entree = correspondance.get(grain)
        if entree is None:
            fautes.append(f"« {grain} » derive son rendement de l'energie mais "
                          "n'a aucune correspondance Ciqual")
        elif entree[1] != "fec":
            fautes.append(f"« {grain} » derive son rendement de l'energie alors "
                          f"qu'il est de categorie « {entree[1]} » : cette "
                          "derivation ne vaut que pour un grain sec")

    for produit, (_motifs, _categorie, rendement) in sorted(correspondance.items()):
        if not isinstance(rendement, (int, float)) or isinstance(rendement, bool) \
                or rendement <= 0:
            fautes.append(f"« {produit} » porte un rendement « {rendement} » : "
                          "il faut un nombre strictement positif")

    return fautes


def main() -> int:
    # Les tables du haut de ce fichier s'ecrivent a la main. On les relit avant
    # de toucher a quoi que ce soit : une faute dedans se paie en valeurs
    # ecrites dans Grocy, pas en trace Python.
    fautes = incoherences_des_tables(GRAINS_SECS, CORRESPONDANCE)
    if fautes:
        sys.exit("Les tables de correspondance se contredisent :\n"
                 + "\n".join(f"  - {faute}" for faute in fautes))

    # --convertir-en-pese : le passage unique d'apres la refonte. Ne lit pas
    # Ciqual : il ne fait que multiplier les valeurs de Grocy par leur propre
    # rendement.
    if "--convertir-en-pese" in sys.argv:
        return convertir_en_pese(APPLIQUER)

    aliments = lire_ciqual(CIQUAL)

    # --chercher « amande » : liste les libellés Ciqual disponibles
    if "--chercher" in sys.argv:
        terme = argument_de(sys.argv, "--chercher")
        print(f"Libellés contenant « {terme} » :\n")
        for a in candidats_pour(aliments, terme, 20):
            print(f"  {a['nom'][:58]:60} {a['kcal'] or 0:6.1f} kcal · "
                  f"{a['prot'] or 0:5.1f} P · {a['gluc'] or 0:5.1f} G · {a['lip'] or 0:5.1f} L")
        print("\nRecopie le bon libellé dans EXACTS, en tête du script.")

        return 0
    # Sans le champ, Grocy refuse l'ecriture entiere avec un 400 laconique :
    # « Field source_valeurs is not a valid userfield of the given entity ».
    manquants = creer_champs_manquants(APPLIQUER)
    if manquants:
        etat = "créé(s)" if APPLIQUER else "à créer (--appliquer les posera)"
        print(f"{len(manquants)} champ(s) personnalisé(s) {etat} : "
              f"{', '.join(manquants)}\n")

    produits = api("GET", "/objects/products")

    trouves, sans_correspondance, introuvables, suspects = [], [], [], []
    ratios_corriges, depuis_etiquette, ratios_mesures = [], [], []
    pesees_ecartees, appariements_douteux, ratios_refuses = [], [], []
    valeurs_a_toi = []

    for produit in produits:
        cle = normaliser(produit["name"])

        if any(mot in cle.split() for mot in EXCLUSIONS):
            sans_correspondance.append((produit["name"], "hors diète"))
            continue

        # Ce que l'utilisateur a saisi lui-meme ne se touche pas.
        if valeurs_saisies_a_la_main(produit):
            valeurs_a_toi.append(produit["name"])
            continue

        # une valeur relevée sur l'emballage prime sur tout
        etiquette = next((m for m in ETIQUETTES if all(x in cle for x in m.split())), None)
        if etiquette is not None:
            categorie, _kcal, _prot, _gluc, _lip, ratio, source = ETIQUETTES[etiquette]
            depuis_etiquette.append((produit["name"], source))
            trouves.append((produit, aliment_detiquette(ETIQUETTES[etiquette]),
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

        # ratio dérivé de Ciqual quand les deux états sont connus — et
        # seulement pour un GRAIN SEC, seul cas où l'énergie se conserve.
        # (Le controle « ETAT_CUIT ne contient que des feculents » vivait ici,
        #  produit par produit. Il est remonte au demarrage le 18 septembre
        #  2026, dans `incoherences_des_tables` : ici, il ne se declenchait que
        #  si un produit Grocy tombait justement sur la ligne fautive, et
        #  restait muet le reste du temps. Un garde-fou qui depend des donnees
        #  qu'on lui soumet n'en est pas un.)

        if motif_produit in ETAT_CUIT:
            # Une entree cuite prise pour de la matiere seche ecrit deux valeurs
            # fausses d'un coup, les macros ET le rendement qui s'en deduit.
            if not grain_sec_credible(aliment):
                introuvables.append(
                    (produit["name"],
                     f"{motifs_ciqual} — « {aliment['nom']} » a "
                     f"{aliment['kcal'] or 0:.0f} kcal, ce n'est pas du grain "
                     f"sec (on attend {SEC_MINI} a {SEC_MAXI})"))
                continue

            cuit = chercher(aliments, ETAT_CUIT[motif_produit])
            if cuit and cuit["kcal"]:
                calcule = rendement_par_energie(aliment["kcal"], cuit["kcal"])
                # Le SENS ne se discute pas : un feculent ne retrecit pas. Une
                # derivation a contresens vient d'un mauvais appariement de
                # l'entree cuite, pas d'une cuisson exotique.
                if rendement_derive_credible(categorie, calcule):
                    if ecart_a_signaler(calcule, ratio, 0.1):
                        ratios_corriges.append(
                            (produit["name"], ratio, calcule, cuit["nom"]))
                    ratio = calcule
                elif sens_du_rendement(categorie, calcule) is not None:
                    ratios_refuses.append(
                        (produit["name"], calcule, ratio, cuit["nom"]))

        # TA balance passe avant Ciqual, et ce bloc a beaucoup maigri.
        #
        # Il fallait auparavant reconcilier une pesee avec des macros, parce
        # que les macros decrivaient le produit CUIT : ton riz rend 4,68 fois
        # son poids, celui de la table 2,26, et garder le rendement de l'un
        # avec les macros de l'autre decrivait un troisieme riz qui n'existe
        # pas. Le script recalculait donc les macros depuis l'etat sec — un
        # rattrapage qui n'aurait jamais du etre necessaire.
        #
        # Les macros decrivent desormais le grain SEC, et le grain sec est le
        # meme quelle que soit la casserole. Une pesee ne peut plus les
        # contredire : elle fixe le rendement, un point c'est tout. Le seul
        # refus qui reste est le contresens — deux chiffres intervertis.
        pesees = pesees_de(produit)
        if pesees is not None:
            mesure = round(pesees[1] / pesees[0], 2)
            contresens = sens_du_rendement(categorie, mesure)

            if contresens is not None:
                pesees_ecartees.append(
                    (produit["name"], mesure, ratio, pesees, contresens))
            else:
                if ecart_a_signaler(mesure, ratio, 0.02):
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

        # « au naturel » contre « a l'huile » : meme poisson, 4 g de lipides
        # d'ecart pour 100 g. La recherche par mots-cles ne peut pas le voir.
        # Un libelle EXACT est un choix delibere : quelqu'un a cherche, lu la
        # liste et recopie le bon. Le controle des mots decisifs n'est la que
        # pour les accidents de la recherche par mots-cles ; l'appliquer a une
        # correspondance exacte reviendrait a se mefier de sa propre decision.
        ecarts_de_mots = ([] if motif_produit in EXACTS
                          else desaccords(produit["name"], aliment["nom"]))
        if ecarts_de_mots:
            appariements_douteux.append(
                (produit["name"], aliment["nom"], ecarts_de_mots))

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

    if valeurs_a_toi:
        print(f"\n{len(valeurs_a_toi)} produit(s) laisse(s) intact(s) — tu les as saisis :")
        for nom in valeurs_a_toi:
            print(f"  - {nom}")
        print("  Aucune table ne bat une etiquette lue sur la boite.")

    if appariements_douteux:
        print(f"\n{len(appariements_douteux)} appariement(s) a verifier :")
        for nom, libelle, mots in appariements_douteux:
            print(f"  {nom[:30]:32} -> « {libelle[:44]} »")
            print(f"  {'':32}    « {', '.join(mots)} » n'est que d'un cote")
        print("  Ces mots-la changent les valeurs, pas seulement le libelle.")
        print("  Utilise --chercher pour trouver le bon, puis ajoute-le a EXACTS.")

    if ratios_refuses:
        print(f"\n{len(ratios_refuses)} rendement(s) DERIVE(S) REFUSE(S) :")
        for nom, calcule, garde, libelle in ratios_refuses:
            print(f"  ! {nom[:26]:28} l'energie donnerait {calcule}, a contresens.")
            print(f"  {'':28} « {libelle[:44]} » n'est pas l'etat cuit de ce grain.")
        print(f"  Le rendement de la table est conserve. Corrige ETAT_CUIT,")
        print("  --chercher te donnera le bon libelle.")

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
            # D'ou viennent ces valeurs. L'application ecrira « moi » si tu les
            # corriges a la main, et ce script ne reviendra plus dessus.
            "source_valeurs": "ciqual",
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
