/**
 * LE CATALOGUE D'EXERCICES VU DE L'ÉCRAN D'ADMINISTRATION : ce qu'on montre,
 * ce qui manque, et où on en est.
 *
 * POURQUOI CE FICHIER EXISTE. Ces six fonctions vivaient dans
 * `app/admin-exercices.tsx`, à deux endroits séparés par quatre cents lignes
 * de rendu — et le fichier documentait DEUX FOIS la même panne, à cinquante
 * lignes d'écart : le filtre « À compléter » et la jauge de progression
 * avaient divergé sur la définition de « renseigné ». La jauge annonçait
 * « 1319/1338 renseignés » pendant que le filtre en listait davantage. Deux
 * chiffres pour une seule question, dont un faux — et c'est celui qu'on lit
 * en premier.
 *
 * Les réunir ici, autour d'`estRenseigne`, rend la divergence IMPOSSIBLE : il
 * n'y a plus qu'une définition à changer. C'était déjà la raison d'être
 * d'`aTraduire`, écrite pour la même panne sur la pastille « FR ».
 *
 * Constat 03-front §4 de l'audit de septembre 2026, découpage du 15 septembre
 * 2026. Rien du comportement n'a changé au passage : l'extraction était
 * mécanique, et `catalogueExercices.test.ts` en tient la preuve — dont un
 * test qui épingle un bug REPRODUIT tel quel (jauge NaN sur base vide).
 *
 * L'écran n'est plus qu'un écran : il appelle, il affiche.
 */

/* IMPORTS RELATIFS POUR LES VALEURS, ET CE N'EST PAS UN CHOIX DE STYLE.
   `tsc -p tsconfig.tests.json` ne réécrit pas l'alias `@/` : un
   `require('@/calcul/texte')` part tel quel dans `dist-tests/` et casse en
   MODULE_NOT_FOUND au `node --test` — pendant que `npm run verif` passe.
   Deux agents y sont tombés le 15 septembre 2026. Un `import type` est
   effacé à la compilation, donc sans danger. */
import type { Exercice } from '../api/types';
import { sansAccent } from '../calcul/texte';
import { casesPour, normaliser, ZONES } from './vocabulaire';

export type Filtre =
  | 'a_completer' | 'sans_muscle' | 'sans_video' | 'sans_nom_fr' | 'perso' | 'tous';

export const FILTRES: { cle: Filtre; libelle: string }[] = [
  { cle: 'a_completer', libelle: 'À compléter' },
  { cle: 'sans_muscle', libelle: 'Sans muscle' },
  { cle: 'sans_video', libelle: 'Sans vidéo' },
  { cle: 'sans_nom_fr', libelle: 'À traduire' },
  /* « Ajoutés dans l'app », et non « Les miens » : depuis que `FiltreExercice`
     applique côté API la règle « public OU le mien », un administrateur ne
     voit plus les exercices privés des autres comptes. Le libellé d'avant
     laissait croire à une distinction de propriétaire qui n'existe plus dans
     ce que l'écran reçoit ; celui-ci parle de la seule chose que la donnée
     dise encore, `source === 'perso'`. */
  { cle: 'perso', libelle: "Ajoutés dans l'app" },
  { cle: 'tous', libelle: 'Tous' },
];

/**
 * UN EXERCICE PERSO N'A RIEN À TRADUIRE.
 *
 * Le nom français vit dans `nomFr`, et le catalogue importé a son nom anglais
 * dans `nom` : traduire, c'est remplir le second à partir du premier. Mais un
 * exercice que tu as créé toi-même s'appelle déjà « Fente bulgare » — dans
 * `nom`. Pour le faire passer au vert, il fallait retaper le même mot dans un
 * second champ : deux endroits pour un seul nom, et le second se périmerait
 * au premier renommage.
 *
 * ILS SONT DONC TRADUITS D'OFFICE, et surtout ils ne comptent NI dans les
 * traduits NI dans le reste à traduire : la question ne se pose pas pour eux.
 * Sans ça le compteur ne pourrait jamais atteindre son total, et un compteur
 * qui n'arrive jamais au bout n'apprend plus rien.
 *
 * CETTE FONCTION EST LA SEULE DÉFINITION. La pastille, le filtre et le
 * compteur s'en servent tous les trois : ils ne peuvent plus se contredire,
 * ce qui est exactement ce qui était arrivé — un « FR » gris sur une fiche
 * où le nom semblait renseigné.
 */
export const aTraduire = (e: Exercice): boolean => e.source !== 'perso' && !e.nomFr;

