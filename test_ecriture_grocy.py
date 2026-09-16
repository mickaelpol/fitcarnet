#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LE BANC D'ESSAI DE L'ÉCRITURE — le seul morceau qu'aucun test ne couvrait.

`test_ciqual.py` vérifie les décisions : quel rendement retenir, quelles macros
en déduire, quel appariement est douteux. Il ne parle à rien. Résultat, une
panne est passée jusqu'en production :

    Grocy a répondu 400 :
    {"error_message":"Field source_valeurs is not a valid userfield"}

Le calcul était juste, l'écriture impossible. Aucun test ne pouvait le voir,
parce qu'aucun test n'écrivait.

Ce fichier lance donc le VRAI script, de bout en bout, contre un Grocy factice
qui se comporte comme le vrai — en particulier : il refuse le lot ENTIER si un
seul champ n'existe pas. Et contre une table Ciqual factice, réduite aux
libellés nécessaires.

    python3 test_ecriture_grocy.py

Aucune dépendance au-delà d'openpyxl, que le script principal exige déjà.
Rien n'est écrit dans ton vrai Grocy : le serveur tourne sur 127.0.0.1.
Rien n'est écrit dans le dépôt non plus : tout part dans un dossier temporaire,
et une vérification finale le prouve. Voir le commentaire de l'export, plus bas.
"""

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

try:
    from openpyxl import Workbook
except ImportError:
    sys.exit("Installe le lecteur de tableur :  pip install openpyxl")

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      "ciqual_vers_grocy.py")
PORT = 8099

# ---------------------------------------------------------------- le faux Grocy

# L'etat de depart reproduit celui rencontre en production : les neuf champs
# historiques existent, `source_valeurs` non. C'est exactement la situation qui
# a produit le 400.
def etat_neuf():
    return {
        "userfields": [
            {"id": i, "entity": "products", "name": n}
            for i, n in enumerate(
                ["cat", "kcal100", "prot100", "gluc100", "lip100", "ratio",
                 "fibres100", "pesee_avant", "pesee_apres"], 1)
        ],
        "products": [
            # Le riz de Mickael : une pesee qui contredit la table.
            {"id": 1, "name": "Riz basmati", "userfields": {
                "cat": "fec", "kcal100": "155", "ratio": "2.26",
                "pesee_avant": "84", "pesee_apres": "393"}},
            # Un legume pese, qui doit passer en valeurs CRUES.
            {"id": 2, "name": "Brocoli", "userfields": {
                "cat": "leg", "pesee_avant": "200", "pesee_apres": "150"}},
            # Des glucides d'origine americaine, a corriger.
            {"id": 3, "name": "Amandes", "userfields": {
                "cat": "ole", "gluc100": "21.5"}},
            # Une saisie manuelle sur un produit que Ciqual NE couvre pas.
            {"id": 4, "name": "Sardines (boite au naturel)", "userfields": {
                "cat": "prot", "kcal100": "182", "source_valeurs": "moi"}},
            # Hors diete.
            {"id": 5, "name": "Coca", "userfields": {}},
            # LE cas qui compte pour la protection : un produit que le script
            # SAIT apparier — « amandes » correspond — mais que l'utilisateur
            # a renseigne lui-meme. Sans lui, la protection semblait tenir
            # alors qu'elle ne faisait rien : les sardines ci-dessus ne sont
            # de toute facon plus dans la table de correspondance, elles
            # auraient ete epargnees pour une tout autre raison.
            {"id": 6, "name": "Amandes effilées", "userfields": {
                "cat": "ole", "gluc100": "21.5", "source_valeurs": "moi"}},
            # LE cas de la refonte : un feculent saisi a la main, qui porte
            # encore ses valeurs CUITES. Le passage normal du script s'interdit
            # d'y toucher — c'est « moi ». Seul --convertir-en-pese le reprend.
            {"id": 7, "name": "Riz basmati (le mien)", "userfields": {
                "cat": "fec", "kcal100": "99", "prot100": "2", "gluc100": "22",
                "lip100": "0.2", "fibres100": "0.6", "ratio": "3.53",
                "source_valeurs": "moi"}},
            # Un feculent dont AUCUN rendement n'explique les valeurs : elles
            # etaient deja fausses. On ne doit pas y toucher.
            {"id": 8, "name": "Semoule complète douteuse", "userfields": {
                "cat": "fec", "kcal100": "40", "gluc100": "8.7",
                "ratio": "3", "source_valeurs": "moi"}},
            # LE degat reel du 10 aout : « semoule complete » ne trouve pas son
            # libelle sec et tombe sur du couscous CUIT a 142 kcal. Le script
            # ecrivait alors 142 kcal comme du grain sec, et en deduisait un
            # rendement de 0,41 — un feculent qui retrecit en cuisant. Il doit
            # desormais refuser d'ecrire quoi que ce soit.
            {"id": 9, "name": "Boulgour", "userfields": {"cat": "fec"}},
            # L'autre moitie du meme piege : le grain SEC est bien apparie
            # (358 kcal, matiere seche), mais c'est l'entree CUITE qui est
            # fausse. Le rendement derive tombe alors sous 1 — un feculent qui
            # retrecit en cuisant. Les macros sont bonnes, le rendement non :
            # on ecrit les premieres et on refuse le second.
            {"id": 10, "name": "Quinoa", "userfields": {"cat": "fec"}},
        ],
        "ecritures": {},
        "champs_crees": [],
        "refus": [],
    }


ETAT = etat_neuf()


class FauxGrocy(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # pas de bruit dans la sortie du banc

    def _repondre(self, code, corps):
        octets = json.dumps(corps).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(octets)))
        self.end_headers()
        self.wfile.write(octets)

    def _corps(self):
        n = int(self.headers.get("Content-Length", 0))

        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        if self.path == "/api/objects/userfields":
            return self._repondre(200, ETAT["userfields"])
        if self.path == "/api/objects/products":
            return self._repondre(200, ETAT["products"])

        return self._repondre(404, {"error_message": "route inconnue"})

    def do_POST(self):
        corps = self._corps()
        if self.path == "/api/objects/userfields":
            ETAT["userfields"].append(
                {"id": 99, "entity": "products", "name": corps["name"]})
            ETAT["champs_crees"].append(corps["name"])

            return self._repondre(200, {"created_object_id": 99})

        return self._repondre(404, {"error_message": "route inconnue"})

    def do_PUT(self):
        corps = self._corps()
        if self.path.startswith("/api/userfields/products/"):
            # LE comportement qui compte : Grocy refuse le lot entier si un
            # seul champ lui est inconnu. C'est ce qui a produit le 400.
            connus = {c["name"] for c in ETAT["userfields"]}
            inconnus = [k for k in corps if k not in connus]
            if inconnus:
                ETAT["refus"].append(inconnus)

                return self._repondre(400, {"error_message":
                    f"Field {inconnus[0]} is not a valid userfield "
                    "of the given entity"})

            ident = int(self.path.rsplit("/", 1)[1])
            ETAT["ecritures"][ident] = corps

            # un vrai Grocy relit ce qu'on lui a ecrit : sans cela, aucun
            # test de rejeu ne prouve quoi que ce soit.
            for produit in ETAT["products"]:
                if produit["id"] == ident:
                    produit.setdefault("userfields", {}).update(
                        {k: str(v) for k, v in corps.items()})

            return self._repondre(204, {})

        return self._repondre(404, {"error_message": "route inconnue"})


# --------------------------------------------------------- la fausse table

CIQUAL_FACTICE = [
    # (libelle, kcal, proteines, glucides, lipides, fibres)
    # Les vraies valeurs de la table (colonne « Reglement UE n° 1169/2011 »).
    # Cette ligne a porte 7.12 / 75.0 / 1.58 / 3.2 jusqu'au 16 septembre 2026 :
    # les lipides au double et les fibres a 2,1x. L'audit avait trace jusqu'ici
    # les valeurs fausses du catalogue (04-tests-qualite.md:144) — une fausse
    # table qui ment sur les chiffres qu'elle imite ne prouve plus rien.
    ("Riz blanc, cru", 350, 7.02, 77.5, 0.79, 1.53),
    ("Riz blanc, cuit, sans sel ajouté", 155, 3.15, 33.2, 0.70, 1.4),
    ("Brocoli, cru", 31.9, 2.9, 2.1, 0.40, 2.6),
    # LE piege du 10 aout, rejoue sur le boulgour. En production c'etait la
    # semoule : EXACTS la pointait sur « Semoule ou graine de couscous
    # complète, CUITE » a 142 kcal. Le libelle portait tous les bons mots — il
    # avait ete choisi a la main — donc rien dans les mots ne pouvait le
    # trahir. Seule la physique le peut : 142 kcal n'est pas de la matiere
    # seche, quel que soit ce qui est ecrit en face.
    ("Boulgour de blé, cru, en salade préparée", 142, 4.3, 26.8, 1.0, 1.9),
    ("Quinoa, cru", 358, 13.2, 58.1, 6.1, 6.8),
    # Une entree « cuite » plus dense que le grain sec : impossible. Elle
    # donnerait un rendement de 0,85 sur un feculent.
    ("Quinoa, cuit en galette frite", 420, 12.0, 50.0, 18.0, 5.0),
    ("Amande, émondée, sans sel ajouté", 631, 21.4, 8.8, 52.5, 10.4),
]


def ecrire_table(chemin):
    classeur = Workbook()
    feuille = classeur.active
    feuille.append([
        "alim_nom_fr",
        "Energie, Règlement UE N° 1169/2011 (kcal/100 g)",
        "Protéines, N x facteur de Jones (g/100 g)",
        "Glucides (g/100 g)",
        "Lipides (g/100 g)",
        "Fibres alimentaires (g/100 g)",
    ])
    for ligne in CIQUAL_FACTICE:
        feuille.append(list(ligne))
    classeur.save(chemin)


# ------------------------------------------------------------------ le banc

ECHECS = []
PASSES = 0


def verifier(quoi, condition):
    global PASSES
    if condition:
        PASSES += 1
    else:
        ECHECS.append(quoi)


def nombre(champs, cle):
    try:
        return float(champs.get(cle, "nan"))
    except (TypeError, ValueError):
        return float("nan")


# La migration versionnee du catalogue commun. Ce banc ne doit JAMAIS l'ecrire :
# on releve son empreinte avant de lancer quoi que ce soit, et on la revérifie.
MIGRATION_VERSIONNEE = os.path.join(os.path.dirname(SCRIPT), "db", "manuel",
                                    "16-catalogue-ciqual.sql")


def empreinte_migration_versionnee():
    """Le contenu du fichier versionne, ou None s'il n'existe pas."""
    try:
        with open(MIGRATION_VERSIONNEE, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except FileNotFoundError:
        return None


VERSIONNEE_AVANT = empreinte_migration_versionnee()


def main():
    serveur = HTTPServer(("127.0.0.1", PORT), FauxGrocy)
    threading.Thread(target=serveur.serve_forever, daemon=True).start()

    with tempfile.TemporaryDirectory() as dossier:
        table = os.path.join(dossier, "ciqual-factice.xlsx")
        ecrire_table(table)

        resultat = subprocess.run(
            [sys.executable, SCRIPT, table, "--appliquer"],
            env=dict(os.environ,
                     GROCY_URL=f"http://127.0.0.1:{PORT}",
                     GROCY_API_KEY="factice"),
            capture_output=True, text=True)

    # Ce que l'import a ecrit, mis de cote avant de lancer la conversion sur
    # le meme faux Grocy.
    importees = dict(ETAT["ecritures"])

    # --------------------------------- le passage unique d'apres la refonte
    #
    # Lance APRES l'import, sur le meme faux Grocy : c'est l'ordre reel. Il ne
    # lit pas Ciqual, il multiplie les valeurs de Grocy par leur propre
    # rendement.
    ETAT["ecritures"] = {}
    conversion = subprocess.run(
        [sys.executable, SCRIPT, "--convertir-en-pese", "--appliquer"],
        env=dict(os.environ,
                 GROCY_URL=f"http://127.0.0.1:{PORT}",
                 GROCY_API_KEY="factice"),
        capture_output=True, text=True)
    converties = dict(ETAT["ecritures"])

    # ... et une seconde fois, pour prouver qu'elle ne double pas les valeurs.
    ETAT["ecritures"] = {}
    rejeu = subprocess.run(
        [sys.executable, SCRIPT, "--convertir-en-pese", "--appliquer"],
        env=dict(os.environ,
                 GROCY_URL=f"http://127.0.0.1:{PORT}",
                 GROCY_API_KEY="factice"),
        capture_output=True, text=True)
    apres_rejeu = dict(ETAT["ecritures"])

    serveur.shutdown()

    if resultat.returncode != 0:
        print(resultat.stdout[-2000:])
        print("--- stderr ---")
        print(resultat.stderr[-1500:])

    # ---------------------------------------------------- ce qui doit tenir

    verifier("le script se termine sans erreur", resultat.returncode == 0)
    verifier("le champ manquant a été créé de lui-même",
             ETAT["champs_crees"] == ["source_valeurs"])
    verifier("Grocy n'a JAMAIS refusé une écriture (le 400 de production)",
             ETAT["refus"] == [])

    ecrites = importees
    verifier("le riz a été écrit", 1 in ecrites)
    verifier("le brocoli a été écrit", 2 in ecrites)
    verifier("les amandes ont été écrites", 3 in ecrites)
    verifier("les sardines marquées « moi » n'ont PAS été touchées",
             4 not in ecrites)
    verifier("le Coca, hors diète, n'a pas été touché", 5 not in ecrites)
    # Celui-ci est le vrai test de la protection : appariable ET épargné.
    verifier("les amandes effilées, appariables mais saisies par toi, "
             "sont épargnées alors que les autres amandes sont écrites",
             6 not in ecrites and 3 in ecrites)

    # LE controle ajoute apres le degat du 10 aout : un grain apparie a une
    # entree CUITE ne doit RIEN ecrire. Ecrire 142 kcal comme du grain sec
    # produisait aussi un rendement de 0,41 — deux valeurs fausses d'un coup.
    verifier("un grain apparié à une entrée CUITE n'est pas écrit du tout",
             9 not in ecrites)
    verifier("... et le script dit pourquoi, avec le nombre de kcal",
             "ce n'est pas du grain sec" in resultat.stdout)

    # Le grain sec est bon, seule l'entrée cuite est fausse : on garde les
    # macros et on refuse le rendement, au lieu d'écrire un féculent qui
    # rétrécit en cuisant.
    quinoa = ecrites.get(10, {})
    verifier("un grain sec valide est écrit malgré une entrée cuite absurde",
             abs(nombre(quinoa, "kcal100") - 358) < 0.5)
    verifier("... mais le rendement dérivé à contresens est REFUSÉ",
             abs(nombre(quinoa, "ratio") - 2.75) < 0.01)
    verifier("... et le refus est annoncé, pas tu",
             "REFUSE(S)" in resultat.stdout)

    riz = ecrites.get(1, {})
    # Ce que la refonte change, vu depuis Grocy : le riz porte desormais les
    # valeurs du grain SEC, celui qu'on pose sur la balance. Sa pesee ne
    # touche plus les macros — elle ne fixe que le rendement — donc elles sont
    # exactement celles de Ciqual, sans recalcul intermediaire.
    verifier("riz : les valeurs du grain SEC (350 kcal), pas du riz cuit",
             abs(nombre(riz, "kcal100") - 350) < 0.5)
    verifier("riz : 77,5 g de glucides pour 100 g SECS",
             abs(nombre(riz, "gluc100") - 77.5) < 0.3)
    verifier("riz : SA pesée ne déplace plus une seule macro",
             abs(nombre(riz, "kcal100") - 350) < 0.5)
    verifier("riz : le rendement retenu est SA mesure (4,68)",
             abs(nombre(riz, "ratio") - 4.68) < 0.01)
    verifier("riz : la provenance est marquée « ciqual »",
             riz.get("source_valeurs") == "ciqual")

    brocoli = ecrites.get(2, {})
    verifier("brocoli : valeurs CRUES (31,9 kcal), pas cuites",
             abs(nombre(brocoli, "kcal100") - 31.9) < 0.5)
    verifier("brocoli : rendement 0,75 repris de sa pesée",
             abs(nombre(brocoli, "ratio") - 0.75) < 0.01)

    amandes = ecrites.get(3, {})
    verifier("amandes : 8,8 g de glucides (Ciqual), pas 21,5 (USDA)",
             abs(nombre(amandes, "gluc100") - 8.8) < 0.2)

    verifier("aucune pesée n'a été réécrite : le script ne mesure rien",
             all("pesee_avant" not in c and "pesee_apres" not in c
                 for c in ecrites.values()))

    # ------------------------------------ l'export du catalogue commun

    # Les 50 aliments de reference sont le point de depart de tout nouveau
    # compte. Ils sont GENERES depuis Ciqual, avec les memes regles que pour
    # Grocy — aucun chiffre tape a la main, donc aucun a corriger deux fois.
    #
    # CE BANC N'ECRIT PAS DANS LE DEPOT. Jusqu'au 14 septembre 2026 il lancait
    # `--exporter-catalogue` sans destination, et le script ecrivait donc dans
    # `db/manuel/16-catalogue-ciqual.sql`, migration VERSIONNEE que
    # `entrypoint-prod.sh` rejoue a chaque demarrage. Le commit c0f6f10 du
    # 10 aout 2026 a 19 h 59 en porte la trace : la migration y passe de 53
    # UPDATE a 4 — exactement les quatre aliments de CIQUAL_FACTICE ci-dessus.
    # 49 aliments du catalogue commun ont disparu de la production ce jour-la,
    # emportes par un commit intitule « Batch cooking ».
    #
    # Un test ecrit dans un fichier temporaire. Toujours.
    with tempfile.TemporaryDirectory() as dossier:
        table = os.path.join(dossier, "ciqual-factice.xlsx")
        ecrire_table(table)
        chemin = os.path.join(dossier, "16-catalogue-ciqual.sql")

        export = subprocess.run(
            [sys.executable, SCRIPT, table, "--exporter-catalogue",
             "--sortie", chemin],
            env=dict(os.environ,
                     GROCY_URL="http://127.0.0.1:1",
                     GROCY_API_KEY="factice"),
            capture_output=True, text=True)

        if export.returncode != 0:
            print("--- export stdout ---"); print(export.stdout[-1500:])
            print("--- export stderr ---"); print(export.stderr[-1500:])

        verifier("l'export se termine sans erreur", export.returncode == 0)
        verifier("l'export a bien ecrit la ou on le lui a demande",
                 os.path.exists(chemin))
        sql = (open(chemin, encoding="utf-8").read()
               if os.path.exists(chemin) else "")

    # La garde qui manquait : si quelqu'un retire `--sortie`, ce test doit
    # tomber AVANT que le fichier versionne ne parte dans un commit.
    verifier("la migration versionnee n'a pas ete touchee par ce banc",
             VERSIONNEE_AVANT == empreinte_migration_versionnee())

    verifier("la migration est écrite", len(sql) > 500)
    verifier("elle est dans une transaction",
             "BEGIN;" in sql and "COMMIT;" in sql)

    # Chaque UPDATE est examiné SÉPARÉMENT. Compter les occurrences dans tout
    # le fichier ne prouvait rien : les SELECT de contrôle contiennent déjà
    # « cree_par IS NULL », et le test passait même en retirant la clause de
    # tous les UPDATE.
    mises_a_jour = [m.split(";")[0] for m in sql.split("UPDATE aliment SET")[1:]]

    verifier("la migration met bien des aliments à jour", len(mises_a_jour) >= 3)
    verifier("CHAQUE mise à jour ne touche que le catalogue commun",
             all("cree_par IS NULL" in m for m in mises_a_jour))
    verifier("CHAQUE mise à jour renseigne les fibres",
             all("fibres_100" in m for m in mises_a_jour))
    verifier("PLUS AUCUNE mise à jour ne parle d'état de référence",
             not any("etat_reference" in m for m in mises_a_jour))

    # Les valeurs viennent de Ciqual, pas d'une table americaine.
    verifier("les amandes passent aux glucides européens (8,8 et non 21,5)",
             "gluc_100       = 8.8" in sql)
    verifier("... avec leurs fibres, jusqu'ici absentes",
             "fibres_100     = 10.4" in sql)
    verifier("le brocoli passe en valeurs CRUES",
             "kcal_100       = 31.9" in sql)
    verifier("le riz du catalogue commun porte les valeurs du SEC",
             "kcal_100       = 350" in sql)
    verifier("le rendement du riz est dérivé de l'énergie",
             "ratio          = 2.26" in sql)

    # Une catégorie sans mesure garde un rendement de 1 : on n'invente pas.
    verifier("aucun rendement inventé pour un légume",
             "ratio          = 1" in sql)

    # ------------------------------------------ la conversion, une seule fois

    if conversion.returncode != 0:
        print("--- conversion stdout ---"); print(conversion.stdout[-1500:])
        print("--- conversion stderr ---"); print(conversion.stderr[-1500:])
    verifier("la conversion se termine sans erreur", conversion.returncode == 0)
    verifier("le riz saisi à la main passe au SEC (99 -> 349 kcal)",
             abs(nombre(converties.get(7, {}), "kcal100") - 349.47) < 0.5)
    verifier("... ses glucides suivent le même facteur (22 -> 77,7)",
             abs(nombre(converties.get(7, {}), "gluc100") - 77.66) < 0.5)
    verifier("... et ses fibres aussi (0,6 -> 2,1)",
             abs(nombre(converties.get(7, {}), "fibres100") - 2.12) < 0.05)
    verifier("le rendement, lui, n'est PAS touché : il était déjà juste",
             "ratio" not in converties.get(7, {}))
    verifier("la semoule douteuse est LAISSÉE telle quelle",
             8 not in converties)
    verifier("... et elle est signalée au lieu d'être tue",
             "LAISSE(S)" in conversion.stdout)
    verifier("les non-féculents ne sont pas touchés",
             not any(i in converties for i in (2, 3, 4, 5, 6)))

    verifier("rejouée, la conversion ne double RIEN", apres_rejeu == {})
    verifier("... et elle le dit franchement",
             "Aucun produit ne porte encore des valeurs cuites" in rejeu.stdout)
    # Ne pas ecrire ne suffit pas : un produit deja converti ne doit pas non
    # plus atterrir dans la liste des suspects, sinon chaque relance affiche
    # une alerte sur un aliment parfaitement sain. Seule la semoule doit y
    # rester.
    verifier("... sans inventer de faux suspects au passage",
             rejeu.stdout.count("  ! ") == 1)

    total = PASSES + len(ECHECS)
    print(f"{PASSES}/{total} vérifications de l'écriture")
    for echec in ECHECS:
        print(f"  ÉCHEC : {echec}")

    return 1 if ECHECS else 0


if __name__ == "__main__":
    sys.exit(main())
