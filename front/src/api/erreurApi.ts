/**
 * L'ERREUR QUE RENVOIE L'API, ET SON STATUT.
 *
 * POURQUOI ELLE VIT DANS SON PROPRE FICHIER
 *
 * Elle était dans `client.ts`, qui importe `react-native` et
 * `expo-secure-store` : deux modules que Node seul ne sait pas charger. Tout
 * test voulant simplement distinguer une panne réseau d'un refus serveur
 * devait donc remplacer `Module._load` avant son `require` — le prix à payer
 * pour une classe de six lignes qui ne dépend de rien.
 *
 * Sortie ici le 18 septembre 2026, en écrivant la règle de réessai du constat
 * M11. `client.ts` la réexporte : rien ne change pour ceux qui l'importaient.
 *
 * LE STATUT ZÉRO N'EST PAS UN STATUT HTTP. C'est la convention du client pour
 * « on n'a jamais eu de réponse » — DNS, coupure, serveur injoignable. Le
 * distinguer d'un refus est ce qui permet de réessayer l'un sans réessayer
 * l'autre.
 */
/** Une raison, et le champ qu'elle vise — pour que l'écran puisse souligner. */
export interface Grief {
  champ: string;
  message: string;
}

export class ErreurApi extends Error {
  /**
   * LES REFUS CHAMP PAR CHAMP D'UN 422 — 26 septembre 2026.
   *
   * L'écriture d'un aliment est jugée par le même `VerdictAliment` que la
   * saisie : quand elle refuse, l'écran doit afficher chaque message SOUS SON
   * CHAMP, pas une phrase recollée dans un bandeau. Toujours un tableau, vide
   * par défaut : l'appelant n'a pas à s'en souvenir à chaque lecture.
   */
  constructor(public readonly statut: number, message: string, public readonly refus: Grief[] = []) {
    super(message);
    this.name = 'ErreurApi';
  }
}
