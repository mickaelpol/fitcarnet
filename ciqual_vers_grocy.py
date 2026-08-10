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

AUTRE_ETAT = {
    "riz complet":      "Riz complet, cru",
    "riz basmati":      "Riz blanc, cru",
    "quinoa":           "Quinoa, cru",
    "pates completes":  "Pâtes sèches, semi-complètes, crues",
    "semoule complete": "Semoule de blé dur, crue",
    "boulgour":         "Boulgour de blé, cru",
}

# Garde-fou : cette table ne doit contenir QUE des grains secs. Le jour ou
# quelqu'un y remet un legume, le script refuse de demarrer plutot que de
# recalculer une portion cinq fois trop petite.
GRAINS_SECS = set(AUTRE_ETAT)

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

    # Ces cinq-la ne sont pas dans MON Grocy : ils viennent du catalogue
    # COMMUN, celui dont part tout nouveau compte. Ils y restaient sans
    # fibres — donc faux des qu'une cible est exprimee en glucides totaux —
    # simplement parce que cette table ne decrivait que mes produits a moi.
    # Les mots-cles sont un pari : si l'un ne trouve rien, l'export le dit et
    # l'aliment reste intact. « --chercher » donnera alors le bon libelle.
    "fromage blanc":        ("fromage blanc, nature",       "lait", 1),
    "asperge":              ("asperge, crue",               "leg",  1),
    "champignon":           ("champignon de paris, cru",    "leg",  1),
    "colin":                ("lieu noir, cru",              "prot", 0.85),
    "tofu":                 ("tofu nature",                 "prot", 1),

    "flocons d avoine":     ("flocons d'avoine",            "fec",  1),
    "fraise":               ("fraise, crue",                "fruit", 1),
    "oeufs entiers":        ("oeuf, cru",                   "prot", 1),
    "blancs d oeufs":       ("blanc d'oeuf, cru",           "prot", 1),
    "skyr":                 ("skyr",                        "lait", 1),
    "banane":               ("banane, crue",                "fruit", 1),
    "amandes":              ("amande",                      "ole",  1),
    "patate douce":         ("patate douce, cuite",         "fec",  1),
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


# A partir de cet ecart avec la table, une pesee ne decrit plus le meme
# produit qu'elle : on ne peut plus melanger le rendement de l'un avec les
# macros de l'autre.
#
# CE SEUIL NE SERT PLUS A JETER UNE PESEE. Il a longtemps fait exactement ca :
# 84 g de riz sec pour 393 g cuits donnaient 4,68 la ou Ciqual disait 2,26, et
# le script gardait 2,26 en silence — juste sous un commentaire affirmant que
# « TA balance passe avant Ciqual ». La regle contredisait sa propre phrase.
#
# Ce qu'on a compris depuis : une pesee et une table ne se contredisent pas,
# elles decrivent deux produits differents. 84 g de riz sec portent 73 g de
# matiere seche ; qu'ils rendent 393 g veut dire que CE riz-la contient 81 %
# d'eau, contre 70 % pour le riz moyen de la table. Les deux existent.
#
# Le seuil declenche donc desormais le RECALCUL des macros cuites depuis
# l'etat sec, pour que le couple reste coherent. On ne jette plus rien.
ECART_PESEE_MAX = 0.5


def macros_depuis_le_sec(sec, mesure: float):
    """
    Les macros du produit CUIT que la pesee impose, a partir de l'etat SEC.

    La cuisson n'ajoute que de l'eau : l'energie et les nutriments se
    conservent, seule la masse change. 100 g de riz sec a 350 kcal qui rendent
    `mesure` fois leur poids donnent un produit cuit a 350 / mesure kcal pour
    100 g, et toutes les autres valeurs suivent le meme facteur.

    C'est le calcul le plus honnete quand une pesee personnelle s'ecarte de la
    table : la pesee est un fait mesure sur CE produit, la table est une
    moyenne. On garde ce qui a ete mesure — le rendement — et ce qui est
    stable — l'etiquette du sec — et on en deduit le reste.
    """
    if not mesure or mesure <= 0 or not sec or not sec.get("kcal"):
        return None

    return {
        "nom": f"{sec['nom']} ÷ {mesure:.2f} (ta pesée)",
        "cle": sec["cle"],
        "kcal": sec["kcal"] / mesure,
        "prot": (sec.get("prot") or 0) / mesure,
        "gluc": (sec.get("gluc") or 0) / mesure,
        "lip": (sec.get("lip") or 0) / mesure,
        "fibres": (sec.get("fibres") or 0) / mesure,
    }


