import type { Aliment } from '@/solveur/types';

/**
 * LES FOURNÉES DU BATCH COOKING.
 *
 * Une cuisson n'est plus une valeur figée dans le code mais une LIGNE d'une
 * table partagée — « Vapeur », « Four 180 °C » — que seul l'administrateur
 * alimente. Voir `db/manuel/20-mode-de-cuisson.sql` pour le pourquoi.
 *
 * Deux conséquences qui simplifient tout ce fichier :
 *
 *   - **l'identifiant EST la fournée.** Deux aliments se cuisent ensemble
 *     s'ils pointent la même ligne. « Four 180 » et « Four 200 » sont deux
 *     lignes, donc deux fournées — et c'est exactement ce qu'on veut dire :
 *     on ne met pas le poisson à 180 avec les légumes à 200 en espérant que
 *     ça passe.
 *   - **rien à comparer, donc rien à faire diverger.** Pas de mode d'un côté
 *     et de température de l'autre, pas de vocabulaire dupliqué entre le
 *     front, l'API et le SQL. Le libellé s'affiche, l'identifiant regroupe.
 *
 * Un aliment sans cuisson choisie n'est simplement pas cuit : il n'entre dans
 * aucune fournée. L'absence est l'état par défaut, et elle ne se stocke pas.
 */

export interface ModeCuisson {
  id: number;
  libelle: string;
  ordre: number;
}

/**
 * Ce que l'écran retient : quel mode pour quel aliment, dans quel repas.
 *
 * TROIS ÉTATS, ET LA DIFFÉRENCE ENTRE LES DEUX DERNIERS COMPTE :
 *
 *   - un identifiant  → cet aliment se cuit de cette façon ;
 *   - `null`          → cet aliment ne se cuit PAS, et c'est un choix ;
 *   - clé absente     → personne n'a encore décidé.
 *
 * Sans le `null`, le skyr et les amandes resteraient éternellement « à
 * situer » : l'écran réclamerait une cuisson pour des aliments qui n'en ont
 * pas, et on ne saurait jamais si un plan est complet. « Je n'en mets pas »
 * n'est pas « je n'ai pas répondu » — c'est la même distinction que le zéro
 * et le champ vide dans les restes.
 */
export type Cuissons = Record<string, number | null>;

/**
 * Le plan mis à plat, tel que ce module l'attend : un repas, ses quantités.
 *
 * Rien n'est recalculé ici — le solveur a déjà tout résolu. Ce module se
 * contente de regrouper et de répartir, et c'est la garantie qu'une fournée
 * ne peut pas fausser un gramme.
 */
export interface Repas {
  /** « 2|R3 » */
  cle: string;
  /** pour combien de personnes ce repas a été composé */
  convives: number;
  quantites: readonly { aliment: Aliment; aCuire: number; assiette: number }[];
}

/** La clé d'un choix : « 2|R3|grocy:12 ». */
export const cleDeCuisson = (cleRepas: string, aliment: Aliment): string =>
  `${cleRepas}|${aliment.id}`;

export interface Fournee {
  mode: ModeCuisson;
  lignes: { aliment: Aliment; aCuire: number }[];
}

/**
 * UNE BOÎTE : ce qu'on met de côté pour un repas donné.
 *
 * C'est la finalité du batch cooking. On cuit tout d'un coup — les fournées —
 * puis on répartit dans des boîtes, une par repas. Sans cette répartition, le
 * batch cooking ne sert à rien : on saurait quoi cuire, pas quoi mettre où.
 *
 * LES POIDS SONT ICI EN **CUIT**, et c'est la différence qui compte avec les
 * fournées. On pèse du riz sec pour le mettre à cuire ; on répartit du riz
 * cuit à la cuillère. Annoncer le poids sec devant des boîtes ferait servir
 * trois fois trop.
 *
 * Les aliments qui ne se cuisent pas sont à part : on ne met pas un skyr dans
 * une boîte cinq jours à l'avance, on l'ajoute au moment de manger.
 */
export interface Boite {
  /** « 2|R3 » : le repas auquel cette boîte est destinée */
  cle: string;
  convives: number;
  /** ce qui sort d'une fournée, en poids CUIT */
  cuits: Portion[];
  /** ce qui s'ajoute au dernier moment : yaourt, fruits, oléagineux, huile */
  crus: Portion[];
}

