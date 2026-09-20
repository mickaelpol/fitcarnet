import { comptesJetablesRestants, SUFFIXE } from './compteJetable';

/**
 * LA PREUVE QU'IL NE RESTE RIEN.
 *
 * Ne pas se contenter de supprimer : COMPTER APRÈS. C'est ce que la skill
 * `donnees-de-test` exige, et c'est ce qui distingue « j'ai lancé les DELETE »
 * de « la base est revenue à son état ».
 *
 * Si une épreuve tombe au milieu, son compte peut survivre. On le dit fort
 * plutôt que de le laisser traîner : un compte jetable oublié fausse le relevé
 * de la fois suivante.
 */
export default function menage(): void {
  const restants = comptesJetablesRestants();

  if (restants > 0) {
    throw new Error(
      `${restants} compte(s) jetable(s) en ${SUFFIXE} sont restés en base.\n`
      + 'Une épreuve est probablement tombée avant son nettoyage. À retirer :\n'
      + `  docker exec fitcarnet-db-dev psql -U fitcarnet -c "DELETE FROM utilisateur WHERE email LIKE '%${SUFFIXE}'"\n`
      + '(supprimer d\'abord leur stock puis leurs aliments — voir compteJetable.ts)');
  }
}
