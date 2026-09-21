import type { Aliment } from '../solveur/types';

/**
 * Du groupe CIQUAL vers la categorie du calculateur.
 *
 * DESCENDUE LE 20 SEPTEMBRE 2026 (palier 0) depuis `app/migration-grocy.tsx`,
 * ou ces onze correspondances vivaient sans test possible. Ce qu'elles
 * decident n'est pas cosmetique : la categorie fixe le ROLE de l'aliment dans
 * le calculateur, et le serveur s'en sert pour juger un rendement
 * cru/cuit. Une categorie devinee de travers classe un aliment dans le mauvais
 * role, en silence.
 *
 * CE QUE L'ABSENCE DE TEST CACHAIT : `case '13000'` etait du code MORT.
 * `slice(0, 2)` rend deux caracteres, jamais cinq, et `case '13'` repondait
 * deja deux lignes plus haut. Retire.
 *
 * ELLE NE COUVRE VOLONTAIREMENT PAS TOUT. Ce qu'on ne sait pas reste vide, et
 * le bouton d'envoi attend la saisie — regle 6. Repondre « autre » ferait
 * passer l'aliment en silence avec un role que personne n'a choisi.
 *
 * LE TYPE DE RETOUR EST LA VRAIE CATEGORIE, et non `string` comme avant : une
 * faute de frappe passait le typage et se faisait refuser par le serveur avec
 * un 422 opaque, une fois la saisie terminee.
 */
export function categorieDepuisCiqual(sousgroupeCode: string): Aliment['categorie'] | '' {
  switch (sousgroupeCode.slice(0, 2)) {
    case '01': return 'autre';   // entrees et plats composes
    case '02': return 'prot';    // viandes, oeufs, poissons
    case '03': return 'fec';     // produits cerealiers
    case '04': return 'lait';    // laits et produits laitiers
    case '09': return 'prot';    // viandes et charcuteries
    case '11': return 'prot';    // poissons et fruits de mer
    case '12': return 'lait';
    case '13': return 'huile';   // huiles et graisses
    case '15': return 'ole';     // fruits a coque et graines
    case '20': return 'leg';     // legumes
    default: return '';
  }
}
