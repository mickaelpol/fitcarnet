export type EtatSauvegarde = 'repos' | 'attente' | 'envoi' | 'enregistre' | 'erreur';

/**
 * Sérialise les envois d'une sauvegarde différée : un seul à la fois, et
 * aucune saisie perdue.
 *
 * POURQUOI CE MODULE EST À PART DU HOOK.
 *
 * `useSauvegardeAuto` vit dans React : il ne s'éprouve pas. Sa règle de
 * concurrence tenait en une ligne — `if (enCours.current) return;` — et cette
 * ligne PERDAIT la saisie. On coche une série (l'envoi part, deux secondes de
 * réseau), on tape la charge suivante, on appuie sur Retour : le démontage
 * demande l'envoi, trouve l'autre en vol, et abandonne. Sans réessai, sans un
 * mot. En salle, ce n'est pas un cas limite, c'est le geste normal.
 *
 * La règle est donc écrite ici, où huit tests la tiennent, et le hook ne
 * fournit plus que React autour.
 *
 * @see envoiSerialise.test.ts
 */

/** Où le hook reporte l'avancement, pour l'afficher. */
export interface Journal {
  etat(e: EtatSauvegarde): void;
  motif(m: string | null): void;
}

export interface Envoyeur<T> {
  /**
   * Demande l'envoi de la valeur courante.
   *
   * La valeur est LUE au moment où l'envoi part, pas au moment de la demande :
   * une saisie faite pendant qu'un envoi est en vol sera donc bien celle qui
   * partira ensuite.
   */
  envoyer(lire: () => T | null): Promise<void>;
}

export function creerEnvoyeur<T>(
  enregistrer: (v: T) => Promise<unknown>,
  journal: Journal,
): Envoyeur<T> {
  let enCours = false;
  let derniereEnvoyee: string | null = null;
  let redemander = false;

  return {
    async envoyer(lire: () => T | null): Promise<void> {
      /* Un envoi est déjà en vol : on ne le double pas, mais on NOTE qu'il
         faudra regarder à nouveau en sortant. C'est toute la différence avec
         l'abandon d'avant. */
      if (enCours) {
        redemander = true;

        return;
      }

      enCours = true;
      try {
        do {
          redemander = false;

          const v = lire();
          if (v === null) break;

          const signature = JSON.stringify(v);
          if (signature === derniereEnvoyee) break;

          journal.etat('envoi');
          try {
            await enregistrer(v);
            /* La signature n'est retenue qu'APRÈS un succès. Retenue avant,
               une même saisie retentée après un échec passerait pour un
               doublon et ne serait jamais réécrite. */
            derniereEnvoyee = signature;
            journal.motif(null);
            journal.etat('enregistre');
          } catch (e) {
            journal.motif(e instanceof Error ? e.message : String(e));
            journal.etat('erreur');
            /* On ne boucle pas sur un échec : réseau coupé, on réessaierait
               sans fin. La saisie suivante relancera. */
            break;
          }
        } while (redemander);
      } finally {
        enCours = false;
      }
    },
  };
}
