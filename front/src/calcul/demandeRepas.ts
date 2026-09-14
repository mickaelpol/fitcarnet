import type { AlimentDisponible } from '@/api/types';
import { MODELE, type DemandeRepas, type Repas, type Role } from '../solveur/composer';
import { convertir, versReference } from '../solveur/solveur';
import type { Aliment, Fixe } from '@/solveur/types';

/**
 * LE CONTRAT QUE L'ÉCRAN PASSE AU SOLVEUR, et rien d'autre.
 *
 * Ce bloc vivait en tête de `app/(onglets)/repas.tsx`, une route de 2 397
 * lignes. Il est 100 % pur, et il portait pourtant la règle la plus sensible
 * du calculateur — « un reste déclaré est un plafond, zéro est un retrait » —
 * sans un seul test. Il ne pouvait pas en avoir : le motif d'inclusion de
 * `tsconfig.tests.json` ne descend que sous `src`, donc un test posé à côté
 * de lui dans `app/` n'aurait jamais été exécuté, sans le moindre signal.
 *
 * Descendu ici le 15 septembre 2026 (rang 4 du lot 6 de l'audit), à comportement
 * strictement inchangé. Seules deux duplications internes ont été fusionnées :
 * D7 (`grammesSaisis` réécrit 35 lignes plus bas) et D8 (le filtre des aliments
 * ajoutables calculé deux fois).
 */

/* L'ordre d'affichage. `fixe` dit la quantité par personne quand le rôle
   n'est pas une variable du solveur — l'huile et le légume. */
/* Mêmes seuils que le solveur : au-delà, l'écart n'est plus de l'arrondi. */
export const TOLERANCE = { kcal: 45, prot: 1.5, gluc: 2.5, lip: 1.2 };

/* Ordre d'affichage. La quantité d'un rôle imposé ne vit plus ici mais dans
   le modèle du repas : elle change d'un repas à l'autre. */
export const ROLES: { cle: Role; titre: string; cat: string }[] = [
  { cle: 'laitage', titre: 'Laitage', cat: 'lait' },
  { cle: 'proteine', titre: 'Protéine', cat: 'prot' },
  { cle: 'glucide', titre: 'Glucide', cat: 'fec' },
  { cle: 'fruit', titre: 'Fruit', cat: 'fruit' },
  { cle: 'lipide', titre: 'Oléagineux', cat: 'ole' },
  { cle: 'huile', titre: 'Huile', cat: 'huile' },
  { cle: 'legume', titre: 'Légume', cat: 'leg' },
];

/** Grammes par personne d'un rôle imposé à ce repas, ou undefined s'il varie. */
export const imposePour = (repas: Repas, cle: Role): number | undefined =>
  MODELE[repas].imposes.find((i) => i.role === cle)?.grammes;

/**
 * La quantité tapée, ou `null` si elle est inutilisable.
 *
 * UN SEUL ENDROIT DÉCIDE CE QU'EST UNE SAISIE VALABLE, et l'écran s'en sert
 * pour le dire. Avant, la règle vivait dans le calcul et nulle part ailleurs :
 * taper « 12O » avec un O, ou « -50 », faisait entrer l'aliment avec 0 g. Il
 * restait affiché dans la liste, le résultat était calculé sans lui, et rien
 * n'indiquait que le chiffre avait été jeté.
 *
 * `null` distingue « rien tapé » de « tapé mais illisible » : le premier est
 * normal, le second mérite un message.
 */
export const grammesSaisis = (brut?: string): number | null => {
  const saisi = (brut ?? '').trim();
  if (saisi === '') return null;

  const g = Number(saisi.replace(',', '.'));

  return Number.isFinite(g) && g >= 0 ? g : null;
};

/** Une saisie non vide que le calcul ne saura pas utiliser. */
export const saisieIllisible = (brut?: string): boolean =>
  (brut ?? '').trim() !== '' && grammesSaisis(brut) === null;

/**
 * Ce qu'un repas corrigé demande au solveur : ses variables, ses quantités
 * imposées, ses cibles pour toute la tablée.
 *
 * Cette construction vivait DANS la carte du repas, ce qui la rendait aveugle
 * aux autres : chaque carte résolvait son repas contre le frigo entier, et le
 * déjeuner comme le dîner réclamaient chacun 400 g de brocoli quand il n'en
 * restait que 500. Sortie du composant, elle se résout maintenant en une
 * seule passe pour la journée — voir `resoudreLaJournee`.
 */
