import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useCibles, useEnregistrerCuissons,
  useMesCuissons, useModesCuisson, useMonFrigo, usePlans, useSupprimerPlan,
} from '@/api/hooks';
import type { PlanRepas } from '@/api/hooks';
import { Bouton, Carte, Chargement, Discret, Erreur } from '@/composants/base';
import { ChoixDansListe } from '@/composants/choixAliment';
import { libelleDuJour } from '@/composants/calendrier';
import { Etapes } from '@/composants/etapes';
import { Pliant } from '@/composants/pliant';
/* LES ÉCRANS DE CETTE ROUTE VIVENT DANS `src/composants/`.

   Ils cohabitaient ici — un plan relu, un paramétrage, un batch cooking, une
   correction, plus la carte d'un repas — sélectionnés par des `return`
   précoces dans une seule fonction de 2 397 lignes. Trois des tables étaient
   écrites deux fois (constat D9 de l'audit) parce que rien n'obligeait les
   deux écrans qui les affichent à s'accorder.

   Descendus le 15 septembre 2026, rangs 7 et 11 du lot 6. Ce qui reste ici :
   les hooks, la chaîne de calcul, l'état de navigation et l'aiguillage. */
import { CarteRepas } from '@/composants/carteRepas';
import { EtapeBatch } from '@/composants/etapeBatch';
import { EtapeReglage } from '@/composants/etapeReglage';
import { PlanRelu } from '@/composants/planRelu';
import { SR } from '@/composants/stylesRepas';
/* Le contrat passé au solveur — vocabulaire des rôles, validation d'une
   saisie de poids, traduction état-écran → `DemandeRepas` — vit dans `src/`
   depuis le 15 septembre 2026. Il est 100 % pur, et ne pouvait pas être testé
   tant qu'il habitait cette route : `tsconfig.tests.json` ne compile que
   `src`. */
import {
  type Compose, ROLES, alimentsAjoutables, demandePour, vers,
} from '@/calcul/demandeRepas';
import {
  type Cuissons, cleDHabitude, cleDeCuisson, dejaPromis, depuisLesHabitudes,
  enFournees, habitudesAEcrire, repartition, resteSansCuisson, sansCuisson,
} from '@/calcul/cuisson';
import {
  MODELE, NOM_REPAS, REPAS,
  type AuMieux, type DemandeDatee, type Repas, type Role,
  cleDuRepas, composer, listeDeCourses, resoudreLaPeriode, roleDe, releveDe,
} from '@/solveur/composer';
import { verifierCatalogue } from '@/calcul/plausibilite';
import { estCoche } from '@/calcul/selectionRepas';
import type { Aliment } from '@/solveur/types';
import { E, T, couleurRole } from '@/theme';

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

