# -*- coding: utf-8 -*-
"""
Ajoute a Grocy les champs personnalises de macros, et les remplit.

Grocy connait tes stocks mais aucune valeur nutritionnelle. Ce script lui en
donne : six champs par produit, remplis automatiquement pour tout ce qui est
reconnu. Grocy devient alors ta base d'aliments complete, et fitcarnet n'a
plus qu'a la lire.

Les six champs :
    cat       prot | fec | leg | ole | huile | lait | fruit | autre
    kcal100   calories pour 100 g, dans l'etat de reference
    prot100   proteines  pour 100 g
    gluc100   glucides   pour 100 g
    lip100    lipides    pour 100 g
    ratio     feculents : cuit/sec (riz 3, patate douce 1)
              proteines : cuit/cru (poisson 0.85, viande 0.75)

Etat de reference : CRU pour les viandes et poissons, CUIT pour les feculents
et legumes. C'est la convention des tables nutritionnelles, et celle qu'attend
le solveur.

Idempotent : relancer le script met a jour, ne duplique rien.

Usage :
    GROCY_URL=https://grocy.mickael-pol.fr GROCY_API_KEY=xxx \
        python3 grocy_macros.py                 # simulation
    GROCY_URL=... GROCY_API_KEY=... python3 grocy_macros.py --appliquer
"""

import json
import os
import sys
import unicodedata
import urllib.error
import urllib.request

GROCY_URL = os.environ.get("GROCY_URL", "").rstrip("/")
API_KEY = os.environ.get("GROCY_API_KEY", "")
APPLIQUER = "--appliquer" in sys.argv

if not GROCY_URL or not API_KEY:
    sys.exit("Renseigne GROCY_URL et GROCY_API_KEY dans l'environnement.")


def api(methode, chemin, corps=None):
    donnees = json.dumps(corps).encode() if corps is not None else None
    requete = urllib.request.Request(
        GROCY_URL + "/api" + chemin, data=donnees, method=methode,
        headers={"GROCY-API-KEY": API_KEY,
                 "Content-Type": "application/json",
                 "Accept": "application/json"})
    try:
        with urllib.request.urlopen(requete, timeout=30) as r:
            contenu = r.read().decode()

            return json.loads(contenu) if contenu else {}
    except urllib.error.HTTPError as e:
        sys.exit(f"Grocy a répondu {e.code} sur {chemin} : {e.read().decode()[:200]}")
    except urllib.error.URLError as e:
        sys.exit(f"Grocy est injoignable : {e.reason}")


def normaliser(s: str) -> str:
    """« Chou-fleur » -> « chou fleur »."""
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()

    return " ".join("".join(c if c.isalnum() else " " for c in s).split())


# ---------------------------------------------------------------- champs

CHAMPS = [
    ("cat",     "Catégorie",             "text-single-line"),
    ("kcal100", "kcal / 100 g",          "number-decimal"),
    ("prot100", "Protéines / 100 g",     "number-decimal"),
    ("gluc100", "Glucides / 100 g",      "number-decimal"),
    ("lip100",  "Lipides / 100 g",       "number-decimal"),
    ("ratio",   "Ratio cuit / cru",      "number-decimal"),
    # D'ou viennent les macros : « ciqual » quand le script les a ecrites,
    # « moi » quand l'utilisateur les a saisies lui-meme. Dans ce second cas
    # l'import n'y touche plus — aucune table ne bat une etiquette lue sur la
    # boite, et Ciqual ne couvre pas tout (il n'y a pas de sardine au naturel).
    ("source_valeurs", "Source des valeurs", "text-single-line"),
]

# --------------------------------------------------- valeurs de reference
# (categorie, kcal, proteines, glucides, lipides, ratio)