/**
 * Une ligne de boîte, avec les DEUX quantités qui comptent.
 *
 * `assiette` est ce qu'on met dans la boîte pour tout le monde. `parPersonne`
 * est ce que CELUI QUI SUIT LA DIÈTE doit se servir le jour venu.
 *
 * Les deux sont nécessaires, et confondre l'une avec l'autre ruine tout : une
 * boîte pour trois contient trois portions, mais ses macros ne valent que
 * pour une. Sans la seconde ligne, il faudrait recomposer le repas le jour du
 * repas pour retrouver combien s'en servir — c'est-à-dire refaire tout le
 * travail que le batch cooking venait d'éviter.
 */
export interface Portion {
  aliment: Aliment;
  /** ce qu'on met dans la boîte, pour tous les convives */
  assiette: number;
  /** ce qu'on se sert, pour UNE personne, afin de tenir ses macros */
  parPersonne: number;
}

/**
 * Regroupe tout un plan en fournées.
 *
 * Les quantités s'ADDITIONNENT sur toute la période : cuire 300 g de riz en
 * une fois pour trois repas, c'est tout l'intérêt du batch cooking. Un aliment
 * qui revient dans quatre repas donne donc une seule ligne, et son total.
 *
 * `quantites` arrive déjà résolu par le solveur — on ne recalcule rien ici,
 * on regroupe. Un aliment sans mode choisi est ignoré : il n'est pas cuit.
 */
export function enFournees(
  repas: readonly Repas[],
  choisi: Cuissons,
  modes: readonly ModeCuisson[],
): Fournee[] {
  const parMode = new Map<number, Map<Aliment['id'], { aliment: Aliment; aCuire: number }>>();

  for (const r of repas) {
    for (const q of r.quantites) {
      const idMode = choisi[cleDeCuisson(r.cle, q.aliment)];
      /* `undefined` : pas encore décidé. `null` : décidé qu'on ne le cuit
         pas. Ni l'un ni l'autre n'entre dans une fournée — mais seul le
         premier est signalé à l'écran.

         Le cas `null` est doublement protégé : même sans ce test, aucun mode
         ne porterait cet identifiant et le groupe serait écarté plus bas. La
         mutation le confirme — la retirer ne casse aucun test. On la garde
         quand même, parce qu'elle dit l'INTENTION : « ceci ne se cuit pas »
         n'est pas « ce mode n'existe plus », et les deux ne doivent pas
         dépendre du même hasard. */
      if (idMode === undefined || idMode === null) continue;

      const lignes = parMode.get(idMode) ?? new Map();
      const deja = lignes.get(q.aliment.id);
      if (deja === undefined) {
        lignes.set(q.aliment.id, { aliment: q.aliment, aCuire: q.aCuire });
      } else {
        deja.aCuire += q.aCuire;
      }
      parMode.set(idMode, lignes);
    }
  }

  const out: Fournee[] = [];
  for (const [idMode, lignes] of parMode) {
    const mode = modes.find((m) => m.id === idMode);
    /* Un mode supprimé par l'administrateur pendant qu'un plan était ouvert :
       on écarte la fournée plutôt que d'inventer un libellé. */
    if (mode === undefined) continue;
    out.push({
      mode,
      lignes: [...lignes.values()].sort((x, y) => y.aCuire - x.aCuire),
    });
  }

  /* L'ordre de la table, celui que l'administrateur a voulu. */
  return out.sort((x, y) => x.mode.ordre - y.mode.ordre
    || x.mode.libelle.localeCompare(y.mode.libelle, 'fr'));
}

/**
 * Marque « sans cuisson » tout ce qui n'a pas encore été décidé.
 *
 * Un plan de sept jours porte une trentaine de lignes, dont beaucoup ne se
 * cuisent pas — skyr, amandes, fruits, huile. Les pointer une par une pour
 * dire « rien à faire » serait absurde. Ce qui EST cuit se choisit à la main ;
 * le reste se règle d'un geste.
 *
 * Rien n'est écrasé : les choix déjà faits, y compris les « sans cuisson »,
 * restent tels quels.
 */
