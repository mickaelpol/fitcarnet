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
import re
import sys

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      "ciqual_vers_grocy.py")

SOURCE = open(SCRIPT, encoding="utf-8").read()
ARBRE = ast.parse(SOURCE)

A_EXTRAIRE = {"sens_du_rendement", "rendement_par_energie",
              "rendement_derive_credible", "grain_sec_credible",
              "valeurs_au_sec", "nombre", "coherent", "SEC_MINI", "SEC_MAXI",
              "ETAT_CUIT", "CORRESPONDANCE", "desaccords", "normaliser",
              "MOTS_DECISIFS", "valeurs_saisies_a_la_main", "SAISIE_MANUELLE",
              "EXACTS", "CHAMPS_REQUIS"}


def noms_poses(noeud) -> set:
    """
    Les noms qu'un noeud de premier niveau pose, `A, B = 1, 2` compris.

    `SEC_MINI, SEC_MAXI = 300, 400` sortait d'ici les mains vides : la cible
    n'est pas un `Name` mais un `Tuple`, et le `getattr(cible, "id", None)`
    d'avant rendait None sans un mot. La constante etait donc declaree
    introuvable alors qu'elle est bien dans le script. Vu le 17 septembre 2026,
    en voulant justement l'extraire.
    """
    if isinstance(noeud, ast.FunctionDef):
        return {noeud.name}

    cible = noeud.targets[0]
    if isinstance(cible, ast.Tuple):
        return {getattr(element, "id", "") for element in cible.elts}

    return {getattr(cible, "id", "")}


def fonctions_pures():
    """Les fonctions sans effet de bord du script, sorties de leur contexte."""
    morceaux, posees = [], set()
    for noeud in ARBRE.body:
        if not isinstance(noeud, (ast.FunctionDef, ast.Assign)):
            continue
        noms = noms_poses(noeud)
        posees |= noms
        if noms & A_EXTRAIRE:
            morceaux.append(ast.get_source_segment(SOURCE, noeud))

    manquantes = A_EXTRAIRE - posees
    if manquantes:
        sys.exit(f"Introuvables dans le script : {', '.join(sorted(manquantes))}")

    espace = {"unicodedata": __import__("unicodedata"), "re": __import__("re")}
    exec("\n\n".join(morceaux), espace)  # noqa: S102 — code du depot, pas une entree
    return espace


def source_de(nom):
    """
    Le code SOURCE d'une fonction du script, sans l'executer.

    `exporter_catalogue` ecrit un fichier VERSIONNE : un test ne l'appelle
    pas. Mais on peut lire le gabarit SQL qu'elle construit — et c'est la, et
    nulle part ailleurs, que se decide quelle colonne a le droit de dependre
    du rendement.
    """
    for noeud in ARBRE.body:
        if isinstance(noeud, ast.FunctionDef) and noeud.name == nom:
            return ast.get_source_segment(SOURCE, noeud)

    sys.exit(f"Fonction introuvable dans le script : {nom}")


BOITE = fonctions_pures()
sens_du_rendement = BOITE["sens_du_rendement"]
normaliser = BOITE["normaliser"]
EXACTS = BOITE["EXACTS"]

