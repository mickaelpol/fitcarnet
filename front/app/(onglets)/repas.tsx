import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCibles, useMonFrigo } from '@/api/hooks';
import type { AlimentDisponible } from '@/api/types';
import { Bouton, Carte, Champ, Chargement, Chiffre, Discret, Erreur, Texte, Vide } from '@/composants/base';
import { ChoixDansListe } from '@/composants/choixAliment';
import { Calendrier, libelleDuJour } from '@/composants/calendrier';
import { Pliant } from '@/composants/pliant';
import {
  MODELE, NOM_REPAS, REPAS,
  type AuMieux, type DemandeDatee, type DemandeRepas, type Repas, type Role,
  cleDuRepas, composer, listeDeCourses, resoudreLaPeriode, roleDe, rolesDuRepas,
} from '@/solveur/composer';
import { verifierCatalogue } from '@/calcul/plausibilite';
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
    const saisi = (compose.restes[String(aliment.id)]?.grammes ?? '').trim();
    const g = Number(saisi.replace(',', '.'));
    fixes.push({
      aliment,
      grammes: saisi !== '' && Number.isFinite(g) && g >= 0 ? g : 0,
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
     décide de s'en servir, pas l'aliment. */
  fibres100: a.fibres100 ?? 0,
  ratio: a.ratio,
});

export default function Calculateur() {
  const frigo = useMonFrigo();
  const cibles = useCibles();
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

  /* Les jours réellement planifiés : un seul si le mode ne l'est pas. Rendus
     dans l'ordre du temps, quel que soit l'ordre où on les a cochés. */
  const joursRetenus = useMemo(
    () => (plusieurs ? [...rangs].sort((x, y) => x - y) : [0]),
    [plusieurs, rangs],
  );

  const coche = (rang: number, repas: Repas): boolean =>
    choisis[cleDuRepas(rang, repas)] === true;
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

  const stockDe = useCallback(
    (a: Aliment) => grammesEnStock.get(a.id) ?? 0, [grammesEnStock]);

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

  /* ------------------------------------------------ paramétrage */

  if (plan === null) {
    return (
      /* L'action principale est COLLÉE EN BAS, hors du défilement. Sept jours
         de repas font une page longue ; laisser le bouton à la fin obligeait
         à dérouler jusqu'en bas pour lancer le calcul, puis à remonter pour
         corriger. Il reste sous le pouce, là où on l'attend. */
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.page}>
        <Carte style={{ gap: E.s }}>
          {/* Un interrupteur, pas deux boutons. Deux boutons demandent de lire
              lequel est enfoncé ; un interrupteur se lit d'un coup d'œil et
              dit tout seul dans quel état il est. */}
          <View style={s.interrupteur}>
            <View style={{ flex: 1 }}>
              <Texte style={{ fontFamily: P.fort }}>Plusieurs jours</Texte>
              <Discret style={s.aide}>
                {plusieurs ? 'Choisis tes jours au calendrier' : "Aujourd'hui seulement"}
              </Discret>
            </View>
            <Switch
              value={plusieurs}
              onValueChange={(v) => { setPlusieurs(v); if (!v) setRangs([0]); }}
              trackColor={{ false: C.ligne, true: C.vifFond }}
              thumbColor={plusieurs ? C.vif : C.attenue}
              accessibilityLabel="Planifier plusieurs jours"
            />
          </View>
          <Discret style={s.aide}>
            {plusieurs
              ? 'Les jours choisis partagent le MÊME frigo : le premier est servi '
                + 'en entier, le dernier hérite de ce qui reste. La liste de courses '
                + 'dira ce qui manque.'
              : 'Coche les repas à cuisiner et dis pour combien de personnes. '
                + "L'application composera à partir de ton frigo."}
          </Discret>
        </Carte>

        {plusieurs && (
          <Carte style={{ gap: E.s }}>
            <Calendrier
              rangs={rangs}
              onBasculer={(rang) => setRangs((liste) => (liste.includes(rang)
                /* On ne descend jamais sous un jour : un plan vide n'a pas de
                   sens, et le bouton « composer » serait mort. */
                ? (liste.length > 1 ? liste.filter((r) => r !== rang) : liste)
                : [...liste, rang]))}
            />
          </Carte>
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
                          setChoisis((c) => ({ ...c, [cle]: !c[cle] }));
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
                          >
                            <Texte style={s.signe}>−</Texte>
                          </Pressable>
                          <Chiffre taille={N.petit}>{convives(rang, repas)}</Chiffre>
                          <Pressable
                            onPress={() => setPortions((p) => ({
                              ...p, [cle]: Math.min(12, (p[cle] ?? 1) + 1),
                            }))}
                            style={s.persBouton}
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

        {stock.length === 0 && (
          <Vide message="Ton frigo est vide, ou aucun aliment n'a de poids et de macros connus. Le calculateur ne devine rien." />
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
              Le calcul sera exact, mais il partira de valeurs qui ne peuvent pas
              être vraies. Corrige-les avant de cuisiner.
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
          </Carte>
        )}

        </ScrollView>

        <View style={[s.pied, { paddingBottom: E.m + insets.bottom }]}>
          <Bouton onPress={composerTout} desactive={aucunCoche || stock.length === 0}>
            {joursRetenus.length > 1
              ? `Composer les ${joursRetenus.length} jours`
              : 'Composer les repas'}
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
        <Discret style={{ fontSize: T.petit, lineHeight: 17 }}>
          Remplace ce qui ne va pas : les quantités du repas se recalculent
          pour retomber sur tes objectifs. Un reste déclaré fige la quantité —
          mets 0 pour écarter un aliment de ce repas.
        </Discret>

        {/* ---- la liste de courses ---- */}
        {aAcheter.length > 0 && (
          <Carte style={{ gap: E.xs }}>
            <Pressable onPress={() => setCourses(!courses)}>
              <Texte style={{ fontFamily: P.fort }}>
                Liste de courses · {aAcheter.length} aliment
                {aAcheter.length > 1 ? 's' : ''}
              </Texte>
              <Discret style={{ fontSize: T.petit, lineHeight: 17 }}>
                Ce qu'il manque pour cuisiner ce plan tel qu'il est prévu, ton
                frigo déjà déduit. {courses ? '' : 'Touche pour voir.'}
              </Discret>
            </Pressable>

            {courses && aAcheter.map(({ aliment, grammes }) => (
              <View key={String(aliment.id)} style={s.ligneCourse}>
                <View style={[s.pastille, { backgroundColor: couleurRole(aliment.categorie) }]} />
                <Texte style={{ flex: 1 }}>{aliment.nom}</Texte>
                <Texte style={{ fontFamily: P.fort }}>{nb(grammes)} g</Texte>
              </View>
            ))}
          </Carte>
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

      <View style={[s.pied, { paddingBottom: E.m + insets.bottom }]}>
        <Bouton variante="contour" onPress={() => setPlan(null)}>
          ← Modifier la sélection
        </Bouton>
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
        </View>
        <Discret>{ouvert ? '▲' : '▼'}</Discret>
      </Pressable>

      {ouvert && (
        <View style={{ gap: E.s }}>
          <View style={s.entete}>
            <Discret style={[s.col, { flex: 2 }]}>aliment</Discret>
            <Discret style={s.col}>à cuire</Discret>
            <Discret style={s.col}>cuit</Discret>
            <Discret style={s.col}>1 pers.</Discret>
          </View>

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
  coche: { flexDirection: 'row', alignItems: 'center', gap: E.s, flex: 1, minHeight: TOUCHE },
  carre: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.ligne,
    alignItems: 'center', justifyContent: 'center',
  },
  pers: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
