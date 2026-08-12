import { useEffect, useState } from 'react';

import { abonnerJeton, chargerJeton } from './client';

/**
 * SOMMES-NOUS CONNECTÉS ?
 *
 * Trois réponses, et la troisième compte autant que les deux autres :
 * `true`, `false`, et `null` tant qu'on n'a pas fini de lire le coffre.
 *
 * Confondre `null` et `false` renverrait tout le monde vers l'écran de
 * connexion à chaque démarrage, une fraction de seconde, avant de revenir —
 * y compris ceux qui sont parfaitement connectés. « Je ne sais pas encore »
 * n'est pas « non ».
 */
export function useConnecte(): boolean | null {
  const [connecte, setConnecte] = useState<boolean | null>(null);

  useEffect(() => {
    let vivant = true;
    void chargerJeton().then((j) => {
      if (vivant) setConnecte(j !== null && j !== '');
    });

    /* Et on suit les changements : une déconnexion, une session expirée, une
       connexion réussie. Le portier réagit sans attendre un changement
       d'écran. */
    const desabonner = abonnerJeton((v) => { if (vivant) setConnecte(v); });

    return () => { vivant = false; desabonner(); };
  }, []);

  return connecte;
}
