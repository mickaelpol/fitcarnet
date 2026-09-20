import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../client';

/**
 * CE QUE L'ECRAN DOIT DIRE, DEMANDE AU SERVEUR.
 *
 * Decision du 20 septembre 2026 : « tout doit passer par le serveur car le
 * metier doit etre sur le serveur et puis c'est tout, comme ca je peux changer
 * le front quand bon me semble ».
 *
 * Ce hook ne juge RIEN. Il transmet ce qui est tape et rend ce qui revient.
 * Un front ecrit demain dans une autre technologie appelle la meme route et
 * obtient les memes phrases — il n'a rien a reimplementer, donc rien a oublier
 * de reimplementer.
 */

/** Une raison, et le champ qu'elle vise — pour que l'ecran puisse souligner. */
export interface Grief {
  champ: string;
  message: string;
}

/** La teinte du bandeau est une DECISION du serveur, pas un style du front. */
export type Verdict = 'coherent' | 'ecart' | 'incoherent' | 'indecidable';

export interface VerdictAliment {
  refus: Grief[];
  avertissements: Grief[];
  /** La phrase du bandeau de controle, telle que le serveur la formule. */
  resume: string;
  verdict: Verdict;
  /**
   * Une conversion kilojoules -> calories a PROPOSER, ou `null`.
   *
   * A ne pas confondre avec un refus : le refus dit « non », ceci offre un
   * correctif en un geste. Les deux peuvent parler en meme temps, et c'est le
   * comportement d'avant la refonte — qui ne doit rien changer de visible.
   */
  conversion: { saisi: number; converti: number; motif: 'plafond' | 'rapport' } | null;
  /**
   * Le rendement qu'on vient de MESURER, juge a part.
   *
   * L'ecran propose « utiliser ce resultat » apres deux pesees : c'est un
   * candidat, pas la valeur en cours. Sans cette reponse distincte, l'ecran
   * aurait garde un juge local pour ce seul bouton.
   */
  candidat: { acceptable: boolean; motif: string | null } | null;
  enregistrable: boolean;
}

/** Ce que l'ecran envoie : les champs TELS QU'ILS SONT TAPES. */
export interface SaisieAliment {
  categorie: string;
  kcal100: string;
  prot100: string;
  gluc100: string;
  lip100: string;
  fibres100: string;
  ratio: string;
  /** Le rendement issu des deux pesees en cours, s'il y en a. */
  ratioCandidat?: string;
  /**
   * CE QUE LA FICHE PORTAIT DEJA, sur une correction.
   *
   * Un aliment incoherent deja en base — migre avant que la regle existe —
   * doit pouvoir etre renomme. Le serveur ne le lit PAS en base : l'ecran le
   * declare. Cette route n'a donc rien a lire, et la regle 2 n'a pas de
   * nouveau chemin a garder.
   *
   * Absent sur une creation : tout y est nouveau, ce qui est exactement juste.
   */
  origine?: Omit<SaisieAliment, 'origine' | 'ratioCandidat'>;
}

/**
 * Le verdict de la saisie en cours.
 *
 * `placeholderData: keepPreviousData` EST LA PIECE QUI EVITE LE CLIGNOTEMENT :
 * pendant qu'une reponse arrive, l'ecran garde la precedente au lieu de vider
 * le bandeau. Sans elle, le message disparaitrait a chaque frappe et
 * reapparaitrait — ce qui serait pire que l'ancien calcul local.
 *
 * `enabled` coupe l'appel tant que rien n'est saisi : une modale qui s'ouvre
 * ne doit pas interroger le serveur pour lui dire qu'elle est vide.
 */
export function useVerdictAliment(saisie: SaisieAliment | null) {
  const requete = useQuery({
    queryKey: ['verdict-aliment', saisie],
    enabled: saisie !== null,
    /* Le verdict ne vieillit pas : pour une saisie donnee, la reponse est
       toujours la meme. On ne redemande donc jamais la meme. */
    staleTime: Infinity,
    gcTime: 60_000,
    placeholderData: (precedent: VerdictAliment | undefined) => precedent,
    queryFn: () => api<VerdictAliment>(
      '/verification/aliment', { methode: 'POST', corps: saisie }),
  });

  /* CE QU'ON REND EST-IL LE VERDICT DE CETTE SAISIE, OU DE LA PRECEDENTE ?
     
     RELEVE PAR `revue-pile` LE 20 SEPTEMBRE 2026. `placeholderData` garde la
     reponse precedente pendant l'attente — c'est ce qui evite le
     clignotement — mais l'ecran l'affichait comme si elle etait courante.
     Deux scenarios, tous deux visibles :
     
       - on ferme un riz refuse, on ouvre une huile saine : pendant
         l'anti-rebond ET l'aller-retour, l'huile porte le refus du riz ;
       - on tape « 350 » (accepte) puis on efface un chiffre : le bandeau dit
         encore « cohérent » en vert sur une valeur que le serveur refuserait.
     
     C'est la regle 7 prise a revers — un chiffre faux affiche — et l'ancien
     code, synchrone, ne pouvait pas le produire. L'ecran doit donc savoir
     distinguer les deux, et c'est ce que la documentation de TanStack Query
     nomme `isPlaceholderData`. */
  return {
    ...requete,
    verdict: requete.data,
    /** Vrai quand ce qui est rendu decrit une saisie PRECEDENTE. */
    perime: requete.isPlaceholderData,
  };
}

/**
 * La meme valeur, mais en retard.
 *
 * L'ANTI-REBOND EST CE QUI REND L'APPEL SUPPORTABLE : sans lui, chaque
 * caractere tape partirait au serveur. Avec, c'est un appel par PAUSE de
 * frappe. 250 ms est le delai au-dela duquel une frappe cesse d'etre une
 * frappe — assez court pour que le verdict paraisse immediat, assez long pour
 * qu'ecrire « 350 » ne fasse qu'un appel.
 *
 * Combine a `placeholderData`, l'ecran garde le verdict precedent pendant
 * l'attente : rien ne clignote, rien ne disparait.
 */
export function useRetarde<T>(valeur: T, millisecondes = 250): T {
  const [retarde, setRetarde] = useState(valeur);

  useEffect(() => {
    const minuterie = setTimeout(() => setRetarde(valeur), millisecondes);

    return () => clearTimeout(minuterie);
  }, [valeur, millisecondes]);

  return retarde;
}
