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


if __name__ == "__main__":
    SORTIE.write_text(construire(), encoding="utf-8")
    print(f"{SORTIE.name} — {SORTIE.stat().st_size // 1024} Ko")
