import type { Repas } from '@/solveur/repasVocabulaire';

/** Reflets des ressources exposées par l'API. */

export interface Aliment {
  '@id': string;
  id: number;
  nom: string;
  categorie: 'prot' | 'fec' | 'leg' | 'ole' | 'huile' | 'lait' | 'fruit' | 'autre';
  kcal100: number;
  prot100: number;
  gluc100: number;
  lip100: number;
  fibres100: number | null;
  ratio: number;
  /** pesées ayant servi à mesurer le ratio ; null s'il vient d'une valeur courante */
  peseeAvant: number | null;
  peseeApres: number | null;
  codeBarres: string | null;
}

export interface Emplacement {
  '@id': string;
  id: number;
  code: string;
  libelle: string;
  ordre: number;
}

export interface LigneStock {
  '@id': string;
  id: number;
  aliment: Aliment | string;
  emplacement: Emplacement | string;
  quantite: number;
  peremption: string | null;
}

export interface Cible {
  '@id': string;
  id: number;
  repas: Repas;
  kcal: number;
  prot: number;
  gluc: number;
  lip: number;
  /**
   * La cible en glucides comprend-elle les fibres ?
   *
   * Vrai pour un plan nord-américain, faux pour la convention européenne.
   * Une quantité sans son unité est un bug qui attend son heure.
   */
  glucidesTotaux?: boolean;
}

export interface Exercice {
  '@id': string;
  id: number;
  nom: string;
  /** nom français facultatif ; à défaut, « nom » est affiché */
  nomFr: string | null;
  nomAffiche?: string;
  formatPrescrit: string | null;
  modeDefaut: 'charge' | 'iso' | 'chrono';
  groupes: string[];
  videoUrl: string | null;
  partieCorps: string | null;
  source: 'perso' | 'import';

  /* ABSENTS DE LA LISTE, PRESENTS SUR LA FICHE — d'où le « ? ».
     Ces quatre champs ne servent que dans `ModaleExercice`, ouverte pour UN
     exercice à la fois. Les livrer pour les 1338 entrées du catalogue à chaque
     chargement revient à transporter des centaines de kilooctets de texte que
     personne n'affiche. Côté API ils sont passés dans le groupe
     `exercice:detail`, servi par `GET /api/exercices/{id}` uniquement.

     Le « ? » n'est pas décoratif : sans lui, TypeScript affirmerait que ces
     champs existent toujours, et le premier accès sans garde échouerait à
     l'exécution sans que rien ne l'ait signalé à la compilation. */
  equipement?: string | null;
  muscleCible?: string | null;
  musclesSecondaires?: string | null;
  instructions?: string | null;
}

/**
 * L'identifiant d'un exercice, qu'il arrive en IRI (`/api/exercices/7`) ou en
 * objet complet.
 *
 * API Platform sérialise la même relation des deux façons selon les groupes de
 * la route : `exercice` est un objet sur la fiche d'une séance, une chaîne dans
 * la collection. Le ternaire qui tranche était recopié CINQ fois — constat D10
 * de l'audit de septembre 2026 : `app/seance/[id].tsx`, `app/modele/[id].tsx`
 * et trois fois dans `api/hooks.ts`. Cinq copies d'une conversion, c'est cinq
 * endroits où la forme non prévue passera un jour en silence, et un `NaN` qui
 * ne dit pas d'où il vient.
 *
 * D10 EST SOLDÉ. Les cinq copies ont disparu le 15 septembre 2026 :
 * `app/seance/[id].tsx`, `app/modele/[id].tsx` et `calcul/historiqueSeances.ts`
 * importent tous celle-ci. Dans le dernier, la copie était typée `unknown` avec
 * un `as { id: number }` — prudence inutile, `SeanceExercice.exercice` est déjà
 * `Exercice | string`.
 *
 * Ce paragraphe a d'abord annoncé « trois copies restent, et elles attendent ».
 * C'était vrai à la minute où il a été écrit, et faux vingt minutes plus tard —
 * les trois lignes ont été faites dans la foulée. Un état des lieux daté dans
 * un commentaire se périme plus vite que le code qu'il décrit : c'est le motif
 * n° 3 de la skill `revue-de-code`, observé sur lui-même.
 */
export const idDe = (v: Exercice | string): number =>
  typeof v === 'string' ? Number(v.split('/').pop()) : v.id;

/**
 * L'autre moitie du meme ternaire : l'IRI plutot que l'identifiant.
 *
 * `useSeanceVersModele` en a besoin — l'API veut « /api/exercices/7 » et non
 * 7 — et `app/seance/[id].tsx` en portait sa propre copie. Deux copies d'un
 * ternaire de deux lignes ne sont pas un drame ; deux copies qui divergent
 * font pointer un modele sur le mauvais exercice, et personne ne le voit
 * avant la seance suivante. Rassemblees le 15 septembre 2026.
 */
export const iriDe = (v: Exercice | string): string =>
  typeof v === 'string' ? v : v['@id'];