REFERENCE = {
    # --- proteines : valeurs CRUES, ratio = cuit / cru ---
    "saumon":                   ("prot", 173.5, 18.9, 0,    10.2, 0.85),
    "truite":                   ("prot", 148,   20.8, 0,    6.8,  0.85),
    "cabillaud":                ("prot", 105,   22.8, 0,    0.9,  0.85),
    "colin lieu":               ("prot", 82,    17.8, 0,    0.7,  0.85),
    "thon au naturel":          ("prot", 116,   25.5, 0,    1.0,  1),
    "sardines":                 ("prot", 208,   24.6, 0,    11.5, 1),
    "blanc de poulet":          ("prot", 165,   31,   0,    3.6,  0.75),
    "haut de cuisse de poulet": ("prot", 179,   24.2, 0,    8.7,  0.75),
    "escalope de dinde":        ("prot", 147,   30,   0,    2.0,  0.75),
    "escalope de veau":         ("prot", 172,   31,   0,    4.8,  0.75),
    "boeuf hache 5":            ("prot", 149,   25,   0,    4.6,  0.78),
    "oeufs entiers":            ("prot", 146,   12,   2,    10,   1),
    "blancs d oeufs":           ("prot", 52,    10.9, 0.7,  0.2,  1),

    # --- feculents : valeurs CUITES, ratio = cuit / sec ---
    "patate douce":             ("fec",  92,    2.0,  20.7, 0.16, 1),
    "pommes de terre":          ("fec",  87,    1.9,  20.1, 0.1,  1),
    "riz complet":              ("fec",  110.8, 2.55, 23.1, 1.05, 3),
    "riz basmati":              ("fec",  130,   2.7,  28.2, 0.3,  3),
    "quinoa":                   ("fec",  120,   4.4,  21.3, 1.9,  2.75),
    "pates completes":          ("fec",  124,   5.3,  26.5, 0.6,  2.2),
    "semoule complete":         ("fec",  112,   3.8,  23.2, 0.65, 3),
    "boulgour":                 ("fec",  83,    3.1,  18.6, 0.2,  2.5),
    "flocons d avoine":         ("fec",  375,   12.5, 67.5, 7.5,  1),
    "pain de mie complet":      ("fec",  248,   9.0,  41.0, 4.2,  1),

    # --- legumes ---
    "haricots verts":           ("leg",  31,    1.8,  7.0,  0.1,  1),
    "brocoli":                  ("leg",  34,    2.8,  7.0,  0.4,  1),
    "courgettes":               ("leg",  17,    1.2,  3.1,  0.3,  1),
    "epinards":                 ("leg",  23,    2.9,  3.6,  0.4,  1),
    "carottes":                 ("leg",  41,    0.9,  9.6,  0.2,  1),
    "chou fleur":               ("leg",  25,    1.9,  5.0,  0.3,  1),
    "poireaux":                 ("leg",  31,    1.5,  6.3,  0.3,  1),
    "ratatouille":              ("leg",  22,    1.0,  5.0,  0.2,  1),
    "champignons":              ("leg",  22,    3.1,  3.3,  0.3,  1),
    "petits pois":              ("leg",  80,    5.0,  14.0, 0.4,  1),
    "concombre":                ("leg",  15,    0.7,  3.6,  0.1,  1),
    "asperges":                 ("leg",  20,    2.2,  3.9,  0.1,  1),

    # --- oleagineux et matieres grasses ---
    "amandes":                  ("ole",  575,   21,   21.5, 49.5, 1),
    "noix":                     ("ole",  654,   15.2, 13.7, 65.2, 1),
    "noisettes":                ("ole",  628,   15,   16.7, 60.8, 1),
    "beurre de cacahuete":      ("ole",  588,   25,   20,   50,   1),
    "huile":                    ("huile", 900,  0,    0,    100,  1),

    # --- laitages ---
    "skyr":                     ("lait", 57,    10,   4,    0.2,  1),
    "fromage blanc":            ("lait", 55,    8,    4.5,  0.2,  1),
    "lait":                     ("lait", 47,    3.3,  4.8,  1.6,  1),
    "camembert":                ("lait", 299,   19.8, 0.5,  24.3, 1),
    "emmental":                 ("lait", 380,   28.0, 1.0,  29.7, 1),

    # --- fruits ---
    "banane":                   ("fruit", 89,   1.1,  22.8, 0.3,  1),
    "pomme":                    ("fruit", 52,   0.3,  13.8, 0.2,  1),
    "poire":                    ("fruit", 57,   0.4,  15.2, 0.1,  1),
    "ananas":                   ("fruit", 50,   0.5,  13.1, 0.1,  1),
    "fraises":                  ("fruit", 32,   0.7,  7.7,  0.3,  1),
    "framboises":               ("fruit", 52,   1.2,  12,   0.65, 1),
    "myrtilles":                ("fruit", 57,   0.7,  14.5, 0.3,  1),
    "mures":                    ("fruit", 43,   1.4,  9.6,  0.5,  1),

    # --- divers ---
    "jus de citron":            ("autre", 22,   0.4,  6.9,  0.2,  1),
}

# Mots qui INTERDISENT l'appariement : « Glace amandes » n'est pas des amandes,
# et lui donner 575 kcal fausserait tout un repas.
EXCLUSIONS = ("glace", "sorbet", "bonbon", "biscuit", "gateau", "gateaux",
              "chips", "sauce", "sirop", "soda")


