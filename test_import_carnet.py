#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
L'IMPORT DU CARNET, JOUÉ POUR DE VRAI SUR UNE BASE JETABLE.

`import_carnet.py` écrit en SQL direct : aucune entité, aucun test d'API ne
le regarde. Le 15 septembre 2026, la colonne `modele.partage` a été retirée
du schéma (migration 33) ; le script a continué de l'écrire. Personne ne l'a
vu pendant deux jours : l'import est transactionnel, les modèles passent
avant les séances, et la première création annulait TOUT — `installer.sh`
s'arrêtait sur « L'import du carnet a échoué », sur toute installation neuve.
Relevé par `verite-documentaire` le 17 septembre 2026.

Ce que ce test éprouve : un PostgreSQL jetable, le schéma de `db/01-schema.sql`
et les exercices de `db/02-donnees.sql`, un compte, un carnet minimal ; puis
le script, en simulation d'abord (rien ne doit être écrit), en écriture
ensuite (tout doit l'être, virgule décimale comprise).

Prérequis : Docker, et le pilote que le script exige lui-même
(`pip install psycopg2-binary`). Usage : `python3 test_import_carnet.py`.
Sûreté : conteneur à nom unique, détruit à la sortie ; aucune base réelle.
"""

import json
import os
import subprocess
import sys
import tempfile
import time

RACINE = os.path.dirname(os.path.abspath(__file__))
CONTENEUR = f"fitcarnet-verif-carnet-{os.getpid()}"
EMAIL = "carnet@verif.local"

try:
    import psycopg2  # noqa: F401 — seulement pour échouer ici, lisiblement
except ImportError:
    sys.exit("Le script testé exige le pilote PostgreSQL :  pip install psycopg2-binary")

PASSES = 0
ECHECS: list[str] = []


def verifier(quoi: str, condition: bool) -> None:
    global PASSES
    if condition:
        PASSES += 1
        print(f"  ✓ {quoi}")
    else:
        ECHECS.append(quoi)
        print(f"  ✗ {quoi}")


def docker(*args: str, entree: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(["docker", *args], input=entree, capture_output=True, text=True)


def psql(sql: str) -> str:
    """Une requête, sa réponse brute. `ON_ERROR_STOP` : une erreur n'est jamais avalée."""
    r = docker("exec", "-i", "-e", "PGPASSWORD=verif", CONTENEUR,
               "psql", "-U", "verif", "-d", "essai", "-v", "ON_ERROR_STOP=1", "-qtA",
               entree=sql)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip())

    return r.stdout.strip()


def attendre_postgres() -> None:
    """Deux réponses de suite : le serveur temporaire d'initdb répond aussi, une fois."""
    reussites = 0
    for _ in range(60):
        try:
            psql("SELECT 1;")
            reussites += 1
            if reussites >= 2:
                return
        except RuntimeError:
            reussites = 0
        time.sleep(1)
    raise RuntimeError("PostgreSQL n'a pas démarré")


def importer(carnet: str, port: str, appliquer: bool) -> subprocess.CompletedProcess:
    commande = [sys.executable, os.path.join(RACINE, "import_carnet.py"), carnet,
                "--email", EMAIL, "--hote", "127.0.0.1", "--port", port,
                "--base", "essai", "--utilisateur", "verif", "--motdepasse", "verif"]
    if appliquer:
        commande.append("--appliquer")

    return subprocess.run(commande, capture_output=True, text=True)


def compter(table: str) -> int:
    return int(psql(f"SELECT count(*) FROM {table};"))


# Deux exercices du catalogue semé (`02-donnees.sql`), et un inconnu : le
# script doit ignorer ce dernier sans rien casser.
CARNET = {
    "sessions": [
        {"tpl": True, "title": "Push", "exercises": [
            {"name": "DIPS", "mode": "time", "sets": [{"reps": "12", "weight": "0"}]},
            {"name": "Exercice qui n'existe pas", "sets": [{"reps": "5"}]},
        ]},
        {"date": "2026-09-01", "title": "Push", "exercises": [
            {"name": "Pompes", "notes": "mains larges", "sets": [
                {"reps": "20", "done": True},
                {"reps": "18", "weight": "4,5", "sec": "1:05"},
            ]},
        ]},
    ],
}


def main() -> int:
    print("Démarrage d'un PostgreSQL jetable...")
    r = docker("run", "-d", "--name", CONTENEUR, "-p", "127.0.0.1::5432",
               "-e", "POSTGRES_USER=verif", "-e", "POSTGRES_PASSWORD=verif",
               "-e", "POSTGRES_DB=essai", "postgres:16")
    if r.returncode != 0:
        sys.exit(f"docker run a échoué : {r.stderr.strip()}")

    try:
        attendre_postgres()
        port = docker("port", CONTENEUR, "5432/tcp").stdout.strip().rsplit(":", 1)[-1]

        for fichier in ("db/01-schema.sql", "db/02-donnees.sql"):
            with open(os.path.join(RACINE, fichier), encoding="utf-8") as f:
                psql(f.read())
        psql(f"INSERT INTO utilisateur (email, mot_de_passe, nom) VALUES ('{EMAIL}', 'x', 'Carnet');")

        with tempfile.TemporaryDirectory() as dossier:
            carnet = os.path.join(dossier, "carnet.json")
            with open(carnet, "w", encoding="utf-8") as f:
                json.dump(CARNET, f, ensure_ascii=False)

            print("Simulation...")
            simule = importer(carnet, port, appliquer=False)
            verifier("la simulation se termine sans erreur", simule.returncode == 0)
            verifier("la simulation n'écrit rien",
                     compter("modele") == 0 and compter("seance") == 0)

            print("Import...")
            reel = importer(carnet, port, appliquer=True)
            verifier("l'import se termine sans erreur", reel.returncode == 0)
            if reel.returncode != 0:
                print("    " + reel.stderr.strip().replace("\n", "\n    "))

        verifier("un modèle créé", compter("modele") == 1)
        verifier("l'exercice inconnu est ignoré, le connu importé",
                 compter("modele_exercice") == 1 and compter("modele_serie") == 1)
        verifier("le mode « time » du carnet devient « chrono »",
                 psql("SELECT mode FROM modele_exercice;") == "chrono")
        verifier("une séance créée, avec ses deux séries",
                 compter("seance") == 1 and compter("serie") == 2)
        verifier("« 4,5 » kg se lit 4,5 et « 1:05 » 65 secondes",
                 psql("SELECT poids || '|' || secondes FROM serie WHERE ordre = 1;") == "4.50|65")
        verifier("une série faite le reste, une série sans poids reste sans poids",
                 psql("SELECT faite || '|' || coalesce(poids::text, 'vide') FROM serie WHERE ordre = 0;")
                 == "true|vide")
    finally:
        docker("rm", "-f", CONTENEUR)

    total = PASSES + len(ECHECS)
    print(f"{PASSES}/{total} vérifications passées")
    for echec in ECHECS:
        print(f"  ÉCHEC : {echec}")

    return 1 if ECHECS else 0


if __name__ == "__main__":
    sys.exit(main())