export function resteSansCuisson(
  repas: readonly Repas[],
  choisi: Cuissons,
): Cuissons {
  const suite: Cuissons = { ...choisi };
  for (const r of repas) {
    for (const q of r.quantites) {
      const cle = cleDeCuisson(r.cle, q.aliment);
      if (suite[cle] === undefined) suite[cle] = null;
    }
  }

  return suite;
}

/** Combien d'aliments du plan attendent encore qu'on dise comment les cuire. */
export function sansCuisson(
  repas: readonly Repas[],
  choisi: Cuissons,
): number {
  let n = 0;
  for (const r of repas) {
    for (const q of r.quantites) {
      /* Seule l'ABSENCE de décision compte. Un aliment marqué « sans
         cuisson » est réglé, même s'il n'ira dans aucune fournée. */
      if (choisi[cleDeCuisson(r.cle, q.aliment)] === undefined) n += 1;
    }
  }

  return n;
}

/**
 * Ce qu'on met dans chaque boîte, repas par repas.
 *
 * L'ordre suit celui du plan — jour puis repas — parce qu'on remplit ses
 * boîtes dans l'ordre où on les mangera.
 */
export function repartition(repas: readonly Repas[], choisi: Cuissons): Boite[] {
  return repas.map((r) => {
    const cuits: Boite['cuits'] = [];
    const crus: Boite['crus'] = [];

    for (const q of r.quantites) {
      const choix = choisi[cleDeCuisson(r.cle, q.aliment)];
      const ou = (choix === undefined || choix === null) ? crus : cuits;
      ou.push({
        aliment: q.aliment,
        assiette: q.assiette,
        /* Une portion vaut TES cibles, celles de ton compte. Cuisiner pour
           trois, c'est cuisiner trois fois la même portion — la famille n'a
           pas tes besoins, mais elle ne pèse rien. */
        parPersonne: q.assiette / Math.max(1, r.convives),
      });
    }

    return { cle: r.cle, convives: r.convives, cuits, crus };
  });
}

/* ------------------------------------------------- l'instantané conservé */

/**
 * UN PLAN ENREGISTRÉ EST UN INSTANTANÉ, PAS UNE RECETTE À REJOUER.
 *
 * Il porte des NOMS et des GRAMMES, jamais des identifiants d'aliments. Deux
 * raisons, et la seconde est la plus importante :
 *
 *   - un aliment supprimé du frigo depuis ne doit pas rendre un plan
 *     illisible ;
 *   - **on ne recalcule rien à la lecture.** Le jeudi midi, on ne veut pas
 *     savoir ce qu'on cuisinerait aujourd'hui — le stock a bougé, une cible a
 *     peut-être changé — on veut savoir ce qu'on a cuisiné dimanche. Rejouer
 *     le solveur donnerait un autre plan, et ce serait le mauvais.
 */
export interface PlanEnregistre {
  /** version de la forme, pour qu'une évolution ne rende pas l'ancien illisible */
  version: 1 | 2;
  courses: { nom: string; categorie: string; grammes: number }[];
  fournees: {
    libelle: string;
    lignes: { nom: string; categorie: string; aCuire: number }[];
  }[];
  boites: {
    /** « Aujourd'hui · Midi », déjà mis en toutes lettres */
    titre: string;
    convives: number;
    cuits: LigneEnregistree[];
    crus: LigneEnregistree[];
  }[];
  /**
   * CE QUE CE PLAN PREND AU FRIGO. Absent des plans version 1.
   *
   * La seule partie de l'instantané qui porte des IDENTIFIANTS, et c'est
   * assumé. Le reste du plan se lit ; celle-ci se CALCULE avec — réserver du
   * stock puis le décrémenter demande de désigner une ligne du frigo, pas de
   * l'appeler par son nom. Un nom se réécrit, un identifiant non ; se tromper
   * de ligne ici viderait le mauvais bac.
   *
   * Un aliment disparu du frigo depuis rend sa ligne inapplicable, et c'est
   * dit plutôt que deviné.
   *
   * Les grammes sont ceux de la BALANCE — le poids pesé, additionné sur toute
   * la période, cuisson ou pas. C'est ce qui sort réellement du frigo : ce
   * qu'on y a mis n'a jamais été de l'eau de cuisson.
   */
  consomme?: { reference: number | string; nom: string; grammes: number }[];
}

export interface LigneEnregistree {
  nom: string;
  categorie: string;
  /** ce qu'on met dans la boîte, pour tous les convives */
  assiette: number;
  /** ce qu'on se sert, pour UNE personne */
  parPersonne: number;
}

