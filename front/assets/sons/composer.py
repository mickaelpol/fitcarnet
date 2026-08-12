#!/usr/bin/env python3
"""
Fabrique les sonneries de fin de repos.

    python3 composer.py

POURQUOI ON LES SYNTHETISE PLUTOT QUE DE LES TELECHARGER

Elles doivent etre regenerables, comme les icones : changer une duree ou une
note ne doit pas demander de retrouver un site de bruitages. Et surtout, les
sonneries libres qu'on trouve sont presque toutes concues pour un reveil —
c'est-a-dire pour reveiller quelqu'un, donc stridentes par construction.

CE QUI REND UNE ALARME DESAGREABLE, ET COMMENT ON L'EVITE

1. L'ENERGIE ENTRE 2 ET 5 kHz. C'est la zone ou l'oreille humaine est la plus
   sensible — celle des cris de nourrisson, et celle que visent les alarmes de
   reveil. On filtre donc tout ce qui depasse, et les partiels aigus sont
   attenues bien plus vite que le fondamental.

2. L'ATTAQUE INSTANTANEE. Un son qui passe de zero a son maximum en un
   echantillon produit un clic — le meme que celui d'un haut-parleur qu'on
   branche. Quelques millisecondes de montee suffisent a le supprimer.

3. LA REPETITION RAPIDE ET REGULIERE. Six bips identiques a intervalle fixe,
   c'est une alarme incendie. Trois notes qui montent, c'est une invitation.
   Meme volume, effet inverse.

4. LES PARTIELS HARMONIQUES EXACTS sonnent electroniques ; les cloches
   reelles ont des partiels inharmoniques (2,00 / 2,40 / 3,00 …), et c'est
   precisement ce qui les rend agreables.

CE QU'ON GARDE MALGRE TOUT : `rappel` est concu pour s'entendre en salle,
par-dessus de la musique et des machines. Il est plus fort et plus insistant
que les autres — mais toujours sans rien au-dessus de 4 kHz.

FORMAT : WAV mono 22 050 Hz, 16 bits.

  - WAV et pas MP3 : Android joue ces fichiers depuis `res/raw` pour les
    notifications, et un WAV ne depend d'aucun decodeur.
  - 22 050 Hz suffit : rien dans ces sons ne depasse 4 kHz, et la moitie de la
    frequence d'echantillonnage est le maximum representable (11 kHz ici).
    Doubler la frequence doublerait le poids pour du silence.
"""

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

TAUX = 22_050

# La gamme. Do majeur, sans demi-ton : aucun intervalle qui accroche l'oreille.
DO = 261.63
RE = 293.66
MI = 329.63
SOL = 392.00
LA = 440.00
DO2 = 523.25
MI2 = 659.25
SOL2 = 783.99


def silence(duree):
    return np.zeros(int(duree * TAUX))


def enveloppe(n, attaque, decroissance):
    """Montee douce, descente exponentielle.

    L'attaque supprime le clic. La descente est exponentielle et non lineaire
    parce que c'est ainsi que decroit un objet reel qui vibre — une corde, une
    lame de bois, un metal. Une descente lineaire s'entend comme une coupure.
    """
    t = np.arange(n) / TAUX
    montee = np.clip(t / max(attaque, 1e-6), 0, 1)

    return montee * np.exp(-t / decroissance)


def note(frequence, duree, partiels, attaque=0.006, decroissance=0.5, volume=1.0):
    """Une note = un fondamental et ses partiels, chacun avec sa propre durée.

    `partiels` : liste de (rapport de frequence, amplitude, facteur de duree).
    LES AIGUS S'ETEIGNENT PLUS VITE, toujours : c'est vrai de tout objet reel,
    et c'est ce qui evite qu'un son « brille » desagreablement jusqu'au bout.
    """
    n = int(duree * TAUX)
    t = np.arange(n) / TAUX
    sortie = np.zeros(n)

    for rapport, amplitude, duree_relative in partiels:
        f = frequence * rapport
        if f > TAUX / 2 * 0.9:      # au-dela, le repliement fabrique des sons faux
            continue
        sortie += amplitude * np.sin(2 * np.pi * f * t) * enveloppe(
            n, attaque, decroissance * duree_relative)

    return sortie * volume


