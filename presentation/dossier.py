#!/usr/bin/env python3
"""
Construit le DOSSIER de démonstration : ce qu'on dit, dans quel ordre.

POURQUOI UN RENDU ET PAS UN SECOND DOCUMENT.

Le dossier et l'inventaire ont été deux fichiers séparés jusqu'au 17 septembre
2026 — `plan-de-tournage.md` d'un côté, `script-narration.md` et
`demo-30-minutes.md` de l'autre. Ils se sont contredits : l'un annonçait
57 fonctionnalités, l'autre 288 ; l'un envoyait en salle avec le seul
`jeu-demo.sql`, donc avec un frigo vide. Deux documents qui disent la même chose
finissent toujours par ne plus la dire pareil.

Il n'y a donc plus qu'une source, `demonstration.md`, et ce script la rend
projetable : même palette que les slides, gros corps, imprimable.

  python3 presentation/dossier.py
"""
import html
import pathlib
import re

RACINE = pathlib.Path(__file__).parent
SOURCE = RACINE / "demonstration.md"
SORTIE = RACINE / "fitcarnet-dossier.html"

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f1114;color:#e9e6e0;padding:3rem 0 6rem;
     font:17px/1.62 "IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:56rem;margin:0 auto;padding:0 2.5rem}
h1,h2,h3,h4{font-family:Archivo,system-ui,sans-serif;letter-spacing:-.02em;text-wrap:balance}
h1{font-size:2.6rem;font-weight:800;margin:3.4rem 0 1.1rem;padding-bottom:.6rem;
   border-bottom:3px solid #e8b84b}
h1:first-child{margin-top:0}
h2{font-size:1.75rem;font-weight:700;color:#fff;margin:2.6rem 0 .9rem}
h3{font-size:1.2rem;font-weight:600;color:#e8b84b;margin:1.8rem 0 .7rem}
h4{font-size:1rem;font-weight:600;color:#9aa0a8;text-transform:uppercase;
   letter-spacing:.09em;margin:1.4rem 0 .5rem}
p{margin:0 0 .9rem}
strong{color:#fff}
em{color:#cfd3d9}
code{background:#1b1f25;border:1px solid #242931;padding:.08em .38em;border-radius:3px;
     font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:.88em;color:#e8b84b}
pre{background:#161a20;border:1px solid #242931;border-left:3px solid #e8b84b;
    border-radius:6px;padding:1rem 1.2rem;margin:0 0 1.1rem;overflow-x:auto}
pre code{background:none;border:0;padding:0;color:#b9bec6;font-size:.86rem;line-height:1.55}
ul,ol{margin:0 0 1rem 1.4rem}
li{margin-bottom:.4rem}
blockquote{border-left:3px solid #6fa8dc;background:#141a22;border-radius:0 6px 6px 0;
           padding:.9rem 1.2rem;margin:0 0 1.1rem;color:#b9bec6}
blockquote p:last-child{margin-bottom:0}
hr{border:0;border-top:1px solid #262a31;margin:2.4rem 0}
.tableau{overflow-x:auto;margin:0 0 1.2rem}
table{border-collapse:collapse;width:100%;font-size:.94rem}
th,td{text-align:left;vertical-align:top;padding:.5rem .7rem;border-bottom:1px solid #242931}
th{background:#161a20;color:#e8b84b;font-weight:600;white-space:nowrap}
tr:hover td{background:#13171d}
.entete{color:#71767e;font-size:.9rem;margin-bottom:2.2rem;padding-bottom:1rem;
        border-bottom:1px solid #262a31}
@media print{
  body{background:#fff;color:#111;padding:0;font-size:11pt}
  main{max-width:none;padding:0}
  h2,h3{color:#111}
  code{background:#f2f2f2;color:#111}
  blockquote{background:#f7f7f7;color:#333}
  th{background:#f2f2f2;color:#111}
  h1{page-break-before:always}
  h1:first-child{page-break-before:avoid}
}
"""


def enligne(texte: str) -> str:
    """Le balisage de ligne : code, gras, italique, liens.

    L'ORDRE COMPTE, ET IL A DÉJÀ COÛTÉ UN RENDU FAUX. On échappe le HTML
    d'abord (sinon un `<` du texte ouvre une balise), puis on met les fragments
    de code À L'ABRI derrière un jeton : sans cela, `**` à l'intérieur d'un
    `code` était pris pour du gras, et `*` pour de l'italique.
    """
    texte = html.escape(texte, quote=False)

    abri: list[str] = []

    def garder(m: re.Match) -> str:
        abri.append(m.group(1))
        return f"\x00{len(abri) - 1}\x00"

    texte = re.sub(r"`([^`]+)`", garder, texte)
    texte = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", texte)
    texte = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", texte)
    texte = re.sub(r"~~([^~]+)~~", r"<del>\1</del>", texte)
    texte = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', texte)
    texte = re.sub(r"\x00(\d+)\x00", lambda m: f"<code>{abri[int(m.group(1))]}</code>", texte)
    return texte


def ligne_de_tableau(ligne: str) -> list[str]:
    return [c.strip() for c in ligne.strip().strip("|").split("|")]


def rendre(markdown: str) -> str:
    sortie: list[str] = []
    lignes = markdown.split("\n")
    i = 0
    liste_en_cours = ""      # "ul" ou "ol", vide si aucune

    def fermer_liste() -> None:
        nonlocal liste_en_cours
        if liste_en_cours:
            sortie.append(f"</{liste_en_cours}>")
            liste_en_cours = ""

    while i < len(lignes):
        ligne = lignes[i]
        nu = ligne.strip()

        # ---------------------------------------------------------- code
        if nu.startswith("```"):
            fermer_liste()
            i += 1
            bloc = []
            while i < len(lignes) and not lignes[i].strip().startswith("```"):
                bloc.append(html.escape(lignes[i], quote=False))
                i += 1
            i += 1
            sortie.append("<pre><code>" + "\n".join(bloc) + "</code></pre>")
            continue

        # ------------------------------------------------------- tableau
        # Un tableau se reconnaît à sa SECONDE ligne (|---|---|), jamais à la
        # première : une phrase peut très bien contenir des barres verticales.
        if nu.startswith("|") and i + 1 < len(lignes) and re.match(r"^\|[\s:|-]+\|$", lignes[i + 1].strip()):
            fermer_liste()
            entetes = ligne_de_tableau(nu)
            i += 2
            corps = []
            while i < len(lignes) and lignes[i].strip().startswith("|"):
                corps.append(ligne_de_tableau(lignes[i].strip()))
                i += 1
            sortie.append('<div class="tableau"><table><thead><tr>'
                          + "".join(f"<th>{enligne(c)}</th>" for c in entetes)
                          + "</tr></thead><tbody>")
            for rangee in corps:
                sortie.append("<tr>" + "".join(f"<td>{enligne(c)}</td>" for c in rangee) + "</tr>")
            sortie.append("</tbody></table></div>")
            continue

        # ------------------------------------------------------- citation
        if nu.startswith(">"):
            fermer_liste()
            bloc = []
            while i < len(lignes) and lignes[i].strip().startswith(">"):
                bloc.append(re.sub(r"^\s*>\s?", "", lignes[i]))
                i += 1
            paragraphes = [p.strip() for p in "\n".join(bloc).split("\n\n") if p.strip()]
            sortie.append("<blockquote>"
                          + "".join(f"<p>{enligne(' '.join(p.split()))}</p>" for p in paragraphes)
                          + "</blockquote>")
            continue

        # ------------------------------------------------------------ titre
        if nu.startswith("#"):
            fermer_liste()
            niveau = len(nu) - len(nu.lstrip("#"))
            sortie.append(f"<h{min(niveau, 4)}>{enligne(nu.lstrip('#').strip())}</h{min(niveau, 4)}>")
            i += 1
            continue

        # ------------------------------------------------------------- filet
        if nu in ("---", "***", "___"):
            fermer_liste()
            sortie.append("<hr>")
            i += 1
            continue

        # ------------------------------------------------------------ listes
        puce = re.match(r"^\s*[-*]\s+(.*)$", ligne)
        numero = re.match(r"^\s*\d+\.\s+(.*)$", ligne)
        if puce or numero:
            voulue = "ul" if puce else "ol"
            if liste_en_cours != voulue:
                fermer_liste()
                sortie.append(f"<{voulue}>")
                liste_en_cours = voulue
            contenu = (puce or numero).group(1)
            # La suite indentée appartient à la même puce.
            i += 1
            while i < len(lignes) and lignes[i].startswith("  ") and lignes[i].strip() \
                    and not re.match(r"^\s*([-*]|\d+\.)\s+", lignes[i]):
                contenu += " " + lignes[i].strip()
                i += 1
            sortie.append(f"<li>{enligne(contenu)}</li>")
            continue

        # ------------------------------------------------------- paragraphe
        if not nu:
            fermer_liste()
            i += 1
            continue

        bloc = []
        while i < len(lignes) and lignes[i].strip() and not re.match(
                r"^\s*(#|>|```|\||[-*]\s|\d+\.\s|---$)", lignes[i]):
            bloc.append(lignes[i].strip())
            i += 1
        fermer_liste()
        sortie.append(f"<p>{enligne(' '.join(bloc))}</p>")

    fermer_liste()
    return "\n".join(sortie)


def construire() -> str:
    if not SOURCE.exists():
        raise SystemExit(f"dossier : {SOURCE} est introuvable — c'est la seule source.")
    corps = rendre(SOURCE.read_text(encoding="utf-8"))
    return "\n".join([
        # LE CHARSET D'ABORD, comme pour les slides : servi en file://, un HTML
        # sans cette ligne s'affiche « composÃ©s ». Vu le 9 septembre 2026.
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        "<title>fitcarnet — dossier de démonstration</title>",
        '<link rel="preconnect" href="https://fonts.googleapis.com">'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
        "family=Archivo:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600&"
        'family=IBM+Plex+Mono:wght@400&display=swap">',
        f"<style>{CSS}</style>",
        "<main>",
        '<p class="entete">Dossier de démonstration — rendu depuis '
        "<code>presentation/demonstration.md</code>, qui est la seule source. "
        "Ne pas corriger ce HTML : il est régénéré à chaque "
        "<code>preparer-demonstration.sh</code>.</p>",
        corps,
        "</main>",
    ])


# =====================================================================
#  LA FEUILLE DE TOURNAGE.
#
#  POURQUOI. La vidéo montée par `tourner.mjs` est un parcours automatique :
#  elle montre les écrans, elle ne fait pas une démonstration. Le propriétaire
#  filme donc lui-même, au téléphone, et il lui faut ce qu'aucun des deux
#  rendus précédents ne donnait : UNE TIMELINE — filmer ceci, puis cela, et à
#  quel moment du film on en est.
#
#  Elle ne s'écrit pas à part. La partie III de `demonstration.md` porte déjà
#  chaque plan avec son geste, ce qu'on voit, ce qu'on dit et sa durée ; on la
#  lit, on cumule les durées, on la rend. Une seconde source aurait dérivé de
#  la première en une semaine — c'est ce qui a fait supprimer quatre documents.
# =====================================================================
SORTIE_TOURNAGE = RACINE / "fitcarnet-tournage.html"

BOBINE = re.compile(r"^## Bobine (\d+) · (.+?) · ~[^—]+(?:— (.*))?$")
PLAN = re.compile(r"^\*\*(\d+\.\d+) — (.+?)\*\*\s*·\s*(\d+)\s*(s|min)\b(.*)$")
ETAPE = re.compile(r"^\*([^*]+)\*\s*:\s*(.+)$")

CSS_TOURNAGE = """
.plan{display:grid;grid-template-columns:8.6rem 1fr;gap:0 1.2rem;padding:1rem 0;
      border-top:1px solid #262a31}
.tc{font-family:"IBM Plex Mono",ui-monospace,monospace;color:#e8b84b;font-size:.95rem;
    line-height:1.4;white-space:nowrap}
.tc small{display:block;color:#71767e;font-size:.8rem}
.plan h3{margin:0 0 .5rem;font-size:1.12rem}
.plan h3 .n{color:#71767e;font-weight:500;margin-right:.35rem}
.fort{display:inline-block;margin-left:.5rem;padding:.05rem .45rem;border-radius:3px;
      background:#e8b84b;color:#0f1114;font-size:.72rem;font-weight:700;
      letter-spacing:.04em;text-transform:uppercase;vertical-align:middle}
.etape{display:grid;grid-template-columns:5.6rem 1fr;gap:.6rem;margin:.28rem 0}
.etape b{font-weight:600;font-size:.78rem;text-transform:uppercase;letter-spacing:.07em;
         padding-top:.2rem}
.geste b{color:#6fa8dc}.ecran b{color:#9aa0a8}.dire b{color:#7bc47f}
.dire span{color:#fff}
.note{border-left:3px solid #e8b84b;background:#1c1a14;border-radius:0 6px 6px 0;
      padding:.6rem .9rem;margin:.6rem 0 0;color:#d9d2c0;font-size:.92rem}
.note p{margin:0 0 .4rem}.note p:last-child{margin:0}
.depart{border-left-color:#6fa8dc;background:#141a22;color:#b9bec6}
.remise{border-left-color:#71767e;background:#15171b;color:#9aa0a8}
.coche{font-size:1.15rem;color:#71767e;margin-right:.35rem}
.recap td:nth-child(3),.recap td:nth-child(4){font-family:"IBM Plex Mono",monospace;
      white-space:nowrap}
@media (max-width:40rem){
  main{padding:0 1rem}
  .plan{grid-template-columns:1fr}
  .tc{margin-bottom:.3rem}
  .etape{grid-template-columns:1fr;gap:0}
}
@media print{
  .plan{page-break-inside:avoid}
  .dire span{color:#111}
  .note{background:#f7f5ee;color:#333}
}
"""


def minutage(secondes: int) -> str:
    return f"{secondes // 60:02d}:{secondes % 60:02d}"


def duree_lisible(secondes: int) -> str:
    m, s = divmod(secondes, 60)
    return f"{m} min {s:02d} s" if m else f"{s} s"


def lire_partie_iii(markdown: str) -> tuple[list[dict], list[str]]:
    """Les bobines et leurs plans, dans l'ordre du document.

    Une citation qui commence par « État de départ » ou « Remise à zéro » est
    rangée à part ; toute autre citation est une note « à savoir », accrochée
    au plan qui la précède — c'est là qu'elle sert, au moment de filmer.
    """
    debut = markdown.find("\n# Partie III")
    fin = markdown.find("\n# Partie IV")
    if debut < 0 or fin < 0:
        raise SystemExit("tournage : la partie III de demonstration.md est introuvable.")
    lignes = markdown[debut:fin].split("\n")

    bobines: list[dict] = []
    hors_champ: list[str] = []
    bobine = plan = None
    dans_hors_champ = False
    i = 0
    while i < len(lignes):
        nu = lignes[i].strip()

        if nu.startswith("## Ce qui reste hors champ"):
            dans_hors_champ, bobine, plan = True, None, None
            i += 1
            continue

        m = BOBINE.match(nu)
        if m:
            dans_hors_champ = False
            bobine = {"numero": int(m.group(1)), "titre": m.group(2).strip(),
                      "marque": (m.group(3) or "").strip(),
                      "depart": [], "remise": [], "notes": [], "plans": []}
            bobines.append(bobine)
            plan = None
            i += 1
            continue

        if dans_hors_champ and nu.startswith("- "):
            texte = nu[2:]
            i += 1
            while i < len(lignes) and lignes[i].startswith("  ") and lignes[i].strip():
                texte += " " + lignes[i].strip()
                i += 1
            hors_champ.append(texte)
            continue

        if bobine is None:
            i += 1
            continue

        m = PLAN.match(nu)
        if m:
            secondes = int(m.group(3)) * (60 if m.group(4) == "min" else 1)
            plan = {"numero": m.group(1), "titre": m.group(2).strip(),
                    "secondes": secondes, "fort": "moment fort" in m.group(5),
                    "etapes": [], "notes": []}
            bobine["plans"].append(plan)
            i += 1
            continue

        m = ETAPE.match(nu)
        if m and plan is not None:
            plan["etapes"].append((m.group(1).strip(), m.group(2).strip()))
            i += 1
            continue

        if nu.startswith(">"):
            bloc = []
            while i < len(lignes) and lignes[i].strip().startswith(">"):
                bloc.append(re.sub(r"^\s*>\s?", "", lignes[i]))
                i += 1
            paragraphes = [" ".join(p.split()) for p in "\n".join(bloc).split("\n\n") if p.strip()]
            # Par PARAGRAPHE et non par ligne : la bobine 1 écrit son état de
            # départ sur deux lignes, et le tableau récapitulatif s'arrêtait
            # sur « Un second ». Vu à la première relecture de la feuille.
            if paragraphes and paragraphes[0].startswith("**État de départ**"):
                bobine["depart"].extend(paragraphes)
            elif paragraphes and paragraphes[0].startswith("**Remise à zéro**"):
                bobine["remise"].extend(paragraphes)
            elif plan is not None:
                plan["notes"].append(paragraphes)
            else:
                bobine["notes"].append(paragraphes)
            continue

        i += 1

    for b in bobines:
        for p in b["plans"]:
            if not any(etiquette.startswith("Geste") for etiquette, _ in p["etapes"]):
                raise SystemExit(f"tournage : le plan {p['numero']} n'a aucun geste — "
                                 "la partie III a changé de forme, le lecteur aussi doit changer.")
    return bobines, hors_champ


def rendre_etape(etiquette: str, texte: str) -> str:
    if etiquette.startswith("Geste"):
        classe, nom = "geste", "Geste"
    elif etiquette.startswith("À l'écran"):
        classe, nom = "ecran", "À l'écran"
    else:
        classe, nom = "dire", "Tu dis"
    precision = etiquette[len("Tu dis"):].strip(" ,") if classe == "dire" else ""
    prefixe = f"<em>({html.escape(precision)})</em> " if precision else ""
    return (f'<div class="etape {classe}"><b>{nom}</b>'
            f"<span>{prefixe}{enligne(texte)}</span></div>")


def rendre_note(paragraphes: list[str], classe: str = "") -> str:
    return (f'<div class="note {classe}">'
            + "".join(f"<p>{enligne(p)}</p>" for p in paragraphes) + "</div>")


def construire_tournage() -> tuple[str, int, int]:
    bobines, hors_champ = lire_partie_iii(SOURCE.read_text(encoding="utf-8"))

    # Le minutage court sur tout le film, bobine après bobine : c'est lui qui
    # dit « à 07:40, on est dans le calculateur ».
    horloge = 0
    for b in bobines:
        b["debut"] = horloge
        for p in b["plans"]:
            p["debut"] = horloge
            horloge += p["secondes"]
            p["fin"] = horloge
        b["fin"] = horloge
    total = horloge
    nb_plans = sum(len(b["plans"]) for b in bobines)

    corps = [
        "<h1>Feuille de tournage</h1>",
        f"<p><strong>{len(bobines)} bobines, {nb_plans} plans, "
        f"{duree_lisible(total)} de film</strong> une fois recollés. "
        "Filme <strong>dans cet ordre</strong> : il raconte une journée — on arrive, on "
        "règle ses objectifs, on remplit le frigo, on planifie, on cuisine, on prépare "
        "ses programmes, on s'entraîne, puis on passe côté administrateur.</p>",
        "<ul>"
        "<li><strong>Une bobine = un enregistrement.</strong> On ne cherche pas "
        "l'enchaînement parfait : le montage recolle. Une bobine ratée se refait seule.</li>"
        "<li><strong>La colonne de gauche</strong> dit où le plan tombe dans le film "
        "final, et combien de temps il dure. Ce sont des minimums : un geste trop "
        "rapide est un geste illisible.</li>"
        "<li><strong>La bobine 5 se filme juste après la 4</strong> : on y cuisine le "
        "plan qu'on vient d'enregistrer.</li>"
        "<li><strong>Ne lis que ce qui est à l'écran.</strong> Si un message annoncé "
        "n'apparaît pas, tais-le plutôt que de le réciter.</li>"
        "<li>Enregistrement : <code>scrcpy --record bobine-1.mp4 --max-size 1080</code> "
        "depuis le PC, ou l'enregistreur intégré d'Android. Téléphone en « Ne pas "
        "déranger », luminosité fixe, batterie au-dessus de 50 %.</li>"
        "</ul>",
        '<h2>Le déroulé</h2>',
        '<div class="tableau"><table class="recap"><thead><tr>'
        "<th>#</th><th>Bobine</th><th>Dans le film</th><th>Durée</th><th>Avant de filmer</th>"
        "</tr></thead><tbody>",
    ]
    for b in bobines:
        depart = enligne(re.sub(r"^\*\*État de départ\*\*\s*:\s*", "", b["depart"][0])) \
            if b["depart"] else "—"
        corps.append(
            f"<tr><td>{b['numero']}</td><td>{enligne(b['titre'])}</td>"
            f"<td>{minutage(b['debut'])} → {minutage(b['fin'])}</td>"
            f"<td>{duree_lisible(b['fin'] - b['debut'])}</td><td>{depart}</td></tr>")
    corps.append("</tbody></table></div>")

    for b in bobines:
        marque = f' <span class="fort">{html.escape(re.sub(r"[*]", "", b["marque"]))}</span>' \
            if b["marque"] else ""
        corps.append(f"<h2>Bobine {b['numero']} · {enligne(b['titre'])}{marque}</h2>")
        corps.append(f"<p class=\"tc\">{minutage(b['debut'])} → {minutage(b['fin'])} · "
                     f"{duree_lisible(b['fin'] - b['debut'])}</p>")
        if b["depart"]:
            corps.append(rendre_note(b["depart"], "depart"))
        for n in b["notes"]:
            corps.append(rendre_note(n))
        for p in b["plans"]:
            fort = '<span class="fort">moment fort</span>' if p["fort"] else ""
            corps.append(
                '<div class="plan">'
                f'<div class="tc">{minutage(p["debut"])} → {minutage(p["fin"])}'
                f'<small>{p["secondes"]} s</small></div>'
                "<div>"
                f'<h3><span class="coche">☐</span><span class="n">{p["numero"]}</span>'
                f'{enligne(p["titre"])}{fort}</h3>'
                + "".join(rendre_etape(e, t) for e, t in p["etapes"])
                + "".join(rendre_note(n) for n in p["notes"])
                + "</div></div>")
        for r in b["remise"]:
            corps.append(rendre_note([r], "remise"))

    if hors_champ:
        corps.append("<h2>Ce qu'on ne filme pas</h2><ul>"
                     + "".join(f"<li>{enligne(h)}</li>" for h in hors_champ) + "</ul>")

    return "\n".join([
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        "<title>fitcarnet — feuille de tournage</title>",
        '<link rel="preconnect" href="https://fonts.googleapis.com">'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
        "family=Archivo:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600&"
        'family=IBM+Plex+Mono:wght@400&display=swap">',
        f"<style>{CSS}{CSS_TOURNAGE}</style>",
        "<main>",
        '<p class="entete">Rendue depuis la partie III de '
        "<code>presentation/demonstration.md</code>. Pour changer un plan, change-le "
        "là-bas, puis <code>python3 presentation/dossier.py</code>.</p>",
        "\n".join(corps),
        "</main>",
    ]), total, nb_plans


if __name__ == "__main__":
    SORTIE.write_text(construire(), encoding="utf-8")
    print(f"{SORTIE.name} — {SORTIE.stat().st_size // 1024} Ko")
    page, total, nb_plans = construire_tournage()
    SORTIE_TOURNAGE.write_text(page, encoding="utf-8")
    print(f"{SORTIE_TOURNAGE.name} — {nb_plans} plans, {duree_lisible(total)} de film, "
          f"{SORTIE_TOURNAGE.stat().st_size // 1024} Ko")