def sens_du_rendement(categorie: str, ratio: float):
    """
    Le rendement va-t-il dans le bon sens ? Meme regle que l'API.

    Ce n'est pas une plage de tolerance, c'est un SENS : un feculent absorbe
    de l'eau, une viande en perd. A contresens, les deux colonnes de l'ecran
    s'inversent. Les bornes restent larges — 4,68 sur un riz tres hydrate et
    0,53 sur une truite tres cuite sont des mesures, pas des fautes.
    """
    if ratio <= 0:
        return "rendement nul ou negatif"
    if categorie == "prot" and ratio > 1.05:
        return f"rendement {ratio:.2f} : une viande ne gagne pas de poids en cuisant"
    if categorie == "fec" and ratio < 1:
        return f"rendement {ratio:.2f} : un feculent ne perd pas de poids en cuisant"
    if not 0.3 <= ratio <= 6:
        return f"rendement {ratio:.2f} : hors de tout ordre de grandeur"

    return None


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

# Les champs personnalises Grocy dont CE script a besoin. Il les cree lui-meme
# plutot que de dependre d'un autre outil : grocy_macros.py sait aussi les
# creer, mais son --appliquer reecrit AU PASSAGE les macros de tous les
# produits depuis sa propre table, ecrasant le travail fait ici. Demander a
# quelqu'un de lancer l'un pour reparer l'autre etait un piege.
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


# ------------------------------------------------- le catalogue commun

#  Les 50 aliments de reference sont le point de depart de TOUT nouveau
#  compte. Ils portaient encore des valeurs tapees a la main, en partie
#  d'origine americaine — l'amande y etait a 21,5 g de glucides, fibres
#  comprises, contre 8,8 en Ciqual — sans aucune fibre renseignee, et avec
#  des legumes references cuits.
#
#  Plutot que de retaper cinquante lignes, on les GENERE depuis la table
#  Ciqual, avec exactement les memes regles que pour Grocy. Aucun chiffre
#  n'est invente : ils viennent tous du fichier de l'Anses.
#
#  La migration ne touche QUE le commun (`cree_par IS NULL`). Un aliment cree
#  par un utilisateur lui appartient, meme s'il porte le meme nom.

# Relatif au SCRIPT et non au dossier courant : on le lance souvent depuis
# ailleurs, et un fichier ecrit au hasard du `cd` est un fichier perdu.
CHEMIN_CATALOGUE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "db", "manuel",
    "16-catalogue-ciqual.sql")

# Les accents, sans extension PostgreSQL a installer.
ACCENTS = "àâäéèêëïîôöùûüçÀÂÄÉÈÊËÏÎÔÖÙÛÜÇ"
SANS_ACCENT = "aaaeeeeiioouuucAAAEEEEIIOOUUUC"


def _sql(v) -> str:
    """Un nombre pour SQL, ou NULL quand la valeur est inconnue."""
    return "NULL" if v is None else f"{v:g}"