# --- timbres -----------------------------------------------------------
# (rapport, amplitude, duree relative)

# Lame de bois : partiels harmoniques hauts mais tres brefs. Chaud, mat.
BOIS = [(1, 1.0, 1.0), (3.9, 0.25, 0.25), (9.2, 0.08, 0.12)]

# Cloche : partiels INHARMONIQUES. C'est ce rapport 2,4 — une tierce mineure
# au-dessus de l'octave — qui donne le timbre « cloche » et non « orgue ».
CLOCHE = [(1, 1.0, 1.0), (2.0, 0.5, 0.7), (2.4, 0.35, 0.55), (3.0, 0.2, 0.4),
          (4.5, 0.1, 0.25)]

# Corde pincee : beaucoup d'harmoniques, decroissance rapide et reguliere.
CORDE = [(1, 1.0, 1.0), (2, 0.45, 0.6), (3, 0.22, 0.45), (4, 0.12, 0.35),
         (5, 0.06, 0.25)]

# Gong grave : peu d'aigus, tres longue resonance.
GONG = [(1, 1.0, 1.0), (1.5, 0.4, 0.9), (2.7, 0.18, 0.5), (3.4, 0.1, 0.35)]


def assembler(evenements, duree_totale):
    """Place chaque note a son instant. `evenements` : (instant, signal)."""
    sortie = silence(duree_totale)
    for instant, signal in evenements:
        debut = int(instant * TAUX)
        fin = min(debut + len(signal), len(sortie))
        sortie[debut:fin] += signal[:fin - debut]

    return sortie


def adoucir(signal, coupure=3800):
    """Coupe ce qui pique.

    Filtre passe-bas d'ordre 4 : au-dela de la coupure, l'attenuation grimpe
    vite. C'est LA ligne qui separe « une alarme » de « un son ». Sans elle,
    les partiels des cloches et des cordes tapent en plein dans la zone ou
    l'oreille est la plus sensible.
    """
    sos = butter(4, coupure, btype='low', fs=TAUX, output='sos')

    return sosfilt(sos, signal)


def resonance(signal, retard=0.055, retour=0.22, repetitions=4):
    """Une reverberation minuscule : le son ne s'arrete pas net.

    Quatre echos espaces de 55 ms, chacun plus faible. Ce n'est pas un effet
    de studio, c'est ce qui manque a un son de synthese pour ne pas sembler
    coupe au couteau — l'equivalent sonore d'une piece, meme petite.
    """
    sortie = signal.copy()
    for i in range(1, repetitions + 1):
        decalage = int(retard * i * TAUX)
        if decalage >= len(signal):
            break
        sortie[decalage:] += signal[:len(signal) - decalage] * (retour ** i)

    return sortie


def ecrire(nom, signal, crete=0.82):
    """Normalise et enregistre.

    ON NE MONTE PAS A 1,0. Une crete a 0,82 laisse de la marge : additionnee a
    la reverberation et aux arrondis de l'encodage, une normalisation pleine
    produit de l'ecretage — un gresillement bref, exactement le genre de detail
    qui fait trouver un son « bon marche ».
    """
    signal = adoucir(signal)
    maximum = np.max(np.abs(signal))
    if maximum > 0:
        signal = signal / maximum * crete

    # Fondu final de 30 ms : une coupure a mi-oscillation s'entend comme un clic.
    n = int(0.03 * TAUX)
    signal[-n:] *= np.linspace(1, 0, n)

    wavfile.write(nom, TAUX, (signal * 32767).astype(np.int16))

    # Verification : la part d'energie au-dessus de 4 kHz. C'est le chiffre qui
    # dit « strident » ou non. Au-dela de 2 %, on entend l'alarme de reveil.
    spectre = np.abs(np.fft.rfft(signal))
    freqs = np.fft.rfftfreq(len(signal), 1 / TAUX)
    aigu = np.sum(spectre[freqs > 4000] ** 2) / max(np.sum(spectre ** 2), 1e-9)

    print(f"  {nom:16} {len(signal) / TAUX:.2f}s   "
          f"aigus>4kHz {aigu * 100:5.2f}%   {len(signal) * 2 / 1024:.0f} Ko")


