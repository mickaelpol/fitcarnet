import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  useCibles, useEnregistrerCuissons, useEnregistrerPlan, useMarquerCuisine,
  useMesCuissons, useModesCuisson, useMonFrigo, usePlans, useSupprimerPlan,
} from '@/api/hooks';
import type { PlanRepas } from '@/api/hooks';
import type { AlimentDisponible } from '@/api/types';
import { Bouton, Carte, Champ, Chargement, Chiffre, Discret, Erreur, Texte, Vide } from '@/composants/base';
import { ChoixDansListe } from '@/composants/choixAliment';
import {
  DetailComplements, LigneComplements, RappelComplements,
} from '@/composants/complements';
import { Confirmer } from '@/composants/confirmer';
import { Calendrier, libelleCourt, libelleDuJour } from '@/composants/calendrier';
import { Etapes } from '@/composants/etapes';
import { Pliant } from '@/composants/pliant';
import {
  type Cuissons, type ModeCuisson, type PlanEnregistre, cleDHabitude,
  cleDeCuisson, dejaPromis, depuisLesHabitudes, enFournees, estCuisine,
  figerLePlan, habitudesAEcrire, repartition, resteSansCuisson, sansCuisson,
} from '@/calcul/cuisson';
import {
  MODELE, NOM_REPAS, REPAS,
  type AuMieux, type DemandeDatee, type DemandeRepas, type Repas, type Role,
  cleDuRepas, composer, listeDeCourses, resoudreLaPeriode, roleDe, rolesDuRepas,
} from '@/solveur/composer';
import { verifierCatalogue } from '@/calcul/plausibilite';
import { basculer, estCoche } from '@/calcul/selectionRepas';
import { versReference } from '@/solveur/solveur';
import type { Aliment, Fixe } from '@/solveur/types';
import { C, E, N, P, R, T, TOUCHE, couleurRole, nb } from '@/theme';

/**
 * Le calculateur : l'application compose, tu corriges, elle recalcule.
 *
 * Étapes 1 et 2 du parcours décrit dans CALCULATEUR.md. Un plan tient sur un
 * ou plusieurs jours, et UN SEUL JOUR N'EST PAS UN CAS PARTICULIER : c'est une
 * période de longueur 1. Tout l'écran est indexé par `jour|repas`, et le
 * solveur ne fait aucune différence entre les deux — ce qui évite deux chemins
 * de code dont un seul serait testé.
 *
 * Le batch cooking (étape 3) reste à faire.
 */

/* Les dates vivent dans `composants/calendrier` : rang, libellé et grille du
   mois y sont écrits une fois. Cet écran ne manipule que des RANGS — 0 pour
   aujourd'hui, 3 pour dans trois jours — et n'a donc besoin d'aucun calcul de
   calendrier. */

/* L'ordre d'affichage. `fixe` dit la quantité par personne quand le rôle
   n'est pas une variable du solveur — l'huile et le légume. */
/* Mêmes seuils que le solveur : au-delà, l'écart n'est plus de l'arrondi. */
const TOLERANCE = { kcal: 45, prot: 1.5, gluc: 2.5, lip: 1.2 };

/* Ordre d'affichage. La quantité d'un rôle imposé ne vit plus ici mais dans
   le modèle du repas : elle change d'un repas à l'autre. */
const ROLES: { cle: Role; titre: string; cat: string }[] = [
  { cle: 'laitage', titre: 'Laitage', cat: 'lait' },
  { cle: 'proteine', titre: 'Protéine', cat: 'prot' },
  { cle: 'glucide', titre: 'Glucide', cat: 'fec' },
  { cle: 'fruit', titre: 'Fruit', cat: 'fruit' },
  { cle: 'lipide', titre: 'Oléagineux', cat: 'ole' },
  { cle: 'huile', titre: 'Huile', cat: 'huile' },
  { cle: 'legume', titre: 'Légume', cat: 'leg' },
];

/** Grammes par personne d'un rôle imposé à ce repas, ou undefined s'il varie. */
const imposePour = (repas: Repas, cle: Role): number | undefined =>
  MODELE[repas].imposes.find((i) => i.role === cle)?.grammes;

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

const demandePour = (
  repas: Repas,
  compose: Compose,
  portions: number,
  cible: { kcal: number; prot: number; gluc: number; lip: number; glucidesTotaux?: boolean },
): DemandeRepas => {
  const fixes: Fixe[] = [];
  const variables: { proteine?: Aliment; glucide?: Aliment; lipide?: Aliment } = {};

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
    const saisi = (reste?.grammes ?? '').trim();
    const grammes = Number(saisi.replace(',', '.'));

    /* Un reste déclaré fige la quantité : l'aliment sort des variables et
       le repas se recompose autour de lui.
       Zéro est une valeur COMME UNE AUTRE — « je n'en mets pas » — et non
       un champ vide. C'est ce qui permet d'écarter un aliment sans le
       remplacer, et le repas se recalcule autour des autres. */
    if (saisi !== '' && Number.isFinite(grammes) && grammes >= 0) {
      fixes.push({ aliment, grammes, unite: reste!.unite });
    } else if (fixe !== undefined) {
      // même règle que `composer` : la quantité s'entend dans l'état de
      // référence de l'aliment, donc ce qu'on sert.
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
  };
};

/** Un repas composé, tel que l'utilisateur peut encore le corriger. */
interface Compose {
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
  /** l'aliment dont on a un reste, avec ce qu'il en reste */
  restes: Record<string, { grammes: string; unite: 'cru' | 'cuit' }>;
  /** les rôles que l'utilisateur a décidés lui-même : jamais remplacés d'office */
  verrous: Role[];
}

