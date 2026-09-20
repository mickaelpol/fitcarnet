/* IMPORT RELATIF, ET CE N'EST PAS UN DETAIL DE STYLE. `npm test` compile
   `src/` vers `dist-tests/` et lance Node dessus : l'alias `@/` n'y est pas
   reecrit, et un module de calcul qui l'utilise pour une VALEUR tombe sur
   « Cannot find module '@/theme' » au lancement. Les alias ne survivent que
   sur les imports de TYPE, qui s'effacent a la compilation. */
import { nb } from '../theme';

/**
 * Ce qu'une boîte de batch cooking dit d'elle-même sans qu'on la déplie.
 *
 * RAPATRIÉ LE 20 SEPTEMBRE 2026 (palier 0). Cette ligne était écrite DEUX
 * fois, mot pour mot, dans deux composants :
 *
 *     front/src/composants/etapeBatch.tsx:161
 *     front/src/composants/planRelu.tsx:163
 *
 * Même `reduce`, même `nb()`, même mot « personnes », même séparateur —
 * jusqu'aux deux espaces autour du point médian. Le motif du jumeau oublié
 * dans sa forme la plus pure : deux endroits à corriger le jour où on veut
 * dire autre chose, et rien pour signaler qu'on en a oublié un.
 *
 * UNE SEULE DIFFÉRENCE ENTRE LES DEUX, ET ELLE EST VOULUE. `planRelu` fond
 * les aliments crus dans la liste de la boîte : il n'a rien à annoncer « à
 * ajouter après », ce serait les compter deux fois. `etapeBatch` les garde à
 * part et doit le dire. D'où `crusAAjouter`, un nombre et non un booléen :
 * l'appelant décide de ce qu'il a déjà montré.
 */

/** Une ligne cuite, réduite à ce qui pèse. */
interface LigneCuite {
  assiette: number;
}

/** Ce qu'il y a de cuit dans la boîte, en grammes servis. */
export const grammesCuitsDeLaBoite = (cuits: readonly LigneCuite[]): number =>
  cuits.reduce((n, x) => n + x.assiette, 0);

/**
 * Le résumé replié.
 *
 * Le nombre de convives n'apparaît **qu'à partir de deux** : « 1 personne »
 * serait du bruit sur la quasi-totalité des boîtes.
 */
export function resumeDeBoite(boite: {
  cuits: readonly LigneCuite[];
  convives: number;
  crusAAjouter: number;
}): string {
  return `${nb(grammesCuitsDeLaBoite(boite.cuits))} g cuits`
    + (boite.convives > 1 ? `  ·  ${boite.convives} personnes` : '')
    + (boite.crusAAjouter > 0 ? `  ·  ${boite.crusAAjouter} à ajouter après` : '');
}