export const demandePour = (
  repas: Repas,
  compose: Compose,
  portions: number,
  cible: { kcal: number; prot: number; gluc: number; lip: number; glucidesTotaux?: boolean },
): DemandeRepas => {
  const fixes: Fixe[] = [];
  const variables: { proteine?: Aliment; glucide?: Aliment; lipide?: Aliment } = {};
  /* Ce qu'on a DÉCLARÉ avoir sous la main, par aliment. Un plafond, pas une
     quantité à servir : voir plus bas, et `DemandeRepas.plafonds`. */
  const plafonds: Record<string, number> = {};

  /* Un ajout n'a de sens qu'avec une quantité : sans elle, il ne pèse rien
     et n'apparaît pas dans le résultat. On le pose donc à zéro tant que
     l'utilisateur n'a pas tapé son chiffre. */
  for (const aliment of compose.ajouts) {
    fixes.push({
      aliment,
      grammes: grammesSaisis(compose.restes[String(aliment.id)]?.grammes) ?? 0,
      unite: compose.restes[String(aliment.id)]?.unite ?? 'cru',
    });
  }

  for (const { cle } of ROLES) {
    const aliment = compose.roles[cle];
    if (!aliment) continue;
    const fixe = imposePour(repas, cle);

    const reste = compose.restes[String(aliment.id)];
    /* D7, fusionné le 15 septembre 2026. Ces trois lignes réécrivaient
       `grammesSaisis` mot pour mot, trente-cinq lignes sous le commentaire qui
       proclame « UN SEUL ENDROIT DÉCIDE CE QU'EST UNE SAISIE VALABLE ». Deux
       copies, donc deux occasions de diverger — et une divergence ici ne se
       voit nulle part : elle ferait d'un « 8O » tapé de travers un plafond de
       8 g, ou retirerait du repas un aliment qu'on n'avait pas écarté. */
    const grammes = grammesSaisis(reste?.grammes);
    const declare = grammes !== null;

    /* UN RESTE DÉCLARÉ EST UN PLAFOND, PLUS UNE QUANTITÉ IMPOSÉE.
     *
     * Il figeait la quantité : l'aliment sortait des variables et le repas se
     * recomposait autour de lui. Écrire « il me reste 290 g de pommes de
     * terre » revenait donc à exiger d'en manger 290 — et à devoir ajuster
     * tout le reste à la main pour rattraper des macros qu'on n'avait pas
     * demandé de casser.
     *
     * On dit maintenant ce qu'on a ; le calcul sert ce qu'il faut, sans
     * jamais dépasser. Le mécanisme n'est pas neuf : c'est celui qui borne
     * déjà chaque aliment au contenu du frigo, relève par un autre aliment
     * comprise. Un plafond déclaré est simplement un frigo plus petit, le
     * temps d'un repas.
     *
     * ZÉRO RESTE UN RETRAIT, PAS UN PLAFOND. « Je n'en mets pas » doit écarter
     * l'aliment ; un plafond à zéro, lui, ferait chercher un remplaçant du
     * même rôle — l'inverse de ce qu'on demande. */
    if (declare && grammes === 0) {
      fixes.push({ aliment, grammes: 0, unite: reste!.unite });
      continue;
    }

    /* Le plafond se compte dans l'unité du STOCK — la colonne « à cuire » —
       alors que la saisie peut être en cuit. On convertit ici, une fois, au
       lieu de laisser le solveur deviner. */
    if (declare) {
      plafonds[String(aliment.id)] = convertir(
        aliment, versReference(aliment, grammes, reste!.unite),
      ).aCuire;
    }

    if (fixe !== undefined) {
      /* Un rôle que le modèle impose — légume, fruit, laitage — n'a aucune
         variable à optimiser : on sert ce que le modèle demande. La quantité
         s'entend dans l'état de référence de l'aliment.
 
         ON NE RABOTE PAS ICI, ET C'EST UNE CORRECTION DU 15 SEPTEMBRE 2026.
 
         La ligne portait `Math.min(duModele, ce qui reste)`. C'était appliquer
         DEUX FOIS la même contrainte : le plafond est déjà posé quinze lignes
         plus haut, et c'est lui qui dit ce qu'on a.
 
         Le rabotage faisait deux dégâts. D'abord, un `fixes` raboté est
         indiscernable d'un « je n'en veux que 80 g » une fois arrivé au
         solveur : l'information « le plan en voulait 200 » était détruite avant
         `composer.ts`, `ignorerPlafonds` ne pouvait plus la relever, et la liste
         de courses faisait SOUS-ACHETER — c'est le constat É2, par un second
         chemin que l'audit ne décrivait pas.
 
         Ensuite, et c'est pire : `composer` borne lui-même les fixes au stock,
         mais en cherchant un RELAIS pour le manque (`choisirReleve`). Raboter
         en amont lui cachait le débordement — aucun relais n'était proposé, et
         l'utilisateur perdait les 120 g au lieu de se les voir remplacés.
 
         Le commentaire de ce bloc le disait déjà, quelques lignes plus haut :
         « un plafond déclaré est simplement un frigo plus petit, le temps d'un
         repas », « relève par un autre aliment comprise ». Le code contredisait
         son propre commentaire. */
      fixes.push({ aliment, grammes: fixe * portions });
    } else if (cle === MODELE[repas].proteine) {
      variables.proteine = aliment;
    } else if (cle === MODELE[repas].glucide) {
      variables.glucide = aliment;
    } else if (cle === MODELE[repas].lipide) {
      variables.lipide = aliment;
    }
  }

  return {
    repas, variables, fixes,
    /* Les cibles sont PAR PERSONNE : on les multiplie, et tout ce qui
       s'affiche ensuite est le total à cuisiner. La part d'une personne se
       relit sur la dernière colonne. */
    cibles: {
      kcal: cible.kcal * portions, prot: cible.prot * portions,
      gluc: cible.gluc * portions, lip: cible.lip * portions,
    },
    verrous: new Set(compose.verrous),
    glucidesTotaux: cible.glucidesTotaux === true,
    /* `undefined` et non un objet vide : le solveur n'enveloppe alors même
       pas sa fonction de stock, et le cas courant ne paie rien. */
    plafonds: Object.keys(plafonds).length > 0 ? plafonds : undefined,
    releves: Object.keys(compose.releves ?? {}).length > 0 ? compose.releves : undefined,
  };
};