/**
 * Fige un plan pour le relire plus tard.
 *
 * `nomDeLaBoite` traduit une clé « 2|R3 » en « jeudi 14/08 · 16 h ». On la
 * résout ICI et non à la lecture : dans trois jours, le rang 2 ne désignera
 * plus le même jour. Un instantané qui se relit doit être daté au moment où
 * il est pris.
 */
export function figerLePlan(
  courses: readonly { aliment: Aliment; grammes: number }[],
  fournees: readonly Fournee[],
  boites: readonly Boite[],
  nomDeLaBoite: (cle: string) => string,
  /** le plan à plat — sert à savoir ce qui sort du frigo, cuisson ou pas */
  repas: readonly Repas[] = [],
): PlanEnregistre {
  const ligne = (p: Portion): LigneEnregistree => ({
    nom: p.aliment.nom,
    categorie: p.aliment.categorie,
    assiette: p.assiette,
    parPersonne: p.parPersonne,
  });

  return {
    version: 2,
    consomme: consommationDuPlan(repas),
    courses: courses.map((c) => ({
      nom: c.aliment.nom, categorie: c.aliment.categorie, grammes: c.grammes,
    })),
    fournees: fournees.map((f) => ({
      libelle: f.mode.libelle,
      lignes: f.lignes.map((l) => ({
        nom: l.aliment.nom, categorie: l.aliment.categorie, aCuire: l.aCuire,
      })),
    })),
    boites: boites.map((b) => ({
      titre: nomDeLaBoite(b.cle),
      convives: b.convives,
      cuits: b.cuits.map(ligne),
      crus: b.crus.map(ligne),
    })),
  };
}

/**
 * Ce que ce plan prend au frigo, aliment par aliment.
 *
 * `aCuire` et non `assiette` : c'est le poids de la BALANCE. Ce qu'on sort du
 * frigo, c'est du riz sec et de la viande crue — l'eau que la cuisson ajoute
 * n'a jamais été dans le bac. Prendre l'assiette ferait déduire trois fois
 * trop de riz, et le frigo se viderait sur le papier bien avant de se vider
 * en vrai.
 *
 * Les quantités s'additionnent sur toute la période : un aliment servi à
 * quatre repas donne une seule ligne et son total.
 *
 * Tous les aliments, cuits ou non. Les fournées n'en couvrent qu'une partie —
 * le skyr et les amandes sortent du frigo comme le reste.
 */
