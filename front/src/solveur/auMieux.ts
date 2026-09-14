import { type Ajuste, ajusterAuStock } from './plafonner';
import { type Role, roleDe } from './repasVocabulaire';
import type { Aliment, Cibles, Fixe, Resultat, Variables } from './types';

/**
 * LE CALCULATEUR SE DÉBROUILLE SEUL.
 *
 * Quand la combinaison de départ ne tombe pas juste, on en essaie d'autres et
 * on garde la moins mauvaise. Une couche AU-DESSUS de `plafonner`, qui l'appelle
 * une fois par tentative.
 *
 * Extrait de `composer.ts` le 15 septembre 2026 (rang 6 du lot 6 de l'audit).
 * Découpage mécanique : aucune ligne de logique n'a changé.
 */

export interface AuMieux extends Ajuste {
  /** ce que le calculateur a changé de lui-même, pour pouvoir le dire */
  echanges: { role: Role; retire: Aliment; mis: Aliment }[];
}

/** Combien un aliment coûte en gras pour chaque gramme de protéine apporté. */
const grasParProteine = (a: Aliment): number =>
  (a.prot100 > 0 ? a.lip100 / a.prot100 : Number.POSITIVE_INFINITY);

/**
 * À quel point ce repas rate ses cibles. Plus c'est bas, mieux c'est.
 *
 * Un blocage pèse plus lourd que n'importe quel écart : un repas qu'on ne
 * peut pas cuisiner n'est pas un repas presque juste.
 */
const penalite = (r: Resultat): number => {
  const blocages = r.diagnostics.filter((d) => d.gravite === 'blocage').length;
  const e = r.ecarts;

  return blocages * 1000
    + Math.abs(e.prot) / 2 + Math.abs(e.gluc) / 4 + Math.abs(e.lip);
};

/**
 * Essaie d'autres aliments quand la combinaison de départ ne tombe pas juste.
 *
 * Sans cela, l'application annonçait le problème et laissait l'utilisateur le
 * résoudre à la main : mettre les amandes à zéro, ajouter de l'huile, revenir
 * en arrière. C'est exactement le travail qu'un calculateur doit faire.
 *
 * Deux échanges seulement, ceux qui correspondent aux impasses réelles :
 *
 *  - **les lipides ne tiennent pas** — l'oléagineux tombe à zéro et le gras
 *    reste hors cible : on confie les lipides à l'huile, qui cesse alors
 *    d'être une quantité figée ;
 *  - **la protéine est trop grasse** — aucun oléagineux ne peut compenser :
 *    on essaie les protéines les plus maigres du stock, dans l'ordre.
 *
 * `verrous` protège ce que l'utilisateur a choisi lui-même. Un aliment qu'il
 * a mis là par une substitution n'est jamais remplacé dans son dos : corriger
 * à sa place ce qu'il vient de décider serait pire que de ne rien faire.
 */
export function resoudreAuMieux(
  depart: { variables: Variables; fixes: Fixe[] },
  cibles: Cibles,
  stockDe: (a: Aliment) => number,
  candidats: Aliment[],
  verrous: ReadonlySet<Role> = new Set(),
  glucidesTotaux = false,
  releves: Readonly<Partial<Record<Role, Aliment>>> = {},
): AuMieux {
  const base = ajusterAuStock(
    depart, cibles, stockDe, candidats, glucidesTotaux, releves);
  let meilleur: AuMieux = { ...base, echanges: [] };
  if (base.resultat.ok) return meilleur;

  const essayer = (
    variables: Variables,
    fixes: Fixe[],
    echange: { role: Role; retire: Aliment; mis: Aliment },
  ) => {
    const tente = ajusterAuStock(
      { variables, fixes }, cibles, stockDe, candidats, glucidesTotaux, releves);
    if (penalite(tente.resultat) >= penalite(meilleur.resultat)) return;

    /* Le plafonnement du stock peut faire revenir l'aliment qu'on venait de
       sortir : il redevient le relais d'un autre. Annoncer « X ne permettait
       pas de tenir les objectifs » alors que X est toujours au menu, sur sa
       propre ligne, est un mensonge d'affichage. Dans ce cas on garde le
       résultat, mais sans prétendre à un échange. */
    const revenu = Object.values(tente.variables).some((a) => a.id === echange.retire.id)
      || tente.fixes.some((f) => f.aliment.id === echange.retire.id);

    /* Et le remplaçant doit peser quelque chose. Quand le repas est déjà trop
       gras, l'huile promue variable retombe à zéro : annoncer « c'est l'huile
       qui s'en charge » sous une ligne vide n'aide personne. Les diagnostics
       disent alors la vérité — trop gras — et c'est suffisant. */
    const sert = tente.resultat.quantites.some(
      (q) => q.aliment.id === echange.mis.id && q.aCuire > 0);

    meilleur = { ...tente, echanges: revenu || !sert ? [] : [echange] };
  };

  /* 1. Les lipides : l'huile prend le relais de l'oléagineux. Elle est
        aujourd'hui une quantité figée ; on la libère pour qu'elle s'ajuste. */
  const oleagineux = depart.variables.lipide;
  if (oleagineux !== undefined && !verrous.has('lipide')) {
    const huiles = depart.fixes.filter((f) => roleDe(f.aliment) === 'huile');
    for (const f of huiles) {
      essayer(
        { ...depart.variables, lipide: f.aliment },
        depart.fixes.filter((x) => x !== f),
        { role: 'lipide', retire: oleagineux, mis: f.aliment },
      );
    }
  }

  /* 2. La protéine : la plus maigre d'abord. On s'arrête à trois essais —
        au-delà, on ne fait plus que raboter des dixièmes de gramme. */
  const proteine = depart.variables.proteine;
  if (proteine !== undefined && !verrous.has('proteine')) {
    /* Le rôle de CELUI QU'ON REMPLACE, pas le nom de la case. À 16 h la
       variable « proteine » porte un laitage : y glisser un blanc de poulet
       parce que la case s'appelle « proteine » donnait une collation au
       poulet — et, quand les blancs d'œufs étaient déjà servis en quantité
       imposée, le même aliment deux fois sur deux lignes. */
    const role = roleDe(proteine);

    /* Un aliment déjà au menu ne peut pas « remplacer » : il s'ajouterait à
       lui-même. */
    const dejaLa = new Set<Aliment['id']>([
      ...depart.fixes.map((f) => f.aliment.id),
      ...Object.values(depart.variables).map((a) => a.id),
    ]);

    const maigres = candidats
      .filter((c) => roleDe(c) === role && !dejaLa.has(c.id) && stockDe(c) > 0)
      .sort((a, b) => grasParProteine(a) - grasParProteine(b))
      .slice(0, 3);

    for (const c of maigres) {
      essayer(
        { ...depart.variables, proteine: c },
        depart.fixes,
        { role: 'proteine', retire: proteine, mis: c },
      );
    }
  }

  return meilleur;
}