/** Un repas composé, tel que l'utilisateur peut encore le corriger. */
export interface Compose {
  roles: Partial<Record<Role, Aliment>>;
  /**
   * Aliments ajoutés à la main, en plus des rôles.
   *
   * Un vrai petit-déjeuner porte deux protéines — skyr ET blancs d'œufs — et
   * deux glucides — avoine ET banane. Un aliment par rôle ne sait pas écrire
   * ça. Ces ajouts sont des quantités IMPOSÉES, que l'utilisateur saisit :
   * quatre aliments ajustables pour trois macros n'auraient pas de solution
   * unique. Le repas se recalcule autour d'eux.
   */
  ajouts: Aliment[];
  /**
   * QUI PREND LE RELAIS quand un aliment vient à manquer, par rôle.
   *
   * Sans ce choix, le relais était le premier candidat trouvé dans la liste
   * du frigo : « le reste est porté par Boulgour » parce que le boulgour
   * passait avant le riz, et rien ne permettait de dire non. Vide = le calcul
   * décide, comme avant.
   */
  releves: Partial<Record<Role, Aliment>>;
  /** l'aliment dont on a un reste, avec ce qu'il en reste */
  restes: Record<string, { grammes: string; unite: 'cru' | 'cuit' }>;
  /** les rôles que l'utilisateur a décidés lui-même : jamais remplacés d'office */
  verrous: Role[];
}

export const vers = (a: AlimentDisponible): Aliment => ({
  id: a.reference, nom: a.nom, categorie: a.categorie,
  kcal100: a.kcal100, prot100: a.prot100, gluc100: a.gluc100, lip100: a.lip100,
  /* Les fibres ne servent au calcul que si la cible les comprend — voir
     `glucidesTotaux`. Elles sont toujours transmises : c'est la cible qui
     décide de s'en servir, pas l'aliment.

     ON NE REMPLACE PLUS « INCONNU » PAR « ZÉRO », et ça compte.

     Le `?? 0` d'avant détruisait ici une distinction que toute la chaîne
     préserve — la base la stocke en `NULL`, l'API la transmet, deux
     migrations existent pour ça. Le solveur voyait « ce pain n'a pas de
     fibres » là où la vérité est « on ne sait pas ».

     Sur une cible en glucides TOTAUX, l'écart est réel : un pain complet à
     42 g de glucides et 7 g de fibres inconnues fait servir 143 g au lieu de
     122 — 17 % de féculent en trop, quatre fois par jour, sans un mot.

     `undefined` traverse le solveur sans rien changer au calcul (il fait
     `?? 0` de son côté) mais reste LISIBLE : c'est ce qui permet à l'écran
     de prévenir. Voir `sansFibresConnues`. */
  fibres100: a.fibres100 ?? undefined,
  ratio: a.ratio,
});

/**
 * Les aliments du stock qu'on peut encore ajouter à ce repas.
 *
 * D8, fusionné le 15 septembre 2026. Ce filtre était écrit DEUX FOIS dans la
 * même modale de `repas.tsx` : une fois pour construire la liste affichée,
 * une fois dans `onChoisir` pour retrouver l'aliment choisi. Or la modale ne
 * parle qu'en POSITIONS — les identifiants du frigo sont des références
 * (« grocy:12 »), que `ChoixDansListe` n'accepte pas. Les deux filtres
 * devaient donc rendre exactement la même liste, dans le même ordre, sans que
 * rien ne l'impose : si l'une des deux copies avait changé, on aurait ajouté
 * un aliment pour un autre, en silence.
 */
export const alimentsAjoutables = (stock: readonly Aliment[], compose: Compose): Aliment[] =>
  stock.filter((a) => !ROLES.some(({ cle }) => compose.roles[cle]?.id === a.id)
    && !compose.ajouts.some((x) => x.id === a.id));