export default function Calculateur() {
  const frigo = useMonFrigo();
  const cibles = useCibles();
  const modesCuisson = useModesCuisson();
  const plansGardes = usePlans();
  const supprimerPlan = useSupprimerPlan();
  /* Les cuissons déjà décidées les fois précédentes. Elles ne DÉCIDENT rien :
     elles pré-remplissent, et l'utilisateur change ce qu'il veut. */
  const mesCuissons = useMesCuissons();
  const enregistrerCuissons = useEnregistrerCuissons();
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
  /* Le relais qu'on est en train de choisir : quel repas, quel rôle, et
     l'aliment épuisé — c'est LUI qui décide des candidats acceptables, pas le
     rôle : l'huile peut suppléer un oléagineux, l'inverse aussi. */
  const [relais, setRelais] = useState<
    { cle: string; role: Role; epuise: Aliment } | null>(null);
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

        suite[cle] = { roles, restes: {}, verrous: [], ajouts: [], releves: {} };
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
    return (
      <PlanRelu
        plan={relu}
        /* On recharge le plan depuis la liste plutôt que de bricoler l'état
           local : c'est le serveur qui date la cuisson, et recopier une date
           à la main ferait deux vérités. */
        onCuisine={() => setRelu((v) => (v === null ? null : {
          ...v, cuisineLe: new Date().toISOString(),
        }))}
        onFermer={() => setRelu(null)}
      />
    );
  }

  /* ------------------------------------------------ paramétrage */

  if (plan === null) {
    return (
      <EtapeReglage
        stock={stock}
        problemeFrigo={frigo.data?.probleme}
        anomalies={anomalies}
        sansFibresConnues={sansFibresConnues}
        cibleDe={cibleDe}
        plusieurs={plusieurs}
        setPlusieurs={setPlusieurs}
        rangs={rangs}
        setRangs={setRangs}
        joursRetenus={joursRetenus}
        calendrierOuvert={calendrierOuvert}
        setCalendrierOuvert={setCalendrierOuvert}
        coche={coche}
        convives={convives}
        setChoisis={setChoisis}
        setPortions={setPortions}
        detaille={detaille}
        setDetaille={setDetaille}
        jourOuvert={jourOuvert}
        setJourOuvert={setJourOuvert}
        plans={plansGardes.data ?? []}
        plansOuverts={plansOuverts}
        setPlansOuverts={setPlansOuverts}
        onRelire={setRelu}
        planASupprimer={planASupprimer}
        setPlanASupprimer={setPlanASupprimer}
        onSupprimer={(id) => supprimerPlan.mutate(id)}
        aucunCoche={aucunCoche}
        onComposer={composerTout}
      />
    );
  }

  /* --------------------------------------------- batch cooking */

  if (batch) {
    return (
      <EtapeBatch
        aAcheter={aAcheter}
        parFournee={parFournee}
        boites={boites}
        plat={plat}
        nomDeLaBoite={nomDeLaBoite}
        courses={courses}
        onBasculerCourses={() => setCourses(!courses)}
        boiteOuverte={boiteOuverte}
        onBasculerBoite={(cle) => setBoiteOuverte(boiteOuverte === cle ? null : cle)}
        nomDuPlan={nomDuPlan}
        onNomDuPlan={setNomDuPlan}
        onRevenirEtape={(etape) => { if (etape === 0) setPlan(null); setBatch(false); }}
        onRevenirAuPlan={() => setBatch(false)}
        onEnregistre={() => {
          toutRecommencer();
          /* On ouvre la liste des plans en repartant : c'est la preuve que
             l'enregistrement a eu lieu, et c'est là qu'on ira le rechercher
             jeudi. Sans ça, le plan semble s'évaporer. */
          setPlansOuverts(true);
        }}
      />
    );
  }

  /* ------------------------------------------- correction du plan */

  /* Les aliments proposés en remplacement : même rôle, en stock, et pas
     celui qui est déjà là. Rien d'autre n'est écarté — remplacer n'exclut
     jamais un aliment d'un repas, ni maintenant ni plus tard. */
  const remplacants = remplacer === null ? [] : stock.filter(
    (a) => roleDe(a) === remplacer.role
      && a.id !== plan[remplacer.cle]?.roles[remplacer.role]?.id);

  /* LES MÊMES RÈGLES QUE LE CALCUL, PAS DES RÈGLES PARALLÈLES. `releveDe` est
     la fonction dont le solveur se sert pour choisir tout seul ; on lui pose
     la même question. Proposer ici un aliment qu'il refuserait ensuite
     donnerait un choix sans effet, et rien à l'écran ne dirait pourquoi. */
  const relayeurs = relais === null ? [] : (() => {
    const permis = releveDe(relais.epuise);
    const compose = plan[relais.cle];
    /* Un aliment déjà au menu de ce repas serait refusé par le calcul : il
       ne peut pas tenir deux lignes à la fois. Le proposer quand même
       donnerait un choix sans effet — on appuie, et rien ne change. */
    const dejaLa = new Set<number | string>([
      ...Object.values(compose?.roles ?? {}).map((a: Aliment) => a.id),
      ...(compose?.ajouts ?? []).map((a) => a.id),
    ]);

    return stock.filter((a) => permis.includes(roleDe(a) as Role)
      && !dejaLa.has(a.id)
      && stockDe(a) > 0);
  })();

  /* UNE SEULE LISTE, parce que la modale ne parle qu'en positions. Ce filtre
     était recopié dans la modale « Ajouter un aliment » — une fois pour
     l'affichage, une fois dans `onChoisir` pour retrouver le choix — et deux
     copies qui divergent font ajouter un aliment pour un autre, sans rien
     signaler. Constat D8 de l'audit, fusionné le 15 septembre 2026. */
  const ajoutables = ajouter === null ? [] : alimentsAjoutables(stock, plan[ajouter]!);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={SR.page}>
        <Etapes courante={1} onRevenir={() => { setPlan(null); setBatch(false); }} />

        <Discret style={{ fontSize: T.petit, lineHeight: 17 }}>
          Voilà ce que ton frigo permet. Change ce qui ne te va pas : les
          quantités se recalculent toutes seules pour retomber sur tes
          objectifs. S'il te reste un fond de casserole, écris son poids dans
          la case « reste » : c'est un maximum, le calcul en sert ce qu'il
          faut et pas plus. Mets 0 pour retirer un aliment de ce repas.
        </Discret>

        {/* Un plan de sept jours porte une trentaine de lignes, dont beaucoup
            ne se cuisent pas — skyr, amandes, fruits, huile. Les pointer une
            par une pour dire « rien à faire » serait absurde : ce qui EST
            cuit se choisit à la main, le reste se règle d'un geste. Les choix
            déjà faits ne sont pas écrasés. */}
        {restentASituer > 0 && (
          <Carte style={{ gap: E.xs }}>
            <Discret style={SR.aide}>
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
          <Discret style={SR.aide}>
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
                    onChoisirRelais={(role, epuise) => setRelais({ cle, role, epuise })}
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
            return <View key={rang} style={SR.jourSeul}>{cartes}</View>;
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

      <View style={[SR.pied, { paddingBottom: E.m + insets.bottom, gap: E.s }]}>
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

      {/* CHOISIR QUI COMPLÈTE, plutôt que de subir le premier de la liste. */}
      <ChoixDansListe
        visible={relais !== null}
        titre={relais ? `Compléter ${relais.epuise.nom.toLowerCase()} avec…` : ''}
        elements={relayeurs.map((a, i) => ({
          id: i, nom: a.nom, couleur: couleurRole(a.categorie),
        }))}
        onChoisir={(index) => {
          if (relais === null) return;
          const choisi = relayeurs[index];
          if (!choisi) return;

          setPlan((p) => {
            const courant = p![relais.cle]!;

            return {
              ...p!,
              [relais.cle]: {
                ...courant,
                releves: { ...courant.releves, [relais.role]: choisi },
              },
            };
          });
          setRelais(null);
        }}
        onFermer={() => setRelais(null)}
      />

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
        elements={ajoutables.map((a, i) => ({
          id: i, nom: a.nom, couleur: couleurRole(a.categorie),
        }))}
        onChoisir={(index) => {
          if (ajouter === null) return;
          const choisi = ajoutables[index];
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
