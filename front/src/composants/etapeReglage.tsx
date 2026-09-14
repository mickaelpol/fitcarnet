import type { Dispatch, SetStateAction } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { PlanRepas } from '@/api/hooks';
import type { Cible } from '@/api/types';
import { Bouton, Carte, Chiffre, Discret, Texte } from './base';
import { Calendrier, libelleCourt, libelleDuJour } from './calendrier';
import { Confirmer } from './confirmer';
import { Etapes } from './etapes';
import { Pliant } from './pliant';
import { SR } from './stylesRepas';
import { estCuisine } from '@/calcul/cuisson';
import type { Anomalie } from '@/calcul/plausibilite';
import { basculer } from '@/calcul/selectionRepas';
import { NOM_REPAS, REPAS, type Repas, cleDuRepas } from '@/solveur/composer';
import type { Aliment } from '@/solveur/types';
import { C, E, N, P, R, T, TOUCHE, nb } from '@/theme';

/**
 * ÉTAPE 1 — LE PARAMÉTRAGE : quels jours, quels repas, pour combien.
 *
 * Sortie de `app/(onglets)/repas.tsx` le 15 septembre 2026 (rang 11 du lot 6
 * de l'audit, « le plus enchevêtré : 11 states »). L'audit avait raison : cet
 * écran ne possède presque rien de ce qu'il affiche. Les jours cochés et le
 * nombre de convives alimentent la chaîne de calcul du parent ; la liste des
 * plans vient d'une requête que le parent tient déjà.
 *
 * L'EXTRACTION EST DONC DÉLIBÉRÉMENT MÉCANIQUE : les setters descendent tels
 * quels, en props, et pas une ligne de JSX n'a changé de sens. Leur donner un
 * état à eux est le travail du rang 8 (`usePlanCalcule`), qui n'a pas encore
 * eu lieu — le faire ici, dans le même geste, aurait mêlé un déplacement
 * vérifiable à une réécriture qui ne l'est pas.
 */
export function EtapeReglage({
  stock, problemeFrigo, anomalies, sansFibresConnues, cibleDe,
  plusieurs, setPlusieurs, rangs, setRangs, joursRetenus,
  calendrierOuvert, setCalendrierOuvert,
  coche, convives, setChoisis, setPortions,
  detaille, setDetaille, jourOuvert, setJourOuvert,
  plans, plansOuverts, setPlansOuverts, onRelire,
  planASupprimer, setPlanASupprimer, onSupprimer,
  aucunCoche, onComposer,
}: {
  /* --- le frigo, tel que le calculateur peut s'en servir --- */
  stock: readonly Aliment[];
  /** ce que le frigo répond quand il est injoignable, sinon rien */
  problemeFrigo: string | null | undefined;
  anomalies: readonly Anomalie[];
  /** les aliments dont les fibres manquent, quand la cible les compte */
  sansFibresConnues: readonly string[];
  cibleDe: (repas: Repas) => Cible | undefined;

  /* --- la période --- */
  plusieurs: boolean;
  setPlusieurs: (v: boolean) => void;
  rangs: number[];
  setRangs: Dispatch<SetStateAction<number[]>>;
  joursRetenus: number[];
  calendrierOuvert: boolean;
  setCalendrierOuvert: (v: boolean) => void;

  /* --- les repas cochés --- */
  coche: (rang: number, repas: Repas) => boolean;
  convives: (rang: number, repas: Repas) => number;
  setChoisis: Dispatch<SetStateAction<Record<string, boolean>>>;
  setPortions: Dispatch<SetStateAction<Record<string, number>>>;
  detaille: string | null;
  setDetaille: (v: string | null) => void;
  jourOuvert: number | null;
  setJourOuvert: (v: number | null) => void;

  /* --- les plans déjà enregistrés --- */
  plans: readonly PlanRepas[];
  plansOuverts: boolean;
  setPlansOuverts: (v: boolean) => void;
  onRelire: (p: PlanRepas) => void;
  planASupprimer: { id: number; libelle: string } | null;
  setPlanASupprimer: (p: { id: number; libelle: string } | null) => void;
  onSupprimer: (id: number) => void;

  /* --- l'action --- */
  aucunCoche: boolean;
  onComposer: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    /* L'action principale est COLLÉE EN BAS, hors du défilement. Sept jours
       de repas font une page longue ; laisser le bouton à la fin obligeait
       à dérouler jusqu'en bas pour lancer le calcul, puis à remonter pour
       corriger. Il reste sous le pouce, là où on l'attend. */
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={SR.page}>
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
            <Discret style={SR.aide}>
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
        <Discret style={SR.aide}>
          {plusieurs
            ? 'Tous ces jours puisent dans le MÊME frigo : le premier se sert '
              + "d'abord, le dernier prend ce qui reste. S'il manque quelque "
              + 'chose, tu auras la liste de courses à la fin.'
            : 'Coche les repas à cuisiner et dis pour combien de personnes. '
              + "L'application composera à partir de ton frigo."}
        </Discret>
      </Carte>

      {plans.length > 0 && (
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
            const tous = plans;
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
          {plans.map((pl) => (
            <View key={pl.id} style={SR.ligneCourse}>
              <Pressable
                /* Les deux replis de l'écran d'un plan relu étaient remis
                   à zéro ICI, parce qu'ils étaient partagés avec le batch
                   cooking — deux écrans jamais affichés en même temps, un
                   seul état pour les deux. `PlanRelu` a maintenant les
                   siens, qui naissent repliés : il n'y a plus rien à
                   remettre à zéro, et ouvrir un plan enregistré ne touche
                   plus à ce que le batch cooking avait déplié. */
                onPress={() => onRelire(pl)}
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
                  <Discret style={SR.aide}>
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
                      <Discret style={SR.aide}>Pour combien de personnes ?</Discret>
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
                    <Discret style={SR.aide}>
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
        if (!plusieurs) return <View key={rang} style={SR.jourSeul}>{contenu}</View>;

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
            {(problemeFrigo ?? null) !== null
              ? 'Ton frigo est injoignable'
              : "Rien d'utilisable dans ton frigo"}
          </Texte>
          <Discret style={SR.aide}>
            {problemeFrigo
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

      <View style={[SR.pied, { paddingBottom: E.m + insets.bottom }]}>
        <Confirmer
        visible={planASupprimer !== null}
        titre={`Supprimer « ${planASupprimer?.libelle ?? ''} » ?`}
        message="Ce plan et sa liste de courses seront perdus. Les repas déjà cuisinés, eux, sont dans ton frigo."
        onConfirmer={() => {
          if (planASupprimer !== null) onSupprimer(planASupprimer.id);
          setPlanASupprimer(null);
        }}
        onAnnuler={() => setPlanASupprimer(null)}
      />

      <Bouton onPress={onComposer} desactive={aucunCoche || stock.length === 0}>
          {joursRetenus.length > 1
            ? `Composer les ${joursRetenus.length} jours`
            : 'Composer les repas'}
        </Bouton>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  interrupteur: { flexDirection: 'row', alignItems: 'center', gap: E.s, minHeight: TOUCHE },
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
  persLigne: { flexDirection: 'row', alignItems: 'center', gap: E.s },
  coched: { color: C.fond, fontSize: T.petit },
  signe: { fontSize: T.grand, color: C.attenue },
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
});
