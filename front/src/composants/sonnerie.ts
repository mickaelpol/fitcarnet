import { useEffect, useState } from 'react';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { coffre } from '@/api/client';

/**
 * Sonnerie de fin de repos.
 *
 * Des fichiers plutôt qu'une synthèse : l'ancienne version ne produisait de
 * son que sur le web, faute d'API équivalente en natif. En salle, le
 * téléphone ne faisait donc que vibrer, sans que rien ne l'annonce.
 */
export interface Sonnerie {
  cle: string;
  libelle: string;
  description: string;
  source: number;
}

/* eslint-disable @typescript-eslint/no-require-imports */
export const SONNERIES: Sonnerie[] = [
  {
    cle: 'buzzer',
    libelle: 'Buzzer',
    description: 'six bips stridents — perce par-dessus la musique',
    source: require('../../assets/sons/buzzer.mp3'),
  },
  {
    cle: 'montante',
    libelle: 'Montante',
    description: 'arpège ascendant — présent sans crisper',
    source: require('../../assets/sons/montante.mp3'),
  },
  {
    cle: 'cloche',
    libelle: 'Cloche',
    description: 'un coup, longue résonance',
    source: require('../../assets/sons/cloche.mp3'),
  },
  {
    cle: 'trois-coups',
    libelle: 'Trois coups',
    description: 'bref et grave — le plus discret',
    source: require('../../assets/sons/trois-coups.mp3'),
  },
  {
    cle: 'douce',
    libelle: 'Douce',
    description: 'trois notes rondes — peut se perdre en salle',
    source: require('../../assets/sons/douce.mp3'),
  },
];
/* eslint-enable @typescript-eslint/no-require-imports */

export const SONNERIE_DEFAUT = 'buzzer';

const CLE = 'fitcarnet.sonnerie';

/** Lue une fois, gardée en mémoire : la fin d'un décompte ne doit pas attendre. */
let choisie: string = SONNERIE_DEFAUT;
let chargee = false;

export async function chargerSonnerie(): Promise<string> {
  if (!chargee) {
    const v = await coffre.lire(CLE);
    choisie = SONNERIES.some((s) => s.cle === v) ? (v as string) : SONNERIE_DEFAUT;
    chargee = true;
  }

  return choisie;
}

export async function definirSonnerie(cle: string): Promise<void> {
  choisie = cle;
  chargee = true;
  await coffre.ecrire(CLE, cle);
}

/** Hook de lecture du réglage, pour l'écran de réglages. */
export function useSonnerie(): [string, (cle: string) => void] {
  const [cle, setCle] = useState(choisie);

  useEffect(() => { void chargerSonnerie().then(setCle); }, []);

  return [cle, (v) => { setCle(v); void definirSonnerie(v); }];
}

/**
 * Joue une sonnerie.
 *
 * Un lecteur neuf à chaque fois, libéré ensuite : garder un lecteur en vie
 * retiendrait la session audio du téléphone, ce qui coupe la musique de
 * l'utilisateur entre deux séries.
 */
export function jouerSonnerie(cle: string = choisie): void {
  const son = SONNERIES.find((s) => s.cle === cle) ?? SONNERIES[0];
  if (son === undefined) return;

  try {
    // Le décompte se termine souvent écran verrouillé ou app en second plan :
    // sans ce mode, Android et iOS étouffent la lecture.
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true })
      .catch(() => undefined);

    const lecteur = createAudioPlayer(son.source);
    lecteur.play();

    // Durée la plus longue du lot, marge comprise.
    setTimeout(() => { try { lecteur.release(); } catch { /* déjà libéré */ } }, 4000);
  } catch { /* pas de son : le décompte reste visible, et la vibration part */ }
}