const vers = (a: AlimentDisponible): Aliment => ({
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

export default function Calculateur() {
  const frigo = useMonFrigo();
  const cibles = useCibles();
  const modesCuisson = useModesCuisson();
  const plansGardes = usePlans();
  const enregistrerPlan = useEnregistrerPlan();
  const supprimerPlan = useSupprimerPlan();
  /* Les cuissons déjà décidées les fois précédentes. Elles ne DÉCIDENT rien :
     elles pré-remplissent, et l'utilisateur change ce qu'il veut. */
  const mesCuissons = useMesCuissons();
  const enregistrerCuissons = useEnregistrerCuissons();
  const marquerCuisine = useMarquerCuisine();
  const insets = useSafeAreaInsets();

  /* --------------------------------------------------------- la période
     Un plan tient sur un ou plusieurs jours. Un seul jour n'est pas un cas
     particulier : c'est une période de longueur 1, et le solveur ne fait
     aucune différence. Tout ce qui suit est donc indexé par `jour|repas` —
     « 0|R2 » pour le déjeuner du premier jour. */

  const [plusieurs, setPlusieurs] = useState(false);
  /* Les jours retenus, en rang : [0] pour aujourd'hui seul, [0, 2, 3] pour
     aujourd'hui, après-demain et le jour suivant. Toujours triés. */
  const [rangs, setRangs] = useState<number[]>([0]);

  const [choisis, setChoisis] = useState<Record<string, boolean>>({});
  const [portions, setPortions] = useState<Record<string, number>>({});
  const [plan, setPlan] = useState<Record<string, Compose> | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [remplacer, setRemplacer] = useState<{ cle: string; role: Role } | null>(null);
  const [ajouter, setAjouter] = useState<string | null>(null);
  const [courses, setCourses] = useState(false);
  /* Le pliage. Un seul jour ouvert à la fois — un accordéon, pas sept encarts
     dépliés qui reproduiraient exactement le mur qu'on veut éviter. Le repas
     détaillé, lui, est libre : on n'en ouvre qu'un parce qu'on n'en règle
     qu'un. */
  const [jourOuvert, setJourOuvert] = useState<number | null>(0);
  const [detaille, setDetaille] = useState<string | null>(null);
  /* Le batch cooking est une ÉTAPE, pas un affichage. On y arrive une fois
     les cuissons décidées, et on y trouve dans l'ordre : ce qu'il manque à
     acheter, ce qu'on met à cuire, puis ce qu'on répartit dans les boîtes.
     C'est l'ordre dans lequel on fait les gestes. */
  const [batch, setBatch] = useState(false);
  const [boiteOuverte, setBoiteOuverte] = useState<string | null>(null);
  /* Le calendrier s'ouvre quand on bascule en « plusieurs jours » — il n'y a
     rien d'autre à faire à cet instant — et se referme dès qu'on a choisi. */
  const [calendrierOuvert, setCalendrierOuvert] = useState(false);
  const [nomDuPlan, setNomDuPlan] = useState('');
  /* Un plan relu. Il ne se recalcule pas : on affiche ce qui a été figé.
     On garde le PLAN ENTIER et non ses seuls libellé et contenu : c'est
     depuis cet écran qu'on déclare l'avoir cuisiné, et ça demande son
     identifiant et son état. */
  const [relu, setRelu] = useState<PlanRepas | null>(null);
  const [plansOuverts, setPlansOuverts] = useState(false);
  const [planASupprimer, setPlanASupprimer] = useState<{ id: number; libelle: string } | null>(null);
  /* Les cuissons choisies À LA MAIN pour ce plan, par repas et par aliment.
     Rien n'est stocké sur la fiche de l'aliment : les mêmes pommes de terre
     passent au four ce soir et à la vapeur demain. Clé : « jour|repas|id ».

     Cet état ne contient QUE les choix explicites. Les habitudes se
     superposent dessous (voir `cuissons`, plus bas) plutôt que d'être
     recopiées ici : recopier obligerait à savoir quand recopier, à ne pas
     écraser ce que l'utilisateur vient de faire, et à distinguer « il n'a pas
     encore choisi » de « il a choisi la même chose ». Trois questions qui ne
     se posent pas si le défaut reste en dessous. */
  const [cuissonsChoisies, setCuissonsChoisies] = useState<Cuissons>({});
  const [choisirCuisson, setChoisirCuisson] = useState<
    { cle: string; aliment: Aliment } | null>(null);

  /* Les jours réellement planifiés : un seul si le mode ne l'est pas. Rendus
     dans l'ordre du temps, quel que soit l'ordre où on les a cochés. */
  const joursRetenus = useMemo(
    () => (plusieurs ? [...rangs].sort((x, y) => x - y) : [0]),
    [plusieurs, rangs],
  );

  /**
   * Ce repas est-il à cuisiner ?
   *
   * PRÉ-COCHÉ DÈS QU'UN OBJECTIF EXISTE POUR CE REPAS, et c'est le geste
   * qu'on économise le plus souvent. Avoir renseigné une cible pour le
   * déjeuner, c'est avoir dit qu'on déjeune : redemander de le cocher, quatre
   * fois par jour sur sept jours, faisait vingt-huit appuis pour redire ce
   * que le compte savait déjà.
   *
   * `??` et non `||` : décocher écrit `false`, et `false || défaut` le
   * remettrait à `true`. Un repas décoché doit le rester.
   */
  const coche = (rang: number, repas: Repas): boolean =>
    estCoche(choisis, cleDuRepas(rang, repas), cibleDe(repas) !== undefined);
  const convives = (rang: number, repas: Repas): number =>
    portions[cleDuRepas(rang, repas)] ?? 1;

  /* Le calculateur ne travaille qu'avec ce qui a un poids connu : un litre ou
     un pack n'entrent pas dans un calcul de macros pour 100 g. Un aliment sans
     énergie non plus — l'écrire à zéro fausserait tout le repas. */
  const stock = useMemo(
    () => (frigo.data?.aliments ?? [])
      .filter((a) => a.grammesParUnite !== null && a.stock > 0 && a.kcal100 > 0)
      .map(vers),
    [frigo.data],
  );

  /* Combien il y en a VRAIMENT, en grammes à cuire. C'est ce qui empêche le
     calculateur de réclamer 327 g de saumon quand il n'y en a que 200. */
  const grammesEnStock = useMemo(() => {
    const m = new Map<number | string, number>();
    for (const a of frigo.data?.aliments ?? []) {
      if (a.grammesParUnite !== null) m.set(a.reference, a.stock * a.grammesParUnite);
    }

    return m;
  }, [frigo.data]);

  /**
   * CE QUI EST DÉJÀ PROMIS À UN PLAN PRÉVU.
   *
   * Le bug que ça corrige : deux batch cooking d'affilée comptaient DEUX FOIS
   * le même frigo. On compose lundi-mercredi, on enregistre ; on compose
   * jeudi-samedi, et le solveur repartait du stock d'avant. Le premier plan
   * avait beau vider les 800 g de poulet, le second annonçait « objectifs
   * atteints » sur du poulet qui n'existait plus — et rien ne le disait,
   * puisque chaque plan était juste tout seul.
   */
  const promis = useMemo(
    () => dejaPromis(plansGardes.data ?? []), [plansGardes.data]);

  /**
   * Combien il y en a vraiment, DISPONIBLE — stock moins ce qui est promis.
   *
   * Le plancher à zéro compte : un frigo négatif n'existe pas, et le solveur
   * le lirait comme une dette à rembourser sur les repas suivants.
   */
  const stockDe = useCallback(
    (a: Aliment) => Math.max(0, (grammesEnStock.get(a.id) ?? 0) - (promis.get(a.id) ?? 0)),
    [grammesEnStock, promis]);

  /* Les fibres ne sont pas des macros pour le solveur — elles n'entrent dans
     aucune cible — mais elles pèsent 2 kcal par gramme. Sans elles à l'écran,
     le total de calories d'un repas paraît sorti de nulle part. */
  const fibresPar100 = useMemo(() => {
    const m = new Map<number | string, number>();
    for (const a of frigo.data?.aliments ?? []) m.set(a.reference, a.fibres100 ?? 0);

    return m;
  }, [frigo.data]);

  const fibresDe = useCallback(
    (a: Aliment) => fibresPar100.get(a.id) ?? 0, [fibresPar100]);

  /* Ce que les données racontent et qui ne peut pas être vrai.
     Le solveur est juste ; il ne peut rien contre un aliment dont les valeurs
     mentent. Des valeurs de riz CUIT posées sur un riz qu'on pèse sec se
     calculent parfaitement — et font peser trois fois trop. On le dit AVANT
     de composer, pas après avoir mangé. */
  const anomalies = useMemo(() => verifierCatalogue(stock), [stock]);

  /* LES FIBRES INCONNUES, QUAND LA CIBLE LES COMPTE.
   *
   * Une cible en glucides TOTAUX additionne glucides et fibres. Un aliment
   * dont les fibres sont inconnues est alors compté comme s'il n'en avait
   * aucune — et le solveur en sert davantage pour atteindre le chiffre :
   * un pain complet à 42 g de glucides et 7 g de fibres inconnues fait
   * peser 143 g au lieu de 122. Dix-sept pour cent de féculent en trop,
   * quatre fois par jour.
   *
   * On ne corrige pas à la place de l'utilisateur — inventer 7 g de fibres
   * serait pire que de les ignorer. On NOMME les aliments concernés, une
   * fois, et seulement quand la cible rend le problème réel. */
  const cibleEnGlucidesTotaux = (cibles.data ?? []).some((c) => c.glucidesTotaux === true);

  const sansFibresConnues = useMemo(() => {
    if (!cibleEnGlucidesTotaux) return [];

    return (frigo.data?.aliments ?? [])
      .filter((a) => a.fibres100 === null || a.fibres100 === undefined)
      /* Les fibres d'une huile ou d'un blanc de poulet sont nulles, pas
         inconnues : les signaler noierait les vrais cas. On ne parle que de
         ce qui en contient forcément. */
      .filter((a) => a.categorie === 'fec' || a.categorie === 'leg'
        || a.categorie === 'fruit' || a.categorie === 'ole')
      .map((a) => a.nom);
  }, [frigo.data, cibleEnGlucidesTotaux]);

  const cibleDe = (repas: Repas) => (cibles.data ?? []).find((c) => c.repas === repas);

  /* Les demandes du plan, dans l'ordre du temps. Sert deux fois : au calcul
     réel, bridé par le frigo, et à la liste de courses, frigo plein. */
  const demandes = useMemo((): DemandeDatee[] => {
    if (plan === null) return [];
    const out: DemandeDatee[] = [];

    for (const rang of joursRetenus) {
      for (const repas of REPAS) {
        const cle = cleDuRepas(rang, repas);
        const compose = plan[cle];
        const cible = (cibles.data ?? []).find((c) => c.repas === repas);
        if (compose === undefined || cible === undefined) continue;
        /* Le RANG du calendrier sert directement de rang de période : le
           solveur ne s'en sert que pour ordonner et pour nommer sa sortie.
           Lui passer un index à part obligerait à retraduire ses clés, et une
           erreur de traduction attribuerait les repas d'un jour à un autre —
           sans que rien ne le signale. Un seul système de numérotation. */
        out.push({ ...demandePour(repas, compose, portions[cle] ?? 1, cible), jour: rang });
      }
    }

    return out;
  }, [plan, cibles.data, portions, joursRetenus]);

  /* TOUTE la période résolue EN UNE PASSE, sur un frigo qui se vide. Chaque
     repas se plafonnait déjà à ce qu'il restait ; aucun ne savait que les
     autres avaient servi avant lui — ni hier. */
  const resultats = useMemo(
    () => (demandes.length === 0
      ? new Map<string, AuMieux>()
      : resoudreLaPeriode(demandes, stockDe, stock)),
    [demandes, stockDe, stock],
  );

  /* Ce qu'il faut acheter pour tenir le plan. Calculé frigo plein puis
     diminué du stock réel : le solveur CONTOURNE une pénurie au lieu de la
     subir, donc compter les manques du plan répondrait « rien ». */
  const aAcheter = useMemo(
    () => (demandes.length === 0 ? [] : listeDeCourses(demandes, stockDe, stock)),
    [demandes, stockDe, stock],
  );

  /* Le plan mis à plat, tel que `enFournees` l'attend : un repas, ses
     quantités. Ce module ne recalcule RIEN — il regroupe ce que le solveur a
     déjà résolu, et c'est la garantie qu'un regroupement ne peut pas fausser
     un gramme. */
  const plat = useMemo(
    () => joursRetenus.flatMap((rang) => REPAS
      .map((repas) => cleDuRepas(rang, repas))
      .filter((cle) => resultats.has(cle))
      /* L'ordre du TEMPS, pas celui d'une Map : on remplit ses boîtes dans
         l'ordre où on les mangera. */
      .map((cle) => ({
        cle,
        convives: portions[cle] ?? 1,
        quantites: resultats.get(cle)!.resultat.quantites,
      }))),
    [resultats, joursRetenus, portions],
  );

  /**
   * LES CUISSONS EFFECTIVES : tes habitudes, puis tes choix par-dessus.
   *
   * Deux couches, jamais une seule. Ce qui vient des habitudes est un DÉFAUT ;
   * ce que tu touches à l'écran passe toujours devant, et le reste devant
   * même si l'habitude change entre-temps. C'est ce qui rend un choix
   * explicite indéracinable, sans un seul effet de bord.
   *
   * Tout le reste de l'écran lit CETTE valeur — le compteur d'aliments à
   * situer, les fournées, les boîtes. Un endroit du code qui lirait encore
   * `cuissonsChoisies` verrait un plan à moitié réglé et redemanderait des
   * cuissons déjà connues.
   */
  const cuissons = useMemo(
    (): Cuissons => ({
      ...depuisLesHabitudes(plat, mesCuissons.data ?? {}),
      ...cuissonsChoisies,
    }),
    [plat, mesCuissons.data, cuissonsChoisies],
  );

  /* Ce que ce plan apprend, et qui n'était pas déjà su. Rien si rien n'a
     changé : une semaine sans nouveauté doit pouvoir se composer sans une
     seule écriture. */
  const habitudesNouvelles = useMemo(
    () => habitudesAEcrire(plat, cuissons, mesCuissons.data ?? {}),
    [plat, cuissons, mesCuissons.data],
  );

  /**
   * Retenir ce qui vient d'être décidé — au passage au batch cooking.
   *
   * C'est le moment JUSTE : l'utilisateur vient de finir de régler ses
   * cuissons, il ne reviendra pas dessus. Écrire plus tôt — à chaque appui
   * dans le sélecteur — enregistrerait des aller-retours d'hésitation ;
   * écrire plus tard, à l'enregistrement du plan, raterait les plans qu'on
   * consulte sans enregistrer.
   *
   * L'échec ne bloque RIEN et ne s'affiche pas. Une habitude perdue coûte un
   * appui la semaine prochaine ; interrompre quelqu'un qui va cuisiner pour
   * lui dire qu'un défaut n'a pas été mémorisé coûte plus cher que ça.
   */
  const retenirLesCuissons = () => {
    if (habitudesNouvelles.length === 0) return;
    enregistrerCuissons.mutate(habitudesNouvelles, { onError: () => {} });
  };

  const parFournee = useMemo(
    () => enFournees(plat, cuissons, modesCuisson.data ?? []),
    [plat, cuissons, modesCuisson.data],
  );

  const restentASituer = useMemo(() => sansCuisson(plat, cuissons), [plat, cuissons]);

  const boites = useMemo(() => repartition(plat, cuissons), [plat, cuissons]);

  /**
 * « le mercredi 13/08 », ou rien du tout si la date est illisible.
 *
 * `new Date('n'importe quoi')` ne lève PAS : il rend un objet dont
 * `toLocaleDateString` écrit « Invalid Date » en toutes lettres, au milieu
 * d'une phrase. C'est ce qui s'est affiché sur un plan jamais cuisiné, et ça
 * a l'air d'un bug de données alors que c'est un bug de lecture.
 *
 * On préfère ne rien dire de la date que d'en dire une fausse : la phrase
 * reste juste sans elle.
 */
const dateCourte = (iso: string | null | undefined): string => {
  if (iso === null || iso === undefined || iso === '') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  return ` le ${d.toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: '2-digit',
  })}`;
};

/** « Aujourd'hui · Midi » — le nom d'une boîte. */
  const nomDeLaBoite = (cle: string): string => {
    const [rang, repas] = cle.split('|');

    return `${libelleDuJour(Number(rang))} · ${NOM_REPAS[repas as Repas]}`;
  };

  /**
   * Tout remettre à zéro.
   *
   * Appelé après un enregistrement. Sans cela, revenir sur l'écran affichait
   * encore les jours cochés, les convives et les cuissons du plan qu'on vient
   * de ranger — on croyait repartir de zéro et on repartait de la veille, en
   * corrigeant à l'aveugle une sélection qu'on ne voyait plus.
   *
   * Un plan enregistré est fini. Le suivant commence sur une page blanche.
   */
  const toutRecommencer = () => {
    setPlan(null);
    setBatch(false);
    setRelu(null);
    setChoisis({});
    setPortions({});
    setCuissonsChoisies({});
    setRangs([0]);
    setPlusieurs(false);
    setCalendrierOuvert(false);
    setOuvert(null);
    setDetaille(null);
    setJourOuvert(0);
    setBoiteOuverte(null);
    setCourses(false);
    setNomDuPlan('');
  };

  /** Compose tous les repas cochés, en évitant de resservir le même aliment. */
  const composerTout = () => {
    const suite: Record<string, Compose> = {};

    for (const rang of joursRetenus) {
      /* « Déjà servi » se remet à zéro CHAQUE JOUR. Éviter le poulet deux
         fois le même jour est un service ; l'éviter toute la semaine serait
         une contrainte que personne n'a demandée. */
      const servis = new Set<number | string>();

      for (const repas of REPAS) {
        const cle = cleDuRepas(rang, repas);
        if (!coche(rang, repas)) continue;
        const c = composer(stock, convives(rang, repas), servis, repas);

        const roles: Partial<Record<Role, Aliment>> = {};
        /* Une variable du solveur peut venir d'un rôle différent : à la
           collation, c'est le laitage qui porte les protéines. */
        for (const slot of ['proteine', 'glucide', 'lipide'] as const) {
          const a = c.variables[slot];
          if (a) { roles[MODELE[repas][slot]] = a; servis.add(a.id); }
        }
        /* Les quantités imposées ne comptent pas dans « déjà servi » :
           resservir la même huile à tous les repas est normal. */
        for (const [role, aliment] of Object.entries(c.imposes)) {
          roles[role as Role] = aliment;
        }

        suite[cle] = { roles, restes: {}, verrous: [], ajouts: [] };
      }
    }

    setPlan(suite);
    setCourses(false);
    const premier = Object.keys(suite)[0];
    setOuvert(premier ?? null);
    setJourOuvert(joursRetenus[0] ?? null);
  };

  if (frigo.isLoading || cibles.isLoading) return <Chargement />;
  if (frigo.isError) {
    return <Erreur message={frigo.error.message} onReessayer={() => void frigo.refetch()} />;
  }

  const aucunCoche = joursRetenus.every((r) => REPAS.every((x) => !coche(r, x)));

  /* ------------------------------------------- un plan qu'on relit

     AVANT l'écran de réglage, et c'est un bug qui a coûté une manipulation :
     ce test était placé après `if (plan === null)`, qui rend le réglage et
     sort de la fonction. Toucher un plan enregistré le posait bien dans
     l'état, puis le composant se redessinait… et rendait le réglage. Le clic
     marchait, l'écran ne changeait jamais.

     La règle : les écrans se testent du plus SPÉCIFIQUE au plus général. Un
     plan relu est plus spécifique qu'un réglage vide. */

  if (relu !== null) {
    const p = relu.contenu;

    return (
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.page}>
          <Carte style={{ gap: E.xs }}>
            <Texte style={{ fontFamily: P.fort }}>{relu.libelle}</Texte>
            <Discret style={s.aide}>
              {/* Rien n'est recalculé ici, et c'est le point : le stock a
                  bougé depuis, les cibles ont peut-être changé. On ne veut
                  pas savoir ce qu'on cuisinerait aujourd'hui, on veut savoir
                  ce qu'on a cuisiné ce jour-là. */}
              Ce plan est figé tel qu'il a été enregistré. Les quantités ne se
              recalculent pas : c'est ce que tu as cuisiné, pas ce que ton
              frigo permettrait aujourd'hui.
            </Discret>

            {/* L'ÉTAT DU PLAN, dit en toutes lettres. C'est lui qui explique
                pourquoi le calculateur trouve moins d'aliments qu'il n'y en a
                dans le frigo : ce qui est promis à un plan prévu n'est plus
                disponible pour le suivant. Sans cette ligne, on croirait à un
                bug du solveur. */}
            {!estCuisine(relu) ? (
              <Discret style={[s.aide, { color: C.vif }]}>
                {(relu.contenu.consomme ?? []).length > 0
                  ? 'Prévu. Les ingrédients de ce plan sont mis de côté : tes '
                    + 'prochains calculs ne comptent plus dessus.'
                  /* Un plan version 1 ne sait pas ce qu'il prend au frigo. Le
                     TAIRE serait le pire des deux mondes : on croirait ses
                     ingrédients réservés alors que le plan suivant peut les
                     reprendre entièrement. C'est exactement comme ça que trois
                     plans se sont partagé 800 g de brocoli sur 500. */
                  : 'Enregistré avant la mise de côté des ingrédients : ce plan '
                    + 'ne réserve rien, et tes prochains calculs peuvent '
                    + 'reprendre les mêmes aliments. Refais-en un pour que le '
                    + 'frigo soit compté juste.'}
              </Discret>
            ) : (
              <Discret style={[s.aide, { color: C.ok }]}>
                Cuisiné{dateCourte(relu.cuisineLe)} · ton frigo a été
                décrémenté à ce moment-là.
              </Discret>
            )}
          </Carte>

          {/* Ce qui n'a pas pu être retiré du frigo. On le dit une seule fois,
              juste après l'appui, et on ne le devine jamais : un aliment
              disparu du frigo ne doit pas faire vider le bac voisin. */}
          {(marquerCuisine.data?.ignores ?? []).length > 0 && (
            <Carte style={{ gap: E.xs, backgroundColor: C.vifFond }}>
              <Texte style={{ fontFamily: P.fort }}>À retirer toi-même du frigo</Texte>
              {marquerCuisine.data!.ignores.map((x) => (
                <Discret key={x.nom} style={s.aide}>• {x.nom} — {x.motif}</Discret>
              ))}
            </Carte>
          )}

          {p.courses.length > 0 && (
            <Pliant
              titre="Liste de courses"
              resume={`${p.courses.length} aliment${p.courses.length > 1 ? 's' : ''} manquant`
                + `${p.courses.length > 1 ? 's' : ''} ce jour-là`}
              ouvert={courses}
              onBascule={() => setCourses(!courses)}
              teinte="jour"
            >
              {p.courses.map((c) => (
                <View key={c.nom} style={s.ligneCourse}>
                  <View style={[s.pastille, { backgroundColor: couleurRole(c.categorie) }]} />
                  <Texte style={{ flex: 1 }}>{c.nom}</Texte>
                  <Texte style={{ fontFamily: P.fort }}>{nb(c.grammes)} g</Texte>
                </View>
              ))}
            </Pliant>
          )}

          <Texte style={s.titreEtape}>
            À cuire · {p.fournees.length} fournée{p.fournees.length > 1 ? 's' : ''}
          </Texte>
          {p.fournees.map((f) => (
            <Carte key={f.libelle} style={{ gap: E.xs }}>
              <Texte style={{ fontFamily: P.fort }}>{f.libelle}</Texte>
              {f.lignes.map((l) => (
                <View key={l.nom} style={s.ligneCourse}>
                  <View style={[s.pastille, { backgroundColor: couleurRole(l.categorie) }]} />
                  <Texte style={{ flex: 1 }}>{l.nom}</Texte>
                  <Texte style={{ fontFamily: P.fort }}>{nb(l.aCuire)} g</Texte>
                </View>
              ))}
            </Carte>
          ))}

          <Texte style={s.titreEtape}>
            À servir · {p.boites.length} boîte{p.boites.length > 1 ? 's' : ''}
          </Texte>
          <Discret style={s.aide}>
            La colonne dorée est ce que TU te sers pour tenir tes macros.
          </Discret>

          {p.boites.map((b) => (
            <Pliant
              key={b.titre}
              titre={b.titre}
              resume={`${nb(b.cuits.reduce((n, x) => n + x.assiette, 0))} g cuits`
                + (b.convives > 1 ? `  ·  ${b.convives} personnes` : '')}
              ouvert={boiteOuverte === b.titre}
              onBascule={() => setBoiteOuverte(boiteOuverte === b.titre ? null : b.titre)}
            >
              <View style={s.entete}>
                <Discret style={[s.col, { flex: 2 }]}>aliment</Discret>
                <Discret style={s.col}>boîte</Discret>
                <Discret style={s.col}>1 pers.</Discret>
              </View>
              {[...b.cuits, ...b.crus].map((x) => (
                <View key={x.nom} style={s.ligneCourse}>
                  <View style={[s.pastille, { backgroundColor: couleurRole(x.categorie) }]} />
                  <Texte style={{ flex: 2 }}>{x.nom}</Texte>
                  <Texte style={[s.col, { textAlign: 'right' }]}>{nb(x.assiette)} g</Texte>
                  <Texte style={[s.col, { textAlign: 'right', color: C.vif }]}>
                    {nb(x.parPersonne)} g
                  </Texte>
                </View>
              ))}

              {/* LES COMPLÉMENTS NE SONT PAS FIGÉS DANS LE PLAN, ET C'EST
                  DÉLIBÉRÉ. Le reste de cet écran est un instantané : les
                  quantités du dimanche, relues le jeudi. Les compléments,
                  eux, sont une consigne COURANTE — en rouvrant ce plan on
                  veut savoir ce qu'on prend aujourd'hui, pas ce qu'on prenait
                  quand on l'a enregistré. On les relit donc à chaque
                  affichage, et changer sa routine met à jour les plans déjà
                  faits.

                  `b.repas` manque aux plans enregistrés avant que ce champ
                  existe (versions 1 et 2). Ces boîtes-là n'affichent rien,
                  plutôt que d'aller deviner le repas en relisant leur titre. */}
              {b.repas !== undefined && <LigneComplements repas={b.repas} />}
            </Pliant>
          ))}
        </ScrollView>

        <View style={[s.pied, { paddingBottom: E.m + insets.bottom, gap: E.s }]}>
          {/* LE GESTE QUI REND LE FRIGO HONNÊTE.
              Tant qu'on ne l'a pas fait, ce plan met ses ingrédients de côté :
              le calcul suivant ne compte plus dessus, mais le frigo, lui, est
              encore plein. L'appui fait basculer les deux d'un coup — le stock
              baisse vraiment, la mise de côté tombe. Les séparer laisserait,
              au moindre incident, soit un stock déduit deux fois, soit un
              frigo intact pour un plan déclaré cuisiné. */}
          {!estCuisine(relu) && (
            <>
              <Bouton
                onPress={() => marquerCuisine.mutate(relu.id, {
                  /* On recharge le plan depuis la liste plutôt que de bricoler
                     l'état local : c'est le serveur qui date la cuisson, et
                     recopier une date à la main ferait deux vérités. */
                  onSuccess: () => setRelu((v) => (v === null ? null : {
                    ...v, cuisineLe: new Date().toISOString(),
                  })),
                })}
                desactive={marquerCuisine.isPending}
              >
                {marquerCuisine.isPending
                  ? 'Déduction en cours…'
                  : "J'ai cuisiné — retirer du frigo"}
              </Bouton>
              <Discret style={s.aide}>
                Les quantités de ce plan seront retirées de ton stock, en poids
                pesé. À faire une fois les casseroles vidées.
              </Discret>
            </>
          )}
          {marquerCuisine.isError && (
            <Discret style={[s.aide, { color: C.erreur }]}>
              {marquerCuisine.error.message}
            </Discret>
          )}
          <Bouton variante="contour" onPress={() => { setRelu(null); marquerCuisine.reset(); }}>
            ← Fermer
          </Bouton>
        </View>
      </View>
    );
  }

  /* ------------------------------------------------ paramétrage */

  if (plan === null) {
    return (
      /* L'action principale est COLLÉE EN BAS, hors du défilement. Sept jours
         de repas font une page longue ; laisser le bouton à la fin obligeait
         à dérouler jusqu'en bas pour lancer le calcul, puis à remonter pour
         corriger. Il reste sous le pouce, là où on l'attend. */
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.page}>
        {/* Trois étapes, annoncées dès la première. Un écran qui enchaîne des
            questions sans dire combien il en reste se lit comme un formulaire
            sans fin. Ici on sait, dès le départ, qu'on en a pour trois. */}
        <Etapes courante={0} />

        <Carte style={{ gap: E.s }}>
          {/* Un interrupteur, pas deux boutons. Deux boutons demandent de lire
              lequel est enfoncé ; un interrupteur se lit d'un coup d'œil et
              dit tout seul dans quel état il est. */}
          {/* TOUTE LA LIGNE BASCULE, pas seulement l'interrupteur.

              Le petit interrupteur d'Android fait une cible d'une quinzaine de
              pixels de large, posée dans un ScrollView : au moindre mouvement
              du pouce pendant l'appui, c'est le défilement qui prend la main
              et le geste se perd. D'où l'impression qu'il « ne prend pas » et
              qu'il faut insister. Une ligne entière de 44 px se vise sans
              regarder, et un pouce qui glisse d'un millimètre la touche quand
              même.

              L'interrupteur reste, mais comme INDICATEUR : `pointerEvents:
              none` le rend transparent au toucher, sinon un appui dessus
              déclencherait à la fois son propre gestionnaire et celui de la
              ligne — deux bascules, donc rien de visible. Exactement le bug du
              double appui, pris par l'autre bout. */}
          <Pressable
            onPress={() => {
              const v = !plusieurs;
              setPlusieurs(v);
              if (!v) setRangs([0]);
              /* En activant « plusieurs jours », la seule chose à faire est de
                 choisir ses jours : on ouvre le calendrier plutôt que de
                 demander un appui de plus. */
              setCalendrierOuvert(v);
            }}
            style={s.interrupteur}
            accessibilityRole="switch"
            accessibilityLabel="Planifier plusieurs jours"
            accessibilityState={{ checked: plusieurs }}
          >
            <View style={{ flex: 1 }}>
              <Texte style={{ fontFamily: P.fort }}>Plusieurs jours</Texte>
              <Discret style={s.aide}>
                {plusieurs ? 'Choisis tes jours au calendrier' : "Aujourd'hui seulement"}
              </Discret>
            </View>
            {/* `style` et non la prop `pointerEvents` : react-native-web a
                déprécié la seconde et le prévient à chaque rendu. */}
            <View style={{ pointerEvents: 'none' }}>
              <Switch
                value={plusieurs}
                trackColor={{ false: C.ligne, true: C.vifFond }}
                thumbColor={plusieurs ? C.vif : C.attenue}
                /* Pas d'`onValueChange` : il ne peut pas se déclencher, et en
                   poser un laisserait croire qu'il sert. La ligne au-dessus
                   est le seul chemin. */
              />
            </View>
          </Pressable>
          <Discret style={s.aide}>
            {plusieurs
              ? 'Tous ces jours puisent dans le MÊME frigo : le premier se sert '
                + "d'abord, le dernier prend ce qui reste. S'il manque quelque "
                + 'chose, tu auras la liste de courses à la fin.'
              : 'Coche les repas à cuisiner et dis pour combien de personnes. '
                + "L'application composera à partir de ton frigo."}
          </Discret>
        </Carte>

        {(plansGardes.data ?? []).length > 0 && (
          /* En tête, parce que c'est souvent ce qu'on vient chercher : le
             jeudi midi on ne veut pas composer un plan, on veut relire celui
             de dimanche. */
          <Pliant
            titre="Mes plans enregistrés"
            /* En tête de l'écran et dépliable : c'est ce qu'on vient chercher
               le jeudi midi. On l'ouvre d'un appui sur son titre, puis on
               touche un plan pour le relire. */
            /* Replié, on veut savoir UNE chose : combien mettent encore des
               ingrédients de côté. C'est ce qui explique un frigo qui paraît
               plus vide qu'il ne l'est. */
            resume={(() => {
              const tous = plansGardes.data ?? [];
              const prevus = tous.filter((x) => !estCuisine(x)).length;

              /* Un plan sans `consomme` ne met rien de côté : ses aliments
                 restent comptés comme disponibles, et le plan suivant peut
                 les reprendre entièrement. C'est LE chiffre à voir sans
                 déplier. */
              const muets = tous.filter(
                (x) => !estCuisine(x) && (x.contenu.consomme ?? []).length === 0).length;

              return `${tous.length} plan${tous.length > 1 ? 's' : ''}`
                + (prevus > 0
                  ? `  ·  ${prevus} en attente de cuisson`
                  : '  ·  tous cuisinés')
                + (muets > 0 ? `  ·  ${muets} sans mise de côté` : '');
            })()}
            ouvert={plansOuverts}
            onBascule={() => setPlansOuverts(!plansOuverts)}
            teinte="jour"
          >
            {(plansGardes.data ?? []).map((pl) => (
              <View key={pl.id} style={s.ligneCourse}>
                <Pressable
                  onPress={() => { setRelu(pl); setBoiteOuverte(null); setCourses(false); }}
                  style={s.plan}
                  accessibilityLabel={`Ouvrir le plan ${pl.libelle}`}
                >
                  <View style={{ flex: 1 }}>
                    <Texte style={{ fontFamily: P.fort }}>
                      {pl.libelle}
                      {/* Un plan PRÉVU garde des ingrédients au chaud pour
                          lui. Le dire ici évite de chercher pourquoi le
                          calculateur trouve moins que ce qu'on voit dans le
                          frigo. */}
                      {/* TROIS ÉTATS, et le troisième est celui qui a coûté
                          800 g de brocoli pour 500 en stock : un plan
                          enregistré avant cette version ne sait pas ce qu'il
                          prend au frigo, donc il ne met RIEN de côté. Le
                          taire ferait croire l'inverse. */}
                      {!estCuisine(pl) && (
                        <Discret style={{
                          fontSize: T.minuscule,
                          color: (pl.contenu.consomme ?? []).length > 0 ? C.vif : C.erreur,
                        }}
                        >
                          {(pl.contenu.consomme ?? []).length > 0
                            ? '  ·  à cuisiner'
                            : '  ·  ne réserve rien'}
                        </Discret>
                      )}
                    </Texte>
                    <Discret style={s.aide}>
                      {pl.contenu.boites.length} boîte
                      {pl.contenu.boites.length > 1 ? 's' : ''}
                      {'  ·  '}
                      {pl.contenu.fournees.length} fournée
                      {pl.contenu.fournees.length > 1 ? 's' : ''}
                      {'  ·  touche pour ouvrir'}
                    </Discret>
                  </View>
                  <Texte style={s.chevronPlan}>›</Texte>
                </Pressable>
                {/* Une CROIX, pas le mot « Supprimer ». Le mot débordait sur
                    le chevron voisin : viser « ouvrir » supprimait le plan.
                    Et la suppression passe désormais par une confirmation —
                    un appui de travers ne doit pas détruire un plan qu'on a
                    mis une semaine à cuisiner. */}
                <Pressable
                  onPress={() => setPlanASupprimer(pl)}
                  style={s.croix}
                  accessibilityLabel={`Supprimer le plan ${pl.libelle}`}
                >
                  <Texte style={s.croixTexte}>×</Texte>
                </Pressable>
              </View>
            ))}
          </Pliant>
        )}

        {plusieurs && (
          /* Une grille de mois occupe la moitié de l'écran, et on n'y revient
             qu'une fois : le choix des jours se fait au début, le réglage des
             repas dure. Elle se replie donc dès qu'un jour est coché, en
             laissant lisible ce qui a été choisi — c'est la règle du Pliant :
             replié, un encart dit toujours l'essentiel. */
          <Pliant
            titre="Quels jours"
            resume={joursRetenus.length === 1
              ? libelleDuJour(joursRetenus[0]!)
              : `${joursRetenus.length} jours  ·  `
                + joursRetenus.map((r) => libelleCourt(r)).join(', ')}
            ouvert={calendrierOuvert}
            onBascule={() => setCalendrierOuvert(!calendrierOuvert)}
            teinte="jour"
          >
            <Calendrier
              rangs={rangs}
              onBasculer={(rang) => setRangs((liste) => (liste.includes(rang)
                /* On ne descend jamais sous un jour : un plan vide n'a pas de
                   sens, et le bouton « composer » serait mort. */
                ? (liste.length > 1 ? liste.filter((r) => r !== rang) : liste)
                : [...liste, rang]))}
            />
          </Pliant>
        )}

        {joursRetenus.map((rang) => {
          /* Le contenu d'un jour, identique qu'il soit plié ou non. Le sortir
             ici évite de l'écrire deux fois — et donc de le laisser diverger
             entre le mode « aujourd'hui » et le mode « plusieurs jours ». */
          const contenu = (
            <>
              {REPAS.map((repas) => {
                const cle = cleDuRepas(rang, repas);
                const cible = cibleDe(repas);
                const pris = coche(rang, repas);

                return (
                  <Pliant
                    key={cle}
                    titre={NOM_REPAS[repas]}
                    /* Replié, la ligne dit déjà l'essentiel : est-ce cuisiné,
                       pour combien, et vers quelles macros. On n'ouvre que
                       pour changer le nombre de convives. */
                    resume={cible
                      ? `${pris ? `${convives(rang, repas)} pers.  ·  ` : ''}`
                        + `${nb(cible.kcal)} kcal · ${nb(cible.prot)} P`
                        + ` · ${nb(cible.gluc)} G · ${nb(cible.lip)} L`
                      : 'aucun objectif défini'}
                    ouvert={detaille === cle}
                    onBascule={() => setDetaille(detaille === cle ? null : cle)}
                    teinte="repas"
                    aDroite={(
                      <Pressable
                        /* Cocher OUVRE le repas : régler le nombre de
                           convives est le geste qui suit immédiatement, et le
                           faire attendre un second appui n'apporte rien.
                           Décocher referme, pour la même raison. */
                        onPress={() => {
                          /* ON PART DE CE QUI EST AFFICHÉ, pas de ce qui est
                             stocké — et c'est tout le bug du double appui.

                             Un repas pré-coché parce qu'il a un objectif n'a
                             AUCUNE entrée dans `choisis` : la case est cochée,
                             le dictionnaire est vide. `!choisis[cle]` valait
                             donc `!undefined`, c'est-à-dire `true` — le
                             premier appui réécrivait exactement ce qui était
                             déjà à l'écran, sans rien changer. Il fallait
                             taper deux fois pour décocher.

                             `pris` est la valeur affichée, défaut compris.
                             L'inverser fait toujours basculer quelque chose. */
                          setChoisis((c) => basculer(c, cle, pris));
                          setDetaille(pris ? null : cle);
                        }}
                        style={s.coche}
                        accessibilityLabel={`Cuisiner le repas ${NOM_REPAS[repas]} du ${libelleDuJour(rang)}`}
                        accessibilityState={{ checked: pris }}
                      >
                        <View style={[
                          s.carre,
                          pris && { backgroundColor: C.ok, borderColor: C.ok },
                        ]}
                        >
                          {pris && <Texte style={s.coched}>✓</Texte>}
                        </View>
                      </Pressable>
                    )}
                  >
                    {pris ? (
                      <View style={s.persLigne}>
                        <Discret style={s.aide}>Pour combien de personnes ?</Discret>
                        <View style={s.pers}>
                          <Pressable
                            onPress={() => setPortions((p) => ({
                              ...p, [cle]: Math.max(1, (p[cle] ?? 1) - 1),
                            }))}
                            style={s.persBouton}
                            hitSlop={{ top: 3, bottom: 3, left: 5, right: 5 }}
                            accessibilityLabel="Une personne de moins"
                          >
                            <Texte style={s.signe}>−</Texte>
                          </Pressable>
                          <Chiffre taille={N.petit}>{convives(rang, repas)}</Chiffre>
                          <Pressable
                            onPress={() => setPortions((p) => ({
                              ...p, [cle]: Math.min(12, (p[cle] ?? 1) + 1),
                            }))}
                            style={s.persBouton}
                            hitSlop={{ top: 3, bottom: 3, left: 5, right: 5 }}
                            accessibilityLabel="Une personne de plus"
                          >
                            <Texte style={s.signe}>+</Texte>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <Discret style={s.aide}>
                        Coche à droite pour cuisiner ce repas.
                      </Discret>
                    )}
                  </Pliant>
                );
              })}

              {/* Recopier un jour évite de re-cocher quatre cases et de
                  re-régler quatre fois le nombre de personnes. C'est le geste
                  qui rend une semaine saisissable en moins d'une minute. */}
              {plusieurs && rang === joursRetenus[0] && joursRetenus.length > 1 && (
                <Bouton
                  variante="contour"
                  /* Les deux états se mettent à jour SÉPARÉMENT. Appeler
                     setPortions depuis l'intérieur de setChoisis marcherait à
                     l'oeil, mais React réexécute les fonctions de mise à jour —
                     deux fois en développement — et un effet de bord glissé
                     dedans se rejouerait avec lui. */
                  onPress={() => {
                    const modele = REPAS.map((repas) => ({
                      repas,
                      coche: coche(rang, repas),
                      convives: convives(rang, repas),
                    }));
                    const autres = joursRetenus.slice(1);

                    setChoisis((c) => {
                      const suite = { ...c };
                      for (const autre of autres) {
                        for (const m of modele) suite[cleDuRepas(autre, m.repas)] = m.coche;
                      }

                      return suite;
                    });
                    setPortions((p) => {
                      const suite = { ...p };
                      for (const autre of autres) {
                        for (const m of modele) suite[cleDuRepas(autre, m.repas)] = m.convives;
                      }

                      return suite;
                    });
                  }}
                >
                  Recopier ce jour sur les {joursRetenus.length - 1} autres
                </Bouton>
              )}
            </>
          );

          /* Un seul jour ne se plie pas : il n'y a rien à replier POUR. Le
             pliage sert à tenir sept jours sur un écran, pas à cacher le
             seul contenu de la page. */
          if (!plusieurs) return <View key={rang} style={s.jourSeul}>{contenu}</View>;

          const cuisines = REPAS.filter((r) => coche(rang, r)).length;

          return (
            <Pliant
              key={rang}
              titre={libelleDuJour(rang)}
              resume={cuisines === 0
                ? 'aucun repas'
                : `${cuisines} repas  ·  `
                  + `${REPAS.reduce((n, r) => n + (coche(rang, r) ? convives(rang, r) : 0), 0)} portions`}
              ouvert={jourOuvert === rang}
              onBascule={() => setJourOuvert(jourOuvert === rang ? null : rang)}
              teinte="jour"
            >
              {contenu}
            </Pliant>
          );
        })}

        {/* UN FRIGO INUTILISABLE EST UNE IMPASSE, et il faut en sortir d'ici.
            Auparavant l'écran disait « le calculateur ne devine rien » et
            s'arrêtait là : le bouton « Composer » restait éteint, sans dire
            où aller. Il fallait trouver soi-même l'onglet Frigo, y renseigner
            un poids, revenir. On dit maintenant quoi faire, et on y emmène. */}
        {stock.length === 0 && (
          <Carte style={{ gap: E.s }}>
            <Texte style={{ fontFamily: P.fort }}>
              {(frigo.data?.probleme ?? null) !== null
                ? 'Ton frigo est injoignable'
                : "Rien d'utilisable dans ton frigo"}
            </Texte>
            <Discret style={s.aide}>
              {frigo.data?.probleme
                ?? "Le calculateur ne travaille qu'avec des aliments dont il "
                  + 'connaît le poids par unité et les calories. Un litre ou un '
                  + 'paquet ne se pèse pas, et un aliment sans calories fausserait '
                  + 'tout le repas — les deux sont donc écartés.'}
            </Discret>
            <Bouton variante="contour" onPress={() => router.push('/frigo')}>
              Ouvrir mon frigo →
            </Bouton>
          </Carte>
        )}

        {anomalies.length > 0 && (
          <Carte style={{
            gap: E.xs,
            backgroundColor: anomalies[0]!.gravite === 'blocage' ? C.erreurFond : C.vifFond,
          }}
          >
            <Texte style={{ fontFamily: P.fort, fontSize: T.normal }}>
              {anomalies[0]!.gravite === 'blocage'
                ? 'Des données de ton frigo rendent le calcul faux'
                : 'Des données de ton frigo méritent une vérification'}
            </Texte>
            <Discret style={{ fontSize: T.petit, lineHeight: 17 }}>
              Le calcul sera juste, mais il partira de chiffres qui ne peuvent
              pas être vrais — et un résultat juste sur des chiffres faux reste
              faux. Corrige-les avant de cuisiner.
            </Discret>
            {anomalies.slice(0, 6).map((d) => (
              <Texte
                key={`${d.code}-${d.message}`}
                style={{
                  fontSize: T.petit,
                  lineHeight: 17,
                  color: d.gravite === 'blocage' ? C.erreur : C.vif,
                }}
              >
                • {d.message}
              </Texte>
            ))}
            {anomalies.length > 6 && (
              <Discret style={{ fontSize: T.petit }}>
                … et {anomalies.length - 6} autre(s).
              </Discret>
            )}
            {/* Ces corrections se font dans le frigo, pas ici. Nommer le
                problème sans donner le chemin oblige à le retenir jusqu'à
                l'onglet suivant. */}
            <Bouton variante="contour" onPress={() => router.push('/frigo')}>
              Corriger dans mon frigo →
            </Bouton>
          </Carte>
        )}

        {/* Voir `sansFibresConnues` : le solveur compte « inconnu » comme
            zéro, donc il sert davantage de féculent pour atteindre la cible.
            On ne le corrige pas à sa place — inventer une valeur serait pire
            — mais on ne le laisse pas non plus silencieux. */}
        {sansFibresConnues.length > 0 && (
          <Carte style={{ gap: E.s, borderColor: C.vifBord, backgroundColor: C.vifFond }}>
            <Texte style={{ fontFamily: P.fort }}>
              Fibres inconnues sur {sansFibresConnues.length} aliment
              {sansFibresConnues.length > 1 ? 's' : ''}
            </Texte>
            <Discret style={{ fontSize: T.petit, lineHeight: 17 }}>
              Ta cible compte les glucides TOTAUX — fibres comprises. Un aliment
              dont les fibres sont inconnues est compté comme s’il n’en avait
              aucune, et le calculateur en sert davantage pour atteindre le
              chiffre. Sur un pain complet, l’écart atteint 17 %.
            </Discret>
            <Discret style={{ fontSize: T.petit }}>
              {sansFibresConnues.slice(0, 8).join(', ')}
              {sansFibresConnues.length > 8 ? `, et ${sansFibresConnues.length - 8} autre(s)` : ''}
            </Discret>
            <Bouton variante="contour" onPress={() => router.push('/frigo')}>
              Renseigner dans mon frigo →
            </Bouton>
          </Carte>
        )}

        </ScrollView>

        <View style={[s.pied, { paddingBottom: E.m + insets.bottom }]}>
          <Confirmer
          visible={planASupprimer !== null}
          titre={`Supprimer « ${planASupprimer?.libelle ?? ''} » ?`}
          message="Ce plan et sa liste de courses seront perdus. Les repas déjà cuisinés, eux, sont dans ton frigo."
          onConfirmer={() => {
            if (planASupprimer !== null) supprimerPlan.mutate(planASupprimer.id);
            setPlanASupprimer(null);
          }}
          onAnnuler={() => setPlanASupprimer(null)}
        />

        <Bouton onPress={composerTout} desactive={aucunCoche || stock.length === 0}>
            {joursRetenus.length > 1
              ? `Composer les ${joursRetenus.length} jours`
              : 'Composer les repas'}
          </Bouton>
        </View>
      </View>
    );
  }

  /* --------------------------------------------- batch cooking */

  if (batch) {
    return (
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.page}>
          {/* L'ordre de cet écran est celui des GESTES : ce qu'il faut aller
              chercher, ce qu'on met à cuire, ce qu'on range dans les boîtes. */}
          {/* Revenir à « Jours » depuis ici efface le plan : les jours
              changés, les quantités ne veulent plus rien dire. On enlève donc
              les deux, plutôt que de garder un plan qui parle d'autre chose
              que ce que l'écran affiche. */}
          <Etapes
            courante={2}
            onRevenir={(etape) => { if (etape === 0) setPlan(null); setBatch(false); }}
          />

          {aAcheter.length > 0 && (
            <Pliant
              titre="Liste de courses"
              resume={`${aAcheter.length} aliment${aAcheter.length > 1 ? 's' : ''} manquant`
                + `${aAcheter.length > 1 ? 's' : ''}`}
              ouvert={courses}
              onBascule={() => setCourses(!courses)}
              teinte="jour"
            >
              <Discret style={s.aide}>
                Ce qu'il manque pour cuisiner ce plan tel qu'il est prévu, ton
                frigo déjà déduit.
              </Discret>
              {aAcheter.map(({ aliment, grammes }) => (
                <View key={String(aliment.id)} style={s.ligneCourse}>
                  <View style={[s.pastille, { backgroundColor: couleurRole(aliment.categorie) }]} />
                  <Texte style={{ flex: 1 }}>{aliment.nom}</Texte>
                  <Texte style={{ fontFamily: P.fort }}>{nb(grammes)} g</Texte>
                </View>
              ))}
            </Pliant>
          )}

          {/* ---- les fournées ---- */}
          <Texte style={s.titreEtape}>
            À cuire · {parFournee.length} fournée{parFournee.length > 1 ? 's' : ''}
          </Texte>
          {/* POURQUOI ON PÈSE SEC, dit une fois et à l'endroit où la question
              se pose — devant la balance, un riz annoncé à 80 g alors qu'on
              en servira 240 a l'air d'une erreur.

              Cuire n'ajoute que de l'EAU. 80 g de riz sec deviennent 240 g de
              riz cuit et n'ont pas gagné une calorie au passage ; le même riz
              cuit pèse trois fois plus pour les mêmes macros. Peser cuit
              obligerait donc à connaître le temps de cuisson, le couvercle,
              l'altitude — tout ce qui fait varier l'eau absorbée. Peser sec ne
              dépend de rien. */}
          <Discret style={s.aide}>
            Ces poids sont ceux de la BALANCE, avant cuisson : riz sec, pâtes
            sèches, viande crue. La cuisson n'ajoute que de l'eau — elle change
            le poids, jamais les calories — et l'eau absorbée varie d'une fois
            sur l'autre. Sec, le chiffre est toujours le même. Tout ce qui
            partage une fournée part ensemble.
          </Discret>

          {parFournee.length === 0 && (
            <Vide message="Aucun aliment de ce plan ne se cuit. Il n'y a rien à mettre en fournée — passe directement aux boîtes." />
          )}

          {parFournee.map((f) => (
            <Carte key={f.mode.id} style={{ gap: E.xs }}>
              <Texte style={{ fontFamily: P.fort }}>{f.mode.libelle}</Texte>
              <Discret style={s.aide}>
                {nb(f.lignes.reduce((n, l) => n + l.aCuire, 0))} g à peser en tout
              </Discret>
              {f.lignes.map((l) => (
                <View key={String(l.aliment.id)} style={s.ligneCourse}>
                  <View style={[s.pastille, { backgroundColor: couleurRole(l.aliment.categorie) }]} />
                  <Texte style={{ flex: 1 }}>{l.aliment.nom}</Texte>
                  <Texte style={{ fontFamily: P.fort }}>{nb(l.aCuire)} g</Texte>
                </View>
              ))}
            </Carte>
          ))}

          {/* ---- la répartition ---- */}
          <Texte style={s.titreEtape}>
            À répartir · {boites.length} boîte{boites.length > 1 ? 's' : ''}
          </Texte>
          <Discret style={s.aide}>
            Ces poids-là sont ceux du produit CUIT. La colonne « boîte » est ce
            qu'on y met pour tout le monde ; la colonne « 1 pers. », en doré,
            est ce que TU te sers le jour venu pour tenir tes macros.
          </Discret>

          {boites.map((b) => (
            <Pliant
              key={b.cle}
              titre={nomDeLaBoite(b.cle)}
              resume={`${nb(b.cuits.reduce((n, x) => n + x.assiette, 0))} g cuits`
                + (b.convives > 1 ? `  ·  ${b.convives} personnes` : '')
                + (b.crus.length > 0 ? `  ·  ${b.crus.length} à ajouter après` : '')}
              ouvert={boiteOuverte === b.cle}
              onBascule={() => setBoiteOuverte(boiteOuverte === b.cle ? null : b.cle)}
            >
              {/* DEUX colonnes, et les confondre ruine tout : la boîte
                  contient de quoi servir tout le monde, mais les macros du
                  plan ne valent que pour UNE personne. Sans la seconde, il
                  faudrait recomposer le repas le jour du repas pour savoir
                  combien s'en servir — soit refaire tout le travail que le
                  batch cooking venait d'éviter. */}
              <View style={s.entete}>
                <Discret style={[s.col, { flex: 2 }]}>aliment</Discret>
                <Discret style={s.col}>boîte</Discret>
                <Discret style={s.col}>1 pers.</Discret>
              </View>
              {b.cuits.map((x) => (
                <View key={String(x.aliment.id)} style={s.ligneCourse}>
                  <View style={[s.pastille, { backgroundColor: couleurRole(x.aliment.categorie) }]} />
                  <Texte style={{ flex: 2 }}>{x.aliment.nom}</Texte>
                  <Texte style={[s.col, { textAlign: 'right' }]}>{nb(x.assiette)} g</Texte>
                  <Texte style={[s.col, { textAlign: 'right', color: C.vif }]}>
                    {nb(x.parPersonne)} g
                  </Texte>
                </View>
              ))}

              {/* On ne met pas un skyr dans une boîte cinq jours à l'avance.
                  Mais le taire ferait une boîte qui ne correspond plus au
                  repas, et des macros fausses le jour venu. */}
              {b.crus.length > 0 && (
                <>
                  <Discret style={s.colTitre}>à ajouter au moment de manger</Discret>
                  {b.crus.map((x) => (
                    <View key={String(x.aliment.id)} style={s.ligneCourse}>
                      <View style={[s.pastille, { backgroundColor: C.discret }]} />
                      <Discret style={{ flex: 2 }}>{x.aliment.nom}</Discret>
                      <Discret style={[s.col, { textAlign: 'right' }]}>{nb(x.assiette)} g</Discret>
                      <Discret style={[s.col, { textAlign: 'right', color: C.vif }]}>
                        {nb(x.parPersonne)} g
                      </Discret>
                    </View>
                  ))}
                </>
              )}

              {/* Les compléments de CE repas, dans la boîte qui le prépare.
                  C'est l'endroit le plus juste : un complément ne se cuit
                  pas et ne se range pas dans une boîte cinq jours à
                  l'avance — il s'avale au moment de manger, comme le skyr
                  au-dessus. */}
              <LigneComplements repas={b.cle.split('|')[1] as Repas} />
            </Pliant>
          ))}
        </ScrollView>

        <View style={[s.pied, { paddingBottom: E.m + insets.bottom, gap: E.s }]}>
          {/* Sans enregistrement, il faudrait recomposer tout le plan le
              jeudi — avec un frigo qui a changé — pour lire un chiffre décidé
              le dimanche. Le nom est libre : « Semaine du 11/08 » ou ce qu'on
              veut, tant qu'on s'y retrouve. */}
          <Champ
            valeur={nomDuPlan}
            onChange={setNomDuPlan}
            placeholder="Semaine du 11/08"
            etiquette="Enregistrer ce plan sous"
          />
          <Bouton
            onPress={() => enregistrerPlan.mutate({
              libelle: nomDuPlan.trim(),
              /* `plat` porte ce que le plan prend au frigo, aliment par
                 aliment, en poids PESÉ. Sans lui, l'instantané ne saurait pas
                 ce qu'il consomme — il ne pourrait ni réserver son stock, ni
                 le décrémenter au moment de cuisiner. */
              contenu: figerLePlan(aAcheter, parFournee, boites, nomDeLaBoite, plat),
            }, {
              onSuccess: () => {
                toutRecommencer();
                /* On ouvre la liste des plans en repartant : c'est la preuve
                   que l'enregistrement a eu lieu, et c'est là qu'on ira le
                   rechercher jeudi. Sans ça, le plan semble s'évaporer. */
                setPlansOuverts(true);
              },
            })}
            desactive={nomDuPlan.trim() === '' || enregistrerPlan.isPending}
          >
            {enregistrerPlan.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Bouton>
          {enregistrerPlan.isError && (
            <Discret style={[s.aide, { color: C.erreur }]}>
              {enregistrerPlan.error.message}
            </Discret>
          )}
          <Bouton variante="contour" onPress={() => setBatch(false)}>
            ← Revenir au plan
          </Bouton>
        </View>
      </View>
    );
  }

  /* ------------------------------------------- correction du plan */

  /* Les aliments proposés en remplacement : même rôle, en stock, et pas
     celui qui est déjà là. Rien d'autre n'est écarté — remplacer n'exclut
     jamais un aliment d'un repas, ni maintenant ni plus tard. */
  const remplacants = remplacer === null ? [] : stock.filter(
    (a) => roleDe(a) === remplacer.role
      && a.id !== plan[remplacer.cle]?.roles[remplacer.role]?.id);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.page}>
        <Etapes courante={1} onRevenir={() => { setPlan(null); setBatch(false); }} />

        <Discret style={{ fontSize: T.petit, lineHeight: 17 }}>
          Voilà ce que ton frigo permet. Change ce qui ne te va pas : les
          quantités se recalculent toutes seules pour retomber sur tes
          objectifs. S'il te reste un fond de casserole, écris son poids dans
          la case « reste » — mets 0 pour retirer un aliment de ce repas.
        </Discret>

        {/* Un plan de sept jours porte une trentaine de lignes, dont beaucoup
            ne se cuisent pas — skyr, amandes, fruits, huile. Les pointer une
            par une pour dire « rien à faire » serait absurde : ce qui EST
            cuit se choisit à la main, le reste se règle d'un geste. Les choix
            déjà faits ne sont pas écrasés. */}
        {restentASituer > 0 && (
          <Carte style={{ gap: E.xs }}>
            <Discret style={s.aide}>
              {restentASituer} aliment{restentASituer > 1 ? 's' : ''} dont on ne
              sait pas encore comment {restentASituer > 1 ? 'ils se cuisent' : 'il se cuit'}.
              Touche-{restentASituer > 1 ? 'les' : 'le'} sous « cuisson » dans le
              repas, ou règle tout le reste d'un coup.
            </Discret>
            <Bouton
              variante="contour"
              /* On part des cuissons EFFECTIVES, habitudes comprises. Partir
                 des seuls choix explicites marquerait « sans cuisson » un riz
                 dont l'habitude dit « à l'eau » — une réponse fausse, posée
                 par un bouton censé ne remplir que les trous. */
              onPress={() => setCuissonsChoisies(resteSansCuisson(plat, cuissons))}
            >
              {restentASituer > 1
                ? `Les ${restentASituer} autres se mangent tels quels`
                : 'Le dernier se mange tel quel'}
            </Bouton>
          </Carte>
        )}

        {/* Ce qui a été pré-rempli. On le DIT, parce qu'une valeur apparue
            toute seule qu'on ne s'explique pas est plus inquiétante qu'une
            case vide — et parce qu'il faut savoir qu'on peut la changer. */}
        {restentASituer === 0 && Object.keys(mesCuissons.data ?? {}).length > 0 && (
          <Discret style={s.aide}>
            Les cuissons sont déjà remplies avec ce que tu avais fait la
            dernière fois. Touche-en une pour la changer — c'est la nouvelle
            qui sera retenue.
          </Discret>
        )}

        {joursRetenus.map((rang) => {
          const duJour = REPAS.filter((r) => plan[cleDuRepas(rang, r)] !== undefined);
          if (duJour.length === 0) return null;

          const cartes = (
            <>
              {duJour.map((repas) => {
                const cle = cleDuRepas(rang, repas);

                return (
                  <CarteRepas
                    key={cle}
                    repas={repas}
                    compose={plan[cle]!}
                    cible={cibleDe(repas)}
                    portions={portions[cle] ?? 1}
                    resultat={resultats.get(cle) ?? null}
                    fibresDe={fibresDe}
                    ouvert={ouvert === cle}
                    onOuvrir={() => setOuvert(ouvert === cle ? null : cle)}
                    onRemplacer={(role) => setRemplacer({ cle, role })}
                    onAjouter={() => setAjouter(cle)}
                    onRetirerAjout={(id) => setPlan((p) => ({
                      ...p!,
                      [cle]: {
                        ...p![cle]!,
                        ajouts: p![cle]!.ajouts.filter((a) => a.id !== id),
                      },
                    }))}
                    onReste={(k, valeurs) => setPlan((p) => ({
                      ...p!,
                      [cle]: { ...p![cle]!, restes: { ...p![cle]!.restes, [k]: valeurs } },
                    }))}
                    cuissonDe={(a) => {
                      const choix = cuissons[cleDeCuisson(cle, a)];
                      if (choix === undefined) return 'a choisir';

                      return choix === null
                        ? null
                        : (modesCuisson.data ?? []).find((m) => m.id === choix) ?? 'a choisir';
                    }}
                    onCuisson={(a) => setChoisirCuisson({ cle, aliment: a })}
                  />
                );
              })}
            </>
          );

          if (joursRetenus.length === 1) {
            return <View key={rang} style={s.jourSeul}>{cartes}</View>;
          }

          /* Combien de repas de ce jour n'ont PAS atteint leurs cibles. C'est
             la seule chose qu'on ait besoin de savoir sans déplier — un jour
             replié doit pouvoir dire « celui-là coince ». */
          const rates = duJour.filter(
            (r) => resultats.get(cleDuRepas(rang, r))?.resultat.ok === false).length;

          return (
            <Pliant
              key={rang}
              titre={libelleDuJour(rang)}
              resume={rates === 0
                ? `${duJour.length} repas  ·  objectifs atteints`
                : `${duJour.length} repas  ·  ${rates} hors cible`}
              ouvert={jourOuvert === rang}
              onBascule={() => setJourOuvert(jourOuvert === rang ? null : rang)}
              teinte="jour"
            >
              {cartes}
            </Pliant>
          );
        })}

      </ScrollView>

      <View style={[s.pied, { paddingBottom: E.m + insets.bottom, gap: E.s }]}>
        {/* Le batch cooking vient APRÈS, une fois les cuissons décidées. Le
            proposer plus tôt donnerait des fournées incomplètes sans le dire,
            et on découvrirait l'oubli devant les casseroles. */}
        <Bouton
          onPress={() => { retenirLesCuissons(); setBatch(true); }}
          desactive={restentASituer > 0}
        >
          {restentASituer > 0
            ? `${restentASituer} cuisson${restentASituer > 1 ? 's' : ''} à renseigner`
            : 'Passer au batch cooking →'}
        </Bouton>
        <Bouton variante="contour" onPress={() => { setPlan(null); setBatch(false); }}>
          ← Changer les jours</Bouton>
      </View>

      <ChoixDansListe
        visible={remplacer !== null}
        titre={remplacer ? `Remplacer ${ROLES.find((r) => r.cle === remplacer.role)?.titre.toLowerCase()}` : ''}
        /* La liste de choix travaille avec des identifiants numériques ; ceux
           du frigo sont des références (« grocy:12 »). On passe donc par la
           position, résolue juste en dessous. */
        elements={remplacants.map((a, i) => ({
          id: i, nom: a.nom, couleur: couleurRole(a.categorie),
        }))}
        onChoisir={(index) => {
          if (remplacer === null) return;
          const choisi = remplacants[index];
          if (!choisi) return;

          setPlan((p) => {
            const courant = p![remplacer.cle]!;

            return {
              ...p!,
              [remplacer.cle]: {
                ...courant,
                roles: { ...courant.roles, [remplacer.role]: choisi },
                /* Ce que tu viens de choisir est verrouillé : le calculateur
                   ne le remplacera pas dans ton dos pour gagner un gramme. */
                verrous: courant.verrous.includes(remplacer.role)
                  ? courant.verrous
                  : [...courant.verrous, remplacer.role],
              },
            };
          });
        }}
        onFermer={() => setRemplacer(null)}
      />

      {/* Changer la cuisson d'un aliment POUR CE REPAS.
          La fiche de l'aliment ne bouge jamais — les mêmes pommes de terre
          passent au four ce soir et à la vapeur demain. En revanche le
          DERNIER choix du plan devient l'habitude, et c'est ce qui sera
          pré-rempli la prochaine fois. */}
      <ChoixDansListe
        visible={choisirCuisson !== null}
        titre={choisirCuisson ? `Comment cuire ${choisirCuisson.aliment.nom} ?` : ''}
        /* « Sans cuisson » porte l'identifiant 0, qu'aucune ligne de la table
           n'a. Il n'a rien à faire dans la table : ce n'est pas une façon de
           cuire, c'est l'absence de cuisson — et l'y mettre obligerait
           `enFournees` à connaître un identifiant particulier. */
        elements={(() => {
          /* Ce qu'on faisait d'habitude avec CET aliment, marqué dans la
             liste. Sans cette marque, la valeur pré-remplie n'a pas
             d'origine visible : on se demande d'où elle sort, et on n'ose
             pas la changer. */
          const habitude = choisirCuisson === null
            ? undefined
            : (mesCuissons.data ?? {})[cleDHabitude(choisirCuisson.aliment.nom)];
          const marque = (valeur: number | null) =>
            (habitude === valeur ? 'ce que tu fais d\'habitude' : undefined);

          return [
            { id: 0, nom: 'Se mange tel quel', detail: marque(null) ?? 'aucune cuisson' },
            ...(modesCuisson.data ?? []).map((m) => ({
              id: m.id, nom: m.libelle, detail: marque(m.id),
            })),
          ];
        })()}
        onChoisir={(id) => {
          if (choisirCuisson === null) return;
          setCuissonsChoisies((c) => ({
            ...c,
            [cleDeCuisson(choisirCuisson.cle, choisirCuisson.aliment)]: id === 0 ? null : id,
          }));
          setChoisirCuisson(null);
        }}
        onFermer={() => setChoisirCuisson(null)}
      />

      <ChoixDansListe
        visible={ajouter !== null}
        titre="Ajouter un aliment"
        elements={(ajouter === null ? [] : stock.filter((a) => {
          const c = plan[ajouter]!;

          return !ROLES.some(({ cle }) => c.roles[cle]?.id === a.id)
            && !c.ajouts.some((x) => x.id === a.id);
        })).map((a, i) => ({ id: i, nom: a.nom, couleur: couleurRole(a.categorie) }))}
        onChoisir={(index) => {
          if (ajouter === null) return;
          const c = plan[ajouter]!;
          const possibles = stock.filter((a) => !ROLES.some(({ cle }) => c.roles[cle]?.id === a.id)
            && !c.ajouts.some((x) => x.id === a.id));
          const choisi = possibles[index];
          if (!choisi) return;

          setPlan((p) => ({
            ...p!,
            [ajouter]: { ...p![ajouter]!, ajouts: [...p![ajouter]!.ajouts, choisi] },
          }));
        }}
        onFermer={() => setAjouter(null)}
      />
    </View>
  );
}


