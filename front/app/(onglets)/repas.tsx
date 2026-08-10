import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useCibles, useMonFrigo } from '@/api/hooks';
import type { AlimentDisponible } from '@/api/types';
import { Bouton, Carte, Champ, Chargement, Chiffre, Discret, Erreur, Texte, Vide } from '@/composants/base';
import { ChoixDansListe } from '@/composants/choixAliment';
import {
  MODELE, NOM_REPAS, REPAS,
  type AuMieux, type DemandeRepas, type Repas, type Role,
  composer, resoudreLaJournee, roleDe, rolesDuRepas,
} from '@/solveur/composer';
import { verifierCatalogue } from '@/calcul/plausibilite';
import { versReference } from '@/solveur/solveur';
import type { Aliment, Fixe } from '@/solveur/types';
import { C, E, N, P, R, T, TOUCHE, couleurRole, nb } from '@/theme';

/**
 * Le calculateur : l'application compose, tu corriges, elle recalcule.
 *
 * Étape 1 du parcours décrit dans CALCULATEUR.md — aujourd'hui seulement. Le
 * calendrier et le batch cooking viennent après ; il n'y a donc volontairement
 * aucun sélecteur « plusieurs jours » ici plutôt qu'un bouton mort.
 */

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
  ratio: a.ratio, etatReference: a.etatReference,
});