def apparier(nom: str):
    """Cherche l'entrée dont tous les mots figurent dans le nom du produit."""
    cle = normaliser(nom)

    for mot in EXCLUSIONS:
        if mot in cle.split():
            return None

    meilleur, longueur = None, 0
    for reference in REFERENCE:
        if all(mot in cle for mot in reference.split()) and len(reference) > longueur:
            meilleur, longueur = reference, len(reference)

    return meilleur


def main() -> int:
    print(f"Grocy : {GROCY_URL}")
    print("Amorçage seulement : les produits déjà renseignés ne sont pas touchés.")
    print("Pour des valeurs justes, c'est ciqual_vers_grocy.py qui fait autorité.\n")
    if not APPLIQUER:
        print("Mode simulation — rien ne sera écrit. Ajoute --appliquer pour agir.\n")

    # ---------- les champs ----------
    existants = {c["name"]: int(c["id"])
                 for c in api("GET", "/objects/userfields")
                 if c.get("entity") == "products"}

    a_creer = [c for c in CHAMPS if c[0] not in existants]
    if a_creer:
        print(f"{len(a_creer)} champ(s) à créer : {', '.join(c[1] for c in a_creer)}")
        if APPLIQUER:
            for nom, libelle, type_ in a_creer:
                api("POST", "/objects/userfields", {
                    "entity": "products", "name": nom, "caption": libelle,
                    "type": type_, "show_as_column_in_tables": 0})
                print(f"  + {libelle}")
    else:
        print("Les six champs existent déjà.")

    # ---------- les produits ----------
    produits = api("GET", "/objects/products")
    apparies, inconnus = [], []

    for produit in produits:
        reference = apparier(produit["name"])
        if reference is None:
            inconnus.append(produit["name"])
        else:
            apparies.append((produit, reference))

    print(f"\n{len(apparies)} produit(s) sur {len(produits)} reconnus.\n")

    if APPLIQUER:
        # CE SCRIPT NE FAIT QUE L'AMORCAGE.
        #
        # Sa table REFERENCE est un depannage : des valeurs approchees, tapees
        # a la main, en partie d'origine americaine — l'amande y est a 21,5 g
        # de glucides, fibres comprises, contre 8,8 en Ciqual. C'est
        # ciqual_vers_grocy.py qui fait autorite.
        #
        # Ecraser un produit deja renseigne reviendrait donc a remplacer des
        # valeurs verifiees par des valeurs approximatives. On saute tout ce
        # qui porte deja une provenance — « ciqual » comme « moi ».
        ecrits, epargnes = 0, []
        for index, (produit, reference) in enumerate(apparies, 1):
            deja = (produit.get("userfields") or {}).get("source_valeurs")
            if deja:
                epargnes.append((produit["name"], deja))
                continue

            categorie, kcal, prot, gluc, lip, ratio = REFERENCE[reference]
            api("PUT", f"/userfields/products/{produit['id']}", {
                "cat": categorie, "kcal100": kcal, "prot100": prot,
                "gluc100": gluc, "lip100": lip, "ratio": ratio,
                "source_valeurs": "amorcage"})
            ecrits += 1
            if index % 10 == 0:
                print(f"  [{index}/{len(apparies)}]", flush=True)

        print(f"\n=== {ecrits} produit(s) amorcé(s) ===")
        if epargnes:
            print(f"{len(epargnes)} produit(s) laissé(s) intact(s), déjà renseignés :")
            for nom, source in epargnes[:8]:
                print(f"  - {nom[:44]:46} ({source})")
            if len(epargnes) > 8:
                print(f"  … et {len(epargnes) - 8} autres")
            print("  Pour les mettre à jour : ciqual_vers_grocy.py, qui fait autorité.")
    else:
        for produit, reference in apparies[:8]:
            c, k, p, g, l, r = REFERENCE[reference]
            print(f"  {produit['name'][:40]:42} {c:6} {k:6} kcal  "
                  f"{p:5} P {g:5} G {l:5} L  ratio {r}")
        if len(apparies) > 8:
            print(f"  … et {len(apparies) - 8} autres")

    if inconnus:
        print(f"\n{len(inconnus)} produit(s) sans macros — ils resteront invisibles")
        print("dans le calculateur, ce qui convient pour la plupart :")
        for nom in inconnus:
            print("  -", nom)
        print("\nPour en utiliser un, renseigne ses six champs dans Grocy :")
        print("  fiche produit → section « Champs personnalisés ».")

    return 0


if __name__ == "__main__":
    sys.exit(main())
