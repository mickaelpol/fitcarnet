import { sansAccent } from '../calcul/texte';
import { MODELE, type Repas, type Role, roleDe } from './repasVocabulaire';
import type { Aliment, Fixe, Variables } from './types';

/**
 * Choisit LES ALIMENTS d'un repas. Le solveur, lui, choisit les quantités.
 *
 * Séparation volontaire : `calculer` reçoit une protéine, un glucide, un
 * lipide et rend des grammes. Il ne sait pas ce qu'est un repas, et n'a pas à
 * l'apprendre — ses 47 tests portent sur l'algèbre, pas sur le menu. Composer
 * est la couche qui décide QUOI lui donner ; elle se teste à part.
 *
 * ---
 *
 * CE FICHIER EST AUSSI LE BARIL DU SOLVEUR, ET C'EST VOLONTAIRE.
 *
 * Il portait 827 lignes et cinq couches empilées — le vocabulaire du repas, la
 * composition, le plafonnement au stock, les échanges automatiques, la période.
 * Vérifié au découpage : l'ordre de dépendance était strictement croissant,
 * aucun cycle, aucune variable partagée d'un bandeau de commentaire à l'autre.
 *
 * Les cinq couches vivent désormais chacune dans son fichier. Les
 * ré-exportations ci-dessous existent pour que les appelants — composants,
 * modules de calcul, écran, tests — n'aient rien à changer : ils continuent
 * d'écrire `from '@/solveur/composer'`. Pas de compte d'appelants ici : il
 * était juste le jour où on l'a écrit et faux la semaine suivante. Un module
 * qui naît aujourd'hui gagne à viser la couche précise plutôt que le baril.
 *
 * Découpage du 15 septembre 2026, rang 6 du lot 6 de l'audit. Mécanique :
 * aucun comportement n'a changé, aucune formule n'a été recopiée — chaque
 * fonction n'existe toujours qu'à un seul endroit.
 */

export * from './repasVocabulaire';
export * from './plafonner';
export * from './auMieux';
export * from './periode';

export interface Composition {
  variables: Variables;
  fixes: Fixe[];
  /** ce qui a manqué pour composer un repas complet */
  manquants: Role[];
  /** les aliments servis en quantité fixe, par rôle */
  imposes: Partial<Record<Role, Aliment>>;
}

/**
 * Compose un repas à partir du stock.
 *
 * `precedents` sert à ne pas resservir le même aliment quatre fois dans la
 * journée : à qualité égale, on prend celui qui n'a pas encore servi. Ce
 * n'est pas une contrainte — s'il n'y a qu'une protéine en stock, elle
 * reviendra à tous les repas, et c'est très bien.
 */
export function composer(
  disponibles: Aliment[],
  portions: number,
  precedents: ReadonlySet<number | string> = new Set(),
  repas: Repas = 'R2',
): Composition {
  const utilisables = disponibles.filter((a) => roleDe(a) !== null);

  const modele = MODELE[repas];

  const choisir = (role: Role): Aliment | undefined => {
    const candidats = utilisables.filter((a) => roleDe(a) === role);
    if (candidats.length === 0) return undefined;

    /* L'aliment nommé par le plan passe devant, s'il est là. */
    const voulu = modele.preferes?.[role];
    if (voulu !== undefined) {
      const nomme = candidats.find((a) => sansAccent(a.nom).includes(sansAccent(voulu)));
      if (nomme !== undefined) return nomme;
    }

    /* Départage stable : d'abord ce qui n'a pas encore servi aujourd'hui,
       puis l'ordre du stock. Un tri instable rendrait deux générations
       identiques différentes, et l'utilisateur croirait à un bug. */
    const neufs = candidats.filter((a) => !precedents.has(a.id));

    return (neufs.length > 0 ? neufs : candidats)[0];
  };

  const proteine = choisir(modele.proteine);
  const glucide = choisir(modele.glucide);
  const huile = choisir('huile');

  /* L'oléagineux pilote les lipides. À défaut — aucun en stock — c'est
     l'huile qui prend ce rôle, et elle cesse alors d'être une quantité fixe :
     sans elle, plus rien ne porterait les lipides. */
  const oleagineux = choisir(modele.lipide);
  const lipide = oleagineux ?? huile;

  const variables: Variables = {};
  if (proteine) variables.proteine = proteine;
  if (glucide) variables.glucide = glucide;
  if (lipide) variables.lipide = lipide;

  /* Quantités IMPOSÉES, pas des variables : elles pèsent peu sur les macros,
     et les laisser s'ajuster ferait apparaître des « 40 g de brocolis » qui ne
     veulent rien dire dans une assiette. Ce que le modèle du repas ne demande
     pas n'apparaît pas — pas de brocoli à 16 h, pas de fruit au dîner. */
  const fixes: Fixe[] = [];
  const imposes: Partial<Record<Role, Aliment>> = {};

  for (const { role, grammes } of modele.imposes) {
    // l'huile qui porte les lipides n'est plus une quantité fixe
    if (role === 'huile' && lipide?.id === huile?.id) continue;

    const aliment = choisir(role);
    if (aliment === undefined) continue;

    imposes[role] = aliment;
    /* SANS `unite`, LA QUANTITÉ S'ENTEND CRUE — c'est-à-dire À PESER.
       200 g de légume, ce sont 200 g sur la balance avant cuisson ; ce qui
       arrive dans l'assiette en découle par le rendement de l'aliment, et
       l'écran affiche les deux colonnes côte à côte.

       CE COMMENTAIRE DISAIT L'INVERSE — « cuit pour un légume, c'est ce
       qu'on SERT » — et contredisait `Fixe.unite` dans `types.ts`, qui pose
       'cru' par défaut « comme tout le reste de l'application ». Le code,
       lui, n'a jamais converti : `versReference` rend la quantité telle
       quelle quand `unite` est absent. C'était donc le commentaire qui
       mentait, pas le calcul. Deux commentaires contradictoires sur la même
       question, c'est une décision qu'on reprend à zéro à chaque relecture. */
    fixes.push({ aliment, grammes: grammes * portions });
  }

  const manquants = ([
    ['proteine', proteine], ['glucide', glucide], ['lipide', lipide],
  ] as const).filter(([, a]) => a === undefined).map(([r]) => r as Role);

  return { variables, fixes, manquants, imposes };
}