def exporter_catalogue(aliments) -> int:
    lignes, introuvables = [], []

    for motif, (motifs_ciqual, categorie, ratio) in sorted(CORRESPONDANCE.items()):
        aliment = None
        if motif in EXACTS:
            vise = normaliser(EXACTS[motif])
            aliment = next((a for a in aliments if a["cle"] == vise), None)
        if aliment is None:
            aliment = chercher(aliments, motifs_ciqual)
        if aliment is None or not aliment["kcal"]:
            introuvables.append((motif, motifs_ciqual))
            continue

        # meme regle que pour Grocy : l'energie ne derive le rendement que
        # pour un grain sec
        if motif in AUTRE_ETAT:
            sec = chercher(aliments, AUTRE_ETAT[motif])
            if sec and sec["kcal"]:
                calcule = round(sec["kcal"] / aliment["kcal"], 2)
                if 0.4 <= calcule <= 5:
                    ratio = calcule

        contresens = sens_du_rendement(categorie, ratio)
        if contresens is not None:
            ratio = 1

        etat = "cru" if categorie in ("prot", "leg") else "cuit"
        ou = " AND ".join(
            f"fitcarnet_normaliser(nom) LIKE '%{mot}%'" for mot in motif.split())

        lignes.append(f"""
-- {aliment['nom']}
UPDATE aliment SET
    categorie      = '{categorie}',
    kcal_100       = {_sql(aliment['kcal'])},
    prot_100       = {_sql(aliment['prot'] or 0)},
    gluc_100       = {_sql(aliment['gluc'] or 0)},
    lip_100        = {_sql(aliment['lip'] or 0)},
    fibres_100     = {_sql(aliment['fibres'])},
    ratio          = {ratio:g},
    etat_reference = '{etat}'
WHERE cree_par IS NULL AND {ou};""")

    entete = f"""-- =====================================================================
--  Le catalogue COMMUN, aligne sur Ciqual.
--
--  GENERE par `ciqual_vers_grocy.py --exporter-catalogue`. Ne pas modifier
--  a la main : relance la commande.
--
--  Les 50 aliments de reference sont le point de depart de tout nouveau
--  compte. Ils portaient des valeurs tapees a la main, en partie d'origine
--  americaine — l'amande a 21,5 g de glucides fibres comprises contre 8,8 en
--  Ciqual — sans fibres renseignees, ce qui rend une cible exprimee en
--  glucides TOTAUX silencieusement fausse. Et des legumes references cuits,
--  alors qu'on les pese crus.
--
--  Aucun chiffre n'est invente ici : tous viennent de la table de l'Anses.
--  Le rendement d'un grain sec est derive de la conservation de l'energie ;
--  celui d'un legume ou d'une viande reste a 1 faute de mesure — il n'affiche
--  que le poids servi et ne touche aucune macro.
--
--  NE TOUCHE QUE LE COMMUN (`cree_par IS NULL`). Un aliment cree par un
--  utilisateur lui appartient, meme s'il porte le meme nom.
--
--  A jouer APRES 15-legumes-peses-crus.sql. Idempotent.
--
--  Source : Anses, Table Ciqual de composition nutritionnelle des aliments.
-- =====================================================================

BEGIN;

-- Comparer des noms accentues sans installer d'extension.
CREATE OR REPLACE FUNCTION fitcarnet_normaliser(t text) RETURNS text AS $$
    SELECT lower(translate(t, '{ACCENTS}', '{SANS_ACCENT}'));
$$ LANGUAGE sql IMMUTABLE;

SELECT 'avant' AS quand, count(*) FILTER (WHERE fibres_100 IS NULL) AS sans_fibres,
       count(*) FILTER (WHERE categorie = 'leg' AND etat_reference <> 'cru') AS legumes_cuits
FROM   aliment WHERE cree_par IS NULL;
"""

    pied = """
SELECT 'apres' AS quand, count(*) FILTER (WHERE fibres_100 IS NULL) AS sans_fibres,
       count(*) FILTER (WHERE categorie = 'leg' AND etat_reference <> 'cru') AS legumes_cuits
FROM   aliment WHERE cree_par IS NULL;

COMMIT;

-- Ce qui reste sans fibres apres coup : ces aliments faussent une cible
-- exprimee en glucides totaux, et rien ne le signale a l'ecran.
SELECT nom, categorie FROM aliment
WHERE  cree_par IS NULL AND fibres_100 IS NULL
ORDER  BY categorie, nom;
"""

    os.makedirs(os.path.dirname(CHEMIN_CATALOGUE), exist_ok=True)
    with open(CHEMIN_CATALOGUE, "w", encoding="utf-8") as f:
        f.write(entete + "".join(lignes) + "\n" + pied)

    print(f"{len(lignes)} aliment(s) ecrits dans {CHEMIN_CATALOGUE}")
    if introuvables:
        print(f"\n{len(introuvables)} sans equivalent Ciqual, laisses tels quels :")
        for motif, motifs in introuvables:
            print(f"  - {motif:24} (cherche : « {motifs} »)")
    print("\nRelis le fichier, puis joue-le :")
    print("  docker exec -i fitcarnet-db-dev psql -U fitcarnet -d fitcarnet"
          f" -f - < {CHEMIN_CATALOGUE}")

    return 0


# -------------------------------------------------------------------- main

