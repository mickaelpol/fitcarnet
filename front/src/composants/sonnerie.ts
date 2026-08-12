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
/**
 * LES CINQ FICHIERS SONT AUSSI DES RESSOURCES ANDROID.
 *
 * `app.json` les déclare dans le greffon `expo-notifications`, qui les copie
 * dans `res/raw` de l'APK. Android exige alors des noms de ressource en
 * `[a-z0-9_]` — **pas de tiret, pas de majuscule**. L'ancienne sonnerie
 * « trois-coups » aurait fait échouer la compilation native, avec un message
 * parlant de ressource invalide et pas du tiret.
 *
 * Les clés servent donc trois fois : le nom du fichier, la ressource Android,
 * et l'identifiant du canal de notification. Une seule chaîne, trois usages,
 * aucune table de correspondance à tenir à jour.
 */
export const SONNERIES: Sonnerie[] = [
  {
    cle: 'bois',
    libelle: 'Bois',
    description: 'trois lames de marimba qui montent — chaud et bref',
    source: require('../../assets/sons/bois.wav'),
  },
  {
    cle: 'rappel',
    libelle: 'Rappel',
    description: 'trois groupes de deux notes — pour la salle, par-dessus la musique',
    source: require('../../assets/sons/rappel.wav'),
  },
  {
    cle: 'harpe',
    libelle: 'Harpe',
    description: 'cinq notes pincées ascendantes — présente sans presser',
    source: require('../../assets/sons/harpe.wav'),
  },
  {
    cle: 'cloche',
    libelle: 'Cloche',
    description: 'un coup, longue résonance — le plus calme',
    source: require('../../assets/sons/cloche.wav'),
  },
  {
    cle: 'gong',
    libelle: 'Gong',
    description: 'grave et long — ne dérange personne autour',
    source: require('../../assets/sons/gong.wav'),
  },
];
/* eslint-enable @typescript-eslint/no-require-imports */

export const SONNERIE_DEFAUT = 'bois';

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