# Riz blanc cru, Ciqual. C'est l'etiquette : une valeur stable, mesuree sur un
# produit sec, qui ne depend d'aucune facon de cuisiner.
#
# LES VALEURS ETAIENT FAUSSES JUSQU'AU 16 SEPTEMBRE 2026 (7.12 / 75.0 / 1.58 /
# 3.2) et ce bloc etait ecrit DEUX FOIS, la seconde definition ecrasant la
# premiere. Ce sont ces chiffres-la qui avaient contamine le catalogue, et
# `test_ecriture_grocy.py` a ete corrige le meme jour sans que son jumeau
# suive : le jumeau oublie, encore. Table Ciqual 2025, colonne « Reglement UE
# n° 1169/2011 » : 350 / 7,02 / 77,5 / 0,79 / 1,53.
RIZ_SEC = {
    "nom": "Riz blanc, cru", "cle": "riz blanc cru",
    "kcal": 350, "prot": 7.02, "gluc": 77.5, "lip": 0.79, "fibres": 1.53,
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


# -------------------------------- ce que le rendement ne peut PLUS faire

# (La seconde definition de RIZ_SEC vivait ici, identique a celle du haut et
#  l'ecrasant en silence. Retiree le 16 septembre 2026 : un fichier qui definit
#  deux fois la meme constante finit par n'en corriger qu'une.)

# LE test de la refonte, REECRIT LE 17 SEPTEMBRE 2026 parce qu'il ne pouvait
# pas echouer.
#
# Il y avait ici une boucle de dix assertions qui se lisaient tres bien :
# `a_peser` etait calcule par MOT POUR MOT l'expression de `attendu`, et
# `servi` valait `a_peser * rendement` compare a `attendu * rendement`. Aucune
# n'appelait la moindre fonction du script. Elles passaient quoi qu'il arrive,
# et auraient passe tout autant le jour ou l'import serait revenu a multiplier
# les macros par le rendement — c'est-a-dire le bug meme qu'elles etaient
# censees interdire. Onzieme du meme tonneau, `attendu * 4.68 > 2 * (attendu *
# 1.87)` : une verite d'arithmetique, 4,68 > 3,74. Seule la douzieme, le
# couple 350 / 155 -> 2,26, eprouvait quelque chose. Motif « test qui ne peut
# pas echouer » ; l'audit de septembre en avait compte douze.
#
# Les trois regles a garantir n'ont pas bouge d'un pouce. Ce qui change, c'est
# qu'elles sont desormais eprouvees sur le CODE qui les porte :
#
#   1. le poids A PESER ne depend pas du rendement — les macros exportees
#      decrivent le grain SEC, et aucune colonne de macro ne passe par le
#      rendement ;
#   2. le poids SERVI en depend — passer d'un etat a l'autre est exactement
#      une multiplication par le rendement, et rien d'autre ;
#   3. le rendement se derive du couple sec / cuit.
#
# Cote ecran, 1 et 2 vivent dans `front/src/calcul/poidsServi.ts`, qui a ses
# propres tests : la formule ne se recopie pas ici (regle 5). Ce fichier tient
# le bout de la chaine qui est en Python — ce que l'import ECRIT.
grain_sec_credible = BOITE["grain_sec_credible"]
rendement_par_energie = BOITE["rendement_par_energie"]
rendement_derive_credible = BOITE["rendement_derive_credible"]
valeurs_au_sec = BOITE["valeurs_au_sec"]
coherent = BOITE["coherent"]
SEC_MINI, SEC_MAXI = BOITE["SEC_MINI"], BOITE["SEC_MAXI"]

# Riz blanc CUIT, Ciqual : l'autre bout du couple.
RIZ_CUIT_KCAL = 155

# --------- regle 1 : le poids a peser ne depend pas du rendement
#
# Ce n'est plus une propriete a surveiller, c'est une impossibilite d'ecriture
# — encore faut-il le CONSTATER quelque part. On lit donc le gabarit SQL que
# `exporter_catalogue` construit : c'est la seule ligne de code du depot qui
# pourrait faire entrer le rendement dans une macro.
GABARIT = source_de("exporter_catalogue")
COLONNES = dict(re.findall(r"^ {4}(\w+)\s*=\s*(.+)$", GABARIT, re.M))

for colonne in ("kcal_100", "prot_100", "gluc_100", "lip_100", "fibres_100"):
    verifier(f"la colonne « {colonne} » s'ecrit sans le rendement",
             colonne in COLONNES and "ratio" not in COLONNES[colonne])

verifier("le rendement, lui, a sa propre colonne et ne fait rien d'autre",
         COLONNES.get("ratio", "").strip() == "{ratio:g}")

# La colonne peut etre formellement propre et porter quand meme un chiffre de
# produit CUIT : c'est le degat du 10 aout, 142 kcal de semoule cuite ecrits
# comme du sec. La garde est physique, pas lexicale.
verifier("le riz sec de Ciqual passe pour du grain sec",
         grain_sec_credible(RIZ_SEC))
verifier("la semoule CUITE a 142 kcal est refusee",
         not grain_sec_credible({"kcal": 142}))
verifier("le riz CUIT a 155 kcal est refuse lui aussi",
         not grain_sec_credible({"kcal": RIZ_CUIT_KCAL}))
verifier("un aliment sans kcal n'est pas du grain sec par defaut",
         not grain_sec_credible({"kcal": None}) and not grain_sec_credible({}))
verifier(f"les bornes {SEC_MINI} et {SEC_MAXI} sont dans la bande",
         grain_sec_credible({"kcal": SEC_MINI})
         and grain_sec_credible({"kcal": SEC_MAXI}))
verifier("... et ce qui les depasse d'un seul kcal est dehors",
         not grain_sec_credible({"kcal": SEC_MINI - 1})
         and not grain_sec_credible({"kcal": SEC_MAXI + 1}))

# Les macros du riz sec sont une donnee de CE fichier, recopiee de Ciqual :
# rien ne les verifiait, et elles ont ete fausses jusqu'au 16 septembre. Au
# moins doivent-elles tenir debout entre elles, a la convention EUROPEENNE
# (regle 4, fibres a 2 kcal/g). Ce controle n'aurait PAS attrape les valeurs
# fausses de la veille — 360 kcal calcules pour 350 annonces restent dans la
# tolerance de 12 % — et c'est ecrit ici pour que personne ne le croie plus
# fort qu'il n'est.
verifier("les macros du riz sec tiennent avec son energie",
         coherent(RIZ_SEC)[0])

# --------- regle 3 : le rendement se derive du couple sec / cuit
verifier("350 kcal de riz sec pour 155 de riz cuit donnent 2,26",
         presque(rendement_par_energie(RIZ_SEC["kcal"], RIZ_CUIT_KCAL),
                 2.26, 0.005))
verifier("le couple de la semoule, 350 / 164, donne 2,13",
         presque(rendement_par_energie(350, 164), 2.13, 0.005))
verifier("un cuit plus dilue donne un rendement plus grand",
         rendement_par_energie(350, 130)
         > rendement_par_energie(350, RIZ_CUIT_KCAL)
         > rendement_par_energie(350, 180))
verifier("sans l'un des deux etats, pas de rendement — et surtout pas 1",
         rendement_par_energie(350, None) is None
         and rendement_par_energie(None, RIZ_CUIT_KCAL) is None
         and rendement_par_energie(350, 0) is None)
verifier("celui du riz est retenu pour l'export",
         rendement_derive_credible("fec",
                                   rendement_par_energie(350, RIZ_CUIT_KCAL)))
verifier("le couple a l'envers — 142 de « sec » pour 350 de cuit — est refuse",
         not rendement_derive_credible("fec", rendement_par_energie(142, 350)))
verifier("5,83 est hors de la bande d'export, meme dans le bon sens",
         not rendement_derive_credible("fec", rendement_par_energie(350, 60)))
verifier("un legume ne tire pas son rendement de l'energie",
         not rendement_derive_credible("leg",
                                       rendement_par_energie(350, RIZ_CUIT_KCAL)))

# --------- regle 2 : le poids servi, lui, depend du rendement
#
# Et le passage d'un etat a l'autre est une MULTIPLICATION, rien de plus. Les
# valeurs sont celles du riz basmati saisi a la main dans Grocy avant la
# refonte : 99 kcal et 22 g de glucides pour 100 g de riz cuit.
RIZ_CUIT_GROCY = {"kcal100": "99", "gluc100": "22", "prot100": "2.4",
                  "lip100": "", "fibres100": None}
AU_SEC = valeurs_au_sec(RIZ_CUIT_GROCY, 3.53)

verifier("99 kcal de riz cuit a 3,53 redonnent 349,47 au sec",
         presque(AU_SEC["kcal100"], 349.47, 0.005))
verifier("... et 22 g de glucides en redonnent 77,66",
         presque(AU_SEC["gluc100"], 77.66, 0.005))
verifier("... et 2,4 g de proteines, 8,47 : tout suit le rendement",
         presque(AU_SEC["prot100"], 8.47, 0.005))
verifier("changer le rendement change le resultat, dans les memes proportions",
         presque(valeurs_au_sec(RIZ_CUIT_GROCY, 2)["kcal100"], 198.0, 0.005)
         and presque(valeurs_au_sec(RIZ_CUIT_GROCY, 2)["gluc100"], 44.0, 0.005))
verifier("un rendement de 1 ne change rien, par le meme chemin",
         presque(valeurs_au_sec(RIZ_CUIT_GROCY, 1)["kcal100"], 99.0, 0.005))
verifier("un champ vide reste absent : « je ne sais pas » n'est pas zero",
         "lip100" not in AU_SEC and "fibres100" not in AU_SEC)

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
ETAT_CUIT = BOITE["ETAT_CUIT"]
CORRESPONDANCE = BOITE["CORRESPONDANCE"]

for cle in ETAT_CUIT:
    entree = CORRESPONDANCE.get(cle)
    verifier(f"« {cle} » est bien un féculent, pas un légume",
             entree is not None and entree[1] == "fec")

# Et ETAT_CUIT doit bien viser des libelles CUITS : c'est l'autre bout du
# couple dont on tire le rendement. Le jour ou l'un d'eux pointe vers une
# entree crue, le rendement vaut 1 et la colonne « cuit » ment.
for cle, libelle in ETAT_CUIT.items():
    verifier(f"« {cle} » derive son rendement d'une entree CUITE",
             "cuit" in normaliser(libelle))

# Symetriquement, les grains eux-memes doivent viser une entree CRUE ou
# SECHE : c'est ce qu'on pese, donc ce que les macros doivent decrire. Poser
# ici une entree cuite reintroduirait exactement le bug de mars.
for cle in ETAT_CUIT:
    motifs = CORRESPONDANCE[cle][0]
    verifier(f"« {cle} » porte les valeurs du grain SEC",
             any(m in normaliser(motifs) for m in ("cru", "crue", "crues", "seches")))

for interdit in ("brocoli", "epinard", "courgette", "carotte", "poireau",
                 "chou fleur", "haricots verts", "petits pois",
                 "patate douce", "pommes de terre"):
    verifier(f"« {interdit} » ne doit plus déduire son rendement de l'énergie",
             interdit not in ETAT_CUIT)

verifier("les grains secs, eux, y sont restés",
         {"riz basmati", "riz complet", "quinoa", "boulgour",
          "pates completes"} <= set(ETAT_CUIT))

# La semoule, apres le degat du 10 aout : EXACTS la pointait sur un libelle
# CUIT a 142 kcal. Le libelle SEC existe — « Semoule de blé dur, crue », 350
# kcal — mais il n'est pas COMPLET, et Ciqual n'a aucune semoule complete
# crue. On decrit donc ce qu'on peut prouver.
for table in ("ETAT_CUIT", "CORRESPONDANCE", "EXACTS"):
    verifier(f"l'ancienne cle « semoule complete » a disparu de {table}",
             "semoule complete" not in BOITE[table])

# ------------------- LA regle generale : rien ne vise un libelle CUIT
#
# Trois lignes ont vise l'etat cuit sans que personne ne le voie : la semoule
# (142 kcal au lieu de 350), la pomme de terre (95 au lieu de 80) et la patate
# douce (79 au lieu de 81). Toutes trois etaient JUSTES du temps ou les
# feculents portaient leurs valeurs cuites, et sont devenues fausses le jour
# de la refonte. Aucune relecture ne les a attrapees — il a fallu un audit de
# la base, apres coup.
#
# Depuis qu'il n'y a plus qu'une convention, la regle est absolue : les macros
# decrivent ce qu'on PESE, donc aucune correspondance ne peut viser une entree
# cuite. ETAT_CUIT est la seule exception, et pour la seule chose qui ne soit
# pas une macro : deriver un rendement.
CUISSON = ("cuit", "cuite", "cuits", "cuites", "bouilli", "roti", "poele")

for cle, (motifs, _cat, _r) in CORRESPONDANCE.items():
    mots = normaliser(motifs).split()
    verifier(f"« {cle} » ne vise pas un libelle CUIT",
             not any(m in CUISSON for m in mots))

for cle, libelle in EXACTS.items():
    mots = normaliser(libelle).split()
    verifier(f"le libelle exact de « {cle} » n'est pas un produit CUIT",
             not any(m in CUISSON for m in mots))

verifier("la semoule vise un libelle SEC verifie",
         BOITE["EXACTS"]["semoule"] == "Semoule de blé dur, crue")
verifier("... et son entree cuite est la NATURE, pas la complete",
         "complete" not in normaliser(BOITE["ETAT_CUIT"]["semoule"]))

# Le couple doit etre coherent : 350 / 164 = 2,13. Apparier la seche nature a
# la cuite COMPLETE donnerait 2,46 — deux produits differents.
verifier("le rendement de table de la semoule vaut le rendement derive",
         abs(BOITE["CORRESPONDANCE"]["semoule"][2] - 350 / 164) < 0.01)

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
# script crée donc ce qu'il lui faut. Il a existé un grocy_macros.py dont le
# --appliquer réécrivait au passage les macros de tous les produits depuis sa
# propre table, en valeurs cuites ; il a été supprimé en septembre 2026.
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
