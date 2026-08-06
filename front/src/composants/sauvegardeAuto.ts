import { useEffect, useRef, useState } from 'react';

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
): { etat: EtatSauvegarde; forcer: () => void } {
  const { delai = 2500, actif = true } = options;

  const [etat, setEtat] = useState<EtatSauvegarde>('repos');
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
      setEtat('enregistre');
    } catch {
      setEtat('erreur');
    } finally {
      enCours.current = false;
    }
  };

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

  return { etat, forcer };
}

export const libelleEtat = (e: EtatSauvegarde): string => ({
  repos: '',
  attente: 'modifications non enregistrées…',
  envoi: 'enregistrement…',
  enregistre: 'enregistré',
  erreur: 'échec de l\'enregistrement',
}[e]);
