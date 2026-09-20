import type { Exercice, Modele, Seance, SeanceExercice } from '@/api/types';
import { idDe, iriDe } from '../api/types';

/**
 * Ce qu'un écran de séance fabrique et compte, hors de React.
 *
 * POURQUOI CES QUATRE FONCTIONS NE VIVENT PLUS DANS `app/seance/[id].tsx`.
 *
 * Elles y étaient écrites en clair, au milieu du corps du composant, et
 * AUCUNE n'était testée. Elles ne pouvaient pas l'être : `tsconfig.tests.json`
 * n'inclut que `src/**\/*.test.ts`, donc un test posé dans `app/` n'est jamais
 * exécuté — et rien, pas un avertissement, ne le dit. Trois règles métier
 * réelles vivaient là sans filet.
 *
 * Descendues le 15 septembre 2026 (rang 12 du lot 6 de l'audit de septembre),
 * à comportement strictement identique.
 *
 * `blocDepuisExercice` reçoit le format déjà lu plutôt que d'appeler
 * `lireFormat`. LA RAISON ÉCRITE ICI ÉTAIT FAUSSE : elle affirmait que
 * « `tsconfig.tests.json` ne pose aucune option `jsx` », alors que ce fichier
 * porte `"jsx": "react-jsx"` depuis les tests de rendu — et le dit lui-même,
 * en ajoutant que « plus rien n'empêche un .test.ts d'importer une VALEUR
 * depuis un .tsx ». Un relecteur qui vérifiait l'affirmation voyait que ça
 * compile et en concluait qu'il pouvait importer. Ce qu'il aurait découvert à
 * l'exécution, pas au typage : c'est pire.
 *
 * Le point est sans objet depuis le 20 septembre 2026 : `lireFormat` vit dans
 * CE fichier. Le paramètre reste pour l'instant, pour ne pas mélanger un
 * déménagement et un changement d'interface dans le même commit.
 *
 * @see blocSeance.test.ts
 */

/** Ce qu'une séance passée dit d'un exercice : une ligne par série faite. */
export interface SerieFaite {
  reps: number | null;
  poids: number | null;
  secondes: number | null;
}

/** Le format prescrit d'un exercice, tel que `lireFormat` le rend. */
export interface FormatPrescrit {
  series: number;
  reps: number;
}

/**
 * Combien de séries sont cochées, sur combien.
 *
 * Un exercice « for time » n'a qu'un temps total : ses lignes
 * supplémentaires ne comptent pas comme des séries.
 *
 * `parId` sert à retrouver le mode par défaut d'un exercice que le bloc ne
 * précise pas. Un exercice absent du catalogue — il peut ne pas avoir chargé —
 * retombe sur « charge », donc sur le décompte complet.
 */
export function avancementDe(
  exercices: readonly SeanceExercice[],
  parId: ReadonlyMap<number, Exercice>,
): { faites: number; total: number } {
  return exercices.reduce(
    (acc, b) => {
      const mode = b.mode ?? parId.get(idDe(b.exercice))?.modeDefaut ?? 'charge';
      const series = mode === 'chrono' ? b.series.slice(0, 1) : b.series;

      return {
        faites: acc.faites + series.filter((s) => s.faite).length,
        total: acc.total + series.length,
      };
    },
    { faites: 0, total: 0 },
  );
}

/**
 * Le bloc qu'on ajoute à une séance quand on choisit un exercice.
 *
 * On reprend ce qui a été FAIT la dernière fois : mêmes charges, mêmes
 * répétitions. C'est le point de départ utile — le format prescrit ne sert
 * que la première fois, faute de mieux.
 *
 * Un `derniereFois` VIDE reste une réponse : zéro série proposée, et non un
 * repli silencieux sur le format prescrit. Vide n'est pas absent.
 */
export function blocDepuisExercice(
  exercice: Exercice,
  ordre: number,
  derniereFois: readonly SerieFaite[] | undefined,
  format: FormatPrescrit | null,
): SeanceExercice {
  const series = derniereFois !== undefined
    ? derniereFois.map((x, i) => ({
        ordre: i, reps: null, poids: null, secondes: null, faite: false,
        repsCible: x.reps, poidsCible: x.poids, secondesCible: x.secondes,
      }))
    : Array.from({ length: format?.series ?? 3 }, (_, i) => ({
        ordre: i, reps: null, poids: null, secondes: null, faite: false,
        repsCible: format?.reps ?? null, poidsCible: null, secondesCible: null,
      }));

  return {
    exercice: exercice['@id'], ordre,
    mode: exercice.modeDefaut, notes: null, secondesTotal: null, series,
  };
}

/**
 * Partir d'un modèle : on copie ses exercices, ses cibles deviennent
 * les objectifs affichés en filigrane pendant la saisie.
 *
 * L'ordre vient de la POSITION dans le modèle, pas du champ `ordre` : un
 * modèle dont les ordres ont des trous ne les propage pas à la séance.
 */