export interface Serie {
  id?: number;
  ordre: number;
  reps: number | null;
  poids: number | null;
  secondes: number | null;
  faite: boolean;
  repsCible: number | null;
  poidsCible: number | null;
  secondesCible: number | null;
}

export interface SeanceExercice {
  id?: number;
  exercice: Exercice | string;
  ordre: number;
  mode: 'charge' | 'iso' | 'chrono' | null;
  notes: string | null;
  /** temps global d'un « for time » : les séries en dessous détaillent l'effort */
  secondesTotal: number | null;
  series: Serie[];
  /* PAS DE `rmEstime` — l'API ne le rend plus depuis le 19 septembre 2026.
     Elle le calculait avec sa propre ecriture d'Epley, que personne ne lisait :
     le front recalcule tout ce qu'il affiche, par `calcul/performance.ts`. */
}

export interface Seance {
  '@id'?: string;
  id?: number;
  date: string;
  type: 'Push' | 'Pull' | 'Legs' | null;
  modele?: string | null;
  exercices: SeanceExercice[];
  avancement?: { faites: number; total: number };
}

export interface ModeleSerie {
  id?: number;
  ordre: number;
  repsCible: number | null;
  poidsCible: number | null;
  secondesCible: number | null;
}

export interface ModeleExercice {
  id?: number;
  exercice: Exercice | string;
  ordre: number;
  mode: 'charge' | 'iso' | 'chrono' | null;
  notes: string | null;
  series: ModeleSerie[];
}

export interface Modele {
  '@id'?: string;
  id?: number;
  nom: string | null;
  type: 'Push' | 'Pull' | 'Legs' | null;
  /* PAS DE `partage` : le partage de modèle n'existe pas, et c'est une
     décision du 15 septembre 2026, pas un oubli (constat F-05). Le champ a
     existé sans jamais rien faire — `FiltreProprietaire` posait
     « WHERE utilisateur = :moi » avant que le `security:` qui le lisait ne
     soit évalué. Il a été retiré de l'entité, de la base et d'ici le même
     jour ; ne pas le réintroduire sans rouvrir la décision. */
  exercices: ModeleExercice[];
}

/**
 * Une consigne de complément, rattachée à un moment de repas.
 *
 * Ce n'est pas une prise : l'objet ne dit pas « pris ce matin », il dit
 * « avec le repas du matin, 5 g de créatine ». Il vaut tous les jours.
 */
export interface Complement {
  '@id'?: string;
  id: number;
  nom: string;
  /* EN NOMBRE, ET CE CHAMP A DEJA MENTI — panne du 23 septembre 2026.
     Il declarait `string`, avec un commentaire affirmant que l'API « refuse un
     nombre ». Les deux etaient faux : `Complement::getQuantite(): float` rend
     un flottant depuis le 17 aout 2026, et API Platform serialise par
     l'accesseur. L'onglet Compte tombait donc en page blanche sur
     `t.trim is not a function`, sans que `tsc` puisse rien voir — on lui avait
     decrit le contraire du cable. En LECTURE c'est un nombre ; en ECRITURE les
     deux formes passent depuis `App\Metadata\DecimalesNumeriques`. */
  quantite: number;
  unite: string;
  repas: Repas;
}

export interface Utilisateur {
  /* FACULTATIF, ET C'EST LA VÉRITÉ. `@id` est fabriqué par API Platform : la
     collection `/utilisateurs` le porte, `/moi` non — c'est un contrôleur
     ordinaire qui sérialise l'entité. Aucun écran ne lit ce champ sur un
     utilisateur ; le déclarer obligatoire n'aurait rien protégé, seulement
     obligé à en inventer un. */
  '@id'?: string;
  id: string;
  email: string;
  nom: string;
  roles: string[];
  sourceFrigo: 'base' | 'grocy';
  /**
   * Le mot de passe de ce compte ne respecte plus les règles du projet.
   *
   * POSÉ À LA DERNIÈRE CONNEXION, seul moment où le serveur l'a en clair : il
   * n'en garde qu'une empreinte, et on ne relit pas une empreinte pour savoir
   * si elle contenait une majuscule. Les règles ont durci le 18 septembre
   * 2026 ; ce drapeau permet de le DIRE sans mettre personne dehors.
   *
   * FACULTATIF PARCE QU'UN SERVEUR PLUS ANCIEN NE LE RENVOIE PAS — le web est
   * servi par le même déploiement que l'API, mais un APK installé depuis des
   * mois parle au NAS d'aujourd'hui. `undefined` doit se lire « je ne sais
   * pas », donc « on n'affiche rien », jamais « c'est faible ».
   */
  motDePasseFaible?: boolean;
}

/**
 * Un aliment tel que le renvoie /api/mon-frigo, quelle que soit sa source.
 * Grocy pour l'administrateur, la table « aliment » pour les autres — le
 * front ne fait pas la différence.
 */
