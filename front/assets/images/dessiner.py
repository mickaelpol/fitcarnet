"""
L'identite visuelle de fitcarnet, dessinee depuis la charte.

Rien n'est choisi ici : le fond, l'accent et les quatre couleurs de macro
viennent de `src/theme/index.ts`, la police est celle des chiffres de
l'application. Une icone qui n'a pas les couleurs de l'ecran qu'elle ouvre
n'est pas une icone, c'est un autocollant.
"""
from PIL import Image, ImageDraw, ImageFont

FOND    = (0x14, 0x16, 0x1a)   # C.fond
VIF     = (0xe3, 0xb2, 0x3c)   # C.vif — le dore, accent ET feculents
PROT    = (0x7b, 0xa7, 0xdd)
LIP     = (0xe0, 0x90, 0x6a)
LEG     = (0x5e, 0xc0, 0x80)
LIGNE   = (0x2f, 0x34, 0x3d)

POLICE = "node_modules/@expo-google-fonts/barlow-condensed/BarlowCondensed_700Bold.ttf"

# L'anneau des quatre macros : c'est le code couleur de toute l'application,
# et le seul motif qui la resume. Il se lit encore a 48 px, ce qu'aucun
# pictogramme detaille ne fait.
ARCS = [(PROT, -90, 0), (VIF, 0, 90), (LIP, 90, 180), (LEG, 180, 270)]


def anneau(d, boite, epaisseur):
    for couleur, debut, fin in ARCS:
        # 2 degres de retrait a chaque extremite : les quatre arcs se
        # touchent sans se melanger, et la separation reste visible meme
        # quand l'icone est reduite.
        d.arc(boite, debut + 2, fin - 2, fill=couleur, width=epaisseur)


def lettre(d, centre, taille, couleur=VIF):
    f = ImageFont.truetype(POLICE, taille)
    # On centre sur la BOITE ENGLOBANTE reelle du glyphe, pas sur sa ligne de
    # base : un « f » a un jambage et un ascendant, et le centrer sur la
    # ligne de base le pose visiblement trop haut.
    g = d.textbbox((0, 0), "f", font=f)
    d.text((centre[0] - (g[0] + g[2]) / 2, centre[1] - (g[1] + g[3]) / 2),
           "f", font=f, fill=couleur)


def icone(taille, marge_sure=0.0, fond=True, rayon=None):
    """`marge_sure` : la part du bord qu'Android peut rogner sur une icone
    adaptative (masque rond, carre, goutte selon le lanceur). Le motif est
    donc dessine plus petit, au centre, pour survivre a tous les masques."""
    img = Image.new("RGBA", (taille, taille), FOND + (255,) if fond else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if fond and rayon:
        img = Image.new("RGBA", (taille, taille), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([0, 0, taille - 1, taille - 1], radius=rayon, fill=FOND)

    utile = taille * (1 - 2 * marge_sure)
    bord = (taille - utile) / 2
    ep = max(2, int(utile * 0.085))
    inset = bord + utile * 0.10
    anneau(d, [inset, inset, taille - inset - 1, taille - inset - 1], ep)
    lettre(d, (taille / 2, taille / 2), int(utile * 0.52))

    return img


# ---- icone carree (iOS, web, magasins) : pas de masque, pas de marge
icone(1024, marge_sure=0.0, rayon=0).save("assets/images/icone.png")

# ---- icone adaptative Android : le premier plan est rogne par le lanceur.
# Android garantit seulement le disque central des deux tiers ; on garde donc
# un quart de vide tout autour, sinon l'anneau se fait couper.
icone(1024, marge_sure=0.25, fond=False).save("assets/images/icone-adaptative.png")

# ---- favicon web
icone(196, rayon=32).save("assets/images/favicon.png")

# ---- ecran de lancement : le meme motif, seul, sur le fond de
# l'application. Expo le pose centre sur `backgroundColor` — l'image ne doit
# donc porter ni fond ni titre, sans quoi on verrait un carre sur un carre.
img = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
anneau(d, [26, 26, 486, 486], 42)
lettre(d, (256, 256), 268)
img.save("assets/images/lancement.png")

# ---- icone de notification Android : silhouette BLANCHE sur transparent.
# Android l'aplatit en une seule couleur ; toute couleur ici deviendrait un
# carre blanc dans la barre d'etat.
img = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
BLANC = (255, 255, 255)
for _, debut, fin in ARCS:
    d.arc([18, 18, 238, 238], debut + 2, fin - 2, fill=BLANC, width=22)
lettre(d, (128, 128), 132, couleur=BLANC)
img.save("assets/images/notification.png")

print("ok")
