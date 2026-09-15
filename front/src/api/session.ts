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
    void chargerJeton().then(
      (j) => { if (vivant) setConnecte(j !== null && j !== ''); },
      /* LIRE LE COFFRE PEUT LEVER, ET ALORS IL FAUT RÉPONDRE QUAND MÊME (F14).
         Sur le web, le coffre est `localStorage` ; en navigation privée, avec
         les cookies bloqués ou le stockage refusé par une politique, il existe
         et JETTE au lieu de rendre `null`. Sans ce second bras, la promesse
         était rejetée sans personne pour l'attraper : `connecte` restait à
         `null` pour toujours, le portier de `_layout.tsx` n'ouvrait jamais, et
         l'application mourait sur son écran de chargement, sans message.
         Une lecture impossible ne prouve aucune session : c'est « non », pas
         « je ne sais pas encore » — sinon on n'affiche rien du tout. */
      () => { if (vivant) setConnecte(false); },
    );

    /* Et on suit les changements : une déconnexion, une session expirée, une
       connexion réussie. Le portier réagit sans attendre un changement
       d'écran. */
    const desabonner = abonnerJeton((v) => { if (vivant) setConnecte(v); });

    return () => { vivant = false; desabonner(); };
  }, []);

  return connecte;
}