export default function Calculateur() {
  const frigo = useMonFrigo();
  const cibles = useCibles();

  const [choisis, setChoisis] = useState<Record<Repas, boolean>>(
    { R1: false, R2: false, R3: false, R4: false });
  const [portions, setPortions] = useState<Record<Repas, number>>(
    { R1: 1, R2: 1, R3: 1, R4: 1 });
  const [plan, setPlan] = useState<Partial<Record<Repas, Compose>> | null>(null);
  const [ouvert, setOuvert] = useState<Repas | null>(null);
  const [remplacer, setRemplacer] = useState<{ repas: Repas; role: Role } | null>(null);
  const [ajouter, setAjouter] = useState<Repas | null>(null);

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
     mentent. Un riz dont les macros sont celles du sec mais qu'on déclare
     cuit se calcule parfaitement — et fait manger deux fois trop. On le dit
     AVANT de composer, pas après avoir mangé. */
  const anomalies = useMemo(() => verifierCatalogue(stock), [stock]);

  const cibleDe = (repas: Repas) => (cibles.data ?? []).find((c) => c.repas === repas);

  /* TOUS les repas du plan, résolus EN UNE PASSE et dans l'ordre, parce
     qu'ils puisent dans le même frigo. Chacun se plafonnait déjà à ce qu'il
     restait ; aucun ne savait que les autres avaient servi avant lui. */
  const resultats = useMemo(() => {
    if (plan === null) return new Map<Repas, AuMieux>();

    const demandes: DemandeRepas[] = [];
    for (const repas of REPAS) {
      const compose = plan[repas];
      const cible = (cibles.data ?? []).find((c) => c.repas === repas);
      if (compose === undefined || cible === undefined) continue;
      demandes.push(demandePour(repas, compose, portions[repas], cible));
    }

    return resoudreLaJournee(demandes, stockDe, stock);
  }, [plan, cibles.data, portions, stockDe, stock]);

  /** Compose tous les repas cochés, en évitant de resservir le même aliment. */
  const composerTout = () => {
    const servis = new Set<number | string>();
    const suite: Partial<Record<Repas, Compose>> = {};

    for (const repas of REPAS) {
      if (!choisis[repas]) continue;
      const c = composer(stock, portions[repas], servis, repas);

      const roles: Partial<Record<Role, Aliment>> = {};
      /* Une variable du solveur peut venir d'un rôle différent : à la
         collation, c'est le laitage qui porte les protéines. */
      for (const slot of ['proteine', 'glucide', 'lipide'] as const) {
        const a = c.variables[slot];
        if (a) { roles[MODELE[repas][slot]] = a; servis.add(a.id); }
      }
      /* Les quantités imposées ne comptent pas dans « déjà servi » : resservir
         la même huile à tous les repas est normal. */
      for (const [role, aliment] of Object.entries(c.imposes)) {
        roles[role as Role] = aliment;
      }

      suite[repas] = { roles, restes: {}, verrous: [], ajouts: [] };
    }

    setPlan(suite);
    setOuvert(REPAS.find((r) => choisis[r]) ?? null);
  };

  if (frigo.isLoading || cibles.isLoading) return <Chargement />;
  if (frigo.isError) {
    return <Erreur message={frigo.error.message} onReessayer={() => void frigo.refetch()} />;
  }

  const aucunCoche = REPAS.every((r) => !choisis[r]);

  /* ------------------------------------------------ paramétrage */

  if (plan === null) {
    return (
      <ScrollView contentContainerStyle={s.page}>
        <Carte style={{ gap: E.s }}>
          <Texte style={{ fontFamily: P.fort }}>Aujourd'hui</Texte>
          <Discret style={{ fontSize: T.petit, lineHeight: 17 }}>
            Coche les repas à cuisiner et dis pour combien de personnes.
            L'application composera à partir de ton frigo.
          </Discret>
        </Carte>

        {REPAS.map((repas) => {
          const cible = cibleDe(repas);

          return (
            <Carte key={repas} style={s.ligneRepas}>
              <Pressable
                onPress={() => setChoisis((c) => ({ ...c, [repas]: !c[repas] }))}
                style={s.coche}
                accessibilityLabel={`Cuisiner le repas ${NOM_REPAS[repas]}`}
              >
                <View style={[s.carre, choisis[repas] && { backgroundColor: C.ok, borderColor: C.ok }]}>
                  {choisis[repas] && <Texte style={{ color: C.fond, fontSize: T.petit }}>✓</Texte>}
                </View>
                <View style={{ flex: 1 }}>
                  <Texte style={{ fontFamily: P.fort }}>{NOM_REPAS[repas]}</Texte>
                  <Discret style={{ fontSize: T.petit }}>
                    {cible
                      ? `${nb(cible.kcal)} kcal · ${nb(cible.prot)} P · ${nb(cible.gluc)} G · ${nb(cible.lip)} L`
                      : 'aucun objectif défini'}
                  </Discret>
                </View>
              </Pressable>

              {choisis[repas] && (
                <View style={s.pers}>
                  <Pressable
                    onPress={() => setPortions((p) => ({ ...p, [repas]: Math.max(1, p[repas] - 1) }))}
                    style={s.persBouton}
                  >
                    <Texte style={{ fontSize: T.grand, color: C.attenue }}>−</Texte>
                  </Pressable>
                  <Chiffre taille={N.petit}>{portions[repas]}</Chiffre>
                  <Pressable
                    onPress={() => setPortions((p) => ({ ...p, [repas]: Math.min(12, p[repas] + 1) }))}
                    style={s.persBouton}
                  >
                    <Texte style={{ fontSize: T.grand, color: C.attenue }}>+</Texte>
                  </Pressable>
                </View>
              )}
            </Carte>
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
              être vraies. Corrige-les dans Grocy avant de cuisiner.
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

        <Bouton onPress={composerTout} desactive={aucunCoche || stock.length === 0}>
          Composer les repas
        </Bouton>
      </ScrollView>
    );
  }

  /* ------------------------------------------- correction du plan */

  /* Les aliments proposés en remplacement : même rôle, en stock, et pas
     celui qui est déjà là. Rien d'autre n'est écarté — remplacer n'exclut
     jamais un aliment d'un repas, ni maintenant ni plus tard. */
  const remplacants = remplacer === null ? [] : stock.filter(
    (a) => roleDe(a) === remplacer.role
      && a.id !== plan[remplacer.repas]?.roles[remplacer.role]?.id);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.page}>
        <Discret style={{ fontSize: T.petit, lineHeight: 17 }}>
          Remplace ce qui ne va pas : les quantités du repas se recalculent
          pour retomber sur tes objectifs. Un reste déclaré fige la quantité —
          mets 0 pour écarter un aliment de ce repas.
        </Discret>

        {REPAS.filter((r) => plan[r] !== undefined).map((repas) => (
          <CarteRepas
            key={repas}
            repas={repas}
            compose={plan[repas]!}
            cible={cibleDe(repas)}
            portions={portions[repas]}
            resultat={resultats.get(repas) ?? null}
            fibresDe={fibresDe}
            ouvert={ouvert === repas}
            onOuvrir={() => setOuvert(ouvert === repas ? null : repas)}
            onRemplacer={(role) => setRemplacer({ repas, role })}
            onAjouter={() => setAjouter(repas)}
            onRetirerAjout={(id) => setPlan((p) => ({
              ...p!,
              [repas]: {
                ...p![repas]!,
                ajouts: p![repas]!.ajouts.filter((a) => a.id !== id),
              },
            }))}
            onReste={(cle, valeurs) => setPlan((p) => ({
              ...p!,
              [repas]: { ...p![repas]!, restes: { ...p![repas]!.restes, [cle]: valeurs } },
            }))}
          />
        ))}

        <Bouton variante="contour" onPress={() => setPlan(null)}>
          ← Modifier la sélection
        </Bouton>
      </ScrollView>

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
            const courant = p![remplacer.repas]!;

            return {
              ...p!,
              [remplacer.repas]: {
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
    /* Les macros valent pour l'état de référence : le poids cru d'une viande,
       le poids cuit d'un féculent. Prendre la mauvaise colonne fausserait les
       fibres du double du ratio de cuisson. */
    const reference = q.aliment.etatReference === 'cru' ? q.aCuire : q.assiette;

    return n + (fibresDe(q.aliment) * reference) / 100;
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