export interface AlimentDisponible {
  /** « grocy:12 » ou « base:47 » : la source est dans la référence */
  reference: string;
  nom: string;
  /** code CIQUAL ; `null` quand l'aliment n'est rattaché à rien */
  referenceCiqual?: string | null;
  categorie: 'prot' | 'fec' | 'leg' | 'ole' | 'huile' | 'lait' | 'fruit' | 'autre';
  kcal100: number;
  prot100: number;
  gluc100: number;
  lip100: number;
  fibres100: number | null;
  ratio: number;
  /** quantité réellement disponible, exprimée dans l'unité ci-dessous */
  stock: number;
  /**
   * Unité du stock. « g » pour tout ce que le calculateur sait traiter — les
   * macros sont pour 100 g. Une autre valeur (« Pieces », « Litres ») signale
   * un produit que le solveur ne peut pas utiliser tel quel.
   */
  unite: string;
  /**
   * Combien de grammes vaut une unité de stock : 1 au gramme, 1000 au
   * kilogramme, 55 pour un œuf dont la conversion est déclarée dans Grocy.
   * `null` quand elle est inconnue — un litre ou un pack n'ont pas de poids,
   * et l'aliment ne peut pas entrer dans un calcul de macros.
   */
  grammesParUnite: number | null;
  emplacement: string | null;
  peseeAvant: number | null;
  peseeApres: number | null;
  /**
   * D'où vient le rendement retenu.
   *
   * `mesure` : l'utilisateur a pesé son aliment cru puis cuit, et c'est SON
   * chiffre qui est utilisé — aucun import ne peut plus l'écraser, la règle
   * s'applique à la lecture. `table` : faute de pesée, on prend la valeur de
   * référence.
   */
  provenanceRatio: 'mesure' | 'table';
}

/**
 * Un produit Grocy que l'application ne peut PAS calculer, et qu'elle montre
 * quand meme.
 *
 * Il n'a pas de macros — pas « zéro macro » : pas de valeur du tout. Lui en
 * inventer une serait un chiffre faux devant une balance (règles 6 et 7). Il
 * est donc d'un AUTRE type que `AlimentDisponible`, et c'est ce qui empêche
 * le calculateur de le voir par accident : il ne peut pas se glisser dans une
 * liste d'aliments, le compilateur le refuse.
 */
/**
 * Une entrée du catalogue CIQUAL publié par l'Anses.
 *
 * ELLE SERT À RATTACHER, PAS À CHIFFRER. Le lien qu'un aliment pose vers elle
 * dit ce que l'aliment EST — donc à quel repas il convient et avec quoi il va.
 * Les valeurs ci-dessous sont celles d'un aliment GÉNÉRIQUE : elles ne
 * remplacent jamais celles lues sur un paquet. « Un riz basmati acheté par
 * l'utilisateur A peut ne pas avoir les mêmes macros que celui de
 * l'utilisateur B » (20 septembre 2026, règle 7). Elles ne servent qu'à
 * avertir quand une saisie s'en écarte très fortement.
 *
 * Nullables, et c'est la règle 6 : CIQUAL écrit « - » pour « non mesuré » et
 * « traces » pour « trop faible pour être chiffré ». Ni l'un ni l'autre ne
 * vaut zéro.
 */
export interface AlimentReference {
  code: string;
  nom: string;
  groupe: string;
  sousgroupe: string;
  sousgroupeCode: string;
  kcal100: number | null;
  prot100: number | null;
  gluc100: number | null;
  lip100: number | null;
  fibres100: number | null;
}

/**
 * Un produit Grocy tel que l'écran de migration le reçoit.
 *
 * Il réunit les deux formes que Grocy porte : les produits complets et ceux
 * dont les valeurs n'ont jamais été renseignées. `valeursConnues` dit lequel
 * des deux — et c'est ce qui décide du travail demandé : confirmer, ou lire
 * l'étiquette du paquet.
 *
 * Les macros sont nullables parce qu'elles PEUVENT manquer. Les mettre à zéro
 * ferait enregistrer des zéros que personne n'a saisis (règle 6).
 */
export interface AlimentAMigrer {
  reference: string;
  nom: string;
  stock: number;
  unite?: string;
  emplacement: string | null;
  valeursConnues: boolean;
  categorie?: string;
  kcal100?: number | null;
  prot100?: number | null;
  gluc100?: number | null;
  lip100?: number | null;
  fibres100?: number | null;
  ratio?: number;
  peseeAvant?: number | null;
  peseeApres?: number | null;
  /** ce qui manque, pour les produits jamais renseignés */
  manquants?: string[];
}

export interface AlimentIncomplet {
  reference: string;
  nom: string;
  stock: number;
  emplacement: string | null;
  unite: string;
  /** les champs Grocy vides : `kcal100`, `prot100`… */
  manquants: string[];
}

export interface MonFrigo {
  source: 'grocy' | 'base';
  aliments: AlimentDisponible[];
  /** Grocy seulement : visibles à l'écran, invisibles au calculateur. */
  incomplets?: AlimentIncomplet[];
  /** message expliquant pourquoi la liste est vide, le cas échéant */
  probleme: string | null;
}