/**
 * « RENSEIGNÉ » VEUT DIRE ZONE **ET** MUSCLE, ET C'EST LA SEULE DÉFINITION.
 *
 * Le témoin ne regardait que `partieCorps`, choisi parce que c'était alors le
 * seul champ de la fiche à voyager avec la liste. Le muscle y est revenu
 * depuis, et il pèse plus lourd : c'est LUI qui décide sous quelle vignette
 * un exercice se retrouve quand on en cherche un.
 *
 * Un exercice avec une zone mais sans muscle passait donc pour complet, et
 * restait introuvable au filtre — la pire des deux absences, celle qui se
 * croit réglée.
 *
 * La jauge compte ce qui rend `true` ; le filtre « À compléter » liste le
 * reste. Les deux ne peuvent plus diverger, et un test le vérifie.
 */
export const estRenseigne = (e: Exercice): boolean =>
  Boolean(e.partieCorps) && Boolean(e.muscleCible);

/** Le prédicat de chaque filtre, avant la recherche par nom. */
const retenuPar = (e: Exercice, filtre: Filtre): boolean => {
  if (filtre === 'a_completer') return !estRenseigne(e);
  /* SÉPARÉ DE « À compléter », parce que ce n'est pas le même travail.
     Compléter une fiche, c'est saisir plusieurs champs ; rattacher un muscle,
     c'est un appui sur une vignette. Les mélanger ferait remonter un exercice
     presque parfait au milieu de coquilles vides. */
  if (filtre === 'sans_muscle') return !e.muscleCible;
  if (filtre === 'sans_video') return !e.videoUrl;
  if (filtre === 'sans_nom_fr') return aTraduire(e);
  if (filtre === 'perso') return e.source === 'perso';

  return true;
};

/**
 * La liste affichée : le filtre d'abord, la recherche par nom ensuite.
 *
 * La recherche passe par `sansAccent` (module de référence) et regarde les
 * DEUX noms — « bench » trouve l'exercice importé, « développé » trouve sa
 * traduction. Une recherche vide ne retire rien.
 */
export function filtrerExercices(
  exercices: readonly Exercice[], filtre: Filtre, recherche: string,
): Exercice[] {
  const q = sansAccent(recherche.trim());

  return exercices
    .filter((e) => retenuPar(e, filtre))
    .filter((e) => !q || sansAccent(`${e.nom} ${e.nomFr ?? ''}`).includes(q));
}

/**
 * LES ZONES QU'ON PROPOSE SONT CELLES QUI EXISTENT DÉJÀ.
 *
 * Le catalogue est en mémoire ; on lui demande. Une liste écrite à la main
 * finirait par proposer une zone que plus rien n'utilise et par taire celle
 * qu'on vient d'ajouter — et personne ne s'en apercevrait, puisque les deux
 * échouent en silence. `ZONES` ne sert qu'à traduire ; ce qu'il ne traduit
 * pas s'affiche en anglais, ce qui se voit et se corrige.
 */
export function zonesPresentes(
  exercices: readonly Exercice[],
): { cle: string; label: string }[] {
  const presentes = exercices.map((e) => e.partieCorps ?? '').join(',');
  const cles = normaliser(ZONES, presentes);

  return casesPour(ZONES.filter((t) => cles.includes(t.cle)), cles);
}

export interface Avancement {
  total: number;
  avecVideo: number;
  /** Le nombre d'exercices IMPORTÉS — le dénominateur des traduits. */
  importes: number;
  traduits: number;
  renseignes: number;
  /** Le remplissage de la jauge, en pour cent. Voir l'avertissement ci-dessous. */
  pourcentRenseignes: number;
}

/**
 * Où en est le catalogue : ce qu'affiche le bandeau, et le remplissage de la
 * jauge.
 *
 * ON NE COMPTE QUE LES IMPORTÉS POUR LES TRADUCTIONS, numérateur comme
 * dénominateur : « 2/1275 » répond à la question qu'on se pose vraiment —
 * « combien en reste-t-il ? » — là où « 2 traduits » sur un total qui
 * comprend tes propres exercices n'était comparable à rien.
 *
 * ⚠ BUG CONNU, RELEVÉ LE 15 SEPTEMBRE 2026 ET NON CORRIGÉ ICI : sur un
 * catalogue vide, `pourcentRenseignes` vaut `NaN` (0/0), et la jauge reçoit
 * `width: 'NaN%'`. Le découpage devait être mécanique, donc le comportement
 * est reproduit tel quel ; `catalogueExercices.test.ts` l'épingle pour que la
 * correction soit un jour un changement visible et voulu.
 */
export function avancementCatalogue(exercices: readonly Exercice[]): Avancement {
  const total = exercices.length;
  const importes = exercices.filter((e) => e.source !== 'perso');
  const renseignes = exercices.filter(estRenseigne).length;

  return {
    total,
    avecVideo: exercices.filter((e) => Boolean(e.videoUrl)).length,
    importes: importes.length,
    traduits: importes.filter((e) => !aTraduire(e)).length,
    renseignes,
    pourcentRenseignes: Math.round((renseignes / total) * 100),
  };
}
