import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

export type EtatSauvegarde = 'repos' | 'attente' | 'envoi' | 'enregistre' | 'erreur';

/**
 * Sauvegarde différée : on attend que la saisie se calme avant d'envoyer,
 * plutôt que de solliciter le réseau à chaque frappe.
 *
 * En salle, on n'appuie pas sur un bouton entre deux séries : la séance doit
 * se sauvegarder toute seule, sinon une fermeture d'application la perd.
 */
export function useSauvegardeAuto<T>(
  valeur: T | null,
  enregistrer: (v: T) => Promise<unknown>,
  options: { delai?: number; actif?: boolean } = {},
): { etat: EtatSauvegarde; motif: string | null; forcer: () => void } {
  const { delai = 2500, actif = true } = options;

  const [etat, setEtat] = useState<EtatSauvegarde>('repos');
  /* Le MOTIF de l'echec, pas seulement le fait qu'il ait eu lieu. Un point
     rouge et « echec de l'enregistrement » ne disent pas si le reseau est
     tombe, si l'API refuse la donnee ou si le jeton a expire — et pendant
     ce temps la seance se perd sans qu'on sache quoi corriger. */
  const [motif, setMotif] = useState<string | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const derniereEnvoyee = useRef<string | null>(null);
  const enCours = useRef(false);
  const valeurCourante = useRef<T | null>(valeur);

  valeurCourante.current = valeur;

  const envoyer = async () => {
    const v = valeurCourante.current;
    if (v === null || enCours.current) return;

    const signature = JSON.stringify(v);
    if (signature === derniereEnvoyee.current) return;

    enCours.current = true;
    setEtat('envoi');
    try {
      await enregistrer(v);
      derniereEnvoyee.current = signature;
      setMotif(null);
      setEtat('enregistre');
    } catch (e) {
      setMotif(e instanceof Error ? e.message : String(e));
      setEtat('erreur');
    } finally {
      enCours.current = false;
    }
  };

  /* CE QUI SUIT EXISTE PARCE QUE 2,5 SECONDES SUFFISENT A PERDRE UNE SAISIE.
     On tape une charge, on repose le telephone ou on revient en arriere : la
     minuterie n'a pas fini de courir, l'ecran se demonte, et la valeur part
     avec lui. En salle, ce n'est pas un cas limite — c'est le geste normal.

     ON PASSE PAR UNE REFERENCE VERS `envoyer`, ET C'EST INDISPENSABLE. L'effet
     ci-dessous ne s'installe qu'une fois (aucune dependance, sinon il se
     reinstallerait a chaque rendu et le nettoyage enregistrerait en boucle).
     Sans cette reference, il capturerait le `enregistrer` du PREMIER rendu et
     rejouerait une fonction perimee au pire moment. */
  const envoyerRef = useRef(envoyer);
  envoyerRef.current = envoyer;
  const actifRef = useRef(actif);
  actifRef.current = actif;

  useEffect(() => {
    const vider = (): void => {
      if (!actifRef.current) return;
      if (minuteur.current) clearTimeout(minuteur.current);
      /* `envoyer` compare la signature a la derniere envoyee : appele pour
         rien, il ne fait rien. On peut donc etre large sans risquer d'ecrire
         deux fois la meme chose. */
      void envoyerRef.current();
    };

    // Arriere-plan, ecran verrouille, onglet du navigateur masque.
    const abonnement = AppState.addEventListener('change', (etatAppli) => {
      if (etatAppli !== 'active') vider();
    });

    // Sortie de l'ecran. La requete part meme si le composant disparait :
    // elle ne depend plus de lui une fois lancee.
    return () => {
      abonnement.remove();
      vider();
    };
  }, []);

  useEffect(() => {
    if (!actif || valeur === null) return;

    const signature = JSON.stringify(valeur);
    // première valeur reçue : on l'enregistre comme référence sans l'envoyer
    if (derniereEnvoyee.current === null) {
      derniereEnvoyee.current = signature;

      return;
    }
    if (signature === derniereEnvoyee.current) return;

    setEtat('attente');
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => { void envoyer(); }, delai);

    return () => { if (minuteur.current) clearTimeout(minuteur.current); };
  }, [valeur, actif, delai]);

  /** Marque la valeur courante comme déjà enregistrée (après une création). */
  const forcer = () => {
    if (minuteur.current) clearTimeout(minuteur.current);
    void envoyer();
  };

  return { etat, motif, forcer };
}

export const libelleEtat = (e: EtatSauvegarde): string => ({
  repos: '',
  attente: 'modifications non enregistrées…',
  envoi: 'enregistrement…',
  enregistre: 'enregistré',
  erreur: 'échec de l\'enregistrement',
}[e]);
