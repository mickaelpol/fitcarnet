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
"""

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

            ETAT["ecritures"][int(self.path.rsplit("/", 1)[1])] = corps

            return self._repondre(204, {})

        return self._repondre(404, {"error_message": "route inconnue"})


# --------------------------------------------------------- la fausse table

CIQUAL_FACTICE = [
    # (libelle, kcal, proteines, glucides, lipides, fibres)
    ("Riz blanc, cru", 350, 7.12, 75.0, 1.58, 3.2),
    ("Riz blanc, cuit, sans sel ajouté", 155, 3.15, 33.2, 0.70, 1.4),
    ("Brocoli, cru", 31.9, 2.9, 2.1, 0.40, 2.6),
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

    ecrites = ETAT["ecritures"]
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

    riz = ecrites.get(1, {})
    verifier("riz : macros recalculées depuis SA pesée (~74,8 kcal)",
             abs(nombre(riz, "kcal100") - 74.8) < 0.5)
    verifier("riz : ~16,0 g de glucides, pas les 33,2 de la table",
             abs(nombre(riz, "gluc100") - 16.0) < 0.3)
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

    total = PASSES + len(ECHECS)
    print(f"{PASSES}/{total} vérifications de l'écriture")
    for echec in ECHECS:
        print(f"  ÉCHEC : {echec}")

    return 1 if ECHECS else 0


if __name__ == "__main__":
    sys.exit(main())