/* ------------------------------------------------------ une carte de repas */

function CarteRepas({
  repas, compose, cible, portions, resultat, fibresDe,
  ouvert, onOuvrir, onRemplacer, onAjouter, onRetirerAjout, onReste,
  cuissonDe, onCuisson,
}: {
  repas: Repas;
  compose: Compose;
  cible: {
    kcal: number; prot: number; gluc: number; lip: number; glucidesTotaux?: boolean;
  } | undefined;
  portions: number;
  /** résolu au niveau du plan : les repas partagent un seul frigo */
  resultat: AuMieux | null;
  /** grammes de fibres pour 100 g, dans l'état de référence de l'aliment */
  fibresDe: (a: Aliment) => number;
  ouvert: boolean;
  onOuvrir: () => void;
  onRemplacer: (role: Role) => void;
  onAjouter: () => void;
  onRetirerAjout: (id: number | string) => void;
  onReste: (cle: string, valeurs: { grammes: string; unite: 'cru' | 'cuit' }) => void;
  /**
   * La cuisson de cet aliment DANS CE REPAS : un mode, `null` quand on a
   * décidé qu'il ne se cuit pas, ou « a choisir » tant que personne n'a
   * tranché. Les deux derniers ne se confondent pas.
   */
  cuissonDe: (a: Aliment) => ModeCuisson | null | 'a choisir';
  onCuisson: (a: Aliment) => void;
}) {
  /* Le résultat n'est plus calculé ici : il vient du plan, où les quatre
     repas ont été résolus dans l'ordre sur un frigo qui se vide. Une carte
     qui résolvait son propre repas ne pouvait pas voir ce que les autres
     avaient déjà pris. */

  if (!cible) {
    return (
      <Carte>
        <Texte style={{ fontFamily: P.fort }}>{NOM_REPAS[repas]}</Texte>
        <Discret style={{ fontSize: T.petit }}>
          Aucun objectif défini pour ce repas. Renseigne-les depuis ton compte.
        </Discret>
      </Carte>
    );
  }

  const macros = resultat?.resultat.macros;

  /* Les fibres du repas, et ce qu'elles pèsent. C'est ce qui explique qu'un
     repas juste en protéines, glucides et lipides affiche plus de calories
     que ne le donne le calcul 4/4/9 : la convention européenne les compte à
     part, à 2 kcal le gramme. */
  const fibres = (resultat?.resultat.quantites ?? []).reduce((n, q) => {
    /* Les macros valent pour le poids PESÉ, jamais pour le poids servi : la
       cuisson n'ajoute que de l'eau. C'est donc toujours la colonne « à
       cuire ». Prendre l'assiette fausserait les fibres du rendement. */
    return n + (fibresDe(q.aliment) * q.aCuire) / 100;
  }, 0);

  return (
    <Carte style={{ gap: E.s }}>
      <Pressable onPress={onOuvrir} style={s.tete}>
        <View style={{ flex: 1 }}>
          <Texte style={{ fontFamily: P.fort }}>
            {NOM_REPAS[repas]}
            <Discret style={{ fontSize: T.petit }}>
              {portions > 1 ? `  ·  ${portions} personnes` : '  ·  1 personne'}
            </Discret>
          </Texte>
          {/* Affiché PAR PERSONNE, comme les objectifs du compte. Le total
              cuisiné pour trois — 1772 kcal — ne se compare à rien : cette
              ligne sert à dire si la cible est tenue, pas à cumuler. Les
              quantités à peser, elles, restent en total dans le tableau.

              Chaque macro porte SA couleur : un repas juste en protéines et
              raté en lipides ne doit pas s'afficher tout en jaune, sinon on
              ne sait pas quoi corriger. */}
          {macros && resultat && (
            <View style={{ flexDirection: 'row', gap: E.s, alignItems: 'center' }}>
              {([
                ['kcal', 'kcal'], ['prot', 'P'], ['gluc', 'G'], ['lip', 'L'],
              ] as const).map(([cle, suffixe]) => (
                <Discret
                  key={cle}
                  style={{
                    fontSize: T.petit,
                    /* L'écart est celui du repas entier : on le ramène à la
                       personne avant de le comparer à une tolérance qui,
                       elle, vaut pour une assiette. */
                    color: Math.abs(resultat.resultat.ecarts[cle]) / portions <= TOLERANCE[cle]
                      ? C.ok : C.vif,
                  }}
                >
                  {nb(macros[cle] / portions)} {suffixe}
                </Discret>
              ))}
              {portions > 1 && (
                <Discret style={{ fontSize: T.minuscule }}>/ pers.</Discret>
              )}
            </View>
          )}

          {/* Quand la cible est exprimée en glucides TOTAUX, les fibres sont
              DANS la cible : les annoncer « hors cible » serait faux. */}
          {fibres > 0.5 && (
            <Discret style={{ fontSize: T.minuscule }}>
              dont {nb(fibres / portions)} g de fibres
              {cible.glucidesTotaux === true
                ? ', comprises dans la cible en glucides'
                : `, soit ${nb((fibres * 2) / portions)} kcal hors cible`}
            </Discret>
          )}

          {/* CE QUI S'AJOUTE À CE REPAS ET QUI NE SE PÈSE PAS.
              Les compléments n'entrent pas dans le calcul — leurs macros sont
              nulles et leur dose est fixe, le solveur n'a rien à en faire —
              mais ils font partie du repas. Ici un rappel d'une ligne ; le
              détail est plus bas, là où l'on prépare vraiment l'assiette. */}
          <RappelComplements repas={repas} />
        </View>
        <Discret>{ouvert ? '▲' : '▼'}</Discret>
      </Pressable>

      {ouvert && (
        <View style={{ gap: E.s }}>
          <DetailComplements repas={repas} />

          {/* « à peser » et non « à cuire » : la colonne vaut aussi pour les
              amandes et le skyr, qui ne cuisent pas. C'est ce qu'on met sur
              la balance, cuisson ou pas. Et « servi » plutôt que « cuit »,
              pour la même raison. */}
          <View style={s.entete}>
            <Discret style={[s.col, { flex: 2 }]}>aliment</Discret>
            <Discret style={s.col}>à peser</Discret>
            <Discret style={s.col}>servi</Discret>
            <Discret style={s.col}>1 pers.</Discret>
          </View>
          <Discret style={{ fontSize: T.minuscule, lineHeight: 15 }}>
            On pèse AVANT cuisson : la cuisson n'ajoute que de l'eau, jamais
            de calories, et l'eau absorbée change d'une fois sur l'autre.
          </Discret>

          {ROLES.map(({ cle, titre, cat }) => {
            const aliment = compose.roles[cle];
            const fixe = imposePour(repas, cle);

            /* Les renforts de CE rôle : ce que le plafonnement du stock ou un
               échange automatique a fait entrer. Ils s'affichent juste sous
               la ligne qu'ils complètent, pas en bas de la carte — c'est là
               qu'on les cherche. */
            const renforts = (resultat?.resultat.quantites ?? []).filter(
              (q) => q.aliment.id !== aliment?.id
                /* Un aliment qui tient déjà sa propre ligne n'est pas
                   réaffiché ici : quand l'huile prend en charge les lipides,
                   elle apparaissait deux fois, avec la même quantité. */
                && !ROLES.some(({ cle: autre }) => compose.roles[autre]?.id === q.aliment.id)
                && ((resultat?.plafonnes ?? []).some(
                  (pl) => pl.role === cle && pl.releve?.id === q.aliment.id)
                  || (resultat?.echanges ?? []).some(
                    (e) => e.role === cle && e.mis.id === q.aliment.id)));

            const notes = (resultat?.plafonnes ?? []).filter((pl) => pl.role === cle);
            const echange = (resultat?.echanges ?? []).find((e) => e.role === cle);

            if (!aliment) {
              /* Une quantité imposée absente n'est pas un manque : ou bien le
                 modèle du repas ne la demande pas — pas de légume à 16 h — ou
                 bien le frigo n'en a pas. Inutile d'alarmer. */
              if (fixe !== undefined || !rolesDuRepas(repas).has(cle)) return null;

              return (
                <View key={cle} style={s.ligne}>
                  <Discret style={{ flex: 1, fontSize: T.petit }}>
                    Aucun {titre.toLowerCase()} utilisable dans ton frigo.
                  </Discret>
                </View>
              );
            }

            const q = resultat?.resultat.quantites.find((x) => x.aliment.id === aliment.id);
            const reste = compose.restes[String(aliment.id)];

            return (
              <View key={cle} style={{ gap: 4 }}>
                <View style={s.ligne}>
                  <View style={{ flex: 2 }}>
                    <Texte style={{ fontSize: T.normal }} numberOfLines={1}>{aliment.nom}</Texte>
                    <Discret style={{ fontSize: T.minuscule, color: couleurRole(cat) }}>{titre}</Discret>
                  </View>
                  <Texte style={s.val}>{q ? nb(q.aCuire) : '—'}</Texte>
                  <Texte style={s.val}>{q ? nb(q.assiette) : '—'}</Texte>
                  <Texte style={[s.val, { color: C.vif }]}>
                    {q ? nb(q.assiette / portions) : '—'}
                  </Texte>
                </View>

                <View style={s.actions}>
                  <Pressable onPress={() => onRemplacer(cle)} style={s.action}>
                    <Discret style={{ fontSize: T.petit, color: C.vif }}>↻ Remplacer</Discret>
                  </Pressable>
                  <Champ
                    valeur={reste?.grammes ?? ''}
                    onChange={(v) => onReste(String(aliment.id),
                      { grammes: v, unite: reste?.unite ?? 'cuit' })}
                    placeholder="reste"
                    unite="g" numerique style={{ width: 92 }}
                  />
                  <Pressable
                    onPress={() => onReste(String(aliment.id), {
                      grammes: reste?.grammes ?? '',
                      unite: reste?.unite === 'cru' ? 'cuit' : 'cru',
                    })}
                    style={s.action}
                  >
                    <Discret style={{ fontSize: T.petit }}>{reste?.unite ?? 'cuit'}</Discret>
                  </Pressable>
                </View>

                {renforts.map((q) => (
                  <View key={String(q.aliment.id)} style={[s.ligne, s.renfort]}>
                    <View style={{ flex: 2 }}>
                      <Texte style={{ fontSize: T.normal }} numberOfLines={1}>{q.aliment.nom}</Texte>
                      <Discret style={{ fontSize: T.minuscule, color: C.ok }}>
                        {echange?.mis.id === q.aliment.id ? 'À la place' : 'Complément'}
                      </Discret>
                    </View>
                    <Texte style={s.val}>{nb(q.aCuire)}</Texte>
                    <Texte style={s.val}>{nb(q.assiette)}</Texte>
                    <Texte style={[s.val, { color: C.vif }]}>{nb(q.assiette / portions)}</Texte>
                  </View>
                ))}

                {notes.map((pl) => (
                  <Discret key={String(pl.aliment.id)} style={s.plafond}>
                    {pl.aliment.nom} : {nb(pl.grammes)} g, c'est tout ce que tu as.
                    {pl.releve
                      ? ` Le reste est porté par ${pl.releve.nom}.`
                      : ' Rien d\'autre ne peut prendre le relais.'}
                  </Discret>
                ))}

                {echange && (
                  <Discret style={s.plafond}>
                    {echange.retire.nom} ne permettait pas de tenir les objectifs :
                    {ROLES.some(({ cle: autre }) => compose.roles[autre]?.id === echange.mis.id)
                      ? ` c'est ${echange.mis.nom} qui s'en charge, sur sa propre ligne.`
                      : ` remplacé par ${echange.mis.nom}.`} Tu peux revenir dessus.
                  </Discret>
                )}
              </View>
            );
          })}

          {compose.ajouts.map((a) => {
            const q = resultat?.resultat.quantites.find((x) => x.aliment.id === a.id);
            const reste = compose.restes[String(a.id)];

            return (
              <View key={String(a.id)} style={{ gap: 4 }}>
                <View style={s.ligne}>
                  <View style={{ flex: 2 }}>
                    <Texte style={{ fontSize: T.petit }} numberOfLines={1}>{a.nom}</Texte>
                    <Discret style={{ fontSize: T.minuscule, color: couleurRole(a.categorie) }}>
                      Ajouté
                    </Discret>
                  </View>
                  <Texte style={s.val}>{q ? nb(q.aCuire) : '—'}</Texte>
                  <Texte style={s.val}>{q ? nb(q.assiette) : '—'}</Texte>
                  <Texte style={[s.val, { color: C.vif }]}>
                    {q ? nb(q.assiette / portions) : '—'}
                  </Texte>
                </View>

                <View style={s.actions}>
                  <Pressable onPress={() => onRetirerAjout(a.id)} style={s.action}>
                    <Discret style={{ fontSize: T.petit, color: C.erreur }}>× Retirer</Discret>
                  </Pressable>
                  <Champ
                    valeur={reste?.grammes ?? ''}
                    onChange={(v) => onReste(String(a.id),
                      { grammes: v, unite: reste?.unite ?? 'cru' })}
                    placeholder="quantité"
                    unite="g" numerique style={{ width: 112 }}
                  />
                  {/* Une saisie jetée en silence est pire qu'une saisie
                      refusée : on la voit encore à l'écran et on croit
                      qu'elle compte. */}
                  {saisieIllisible(reste?.grammes) && (
                    <Discret style={{ color: C.erreur, fontSize: T.minuscule, flexBasis: '100%' }}>
                      Quantité illisible — cet aliment compte pour 0 g.
                    </Discret>
                  )}
                  <Pressable
                    onPress={() => onReste(String(a.id), {
                      grammes: reste?.grammes ?? '',
                      unite: reste?.unite === 'cru' ? 'cuit' : 'cru',
                    })}
                    style={s.action}
                  >
                    <Discret style={{ fontSize: T.petit }}>{reste?.unite ?? 'cru'}</Discret>
                  </Pressable>
                </View>
              </View>
            );
          })}

          {/* Un repas ne tient pas toujours en un aliment par rôle : un
              petit-déjeuner porte souvent deux protéines et deux glucides. */}
          <Bouton variante="discret" onPress={onAjouter} style={s.ajouterAliment}>
            + Ajouter un aliment
          </Bouton>

          {/* ---- comment on cuit, pour CE repas ----

              Sous le tableau et non dans une colonne : la cuisson ne pèse rien
              et ne change aucun chiffre. La mêler aux grammes lui donnerait une
              importance qu'elle n'a pas, et volerait de la place à ce qu'on
              lit vraiment à la balance.

              Ce qu'on change ici ne touche PAS la fiche de l'aliment : des
              pommes de terre au four ce soir n'engagent pas celles de demain. */}
          {(resultat?.resultat.quantites ?? []).length > 0 && (
            <>
              <Discret style={s.colTitre}>cuisson</Discret>
              <View style={s.puces}>
                {(resultat?.resultat.quantites ?? []).map((q) => (
                  <Pressable
                    key={`cuisson-${q.aliment.id}`}
                    onPress={() => onCuisson(q.aliment)}
                    style={s.puce}
                    accessibilityLabel={`Changer la cuisson de ${q.aliment.nom}`}
                  >
                    <View style={[
                      s.pastille,
                      { backgroundColor: couleurRole(q.aliment.categorie) },
                    ]}
                    />
                    {/* Trois états, trois apparences : décidé et cuit,
                        décidé et cru, pas encore décidé. Le troisième doit
                        se voir — c'est le seul qui demande une action. */}
                    <Discret style={cuissonDe(q.aliment) === 'a choisir'
                      ? { color: C.vif } : undefined}
                    >
                      {q.aliment.nom} · {(() => {
                        const c = cuissonDe(q.aliment);
                        if (c === 'a choisir') return 'à choisir';

                        return c === null ? 'tel quel' : c.libelle;
                      })()}
                    </Discret>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {(resultat?.resultat.diagnostics ?? [])
            .filter((d) => d.gravite !== 'info')
            .map((d) => (
              <Discret key={d.code} style={{ fontSize: T.petit, color: C.vif, lineHeight: 16 }}>
                ⚠ {d.message}
              </Discret>
            ))}
        </View>
      )}
    </Carte>
  );
}

const s = StyleSheet.create({
  page: { padding: E.m, gap: E.s, paddingBottom: E.l },

  /* Barre d'action collée en bas, hors du défilement. Le retrait vient de
     useSafeAreaInsets : sans lui, le bouton passe sous la barre de gestes
     d'un téléphone sans bouton physique, et devient intouchable. */
  pied: {
    padding: E.m,
    borderTopWidth: 1, borderTopColor: C.ligne, backgroundColor: C.fond,
  },
  interrupteur: { flexDirection: 'row', alignItems: 'center', gap: E.s, minHeight: TOUCHE },
  colTitre: { fontSize: T.minuscule, textTransform: 'uppercase' },
  titreEtape: { fontFamily: P.fort, fontSize: T.moyen, marginTop: E.s },
  /* `flex: 1` sur la zone d'ouverture : elle prend toute la largeur
     restante, la croix garde la sienne, et les deux ne se chevauchent
     jamais quelle que soit la longueur du nom du plan. */
  plan: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: TOUCHE },
  chevronPlan: { fontSize: T.grand, color: C.attenue, paddingHorizontal: E.s },
  /* Assez large pour le pouce, assez loin du chevron pour ne pas le toucher. */
  croix: {
    width: TOUCHE, height: TOUCHE, alignItems: 'center', justifyContent: 'center',
    marginLeft: E.xs,
  },
  croixTexte: { fontSize: T.grand, color: C.erreur },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: E.xs },
  puce: {
    flexDirection: 'row', alignItems: 'center', gap: E.xs,
    paddingHorizontal: E.s, paddingVertical: E.xs,
    borderRadius: R.m, borderWidth: 1, borderColor: C.ligne,
    minHeight: TOUCHE - 14,
  },
  aide: { fontSize: T.petit, lineHeight: T.moyen },
  /* Un seul jour : pas d'encart pliant, juste la pile de repas. */
  jourSeul: { gap: E.xs },
  persLigne: { flexDirection: 'row', alignItems: 'center', gap: E.s },
  coched: { color: C.fond, fontSize: T.petit },
  signe: { fontSize: T.grand, color: C.attenue },

  ligneCourse: {
    flexDirection: 'row', alignItems: 'center', gap: E.s, minHeight: TOUCHE - 12,
  },
  pastille: { width: 8, height: 8, borderRadius: 4 },

  ligneRepas: { flexDirection: 'row', alignItems: 'center', gap: E.s },
  /* La case à cocher prend la place d'un doigt, PAS la moitié de la ligne.
     Avec `flex: 1`, elle partageait la largeur à parts égales avec la zone du
     titre : le résumé du repas se retrouvait coupé en plein milieu d'une
     valeur — « 579 kcal · 26.8 P · 64.7 … » — alors qu'il était censé dire
     l'essentiel sans qu'on ait à déplier. */
  coche: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: TOUCHE,
    minHeight: TOUCHE,
  },
  carre: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.ligne,
    alignItems: 'center', justifyContent: 'center',
  },
  pers: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  /* 34 x 38 px auparavant, sous les 44 que le theme impose. On elargit
     la MARGE de touche plus bas plutot que le bouton : la rangee de
     convives reste compacte, la cible fait 44. */
  persBouton: {
    width: 34, minHeight: TOUCHE - 6, borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
    alignItems: 'center', justifyContent: 'center',
  },
  tete: { flexDirection: 'row', alignItems: 'center', minHeight: TOUCHE },
  entete: { flexDirection: 'row', gap: 4, borderBottomWidth: 1, borderBottomColor: C.ligne, paddingBottom: 4 },
  col: { flex: 1, fontSize: T.minuscule, textTransform: 'uppercase', textAlign: 'right' },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  val: { flex: 1, fontFamily: P.chiffre, fontSize: T.moyen, textAlign: 'right' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: E.s, paddingBottom: E.s },
  action: {
    minHeight: TOUCHE - 10, justifyContent: 'center', paddingHorizontal: E.s,
    borderRadius: R.s, borderWidth: 1, borderColor: C.ligne,
  },
  renfort: { paddingLeft: E.m, borderLeftWidth: 2, borderLeftColor: C.ok },
  ajouterAliment: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.ligne, borderRadius: R.s,
  },
  plafond: {
    fontSize: T.petit, lineHeight: 16, color: C.ok,
    backgroundColor: C.okFond, borderRadius: R.s,
    paddingHorizontal: E.s, paddingVertical: 6,
  },
});