def main() -> int:
    aliments = lire_ciqual(CIQUAL)

    # --exporter-catalogue : écrit la migration du catalogue COMMUN
    if "--exporter-catalogue" in sys.argv:
        return exporter_catalogue(aliments)

    # --chercher « amande » : liste les libellés Ciqual disponibles
    if "--chercher" in sys.argv:
        terme = sys.argv[sys.argv.index("--chercher") + 1]
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
    pesees_ecartees, macros_refaites, appariements_douteux = [], [], []
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

        # ratio dérivé de Ciqual quand les deux états sont connus — et
        # seulement pour un GRAIN SEC, seul cas où l'énergie se conserve.
        sec = None
        if categorie != "fec" and motif_produit in AUTRE_ETAT:
            sys.exit(
                f"« {motif_produit} » figure dans AUTRE_ETAT mais n'est pas un\n"
                "féculent. La dérivation du rendement par l'énergie ne vaut que\n"
                "pour un grain sec : un légume perd ses sucres dans l'eau de\n"
                "cuisson, et le calcul rend une portion cinq fois trop petite.")

        if motif_produit in AUTRE_ETAT and aliment and aliment["kcal"]:
            sec = chercher(aliments, AUTRE_ETAT[motif_produit])
            if sec and sec["kcal"]:
                calcule = round(sec["kcal"] / aliment["kcal"], 2)
                if 0.4 <= calcule <= 5:
                    if abs(calcule - ratio) / ratio > 0.1:
                        ratios_corriges.append(
                            (produit["name"], ratio, calcule, sec["nom"]))
                    ratio = calcule
            else:
                sec = None

        # TA balance passe avant Ciqual — et cette fois le code le fait.
        #
        # Une mesure et une table ne se contredisent pas : elles decrivent
        # deux produits differents. Ton riz rend 4,68 fois son poids, celui de
        # la table 2,26 ; les deux existent, ils n'ont simplement pas la meme
        # teneur en eau. Le seul tort serait de garder le rendement de l'un
        # avec les macros de l'autre — c'est ce que faisait ce bloc.
        #
        # On garde donc la mesure, et on recalcule les macros CUITES depuis
        # l'etat SEC divise par elle : deux valeurs qui viennent l'une de ta
        # balance, l'autre d'une etiquette, et qui ne peuvent plus se
        # contredire. Sans etat sec connu, on garde les macros de la table et
        # on dit franchement ce qui restera faux.
        pesees = pesees_de(produit)
        if pesees is not None:
            mesure = round(pesees[1] / pesees[0], 2)
            contresens = sens_du_rendement(categorie, mesure)

            if contresens is not None:
                # Le sens, lui, ne se discute pas : a contresens, les deux
                # colonnes de l'ecran s'inversent.
                pesees_ecartees.append(
                    (produit["name"], mesure, ratio, pesees, contresens))
            else:
                ecart = abs(mesure - ratio) / ratio
                if ecart > ECART_PESEE_MAX:
                    refait = macros_depuis_le_sec(sec, mesure)
                    if refait is not None:
                        macros_refaites.append(
                            (produit["name"], aliment["nom"], aliment["kcal"],
                             refait["kcal"], mesure, ratio))
                        aliment = refait
                    else:
                        # Pas d'etat sec connu : on ne peut pas rendre le
                        # couple coherent, alors on le dit au lieu de le taire.
                        pesees_ecartees.append(
                            (produit["name"], mesure, ratio, pesees,
                             f"{ecart:.0%} d'ecart avec Ciqual, et aucun etat sec "
                             "connu pour recalculer les macros"))
                if ecart > 0.02:
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

    if macros_refaites:
        print(f"\n{len(macros_refaites)} macro(s) recalculée(s) depuis TA pesée :")
        for nom, libelle, avant, apres, mesure, table in macros_refaites:
            print(f"  {nom:28} {avant:6.1f} → {apres:6.1f} kcal/100 g cuits")
            print(f"  {'':28} ton rendement {mesure} contre {table} pour « {libelle} ».")
        print("  Ta balance décrit TON produit ; la table décrit une moyenne.")
        print("  On garde ta mesure et on en déduit les macros, pour que les")
        print("  deux colonnes « à cuire » et « cuit » disent la même chose.")

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