export function consommationDuPlan(
  repas: readonly Repas[],
): { reference: number | string; nom: string; grammes: number }[] {
  const par = new Map<number | string, { nom: string; grammes: number }>();

  for (const r of repas) {
    for (const q of r.quantites) {
      const deja = par.get(q.aliment.id);
      if (deja === undefined) {
        par.set(q.aliment.id, { nom: q.aliment.nom, grammes: q.aCuire });
      } else {
        deja.grammes += q.aCuire;
      }
    }
  }

  return [...par]
    .map(([reference, x]) => ({ reference, nom: x.nom, grammes: x.grammes }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/**
 * CE QUI EST DÉJÀ PROMIS À UN AUTRE PLAN.
 *
 * Le bug qu'elle corrige : deux batch cooking d'affilée comptaient deux fois
 * le même frigo. On compose lundi-mercredi, on enregistre ; on compose
 * jeudi-samedi, et le solveur repartait du stock d'avant. Le premier plan
 * avait beau vider les 800 g de poulet, le second annonçait « objectifs
 * atteints » sur du poulet qui n'existait plus — et personne n'était prévenu,
 * puisque chaque plan était juste tout seul.
 *
 * Seuls les plans PRÉVUS réservent. Un plan cuisiné a déjà fait baisser le
 * stock pour de vrai : le compter encore le déduirait deux fois.
 *
 * Un plan version 1 ne réserve rien — il ne dit pas ce qu'il consomme, et
 * inventer une consommation à partir de ses noms d'aliments serait deviner.
 * Mieux vaut une réservation manquante, qu'on voit, qu'une réservation fausse,
 * qu'on ne voit pas.
 */
export function estCuisine(plan: { cuisineLe?: string | null }): boolean {
  /* `!= null` attrape `null` ET `undefined`, et la différence a coûté cher :
     tant que le serveur n'a pas vidé son cache après la migration, il ne
     renvoie pas du tout le champ. `!== null` répondait alors « cuisiné » pour
     TOUS les plans — donc aucune réservation, et l'écran affichait
     « Cuisiné le Invalid Date » sur un plan qu'on n'avait jamais cuisiné.

     Le défaut va vers PRÉVU, et c'est le bon sens du risque : réserver un
     stock qui ne l'était pas se voit tout de suite et se corrige d'un appui ;
     ne pas réserver laisse trois plans se partager le même brocoli en
     silence, et on le découvre devant le bac. */
  return plan.cuisineLe != null && plan.cuisineLe !== '';
}

export function dejaPromis(
  plans: readonly { contenu: PlanEnregistre; cuisineLe?: string | null }[],
): Map<number | string, number> {
  const promis = new Map<number | string, number>();

  for (const p of plans) {
    if (estCuisine(p)) continue;
    for (const c of p.contenu.consomme ?? []) {
      promis.set(c.reference, (promis.get(c.reference) ?? 0) + c.grammes);
    }
  }

  return promis;
}

/* --------------------------------------------- les cuissons habituelles */

/**
 * CE QUE TU FAIS D'HABITUDE, PRÉ-REMPLI.
 *
 * Le problème tel qu'il s'est présenté : à chaque plan, il fallait redire que
 * le riz passe à l'eau et le poulet à la poêle. Sur une semaine de quatre
 * repas, une trentaine de choix à refaire — et les mêmes que la semaine
 * dernière. Un outil qui fait recommencer ce qu'on vient de lui apprendre
 * n'aide pas, il occupe.
 *
 * LA RÈGLE TIENT EN UNE PHRASE : **ce qui est pré-rempli est ce que tu as
 * fait la dernière fois.** Pas de case « s'en souvenir » à cocher — ce serait
 * une décision de plus à chaque choix, c'est-à-dire exactement la friction
 * qu'on enlève. Pas de « seule la première fois compte » non plus : on ne
 * pourrait plus jamais changer d'avis.
 *
 * Et ce n'est QU'UN DÉFAUT. Il se change d'un geste, repas par repas.
 */

/** La clé d'une habitude : ce qui reste d'un nom quand on l'écrit calmement. */
export type Habitudes = Record<string, number | null>;

/*
 * Les accents, à la main.
 *
 * `String.prototype.normalize('NFD')` ferait la même chose en une ligne, et
 * c'est ce que j'avais écrit d'abord. Mais Hermes — le moteur JavaScript de
 * React Native — ne l'implémente pas toujours : selon la version et selon que
 * l'Intl complet est embarqué ou non, `normalize` est là ou n'y est pas. Une
 * table de quinze lettres ne dépend d'aucun moteur, et le français n'en
 * demande pas plus.
 */
const SANS_ACCENT: Record<string, string> = {
  à: 'a', â: 'a', ä: 'a', á: 'a', ã: 'a', å: 'a',
  ç: 'c',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ñ: 'n',
  ò: 'o', ó: 'o', ô: 'o', ö: 'o', õ: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ý: 'y', ÿ: 'y',
  œ: 'oe', æ: 'ae',
};

/**
 * La clé sous laquelle une habitude s'écrit ET se relit.
 *
 * C'est le seul identifiant que les deux frigos aient en commun : un aliment
 * Grocy porte « grocy:12 », un aliment de la base porte un entier, et ces
 * deux mondes n'ont aucun identifiant partagé. Le NOM, lui, en est un.
 *
 * Minuscules, sans accent, espaces réduits. Sans cela « Riz Basmati », « riz
 * basmati » et « Riz basmati  » feraient trois habitudes pour un seul riz, et
 * l'utilisateur verrait ses réglages disparaître au moindre changement de
 * casse.
 *
 * CETTE FONCTION EST LA SEULE À NORMALISER, dans tout le projet. L'API stocke
 * ce qu'elle reçoit sans le lire. La règle doit être la même à l'écriture et
 * à la lecture ; l'écrire des deux côtés, ce serait se donner deux règles
 * libres de diverger — et le jour où elles divergent, l'habitude s'écrit sous
 * une clé et se cherche sous une autre, sans que rien ne le signale.
 */
export const cleDHabitude = (nom: string): string =>
  nom
    .toLowerCase()
    .replace(/[À-ÿœæ]/g, (c) => SANS_ACCENT[c] ?? c)
    /* Tout ce qui n'est ni lettre ni chiffre devient une coupure : « riz
       basmati », « riz-basmati » et « riz (basmati) » sont le même riz. */
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Les cuissons qu'on propose d'office, avant tout choix de l'utilisateur.
 *
 * Rendu SÉPARÉMENT des choix faits à l'écran, et fusionné dessous eux. C'est
 * ce qui rend un choix explicite indéracinable : il est toujours au-dessus du
 * défaut, quoi qu'il arrive aux habitudes entre-temps. L'inverse — recopier
 * les habitudes dans l'état de l'écran au chargement — obligerait à savoir
 * quand recopier, à ne pas écraser ce que l'utilisateur vient de faire, et à
 * distinguer « il n'a pas encore choisi » de « il a choisi la même chose ».
 * Trois questions qui ne se posent pas ici.
 */
export function depuisLesHabitudes(
  repas: readonly Repas[],
  habitudes: Habitudes,
): Cuissons {
  const out: Cuissons = {};

  for (const r of repas) {
    for (const q of r.quantites) {
      const cle = cleDHabitude(q.aliment.nom);
      /* `in` et non `!== undefined` : `null` est une réponse — « se mange
         sans cuisson » — et la confondre avec l'absence ferait redemander
         éternellement pour le skyr et les amandes.

         HONNÊTEMENT : la mutation qui remplace ce `in` par
         `habitudes[cle] !== undefined` SURVIT, et c'est normal — le type
         `Habitudes` interdit la valeur `undefined`, donc les deux écritures
         disent la même chose ici. Ce n'est pas un trou de test : c'est une
         équivalence garantie par le typage. Le `in` reste parce qu'il dit
         l'intention — on demande si l'habitude EXISTE, pas ce qu'elle vaut —
         et parce qu'il resterait juste si le type s'élargissait un jour. */
      if (cle in habitudes) out[cleDeCuisson(r.cle, q.aliment)] = habitudes[cle]!;
    }
  }

  return out;
}

/**
 * Ce qu'il faut renvoyer au serveur : les habitudes que ce plan vient de
 * décider, celles-là seulement.
 *
 * On ne réécrit PAS ce qui n'a pas bougé. Une semaine sans changement doit
 * pouvoir se composer sans une seule écriture — sinon chaque plan repousserait
 * inutilement `maj_le` sur trente lignes, et un envoi qui échoue à moitié
 * porterait sur des données qui n'avaient aucune raison de partir.
 *
 * Un aliment cuit différemment dans deux repas du même plan ne donne qu'UNE
 * habitude : la dernière rencontrée dans l'ordre du plan, c'est-à-dire la
 * plus tardive. C'est le sens de « ce que tu as fait la dernière fois ».
 */
export function habitudesAEcrire(
  repas: readonly Repas[],
  choisi: Cuissons,
  connues: Habitudes,
): { aliment: string; mode: number | null }[] {
  /* DEUX TEMPS, et l'ordre compte. On retient d'abord la dernière décision de
     chaque aliment, on compare ensuite à ce qui est déjà connu.

     Faire les deux en un seul passage — « si c'est inchangé, passer » — a
     l'air plus court et se trompe : un riz mis au four lundi puis remis à
     l'eau jeudi verrait le jeudi écarté comme inchangé, et le lundi resterait
     dans le lot. On enregistrerait « four » pour un plan qui finit à l'eau. */
  const derniere = new Map<string, number | null>();

  for (const r of repas) {
    for (const q of r.quantites) {
      const decide = choisi[cleDeCuisson(r.cle, q.aliment)];
      if (decide === undefined) continue;

      derniere.set(cleDHabitude(q.aliment.nom), decide);
    }
  }

  return [...derniere]
    /* Inchangé : rien à dire.
       Une habitude ABSENTE rend `undefined`, et `mode` ne peut pas valoir
       `undefined` — la boucle ci-dessus l'a écarté. L'absence est donc
       toujours un écart, sans qu'on ait besoin de la tester à part. */
    .filter(([cle, mode]) => connues[cle] !== mode)
    .map(([aliment, mode]) => ({ aliment, mode }));
}
