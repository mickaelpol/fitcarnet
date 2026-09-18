import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSupprimerPlan } from '@/api/hooks';
import type { PlanRepas } from '@/api/hooks';
import { Bouton, Carte, Chargement, Discret, Erreur } from '@/composants/base';
import { premiereErreur } from '@/composants/etatRequetes';
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
   l'état de navigation, la composition initiale, et l'aiguillage. */
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
import { type Compose, ROLES, alimentsAjoutables } from '@/calcul/demandeRepas';
import { cleDHabitude, cleDeCuisson } from '@/calcul/cuisson';
import {
  MODELE, NOM_REPAS, REPAS, type Repas, type Role,
  cleDuRepas, composer, roleDe, releveDe,
} from '@/solveur/composer';
import { lireLaCle } from '@/solveur/periode';
import { estCoche } from '@/calcul/selectionRepas';
/* LA CHAÎNE DE CALCUL VIT DANS `src/` DEPUIS LE 15 SEPTEMBRE 2026.

   Rang 8 du lot 6 de l'audit. Quinze `useMemo` et deux `useCallback`
   s'enchaînaient ici — `stock` → `demandes` → `resultats` → `plat` →
   `cuissons` → `boites` — sans qu'un seul puisse être testé :
   `tsconfig.tests.json` ne compile que `src`, et un test posé dans `app/`
   n'est jamais exécuté, sans le moindre signal.

   Le câblage est dans les deux hooks ; les décisions, elles, sont descendues
   encore plus bas, dans `calcul/planCalcule.ts`, qui est pur et éprouvé — et
   c'est là que le découpage a du rendement : un hook React n'est pas testable
   ici, le projet n'embarquant ni `@testing-library` ni `react-test-renderer`,
   donc tout ce qui pouvait sortir du hook en est sorti. */
import { useFrigoCalculable } from '@/composants/useFrigoCalculable';
import { usePlanCalcule } from '@/composants/usePlanCalcule';
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
  /* Ce que le frigo permet : le stock utilisable, ce qu'il en reste une fois
     retiré ce qui est promis à un plan prévu, les fibres, et les valeurs qui
     ne peuvent pas être vraies. */
  const {
    frigo, cibles, plans: plansGardes, stock, stockDe, fibresDe, cibleDe,
  } = useFrigoCalculable();
  const supprimerPlan = useSupprimerPlan();
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
  /* Quel aliment de quel repas on est en train de régler. Le CHOIX lui-même
     appartient à `usePlanCalcule` : il est le premier maillon de la chaîne, et
     l'écran n'a pas à savoir comment il se superpose aux habitudes. */
  const [choisirCuisson, setChoisirCuisson] = useState<
    { cle: string; aliment: Aliment } | null>(null);

  /* Les jours réellement planifiés : un seul si le mode ne l'est pas. Rendus
     dans l'ordre du temps, quel que soit l'ordre où on les a cochés. */
  const joursRetenus = useMemo(
    () => (plusieurs ? [...rangs].sort((x, y) => x - y) : [0]),
    [plusieurs, rangs],
  );

  /* La chaîne de calcul, d'un bout à l'autre : les demandes du plan, ce que
     le solveur en fait sur un frigo qui se vide, la liste de courses, le plan
     mis à plat, les cuissons effectives, les fournées et les boîtes.

     `cibles.data` est passé BRUT, sans `?? []` : le `?? []` appartient aux
     `useMemo` du hook. Le hisser ici donnerait un tableau neuf à chaque rendu,
     et le solveur repartirait sur toute la période à chaque frappe. */
  const {
    modesCuisson, mesCuissons,
    resultats, aAcheter, plat, cuissons, parFournee, restentASituer, boites,
    retenirLesCuissons, noterLaCuisson, reglerToutLeReste, oublierLesCuissons,
  } = usePlanCalcule({
    plan, joursRetenus, portions, cibles: cibles.data, stock, stockDe,
  });

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

  /** « Aujourd'hui · Midi » — le nom d'une boîte. */
  const nomDeLaBoite = (cle: string): string => {
    /* `lireLaCle` et non `Number(cle.split('|')[0])` : une clé malformée
       donnait `libelleDuJour(NaN)` à l'écran, sans que rien ne le signale.
       La lecture vit désormais dans `solveur/periode.ts`, là où la clé
       s'écrit — relevé par la revue le 15 septembre 2026. */
    const lu = lireLaCle(cle);

    return lu === null ? 'Boîte' : `${libelleDuJour(lu.jour)} · ${NOM_REPAS[lu.repas]}`;
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
    oublierLesCuissons();
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

  /* SANS CIBLES, CET ÉCRAN NE PROPOSAIT RIEN — ET NE DISAIT PAS POURQUOI.
     Constat M6, corrigé le 18 septembre 2026. Seul `frigo.isError` était
     gardé. Quand /cibles échouait pendant que le frigo, lui, répondait —
     un tunnel de métro suffit —, `cibleDe` et `demandes` filtraient sur un
     `cibles.data ?? []` vide : le solveur ne tournait pas, aucun repas n'était
     proposé, et l'écran avait l'air de dire qu'il n'y avait rien à manger.
     C'est l'écran le plus sensible de l'application (règle 7).
     UN SEUL GARDE POUR LES DEUX : `premiereErreur` rend la première panne et
     son « Réessayer » relance toutes celles qui sont tombées. Il est APRÈS le
     garde de chargement, et jamais avant : « en attente » n'est pas « en
     panne ». */
  const panne = premiereErreur(frigo, cibles);
  if (panne) return <Erreur message={panne.message} onReessayer={panne.reessayer} />;

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
      /* Le frigo — stock, anomalies, fibres manquantes — n'est plus descendu
         en props : cet écran appelle `useFrigoCalculable` lui-même. Ce qui
         reste ici est de l'ÉTAT, dont la chaîne de calcul se nourrit. */
      <EtapeReglage
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
              /* `reglerToutLeReste` part des cuissons EFFECTIVES, habitudes
                 comprises. Partir des seuls choix explicites marquerait
                 « sans cuisson » un riz dont l'habitude dit « à l'eau » — une
                 réponse fausse, posée par un bouton censé ne remplir que les
                 trous. */
              onPress={reglerToutLeReste}
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
          /* « Sans cuisson » porte l'identifiant 0 côté liste, `null` côté
             modèle : c'est une réponse, pas une absence de réponse. */
          noterLaCuisson(choisirCuisson.cle, choisirCuisson.aliment, id === 0 ? null : id);
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
