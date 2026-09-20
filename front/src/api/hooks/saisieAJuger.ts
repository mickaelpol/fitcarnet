import type { SaisieAliment } from './verification';

/* RE-EXPORT DE TYPE UNIQUEMENT. `verification.ts` importe la fonction d'ici,
   et ce module importe le type de la-bas : le cycle n'existe qu'a la
   compilation, ou les types sont effaces. Aucune dependance a l'execution —
   et c'est bien ce qu'on cherche, puisque `verification.ts` tire `client.ts`,
   donc `expo-secure-store`, que node nu ne sait pas charger. C'est ce qui a
   fait echouer la premiere version de ce test. */
export type { SaisieAliment };

/** Les champs qu'on remplit soi-meme : eux seuls font une « saisie ». */
const CHAMPS_TAPES = ['kcal100', 'prot100', 'gluc100', 'lip100', 'fibres100'] as const;

/**
 * Y A-T-IL DE QUOI DERANGER LE SERVEUR ?
 *
 * LE COMMENTAIRE DE `useVerdictAliment` PROMETTAIT CECI SANS QUE RIEN NE LE
 * FASSE — motif 3, releve le 21 septembre 2026. `enabled: interrogee !== null`
 * ne coupait rien : l'editeur est monte en permanence et remonte son etat
 * initial, qui n'est pas `null`. Mesure au navigateur, editeur FERME, a la
 * simple ouverture du frigo :
 *
 *   POST /api/verification/aliment
 *   {"categorie":"prot","kcal100":"", … ,"ratio":"1","ratioCandidat":""}
 *
 * LA CATEGORIE ET LE RENDEMENT NE COMPTENT PAS : ils ont une valeur par defaut
 * (`prot`, `1`) que personne n'a tapee. Les retenir aurait laisse le defaut
 * intact, puisque c'est exactement ce que porte une modale vide.
 *
 * ON REGARDE LE TEXTE, PAS SA VALEUR. `Number('0')` vaut 0, donc faux : un
 * garde ecrit sur la valeur traiterait « 0 g de lipides » comme un champ vide.
 * Vide n'est pas zero (regle 6).
 */
export function ilYAQuelqueChoseAJuger(saisie: SaisieAliment | null): boolean {
  if (saisie === null) return false;

  return CHAMPS_TAPES.some((champ) => saisie[champ].trim() !== '')
    || (saisie.ratioCandidat ?? '').trim() !== '';
}

