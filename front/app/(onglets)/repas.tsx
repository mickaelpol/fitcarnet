import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useCibles, useMonFrigo } from '@/api/hooks';
import type { AlimentDisponible } from '@/api/types';
import { Bouton, Carte, Champ, Chargement, Chiffre, Discret, Erreur, Texte, Vide } from '@/composants/base';
import { ChoixDansListe } from '@/composants/choixAliment';
import {
  HUILE_PAR_PORTION, LEGUME_PAR_PORTION, NOM_REPAS, REPAS,
  type Repas, type Role, composer, resoudreAuMieux, roleDe,
} from '@/solveur/composer';
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

const ROLES: { cle: Role; titre: string; cat: string; fixe?: number }[] = [
  { cle: 'proteine', titre: 'Protéine', cat: 'prot' },
  { cle: 'glucide', titre: 'Glucide', cat: 'fec' },
  { cle: 'lipide', titre: 'Oléagineux', cat: 'ole' },
  { cle: 'huile', titre: 'Huile', cat: 'huile', fixe: HUILE_PAR_PORTION },
  { cle: 'legume', titre: 'Légume', cat: 'leg', fixe: LEGUME_PAR_PORTION },
];

/** Un repas composé, tel que l'utilisateur peut encore le corriger. */
interface Compose {
  roles: Partial<Record<Role, Aliment>>;
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

  const cibleDe = (repas: Repas) => (cibles.data ?? []).find((c) => c.repas === repas);

  /** Compose tous les repas cochés, en évitant de resservir le même aliment. */
  const composerTout = () => {
    const servis = new Set<number | string>();
    const suite: Partial<Record<Repas, Compose>> = {};

    for (const repas of REPAS) {
      if (!choisis[repas]) continue;
      const c = composer(stock, portions[repas], servis);

      const roles: Partial<Record<Role, Aliment>> = {};
      for (const cle of ['proteine', 'glucide', 'lipide'] as const) {
        const a = c.variables[cle];
        if (a) { roles[cle] = a; servis.add(a.id); }
      }
      /* L'huile et le légume ne comptent pas dans « déjà servi » : les
         resservir à tous les repas est normal, on ne varie pas d'huile. */
      if (c.huile) roles.huile = c.huile;
      if (c.legume) roles.legume = c.legume;

      suite[repas] = { roles, restes: {}, verrous: [] };
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
            stockDe={stockDe}
            catalogue={stock}
            fibresDe={fibresDe}
            ouvert={ouvert === repas}
            onOuvrir={() => setOuvert(ouvert === repas ? null : repas)}
            onRemplacer={(role) => setRemplacer({ repas, role })}
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
    </View>
  );
}

/* ------------------------------------------------------ une carte de repas */

function CarteRepas({
  repas, compose, cible, portions, stockDe, catalogue, fibresDe,
  ouvert, onOuvrir, onRemplacer, onReste,
}: {
  repas: Repas;
  compose: Compose;
  cible: {
    kcal: number; prot: number; gluc: number; lip: number; glucidesTotaux?: boolean;
  } | undefined;
  portions: number;
  stockDe: (a: Aliment) => number;
  catalogue: Aliment[];
  /** grammes de fibres pour 100 g, dans l'état de référence de l'aliment */
  fibresDe: (a: Aliment) => number;
  ouvert: boolean;
  onOuvrir: () => void;
  onRemplacer: (role: Role) => void;
  onReste: (cle: string, valeurs: { grammes: string; unite: 'cru' | 'cuit' }) => void;
}) {
  /* Les cibles sont PAR PERSONNE : on les multiplie, et tout ce qui s'affiche
     ensuite est le total à cuisiner. La part d'une personne se relit sur la
     dernière colonne. */
  const resultat = useMemo(() => {
    if (!cible) return null;

    const total = {
      kcal: cible.kcal * portions, prot: cible.prot * portions,
      gluc: cible.gluc * portions, lip: cible.lip * portions,
    };

    const fixes: Fixe[] = [];
      const variables: { proteine?: Aliment; glucide?: Aliment; lipide?: Aliment } = {};

    for (const { cle, fixe } of ROLES) {
      const aliment = compose.roles[cle];
      if (!aliment) continue;

      const reste = compose.restes[String(aliment.id)];
      const saisi = (reste?.grammes ?? '').trim();
      const grammes = Number(saisi.replace(',', '.'));

      /* Un reste déclaré fige la quantité : l'aliment sort des variables et
         le repas se recompose autour de lui. C'est le comportement d'origine
         du solveur, il n'a pas bougé.
         Zéro est une valeur COMME UNE AUTRE — « je n'en mets pas » — et non
         un champ vide. C'est ce qui permet d'écarter un aliment sans le
         remplacer, et le repas se recalcule autour des autres. */
      if (saisi !== '' && Number.isFinite(grammes) && grammes >= 0) {
        fixes.push({ aliment, grammes, unite: reste!.unite });
      } else if (fixe !== undefined) {
        fixes.push({
          aliment, grammes: fixe * portions,
          unite: cle === 'legume' ? 'cuit' : 'cru',
        });
      } else if (cle === 'proteine' || cle === 'glucide' || cle === 'lipide') {
        variables[cle] = aliment;
      }
    }

    /* Le stock a le dernier mot, et le calculateur essaie d'autres aliments
       plutôt que de renvoyer l'utilisateur corriger à la main. */
    return resoudreAuMieux(
      { variables, fixes }, total, stockDe, catalogue, new Set(compose.verrous),
      cible.glucidesTotaux === true);
  }, [cible, compose, portions, stockDe, catalogue]);

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
  const fibres = (resultat?.resultat.quantites ?? []).reduce(
    (n, q) => n + (fibresDe(q.aliment) * versReference(q.aliment, q.aCuire, 'cru')) / 100, 0);

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

          {fibres > 0.5 && (
            <Discret style={{ fontSize: T.minuscule }}>
              + {nb(fibres / portions)} g de fibres, soit {nb((fibres * 2) / portions)} kcal
              hors cible
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
              /* L'huile et le légume sont facultatifs : leur absence n'est pas
                 un manque, inutile d'alarmer. */
              if (cle === 'huile' || cle === 'legume') return null;

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
  plafond: {
    fontSize: T.petit, lineHeight: 16, color: C.ok,
    backgroundColor: C.okFond, borderRadius: R.s,
    paddingHorizontal: E.s, paddingVertical: 6,
  },
});