export function blocsDepuisModele(modele: Modele): SeanceExercice[] {
  return modele.exercices.map((me, i) => ({
    exercice: iriDe(me.exercice),
    ordre: i,
    mode: me.mode,
    notes: null,
    secondesTotal: null,
    series: me.series.map((ms, j) => ({
      ordre: j, reps: null, poids: null, secondes: null, faite: false,
      repsCible: ms.repsCible, poidsCible: ms.poidsCible, secondesCible: ms.secondesCible,
    })),
  }));
}

/**
 * L'aperçu de ce que le raccourci « ↓ dernière fois » va appliquer.
 *
 * IL ÉTAIT AVEUGLE À L'ISOMÉTRIE, et donc invisible en mode « Tenue ». Écrit en
 * clair dans `exerciceSeance.tsx`, il ne gardait que les séries portant des
 * `reps` ou un `poids` : une séance de gainage n'en produit aucune — rien que
 * des `secondes` —, la liste devenait vide, l'aperçu valait `''`, et le
 * raccourci n'était **jamais proposé**. `rechargerDerniereFois`, lui, savait
 * pourtant restaurer les `secondesCible` depuis toujours. Une fonctionnalité
 * éteinte pour un mode entier, sans le moindre signal. Trouvé par la revue le
 * 16 septembre 2026, le jour où le mode est devenu choisissable dans un modèle.
 *
 * DESCENDU ICI POUR ÊTRE ÉPROUVÉ : dans un `.tsx`, aucun test ne l'atteignait.
 *
 * `nombre` est injecté plutôt qu'importé : le formateur du projet vit dans
 * `@/theme`, et ce module n'a aucune raison de dépendre de l'habillage. L'écran
 * passe le sien, le test passe le sien, et l'affichage reste celui d'ailleurs.
 */
export function apercuDerniereFois(
  derniereFois: readonly SerieFaite[] | undefined,
  nombre: (v: number) => string,
): string {
  return (derniereFois ?? [])
    .map((x) => {
      /* LES RÉPÉTITIONS PASSENT AVANT LES SECONDES, et l'ordre a été corrigé le
         16 septembre 2026. En ajoutant le cas « secondes » je l'avais placé en
         tête : une série portant À LA FOIS des répétitions et une durée — il en
         existe, `exerciceSeance.tsx:60` rappelle qu'avant le temps global le
         chrono était stocké sur la première série — voyait son aperçu passer de
         « 12 rép » à « 45 s », alors que le bouton recharge les deux. La revue
         l'a relevé. L'ajout doit être un REPLI, pas une priorité : ainsi aucun
         mode existant ne change d'affichage. */
      if (x.reps !== null && x.poids !== null) return `${x.reps}×${nombre(x.poids)}`;
      if (x.reps !== null) return `${x.reps} rép`;
      if (x.poids !== null) return `${nombre(x.poids)} kg`;

      return x.secondes !== null ? `${x.secondes} s` : '';
    })
    .filter(Boolean)
    .slice(0, 4)
    .join(' · ');
}

/**
 * Recopie le seul identifiant qui compte : celui de la séance.
 *
 * Sans lui, l'enregistrement suivant repartirait sur un POST et créerait une
 * deuxième séance. On ne remplace pas l'état par la réponse : ce qui a été
 * tapé pendant les deux secondes et demie d'attente serait perdu.
 *
 * Les identifiants des exercices et des séries ne sont PAS recopiés, et c'est
 * volontaire. Ils ne figurent que dans le groupe `seance:lire` — le front ne
 * les renvoie jamais, l'API remplace la collection entière à chaque écriture.
 * Ils ne servaient donc qu'à fabriquer les clés de liste, où les greffer
 * faisait passer une ligne de « n0 » à « 12 » : React la remontait, et le
 * champ en cours de saisie perdait le focus au beau milieu d'une frappe.
 */
export const avecIdentifiantSeance = (locale: Seance, distante: Seance): Seance =>
  (locale.id === undefined ? { ...locale, id: distante.id } : locale);

/**
 * « 4 s × 12 rép » → { series: 4, reps: 12 }
 *
 * DESCENDU LE 20 SEPTEMBRE 2026 (palier 0) depuis
 * `composants/exerciceSeance.tsx`. C'est une regle metier — le format prescrit
 * d'un exercice, tel qu'un administrateur l'ecrit — et elle vivait dans un
 * `.tsx`, donc sans test.
 *
 * Elle forcait en plus un contournement dans ce module meme : `blocDepuisExercice`
 * recevait le format DEJA LU en parametre, faute de pouvoir l'appeler. Ce
 * parametre peut redevenir un appel le jour ou quelqu'un le decide ; en
 * attendant, la signature ne bouge pas, pour que ce commit ne melange pas un
 * demenagement et un changement d'interface.
 *
 * CE QUI NE RECONNAIT PAS LE FORMAT REND `null`, ET NON UN FORMAT PAR DEFAUT.
 * Un administrateur peut ecrire « au feeling » ou « 3 x AMRAP » : inventer
 * 3 series de 10 remplirait l'ecran de chiffres que personne n'a prescrits.
 */
export function lireFormat(f: string | null): FormatPrescrit | null {
  if (!f) return null;

  const m = /(\d+)\s*s\s*[×x]\s*(\d+)\s*r[ée]p/i.exec(f);

  return m ? { series: Number(m[1]), reps: Number(m[2]) } : null;
}