print("Sonneries de fin de repos")

# 1. BOIS — trois lames qui montent. Chaud, court, sans insistance.
ecrire('bois.wav', resonance(assembler([
    (0.00, note(DO2, 0.9, BOIS, decroissance=0.30)),
    (0.16, note(MI2, 0.9, BOIS, decroissance=0.30)),
    (0.32, note(SOL2, 1.4, BOIS, decroissance=0.45)),
], 2.0), retard=0.045, retour=0.18))

# 2. CLOCHE — un coup, longue resonance. Le plus « calme » du lot.
ecrire('cloche.wav', resonance(assembler([
    (0.00, note(LA, 3.2, CLOCHE, attaque=0.004, decroissance=1.30)),
    (0.02, note(LA * 2, 2.4, CLOCHE, attaque=0.004, decroissance=0.70, volume=0.30)),
], 3.4), retard=0.070, retour=0.25))

# 3. HARPE — cinq notes pincees qui montent. Presente sans etre pressante.
ecrire('harpe.wav', resonance(assembler([
    (0.00, note(DO, 1.6, CORDE, attaque=0.003, decroissance=0.75)),
    (0.11, note(MI, 1.6, CORDE, attaque=0.003, decroissance=0.75)),
    (0.22, note(SOL, 1.6, CORDE, attaque=0.003, decroissance=0.75)),
    (0.33, note(DO2, 1.8, CORDE, attaque=0.003, decroissance=0.90)),
    (0.44, note(MI2, 2.0, CORDE, attaque=0.003, decroissance=1.00)),
], 2.8), retard=0.060, retour=0.22))

# 4. GONG — grave et long. Celui qui ne derange personne autour.
ecrire('gong.wav', resonance(assembler([
    (0.00, note(DO / 2, 3.6, GONG, attaque=0.020, decroissance=1.60)),
    (0.03, note(SOL / 2, 3.0, GONG, attaque=0.020, decroissance=1.20, volume=0.45)),
], 3.8), retard=0.090, retour=0.30, repetitions=5))

# 5. RAPPEL — pour la salle : par-dessus la musique et les machines.
#
# Il est plus insistant, et c'est assume : trois groupes de deux notes,
# separes par un silence. C'est le SILENCE qui le rend audible sans le rendre
# agressif — six bips colles seraient une alarme, six bips en trois groupes
# sont un appel. Toujours rien au-dessus de 4 kHz.
ecrire('rappel.wav', resonance(assembler([
    (0.00, note(SOL2, 0.5, BOIS, decroissance=0.18, volume=1.00)),
    (0.13, note(DO2 * 1.5, 0.5, BOIS, decroissance=0.18, volume=1.00)),
    (0.45, note(SOL2, 0.5, BOIS, decroissance=0.18, volume=1.00)),
    (0.58, note(DO2 * 1.5, 0.5, BOIS, decroissance=0.18, volume=1.00)),
    (0.90, note(SOL2, 0.5, BOIS, decroissance=0.18, volume=1.00)),
    (1.03, note(DO2 * 1.5, 0.9, BOIS, decroissance=0.35, volume=1.00)),
], 2.2), retard=0.040, retour=0.15))

print("\nRappel : les noms de fichiers deviennent des ressources Android")
print("(res/raw). Uniquement [a-z0-9_], pas de tiret, pas de majuscule.")
